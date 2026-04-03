import type { Show } from '@shared/types';
import { getSettings } from '@shared/storage';

const NOTIFICATION_IDS = {
  SHOW_STARTING: 'show_starting_',
  SHOW_REMINDER: 'show_reminder_',
};

class NotificationManager {
  /**
   * Show notification when a show is starting
   */
  async showStartingNotification(show: Show): Promise<void> {
    const settings = await getSettings();
    
    if (!settings.notifications.enabled || !settings.notifications.showStarting) {
      return;
    }

    const notificationId = `${NOTIFICATION_IDS.SHOW_STARTING}${show.id}`;

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
      title: 'Watch Party Starting Now!',
      message: `"${show.title}" is now live. Click to watch together!`,
      priority: 2,
      requireInteraction: true,
    });

    console.log('[NotificationManager] Show starting notification sent:', show.title);
  }

  /**
   * Show reminder notification before a show starts
   */
  async showReminderNotification(show: Show, minutesBefore: number): Promise<void> {
    const settings = await getSettings();
    
    if (!settings.notifications.enabled) {
      return;
    }

    const notificationId = `${NOTIFICATION_IDS.SHOW_REMINDER}${show.id}`;

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
      title: 'Watch Party Starting Soon!',
      message: `"${show.title}" starts in ${minutesBefore} minutes`,
      priority: 2,
    });

    console.log('[NotificationManager] Reminder notification sent:', show.title);
  }

  /**
   * Handle notification click - navigate to the video
   */
  async handleNotificationClick(notificationId: string): Promise<void> {
    console.log('[NotificationManager] Notification clicked:', notificationId);

    // Extract show ID from notification ID
    let showId: string | null = null;
    
    if (notificationId.startsWith(NOTIFICATION_IDS.SHOW_STARTING)) {
      showId = notificationId.replace(NOTIFICATION_IDS.SHOW_STARTING, '');
    } else if (notificationId.startsWith(NOTIFICATION_IDS.SHOW_REMINDER)) {
      showId = notificationId.replace(NOTIFICATION_IDS.SHOW_REMINDER, '');
    }

    if (!showId) {
      return;
    }

    // Get show info from storage
    const result = await chrome.storage.local.get(`show_${showId}`);
    const showInfo = result[`show_${showId}`];

    if (showInfo?.videoId) {
      // Calculate current timestamp
      const startTime = new Date(showInfo.startTime).getTime();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timestamp = Math.max(0, elapsed);

      // Open YouTube
      const url = `https://www.youtube.com/watch?v=${showInfo.videoId}&t=${timestamp}`;
      await chrome.tabs.create({ url });
    }

    // Clear the notification
    await chrome.notifications.clear(notificationId);
  }

  /**
   * Store show info for notification click handling
   */
  async storeShowInfo(show: Show): Promise<void> {
    await chrome.storage.local.set({
      [`show_${show.id}`]: {
        videoId: show.videoId,
        title: show.title,
        startTime: show.startTime,
      },
    });
  }
}

export const notificationManager = new NotificationManager();
