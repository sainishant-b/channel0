import { useState, useEffect } from 'react';
import type { WatchPartySession } from '@shared/types';
import type { HostChannelResponse, JoinChannelResponse, SessionStatusResponse } from '@shared/message-types';

type PopupView = 'home' | 'host' | 'join' | 'session';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export function Popup() {
  const [view, setView] = useState<PopupView>('home');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WatchPartySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Host form state
  const [channelName, setChannelName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [hosting, setHosting] = useState(false);

  // Join form state
  const [channelCode, setChannelCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    checkSessionStatus();
    loadGoogleUser();
  }, []);

  async function checkSessionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION_STATUS' }) as SessionStatusResponse;
      if (response.active && response.session) {
        setSession(response.session);
        setView('session');
      }
    } catch (err) {
      console.error('Failed to check session status:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleUser() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_GOOGLE_USER' }) as { user: GoogleUser | null };
      setGoogleUser(response.user);
    } catch (err) {
      console.error('Failed to load Google user:', err);
    }
  }

  async function handleGoogleSignIn() {
    setSigningIn(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN' }) as { success: boolean; user?: GoogleUser; error?: string };
      if (response.success && response.user) {
        setGoogleUser(response.user);
      } else {
        alert(response.error || 'Sign in failed');
      }
    } catch (err) {
      console.error('Google sign in failed:', err);
      alert('Sign in failed. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleGoogleSignOut() {
    try {
      await chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_OUT' });
      setGoogleUser(null);
    } catch (err) {
      console.error('Google sign out failed:', err);
    }
  }

  async function handleHost() {
    if (!channelName.trim()) {
      setError('Please enter a channel name');
      return;
    }
    setHosting(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'HOST_CHANNEL',
        channelName: channelName.trim(),
        videoUrl: videoUrl.trim() || undefined,
      }) as HostChannelResponse;

      if (response.success && response.session) {
        setSession(response.session);
        setView('session');
      } else {
        setError(response.error || 'Failed to create channel');
      }
    } catch (err) {
      console.error('Failed to host channel:', err);
      setError('Failed to create channel. Please try again.');
    } finally {
      setHosting(false);
    }
  }

  async function handleJoin() {
    if (!channelCode.trim()) {
      setError('Please enter a channel code');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'JOIN_CHANNEL',
        channelCode: channelCode.trim().toUpperCase(),
      }) as JoinChannelResponse;

      if (response.success && response.session) {
        setSession(response.session);
        setView('session');
      } else {
        setError(response.error || 'Channel not found');
      }
    } catch (err) {
      console.error('Failed to join channel:', err);
      setError('Failed to join channel. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    try {
      await chrome.runtime.sendMessage({ type: 'LEAVE_CHANNEL' });
      setSession(null);
      setView('home');
      setChannelName('');
      setVideoUrl('');
      setChannelCode('');
      setError(null);
    } catch (err) {
      console.error('Failed to leave channel:', err);
    }
  }

  function handleCopyCode() {
    if (session?.channelCode) {
      navigator.clipboard.writeText(session.channelCode);
    }
  }

  function handleOpenSettings() {
    chrome.runtime.openOptionsPage();
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="popup-logo">
          <span className="logo-icon">▶</span>
          <span className="logo-text">Watch Party</span>
        </div>
        <div className="header-actions">
          {googleUser ? (
            <div className="user-profile">
              <img
                src={googleUser.picture}
                alt={googleUser.name}
                className="user-avatar"
                title={googleUser.email}
              />
              <button className="sign-out-btn" onClick={handleGoogleSignOut} title="Sign out">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                </svg>
              </button>
            </div>
          ) : (
            <button
              className="sign-in-btn"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              title="Sign in with Google"
            >
              {signingIn ? (
                <span className="btn-spinner"></span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Sign in</span>
                </>
              )}
            </button>
          )}
          <button className="icon-btn" onClick={handleOpenSettings} title="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="popup-main">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <span>Loading...</span>
          </div>
        ) : view === 'home' ? (
          <HomeView
            onHost={() => { setView('host'); setError(null); }}
            onJoin={() => { setView('join'); setError(null); }}
          />
        ) : view === 'host' ? (
          <HostView
            channelName={channelName}
            videoUrl={videoUrl}
            error={error}
            hosting={hosting}
            onChannelNameChange={setChannelName}
            onVideoUrlChange={setVideoUrl}
            onHost={handleHost}
            onBack={() => { setView('home'); setError(null); }}
          />
        ) : view === 'join' ? (
          <JoinView
            channelCode={channelCode}
            error={error}
            joining={joining}
            onChannelCodeChange={setChannelCode}
            onJoin={handleJoin}
            onBack={() => { setView('home'); setError(null); }}
          />
        ) : view === 'session' && session ? (
          <SessionView
            session={session}
            onLeave={handleLeave}
            onCopyCode={handleCopyCode}
          />
        ) : null}
      </main>

      {/* Footer */}
      <footer className="popup-footer">
        <span className="popup-version">v1.0.0</span>
      </footer>
    </div>
  );
}

// ============================================
// Home View — Host / Join Landing
// ============================================

interface HomeViewProps {
  onHost: () => void;
  onJoin: () => void;
}

function HomeView({ onHost, onJoin }: HomeViewProps) {
  return (
    <div className="home-view">
      <div className="home-hero">
        <div className="hero-icon">
          <svg viewBox="0 0 64 64" width="64" height="64" fill="none">
            <rect x="4" y="12" width="56" height="36" rx="6" fill="url(#grad1)" stroke="#ff4444" strokeWidth="2"/>
            <polygon points="26,22 26,40 42,31" fill="white"/>
            <circle cx="52" cy="44" r="10" fill="#3ea6ff" stroke="#0f0f0f" strokeWidth="2"/>
            <path d="M48 44h8M52 40v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="60" y2="48">
                <stop offset="0%" stopColor="#1a1a2e"/>
                <stop offset="100%" stopColor="#16213e"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h2 className="hero-title">Watch Together</h2>
        <p className="hero-subtitle">Start a watch party or join an existing one</p>
      </div>

      <div className="home-actions">
        <button className="action-card host-card" onClick={onHost}>
          <div className="action-card-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </div>
          <div className="action-card-content">
            <span className="action-card-title">Host a Party</span>
            <span className="action-card-desc">Create a channel & invite friends</span>
          </div>
          <svg className="action-card-arrow" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>

        <button className="action-card join-card" onClick={onJoin}>
          <div className="action-card-icon join-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div className="action-card-content">
            <span className="action-card-title">Join a Party</span>
            <span className="action-card-desc">Enter a code to join friends</span>
          </div>
          <svg className="action-card-arrow" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================
// Host View — Create Channel Form
// ============================================

interface HostViewProps {
  channelName: string;
  videoUrl: string;
  error: string | null;
  hosting: boolean;
  onChannelNameChange: (val: string) => void;
  onVideoUrlChange: (val: string) => void;
  onHost: () => void;
  onBack: () => void;
}

function HostView({ channelName, videoUrl, error, hosting, onChannelNameChange, onVideoUrlChange, onHost, onBack }: HostViewProps) {
  return (
    <div className="form-view">
      <button className="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        Back
      </button>

      <div className="form-header">
        <div className="form-icon host-form-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>
        <h3 className="form-title">Host a Watch Party</h3>
        <p className="form-subtitle">Create a channel and share the code</p>
      </div>

      <div className="form-fields">
        <div className="form-group">
          <label className="form-label">Channel Name</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Movie Night"
            value={channelName}
            onChange={(e) => onChannelNameChange(e.target.value)}
            maxLength={30}
            onKeyDown={(e) => e.key === 'Enter' && onHost()}
          />
        </div>

        <div className="form-group">
          <label className="form-label">YouTube URL <span className="optional-tag">optional</span></label>
          <input
            type="text"
            className="form-input"
            placeholder="https://youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(e) => onVideoUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onHost()}
          />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button className="primary-btn host-btn" onClick={onHost} disabled={hosting}>
        {hosting ? (
          <>
            <span className="btn-spinner"></span>
            Creating...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
            </svg>
            Create Channel
          </>
        )}
      </button>
    </div>
  );
}

// ============================================
// Join View — Enter Code Form
// ============================================

interface JoinViewProps {
  channelCode: string;
  error: string | null;
  joining: boolean;
  onChannelCodeChange: (val: string) => void;
  onJoin: () => void;
  onBack: () => void;
}

function JoinView({ channelCode, error, joining, onChannelCodeChange, onJoin, onBack }: JoinViewProps) {
  return (
    <div className="form-view">
      <button className="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        Back
      </button>

      <div className="form-header">
        <div className="form-icon join-form-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </div>
        <h3 className="form-title">Join a Watch Party</h3>
        <p className="form-subtitle">Enter the code shared by the host</p>
      </div>

      <div className="form-fields">
        <div className="form-group">
          <label className="form-label">Channel Code</label>
          <input
            type="text"
            className="form-input code-input"
            placeholder="e.g. ABCD1234"
            value={channelCode}
            onChange={(e) => onChannelCodeChange(e.target.value.toUpperCase())}
            maxLength={8}
            onKeyDown={(e) => e.key === 'Enter' && onJoin()}
          />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button className="primary-btn join-btn" onClick={onJoin} disabled={joining}>
        {joining ? (
          <>
            <span className="btn-spinner"></span>
            Joining...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Join Party
          </>
        )}
      </button>
    </div>
  );
}

// ============================================
// Session View — Active Watch Party
// ============================================

interface SessionViewProps {
  session: WatchPartySession;
  onLeave: () => void;
  onCopyCode: () => void;
}

function SessionView({ session, onLeave, onCopyCode }: SessionViewProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopyCode();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenVideo() {
    if (session.videoId) {
      chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${session.videoId}` });
    }
  }

  return (
    <div className="session-view">
      <div className="session-status-badge">
        <span className="live-dot"></span>
        {session.isHost ? 'HOSTING' : 'WATCHING'}
      </div>

      <div className="session-info">
        <h3 className="session-channel-name">{session.channelName}</h3>
        <div className="session-meta">
          <span className="session-viewers">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            {session.viewerCount} watching
          </span>
          <span className="session-host">
            Hosted by {session.isHost ? 'you' : session.hostUsername}
          </span>
        </div>
      </div>

      <div className="session-code-card">
        <span className="code-label">Share this code with friends</span>
        <div className="code-display">
          <span className="code-value">{session.channelCode}</span>
          <button className="copy-btn" onClick={handleCopy} title="Copy code">
            {copied ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#2ba640">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {session.videoId && (
        <div className="session-video-card" onClick={handleOpenVideo}>
          <img
            className="session-thumbnail"
            src={`https://img.youtube.com/vi/${session.videoId}/mqdefault.jpg`}
            alt={session.videoTitle || 'Video thumbnail'}
          />
          <div className="session-video-info">
            <span className="session-video-title">{session.videoTitle || 'Untitled Video'}</span>
            <span className="session-video-link">Open in YouTube →</span>
          </div>
        </div>
      )}

      <button className="leave-btn" onClick={onLeave}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
        </svg>
        Leave Party
      </button>
    </div>
  );
}
