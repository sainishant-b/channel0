import { useState, useEffect } from 'react';
import type { Show } from '@shared/types';
import { formatTimeRemaining, getShowProgress, formatCountdown, formatTime } from '@shared/time-utils';

interface NowPlayingProps {
  show: Show | null;
  viewerCount: number;
  nextShow: Show | null;
  onWatchNow: () => void;
}

// Get YouTube thumbnail URL from video ID
function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export function NowPlaying({ show, viewerCount, nextShow, onWatchNow }: NowPlayingProps) {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');

  // Update progress every second
  useEffect(() => {
    if (!show) return;

    const updateProgress = () => {
      setProgress(getShowProgress(show));
      setTimeRemaining(formatTimeRemaining(show));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [show]);

  if (!show) {
    return <NoShowPlaying nextShow={nextShow} />;
  }

  const thumbnailUrl = show.thumbnail || getYouTubeThumbnail(show.videoId);

  return (
    <section className="now-playing-section">
      <div className="live-badge">
        <span className="live-dot"></span>
        LIVE NOW
      </div>

      <div className="now-playing-content">
        <div className="np-thumbnail">
          <img src={thumbnailUrl} alt={show.title} />
          <div className="np-thumbnail-overlay">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        <div className="np-info">
          <h3 className="np-title">{show.title}</h3>
          <p className="np-meta">
            {viewerCount > 0 ? `${viewerCount} watching • ` : ''}{timeRemaining}
          </p>
          <div className="np-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <button className="watch-now-btn" onClick={onWatchNow}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        Watch Now
      </button>
    </section>
  );
}

interface NoShowPlayingProps {
  nextShow: Show | null;
}

function NoShowPlaying({ nextShow }: NoShowPlayingProps) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!nextShow) return;

    const updateCountdown = () => {
      setCountdown(formatCountdown(nextShow.startTime));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextShow]);

  const thumbnailUrl = nextShow ? getYouTubeThumbnail(nextShow.videoId) : null;

  return (
    <section className="no-show-section">
      <div className="no-show-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
        </svg>
      </div>
      <h3 className="no-show-title">No show playing right now</h3>
      {nextShow ? (
        <div className="next-show-preview">
          {thumbnailUrl && (
            <div className="next-show-thumbnail">
              <img src={thumbnailUrl} alt={nextShow.title} />
            </div>
          )}
          <p className="next-show-label">Next up</p>
          <p className="next-show-title">{nextShow.title}</p>
          <p className="next-show-time">
            {formatTime(nextShow.startTime)} • {countdown}
          </p>
        </div>
      ) : (
        <p className="no-show-text">Check back later for scheduled content</p>
      )}
    </section>
  );
}
