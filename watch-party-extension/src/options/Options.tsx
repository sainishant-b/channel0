import { useState, useEffect } from 'react';
import type { Settings } from '@shared/types';
import { getSettings, saveSettings, getUsername, setUsername } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/constants';

export function Options() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [username, setUsernameState] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const [loadedSettings, loadedUsername] = await Promise.all([
      getSettings(),
      getUsername(),
    ]);
    setSettingsState(loadedSettings);
    setUsernameState(loadedUsername || '');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings(settings);
      if (username) {
        await setUsername(username);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  }

  function updateNotifications(updates: Partial<Settings['notifications']>) {
    setSettingsState(prev => ({
      ...prev,
      notifications: { ...prev.notifications, ...updates },
    }));
  }

  function updateAppearance(updates: Partial<Settings['appearance']>) {
    setSettingsState(prev => ({
      ...prev,
      appearance: { ...prev.appearance, ...updates },
    }));
  }

  function updateBehavior(updates: Partial<Settings['behavior']>) {
    setSettingsState(prev => ({
      ...prev,
      behavior: { ...prev.behavior, ...updates },
    }));
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">▶</span>
            <span className="logo-text">Watch Party Settings</span>
          </div>
        </div>
      </header>

      <main className="options-main">
        {/* Username Section */}
        <section className="settings-section">
          <h2 className="section-title">Profile</h2>
          <div className="setting-item">
            <label className="setting-label">Username</label>
            <input
              type="text"
              className="setting-input"
              value={username}
              onChange={(e) => setUsernameState(e.target.value)}
              placeholder="Enter your username"
              maxLength={20}
            />
            <p className="setting-hint">3-20 characters, letters, numbers, and underscores only</p>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="settings-section">
          <h2 className="section-title">Notifications</h2>
          
          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Enable notifications</span>
              <input
                type="checkbox"
                checked={settings.notifications.enabled}
                onChange={(e) => updateNotifications({ enabled: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Notify when shows start</span>
              <input
                type="checkbox"
                checked={settings.notifications.showStarting}
                onChange={(e) => updateNotifications({ showStarting: e.target.checked })}
                disabled={!settings.notifications.enabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <label className="setting-label">Reminder time</label>
            <select
              className="setting-select"
              value={settings.notifications.reminderMinutes}
              onChange={(e) => updateNotifications({ reminderMinutes: Number(e.target.value) })}
              disabled={!settings.notifications.enabled}
            >
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={15}>15 minutes before</option>
            </select>
          </div>

          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Notification sound</span>
              <input
                type="checkbox"
                checked={settings.notifications.sound}
                onChange={(e) => updateNotifications({ sound: e.target.checked })}
                disabled={!settings.notifications.enabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* Appearance Section */}
        <section className="settings-section">
          <h2 className="section-title">Appearance</h2>
          
          <div className="setting-item">
            <label className="setting-label">Chat overlay position</label>
            <select
              className="setting-select"
              value={settings.appearance.overlayPosition}
              onChange={(e) => updateAppearance({ overlayPosition: e.target.value as 'right' | 'left' })}
            >
              <option value="right">Right side</option>
              <option value="left">Left side</option>
            </select>
          </div>

          <div className="setting-item">
            <label className="setting-label">Overlay width</label>
            <div className="range-setting">
              <input
                type="range"
                min={280}
                max={450}
                step={10}
                value={settings.appearance.overlayWidth}
                onChange={(e) => updateAppearance({ overlayWidth: Number(e.target.value) })}
              />
              <span className="range-value">{settings.appearance.overlayWidth}px</span>
            </div>
          </div>

          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Auto-collapse when video is fullscreen</span>
              <input
                type="checkbox"
                checked={settings.appearance.autoCollapse}
                onChange={(e) => updateAppearance({ autoCollapse: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* Behavior Section */}
        <section className="settings-section">
          <h2 className="section-title">Behavior</h2>
          
          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Auto-sync playback</span>
              <input
                type="checkbox"
                checked={settings.behavior.autoSync}
                onChange={(e) => updateBehavior({ autoSync: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
            <p className="setting-hint">Automatically seek to the correct timestamp when out of sync</p>
          </div>

          <div className="setting-item">
            <label className="toggle-setting">
              <span className="toggle-label">Open videos in new tab</span>
              <input
                type="checkbox"
                checked={settings.behavior.openInNewTab}
                onChange={(e) => updateBehavior({ openInNewTab: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* Save Button */}
        <div className="save-section">
          <button 
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>

        {/* About Section */}
        <div className="about-section">
          <p>Watch Party Extension v1.0.0</p>
          <p>Watch YouTube together with friends</p>
        </div>
      </main>
    </div>
  );
}
