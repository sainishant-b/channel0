import { useEffect, useState } from 'react';
import type { ChannelDoc } from '@shared/types';
import type {
  OwnedChannelsResponse,
  MutationResponse,
} from '@shared/message-types';

interface MyChannelsProps {
  onBack: () => void;
  onResume: (channelId: string) => void | Promise<void>;
  onEditPlaylist: (channelId: string) => void;
}

export function MyChannels({ onBack, onResume, onEditPlaylist }: MyChannelsProps) {
  const [channels, setChannels] = useState<ChannelDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LIST_OWNED_CHANNELS',
      }) as OwnedChannelsResponse;
      if (response.success && response.channels) {
        setChannels(response.channels);
      } else {
        setError(response.error || 'Failed to load channels');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResume(channelId: string) {
    // Re-attach the active session via a fresh JOIN of our own channel.
    // We re-use HOST_CHANNEL semantics by routing through the resume path;
    // the simpler approach for now is to fire a no-op message and let the
    // caller open the session view directly.
    onResume(channelId);
  }

  async function handleDelete(channelId: string) {
    if (!confirm('Delete this channel? Viewers will be disconnected.')) return;
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_CHANNEL',
      channelId,
    }) as MutationResponse;
    if (response.success) {
      setChannels(prev => prev.filter(c => c.$id !== channelId));
    } else {
      setError(response.error || 'Failed to delete channel');
    }
  }

  return (
    <div className="form-view my-channels">
      <button className="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Back
      </button>

      <div className="form-header">
        <h3 className="form-title">My Channels</h3>
        <p className="form-subtitle">Channels you host.</p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-state"><div className="spinner" /><span>Loading…</span></div>
      ) : channels.length === 0 ? (
        <div className="empty-state">No channels yet — host one from the home view.</div>
      ) : (
        <ul className="channel-list">
          {channels.map(ch => (
            <li key={ch.$id} className="channel-row">
              <div className="channel-meta">
                <span className="channel-name">{ch.name}</span>
                <span className="channel-sub">
                  <span className={`channel-state ${ch.state}`}>{ch.state}</span>
                  <span className="channel-code">{ch.code}</span>
                  <span className="channel-vis">{ch.visibility}</span>
                </span>
              </div>
              <div className="channel-actions">
                <button className="text-btn" onClick={() => onEditPlaylist(ch.$id)}>Playlist</button>
                <button className="text-btn" onClick={() => handleResume(ch.$id)}>Open</button>
                <button className="text-btn danger" onClick={() => handleDelete(ch.$id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

