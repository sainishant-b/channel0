import { appwriteRawClient, appwriteClient } from '@shared/api-client';
import { APPWRITE_DATABASE_ID, COLLECTION_IDS } from '@shared/constants';
import type { ChannelDoc, ChatMessage } from '@shared/types';

// ============================================
// Types
// ============================================

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface RealtimeHandlers {
  onChannelUpdate: (channel: ChannelDoc) => void;
  onChatMessage: (message: ChatMessage) => void;
  onPresenceChange: (channelId: string, count: number) => void;
  onError: (error: string) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}

interface AppwriteRealtimeEvent<T> {
  events: string[];
  channels: string[];
  payload: T;
}

// ============================================
// Realtime client (Appwrite Databases subscriptions)
// ============================================

class RealtimeClient {
  private unsubscribers: Array<() => void> = [];
  private currentChannelId: string | null = null;
  private presenceCount = 0;
  private status: RealtimeStatus = 'disconnected';
  private currentHandlers: RealtimeHandlers | null = null;

  /**
   * Subscribe to a channel's realtime streams: channel doc updates,
   * its chat messages, and its presence rows. Each subscription is
   * tied to the channel id; calling subscribe again tears down the
   * previous one before opening new ones.
   *
   * Appwrite's SDK Realtime client maintains a shared WebSocket across
   * all subscriptions and handles auto-reconnect internally. We
   * surface a derived `RealtimeStatus` so the UI can show connecting /
   * reconnecting hints without needing access to the underlying socket.
   */
  subscribe(channelId: string, handlers: RealtimeHandlers): void {
    this.unsubscribe();
    this.currentChannelId = channelId;
    this.presenceCount = 0;
    this.currentHandlers = handlers;
    this.setStatus('connecting');

    const channelDocChannel =
      `databases.${APPWRITE_DATABASE_ID}.collections.${COLLECTION_IDS.CHANNELS}.documents.${channelId}`;
    const chatCollectionChannel =
      `databases.${APPWRITE_DATABASE_ID}.collections.${COLLECTION_IDS.CHAT_MESSAGES}.documents`;
    const presenceCollectionChannel =
      `databases.${APPWRITE_DATABASE_ID}.collections.${COLLECTION_IDS.PRESENCE}.documents`;

    const channelSub = appwriteRawClient.subscribe(
      channelDocChannel,
      (event: AppwriteRealtimeEvent<ChannelDoc>) => {
        this.markConnected();
        if (event.events.some(e => e.endsWith('.update'))) {
          handlers.onChannelUpdate(event.payload);
        }
      }
    );

    const chatSub = appwriteRawClient.subscribe(
      chatCollectionChannel,
      (event: AppwriteRealtimeEvent<ChatMessage>) => {
        this.markConnected();
        if (!event.payload || event.payload.channelId !== channelId) return;
        if (event.events.some(e => e.endsWith('.create'))) {
          handlers.onChatMessage(event.payload);
        }
      }
    );

    const presenceSub = appwriteRawClient.subscribe(
      presenceCollectionChannel,
      async (event: AppwriteRealtimeEvent<{ channelId: string }>) => {
        this.markConnected();
        if (!event.payload || event.payload.channelId !== channelId) return;
        // Recompute count via a lightweight refresh — Appwrite doesn't
        // surface aggregate counts directly, so we re-read on change.
        await this.refreshPresenceCount(channelId, handlers);
      }
    );

    this.unsubscribers.push(channelSub, chatSub, presenceSub);

    // Seed initial presence count
    void this.refreshPresenceCount(channelId, handlers);

    // Also load initial channel + chat history
    void this.loadInitialState(channelId, handlers);
  }

  unsubscribe(): void {
    for (const fn of this.unsubscribers) {
      try {
        fn();
      } catch (err) {
        console.warn('[Realtime] Unsubscribe error:', err);
      }
    }
    this.unsubscribers = [];
    this.currentChannelId = null;
    this.presenceCount = 0;
    this.currentHandlers = null;
    this.setStatus('disconnected');
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  private setStatus(next: RealtimeStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.currentHandlers?.onStatusChange?.(next);
  }

  private markConnected(): void {
    if (this.status !== 'connected') this.setStatus('connected');
  }

  private async loadInitialState(channelId: string, handlers: RealtimeHandlers): Promise<void> {
    try {
      const channel = await appwriteClient.getChannel(channelId);
      handlers.onChannelUpdate(channel);
      const recent = await appwriteClient.listRecentChat(channelId);
      for (const msg of recent) handlers.onChatMessage(msg);
      this.setStatus('connected');
    } catch (err) {
      this.setStatus('reconnecting');
      handlers.onError((err as Error).message);
    }
  }

  private async refreshPresenceCount(
    channelId: string,
    handlers: RealtimeHandlers
  ): Promise<void> {
    if (this.currentChannelId !== channelId) return;
    try {
      this.presenceCount = await appwriteClient.countPresence(channelId);
      handlers.onPresenceChange(channelId, this.presenceCount);
    } catch (err) {
      console.warn('[Realtime] Presence refresh failed:', err);
    }
  }
}

export const realtimeClient = new RealtimeClient();
