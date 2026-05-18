import { useEffect, useRef, useState } from 'react';
import type { ChannelDoc, ChatMessage, PlaylistItem, WatchPartySession } from '@shared/types';
import type {
  MutationResponse,
  PlaylistResponse,
} from '@shared/message-types';
import { appwriteClient, appwriteRawClient } from '@shared/api-client';
import { APPWRITE_DATABASE_ID, COLLECTION_IDS } from '@shared/constants';

interface DashboardProps {
  session: WatchPartySession;
  onLeave: () => void;
}

interface RealtimeEvent<T> {
  events: string[];
  payload: T;
}

/**
 * Full-page dashboard for an active channel. Renders the YouTube embed
 * player, the playlist sidebar, the live chat panel, and host controls
 * (when the local user owns the channel). Replaces the popup-style
 * SessionView card.
 *
 * The dashboard reads channel + chat state directly from Appwrite
 * instead of going through the service worker. The SDK works fine in
 * an extension tab (DOM + XHR available) and removing the SW hop
 * keeps the chat feed snappier.
 */
export function Dashboard({ session, onLeave }: DashboardProps) {
  const [channel, setChannel] = useState<ChannelDoc | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftVideoUrl, setDraftVideoUrl] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // `liveTick` re-renders every 250ms while the channel is playing so
  // the visible time + progress bar update smoothly between the slower
  // (3s) channel-doc polls. The value itself is unused; the state
  // change is what schedules the React render.
  const [, setLiveTick] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const currentItem = channel ? items[channel.currentVideoIndex] : null;

  // -------- Local 250 ms tick for live time display --------
  useEffect(() => {
    if (channel?.state !== 'playing') return;
    const id = window.setInterval(() => setLiveTick(t => (t + 1) % 1_000_000), 250);
    return () => window.clearInterval(id);
  }, [channel?.state]);

  // -------- Poll channel doc every 3s --------
  //
  // Also nudges the service worker to rehydrate its `activeChannel`
  // (and its realtime + presence subscriptions) by calling
  // GET_CURRENT_CHANNEL once on mount. Without this, opening the
  // dashboard fresh leaves the SW idle and viewer count stuck at 0.
  useEffect(() => {
    let cancelled = false;
    void chrome.runtime.sendMessage({ type: 'GET_CURRENT_CHANNEL' }).catch(() => undefined);
    async function tick() {
      try {
        const fresh = await appwriteClient.getChannel(session.channelId);
        if (!cancelled) setChannel(fresh);
      } catch (err) {
        console.warn('[Dashboard] channel poll failed:', err);
      }
    }
    void tick();
    const interval = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session.channelId]);

  // -------- Playlist refresh on channel update --------
  useEffect(() => {
    if (!channel) return;
    void refreshPlaylist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.currentVideoIndex]);

  async function refreshPlaylist() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LIST_PLAYLIST',
        channelId: session.channelId,
      }) as PlaylistResponse;
      if (response.success && response.items) setItems(response.items);
    } catch (err) {
      console.warn('[Dashboard] playlist load failed:', err);
    }
  }

  // -------- Chat realtime sub --------
  useEffect(() => {
    let cancelled = false;
    // Seed with recent messages
    appwriteClient.listRecentChat(session.channelId).then((recent) => {
      if (!cancelled) setMessages(recent);
    }).catch(err => console.warn('[Dashboard] chat history failed:', err));

    const channelTopic = `databases.${APPWRITE_DATABASE_ID}.collections.${COLLECTION_IDS.CHAT_MESSAGES}.documents`;
    const unsub = appwriteRawClient.subscribe(channelTopic, (event) => {
      const evt = event as RealtimeEvent<ChatMessage>;
      if (!evt.payload || evt.payload.channelId !== session.channelId) return;
      if (evt.events.some(e => e.endsWith('.create'))) {
        setMessages(prev => [...prev, evt.payload].slice(-200));
      }
      if (evt.events.some(e => e.endsWith('.delete'))) {
        setMessages(prev => prev.filter(m => m.$id !== evt.payload.$id));
      }
    });
    return () => {
      cancelled = true;
      try { unsub(); } catch { /* ignore */ }
    };
  }, [session.channelId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [messages.length]);

  function deriveChannelTime(): number {
    if (!channel || channel.state === 'stopped' || !channel.currentVideoStartedAt) return 0;
    const ref = channel.state === 'paused' && channel.pausedAt
      ? new Date(channel.pausedAt).getTime()
      : Date.now();
    return Math.max(0, (ref - new Date(channel.currentVideoStartedAt).getTime() - channel.pauseAccumMs) / 1000);
  }

  async function fireHostAction(type: 'START_BROADCAST' | 'PAUSE_BROADCAST' | 'RESUME_BROADCAST' | 'SKIP_VIDEO' | 'STOP_BROADCAST') {
    setActionBusy(type);
    setErrorMsg(null);
    try {
      const response = await chrome.runtime.sendMessage({ type, channelId: session.channelId }) as MutationResponse;
      if (!response.success) setErrorMsg(response.error || `${type} failed`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  }

  async function sendChat() {
    const text = draftMessage.trim();
    if (!text) return;
    setDraftMessage('');
    const response = await chrome.runtime.sendMessage({ type: 'SEND_CHAT', text }) as MutationResponse;
    if (!response.success) setErrorMsg(response.error || 'Failed to send chat');
  }

  async function addVideo() {
    const url = draftVideoUrl.trim();
    if (!url) return;
    setDraftVideoUrl('');
    const response = await chrome.runtime.sendMessage({
      type: 'ADD_VIDEO',
      channelId: session.channelId,
      videoUrl: url,
    }) as MutationResponse;
    if (response.success) await refreshPlaylist();
    else setErrorMsg(response.error || 'Failed to add video');
  }

  async function removeItem(itemId: string) {
    const response = await chrome.runtime.sendMessage({ type: 'REMOVE_VIDEO', itemId }) as MutationResponse;
    if (response.success) setItems(prev => prev.filter(it => it.$id !== itemId));
    else setErrorMsg(response.error || 'Failed to remove');
  }

  async function copyCode() {
    await navigator.clipboard.writeText(session.channelCode);
  }

  const channelTimeRaw = deriveChannelTime();
  const channelTime = Math.floor(channelTimeRaw);
  const videoId = currentItem?.videoId ?? null;
  const duration = currentItem?.videoDuration ?? null;
  const progressPct = duration && duration > 0
    ? Math.min(100, (channelTimeRaw / duration) * 100)
    : 0;

  function openWatchTab() {
    if (!videoId) return;
    chrome.tabs.create({
      url: `https://www.youtube.com/watch?v=${videoId}&t=${channelTime}`,
    });
  }

  return (
    <div className="dashboard">
      <div className="dashboard-topbar">
        <div className="dashboard-channel-info">
          <span className={`live-pill ${channel?.state ?? 'stopped'}`}>
            {(channel?.state ?? 'stopped').toUpperCase()}
          </span>
          <span className="dashboard-channel-name">{session.channelName}</span>
          <span className="dashboard-host-tag">
            {session.isHost ? 'Hosted by you' : `Hosted by ${session.hostUsername}`}
          </span>
        </div>
        <div className="dashboard-topbar-right">
          <span className="dashboard-viewers">
            👥 {channel?.viewerCount ?? session.viewerCount}
          </span>
          <button className="code-pill" onClick={copyCode} title="Click to copy code">
            {session.channelCode}
          </button>
          <button className="leave-pill" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {errorMsg && <div className="dashboard-error">{errorMsg}</div>}

      <div className="dashboard-grid">
        <div className="dashboard-player">
          {/* Live ticker — what every viewer's content script syncs to */}
          <div className="channel-ticker">
            <div className="ticker-headline">
              <span className={`ticker-dot ${channel?.state ?? 'stopped'}`} />
              <span className="ticker-label">
                {channel?.state === 'playing' ? 'CHANNEL TIME' :
                 channel?.state === 'paused' ? 'PAUSED' :
                 'OFFLINE'}
              </span>
              <span className="ticker-time">
                {formatTime(channelTime)}{duration ? ` / ${formatTime(duration)}` : ''}
              </span>
            </div>
            <div className="ticker-progress">
              <div className="ticker-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="ticker-sub">
              Viewers auto-snap when drift &gt; 5s. Soft nudge between 1–5s.
            </div>
          </div>

          {videoId ? (
            <button
              type="button"
              className="player-thumbnail"
              onClick={openWatchTab}
              title="Open on YouTube — overlay syncs your playback to this channel time"
            >
              <img
                className="player-thumbnail-img"
                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                alt={currentItem?.videoTitle ?? 'Video thumbnail'}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }}
              />
              <span className="player-thumbnail-overlay">
                <span className="player-thumbnail-play">▶</span>
                <span className="player-thumbnail-label">Watch on YouTube</span>
                <span className="player-thumbnail-sub">Opens at {formatTime(channelTime)}</span>
              </span>
            </button>
          ) : (
            <div className="player-empty">
              <div className="player-empty-icon">▶</div>
              <p>No video playing</p>
              <p className="player-empty-hint">
                {session.isHost ? 'Add a video to the playlist and press Start.' : 'Waiting for the host to start the broadcast.'}
              </p>
            </div>
          )}

          <div className="player-meta">
            <span className="player-current-title">
              {currentItem?.videoTitle ?? '—'}
            </span>
          </div>

          {session.isHost && (
            <div className="host-controls">
              <button
                className="control-btn primary"
                onClick={() => fireHostAction('START_BROADCAST')}
                disabled={actionBusy !== null}
              >▶ Start</button>
              <button
                className="control-btn"
                onClick={() => fireHostAction('PAUSE_BROADCAST')}
                disabled={actionBusy !== null}
              >⏸ Pause</button>
              <button
                className="control-btn"
                onClick={() => fireHostAction('RESUME_BROADCAST')}
                disabled={actionBusy !== null}
              >⏵ Resume</button>
              <button
                className="control-btn"
                onClick={() => fireHostAction('SKIP_VIDEO')}
                disabled={actionBusy !== null}
              >⏭ Skip</button>
              <button
                className="control-btn danger"
                onClick={() => fireHostAction('STOP_BROADCAST')}
                disabled={actionBusy !== null}
              >⏹ Stop</button>
            </div>
          )}
        </div>

        <aside className="dashboard-side">
          <section className="side-section playlist-pane">
            <header className="side-header">
              <h3>Playlist</h3>
              <span className="muted">{items.length} videos</span>
            </header>
            {session.isHost && (
              <div className="playlist-add-row">
                <input
                  className="playlist-add-input"
                  placeholder="Paste YouTube URL"
                  value={draftVideoUrl}
                  onChange={(e) => setDraftVideoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addVideo()}
                />
                <button className="playlist-add-btn" onClick={addVideo}>Add</button>
              </div>
            )}
            <ul className="dashboard-playlist">
              {items.length === 0 ? (
                <li className="playlist-empty">Empty playlist</li>
              ) : items.map((item, idx) => {
                const isCurrent = channel && idx === channel.currentVideoIndex && channel.state !== 'stopped';
                return (
                  <li key={item.$id} className={`dashboard-playlist-item${isCurrent ? ' current' : ''}`}>
                    <img
                      className="dashboard-thumb"
                      src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt=""
                    />
                    <div className="dashboard-playlist-meta">
                      <span className="dashboard-playlist-title">{item.videoTitle}</span>
                      <span className="dashboard-playlist-sub">{isCurrent ? 'Now playing' : `#${idx + 1}`}</span>
                    </div>
                    {session.isHost && !isCurrent && (
                      <button className="playlist-remove" onClick={() => removeItem(item.$id)} title="Remove">×</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="side-section chat-pane">
            <header className="side-header">
              <h3>Chat</h3>
              <span className="muted">{messages.length}</span>
            </header>
            <div className="dashboard-chat-scroll" ref={chatScrollRef}>
              {messages.length === 0 ? (
                <div className="chat-empty">No messages yet.</div>
              ) : messages.map(msg => (
                <div key={msg.$id} className={`chat-row${msg.userId === 'system' ? ' system' : ''}`}>
                  <span className="chat-username" style={{ color: colorFor(msg.username) }}>
                    {msg.username}
                  </span>
                  <span className="chat-text">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="dashboard-chat-input-row">
              <input
                className="dashboard-chat-input"
                placeholder="Send a message…"
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                maxLength={300}
              />
              <button className="dashboard-chat-send" onClick={sendChat}>Send</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function colorFor(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
