import {
  Client,
  Account,
  Databases,
  ID,
  Query,
  Permission,
  Role,
} from 'appwrite';
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_DATABASE_ID,
  COLLECTION_IDS,
  CHANNEL_CODE,
} from './constants';
import type {
  ChannelDoc,
  ChannelVisibility,
  ChatMessage,
  PlaylistItem,
} from './types';

// ============================================
// Client singleton
// ============================================

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

export const appwriteRawClient = client;
export const appwriteAccount = account;

// ============================================
// Helpers
// ============================================

function generateChannelCode(): string {
  const { LENGTH, ALPHABET } = CHANNEL_CODE;
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return code;
}

async function findUniqueChannelCode(maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateChannelCode();
    const existing = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      [Query.equal('code', code), Query.limit(1)]
    );
    if (existing.documents.length === 0) return code;
  }
  throw new Error('Unable to allocate a unique channel code');
}

// ============================================
// API
// ============================================

class AppwriteClient {
  // -------- Channels --------

  async createChannel(input: {
    name: string;
    visibility: ChannelVisibility;
    hostUserId: string;
    hostUsername: string;
    initialVideoId: string | null;
    description?: string | null;
  }): Promise<ChannelDoc> {
    const code = await findUniqueChannelCode();
    const now = new Date().toISOString();

    const doc = await databases.createDocument<ChannelDoc>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      ID.unique(),
      {
        code,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility,
        hostUserId: input.hostUserId,
        hostUsername: input.hostUsername,
        state: 'stopped',
        currentVideoIndex: 0,
        currentVideoStartedAt: null,
        pauseAccumMs: 0,
        pausedAt: null,
        viewerCount: 0,
        createdAt: now,
      },
      [
        Permission.read(Role.any()),
        Permission.update(Role.user(input.hostUserId)),
        Permission.delete(Role.user(input.hostUserId)),
      ]
    );

    if (input.initialVideoId) {
      await this.addPlaylistItem(doc.$id, input.initialVideoId, '');
    }
    return doc;
  }

  async resolveChannelByCode(code: string): Promise<ChannelDoc> {
    const result = await databases.listDocuments<ChannelDoc>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      [Query.equal('code', code.toUpperCase()), Query.limit(1)]
    );
    if (result.documents.length === 0) {
      throw new Error('Channel not found');
    }
    return result.documents[0];
  }

  async getChannel(channelId: string): Promise<ChannelDoc> {
    return databases.getDocument<ChannelDoc>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      channelId
    );
  }

  async listOwnedChannels(hostUserId: string): Promise<ChannelDoc[]> {
    const result = await databases.listDocuments<ChannelDoc>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      [Query.equal('hostUserId', hostUserId), Query.orderDesc('createdAt')]
    );
    return result.documents;
  }

  async updateChannelState(
    channelId: string,
    patch: Partial<Pick<ChannelDoc,
      'state' | 'currentVideoIndex' | 'currentVideoStartedAt' |
      'pauseAccumMs' | 'pausedAt'>>
  ): Promise<ChannelDoc> {
    return databases.updateDocument<ChannelDoc>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      channelId,
      patch
    );
  }

  async startBroadcast(channelId: string): Promise<ChannelDoc> {
    return this.updateChannelState(channelId, {
      state: 'playing',
      currentVideoIndex: 0,
      currentVideoStartedAt: new Date().toISOString(),
      pauseAccumMs: 0,
      pausedAt: null,
    });
  }

  async pauseBroadcast(channelId: string): Promise<ChannelDoc> {
    return this.updateChannelState(channelId, {
      state: 'paused',
      pausedAt: new Date().toISOString(),
    });
  }

  async resumeBroadcast(channelId: string): Promise<ChannelDoc> {
    const ch = await this.getChannel(channelId);
    if (ch.state !== 'paused' || !ch.pausedAt) return ch;
    const additionalPause = Date.now() - new Date(ch.pausedAt).getTime();
    return this.updateChannelState(channelId, {
      state: 'playing',
      pausedAt: null,
      pauseAccumMs: ch.pauseAccumMs + additionalPause,
    });
  }

  async stopBroadcast(channelId: string): Promise<ChannelDoc> {
    return this.updateChannelState(channelId, {
      state: 'stopped',
      pausedAt: null,
    });
  }

  /**
   * Delete a channel and cascade its playlist + chat + presence rows.
   *
   * Cascade is intentionally best-effort on the client. Once the
   * Appwrite Function `channel-cleanup-on-stop` ships (see PLAN.md M7),
   * the function will own this cascade and this method should be
   * trimmed to a single deleteDocument call.
   */
  async deleteChannel(channelId: string): Promise<void> {
    // Cascade playlist
    try {
      const items = await this.listPlaylist(channelId);
      await Promise.all(items.map(i => this.removePlaylistItem(i.$id)));
    } catch (err) {
      console.warn('[api-client] Playlist cascade failed:', err);
    }
    // Cascade chat
    try {
      const messages = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.CHAT_MESSAGES,
        [Query.equal('channelId', channelId), Query.limit(100)]
      );
      await Promise.all(messages.documents.map(m =>
        databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTION_IDS.CHAT_MESSAGES, m.$id)
      ));
    } catch (err) {
      console.warn('[api-client] Chat cascade failed:', err);
    }
    // Cascade presence
    try {
      const presence = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.PRESENCE,
        [Query.equal('channelId', channelId), Query.limit(100)]
      );
      await Promise.all(presence.documents.map(p =>
        databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTION_IDS.PRESENCE, p.$id)
      ));
    } catch (err) {
      console.warn('[api-client] Presence cascade failed:', err);
    }
    await databases.deleteDocument(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHANNELS,
      channelId
    );
  }

  /**
   * Optimistic advance: only succeeds if the channel still has the
   * specified videoId at currentVideoIndex. The first client (host or
   * any viewer) to fire wins; the rest get a benign error and ignore.
   *
   * The actual conditional check is enforced server-side via an
   * Appwrite Function (see PLAN.md M3). Until that ships, this falls
   * back to a best-effort client update guarded by a re-read.
   */
  async advanceChannel(channelId: string, expectedVideoId: string): Promise<ChannelDoc> {
    const ch = await this.getChannel(channelId);
    const items = await this.listPlaylist(channelId);
    const current = items[ch.currentVideoIndex];
    if (!current || current.videoId !== expectedVideoId) {
      throw new Error('Channel already advanced');
    }
    const nextIndex = ch.currentVideoIndex + 1;
    if (nextIndex >= items.length) {
      // End of playlist → stop broadcast
      return this.stopBroadcast(channelId);
    }
    return this.updateChannelState(channelId, {
      currentVideoIndex: nextIndex,
      currentVideoStartedAt: new Date().toISOString(),
      pauseAccumMs: 0,
      pausedAt: null,
    });
  }

  // -------- Playlist --------

  async listPlaylist(channelId: string): Promise<PlaylistItem[]> {
    const result = await databases.listDocuments<PlaylistItem>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      [Query.equal('channelId', channelId), Query.orderAsc('position')]
    );
    return result.documents;
  }

  async addPlaylistItem(
    channelId: string,
    videoId: string,
    videoTitle: string
  ): Promise<PlaylistItem> {
    const existing = await this.listPlaylist(channelId);
    const nextPosition = existing.length === 0
      ? 0
      : existing[existing.length - 1].position + 1;
    return databases.createDocument<PlaylistItem>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      ID.unique(),
      {
        channelId,
        position: nextPosition,
        videoId,
        videoTitle,
        videoDuration: null,
        addedAt: new Date().toISOString(),
      }
    );
  }

  async removePlaylistItem(itemId: string): Promise<void> {
    await databases.deleteDocument(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      itemId
    );
  }

  async reorderPlaylistItem(itemId: string, position: number): Promise<PlaylistItem> {
    return databases.updateDocument<PlaylistItem>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      itemId,
      { position }
    );
  }

  async setVideoDuration(channelId: string, videoId: string, duration: number): Promise<void> {
    const result = await databases.listDocuments<PlaylistItem>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      [
        Query.equal('channelId', channelId),
        Query.equal('videoId', videoId),
        Query.isNull('videoDuration'),
        Query.limit(1),
      ]
    );
    if (result.documents.length === 0) return;
    await databases.updateDocument<PlaylistItem>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PLAYLIST_ITEMS,
      result.documents[0].$id,
      { videoDuration: duration }
    );
  }

  // -------- Chat --------

  async sendChatMessage(
    channelId: string,
    userId: string,
    username: string,
    text: string
  ): Promise<ChatMessage> {
    return databases.createDocument<ChatMessage>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHAT_MESSAGES,
      ID.unique(),
      {
        channelId,
        userId,
        username,
        text,
        createdAt: new Date().toISOString(),
      }
    );
  }

  async listRecentChat(channelId: string, limit = 50): Promise<ChatMessage[]> {
    const result = await databases.listDocuments<ChatMessage>(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.CHAT_MESSAGES,
      [
        Query.equal('channelId', channelId),
        Query.orderDesc('createdAt'),
        Query.limit(limit),
      ]
    );
    return result.documents.reverse();
  }

  // -------- Presence --------

  async touchPresence(channelId: string, userId: string, _username: string): Promise<void> {
    const existing = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PRESENCE,
      [
        Query.equal('channelId', channelId),
        Query.equal('userId', userId),
        Query.limit(1),
      ]
    );
    const now = new Date().toISOString();
    if (existing.documents.length === 0) {
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.PRESENCE,
        ID.unique(),
        { channelId, userId, lastPing: now }
      );
    } else {
      await databases.updateDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.PRESENCE,
        existing.documents[0].$id,
        { lastPing: now }
      );
    }
  }

  async sendHeartbeat(channelId: string, userId: string): Promise<void> {
    return this.touchPresence(channelId, userId, '');
  }

  /**
   * Count presence rows for a channel. Used to derive viewer count on
   * realtime presence-collection changes. Stale rows are cleaned by
   * `sweepStalePresence` rather than a deferred server Function — the
   * trade-off keeps deployment surface small at the cost of one
   * occasional list+delete pass per active participant.
   */
  async countPresence(channelId: string): Promise<number> {
    const result = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PRESENCE,
      [Query.equal('channelId', channelId), Query.limit(100)]
    );
    return result.total;
  }

  /**
   * Drop presence rows whose `lastPing` is older than the timeout.
   * Run periodically by the service worker while the user is in an
   * active channel. Any participant doing the sweep is enough; the
   * delete is idempotent.
   */
  async sweepStalePresence(channelId: string, olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const stale = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PRESENCE,
      [
        Query.equal('channelId', channelId),
        Query.lessThan('lastPing', cutoff),
        Query.limit(100),
      ]
    );
    let removed = 0;
    for (const row of stale.documents) {
      try {
        await databases.deleteDocument(
          APPWRITE_DATABASE_ID,
          COLLECTION_IDS.PRESENCE,
          row.$id
        );
        removed++;
      } catch (err) {
        console.warn('[api-client] Presence sweep delete failed:', err);
      }
    }
    return removed;
  }

  /**
   * Wipe all chat messages for a channel. Called by `handleStopBroadcast`
   * to honor the ephemeral-chat decision (PLAN.md §2). Replaces the
   * deferred server-side cleanup Function (T15) for v1 ship.
   */
  async wipeChat(channelId: string): Promise<number> {
    let removed = 0;
    // Loop because Appwrite caps list responses at 100 docs at a time.
    while (true) {
      const batch = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.CHAT_MESSAGES,
        [Query.equal('channelId', channelId), Query.limit(100)]
      );
      if (batch.documents.length === 0) break;
      for (const msg of batch.documents) {
        try {
          await databases.deleteDocument(
            APPWRITE_DATABASE_ID,
            COLLECTION_IDS.CHAT_MESSAGES,
            msg.$id
          );
          removed++;
        } catch (err) {
          console.warn('[api-client] Chat wipe delete failed:', err);
        }
      }
      if (batch.total <= 100) break;
    }
    return removed;
  }

  async removePresence(channelId: string, userId: string): Promise<void> {
    const existing = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_IDS.PRESENCE,
      [
        Query.equal('channelId', channelId),
        Query.equal('userId', userId),
        Query.limit(1),
      ]
    );
    if (existing.documents.length > 0) {
      await databases.deleteDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_IDS.PRESENCE,
        existing.documents[0].$id
      );
    }
  }
}

export const appwriteClient = new AppwriteClient();
