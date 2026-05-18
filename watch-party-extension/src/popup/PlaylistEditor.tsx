import { useEffect, useState } from 'react';
import type { PlaylistItem } from '@shared/types';
import type {
  PlaylistResponse,
  MutationResponse,
} from '@shared/message-types';

interface PlaylistEditorProps {
  channelId: string;
  onBack: () => void;
}

/**
 * Host-side playlist editor. Lists items, lets the host append a YouTube
 * URL (oEmbed-resolved title), reorder, and remove. Local optimistic
 * updates are applied immediately and reconciled against the next list
 * fetch — keeps the UI snappy without a realtime sub on this surface.
 */
export function PlaylistEditor({ channelId, onBack }: PlaylistEditorProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LIST_PLAYLIST',
        channelId,
      }) as PlaylistResponse;
      if (response.success && response.items) {
        setItems(response.items);
      } else {
        setError(response.error || 'Failed to load playlist');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const url = videoUrl.trim();
    if (!url) {
      setError('Paste a YouTube URL');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_VIDEO',
        channelId,
        videoUrl: url,
      }) as MutationResponse;
      if (response.success) {
        setVideoUrl('');
        await refresh();
      } else {
        setError(response.error || 'Failed to add video');
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(itemId: string) {
    setError(null);
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_VIDEO',
      itemId,
    }) as MutationResponse;
    if (response.success) {
      setItems(prev => prev.filter(it => it.$id !== itemId));
    } else {
      setError(response.error || 'Failed to remove video');
    }
  }

  async function handleMove(itemId: string, direction: -1 | 1) {
    const idx = items.findIndex(it => it.$id === itemId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;

    const a = items[idx];
    const b = items[swapIdx];
    setError(null);

    // Optimistic swap
    const next = [...items];
    next[idx] = b;
    next[swapIdx] = a;
    setItems(next);

    const r1 = await chrome.runtime.sendMessage({
      type: 'REORDER_VIDEO',
      itemId: a.$id,
      position: b.position,
    }) as MutationResponse;
    const r2 = await chrome.runtime.sendMessage({
      type: 'REORDER_VIDEO',
      itemId: b.$id,
      position: a.position,
    }) as MutationResponse;

    if (!r1.success || !r2.success) {
      setError(r1.error || r2.error || 'Reorder failed');
      await refresh();
    }
  }

  return (
    <div className="form-view playlist-editor">
      <button className="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        Back
      </button>

      <div className="form-header">
        <h3 className="form-title">Playlist</h3>
        <p className="form-subtitle">Add YouTube URLs in the order you want them broadcast.</p>
      </div>

      <div className="form-fields">
        <div className="form-group">
          <label className="form-label">Add a video</label>
          <div className="add-video-row">
            <input
              type="text"
              className="form-input"
              placeholder="https://youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button className="primary-btn small" onClick={handleAdd} disabled={adding}>
              {adding ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-state"><div className="spinner" /><span>Loading playlist…</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">No videos yet — add one above.</div>
      ) : (
        <ul className="playlist-list">
          {items.map((item, idx) => (
            <li key={item.$id} className="playlist-item">
              <img
                className="playlist-thumb"
                src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                alt=""
              />
              <div className="playlist-meta">
                <span className="playlist-title">{item.videoTitle}</span>
                <span className="playlist-id">{item.videoId}</span>
              </div>
              <div className="playlist-actions">
                <button
                  className="icon-btn"
                  title="Move up"
                  onClick={() => handleMove(item.$id, -1)}
                  disabled={idx === 0}
                >▲</button>
                <button
                  className="icon-btn"
                  title="Move down"
                  onClick={() => handleMove(item.$id, 1)}
                  disabled={idx === items.length - 1}
                >▼</button>
                <button
                  className="icon-btn danger"
                  title="Remove"
                  onClick={() => handleRemove(item.$id)}
                >×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
