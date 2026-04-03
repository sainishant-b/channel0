import { Router, Request, Response } from 'express';
import { scheduleService } from '../services/schedule-service.js';
import { chatService } from '../services/chat-service.js';
import type { ScheduleResponse, CurrentShowResponse } from '../types.js';

const router = Router();

/**
 * GET /api/schedule
 * Returns the full schedule with current and upcoming shows
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const currentShow = scheduleService.getCurrentShow();
    const upcomingShows = scheduleService.getUpcomingShows('main', 5);
    const viewerCount = currentShow 
      ? chatService.getRoomUserCount(currentShow.id)
      : 0;

    const response: ScheduleResponse = {
      currentShow,
      upcomingShows,
      viewerCount,
    };

    res.json(response);
  } catch (error) {
    console.error('[API] Error getting schedule:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

/**
 * GET /api/schedule/current
 * Returns only the currently playing show with timestamp
 */
router.get('/current', (_req: Request, res: Response) => {
  try {
    const currentShow = scheduleService.getCurrentShow();
    const timestamp = currentShow 
      ? scheduleService.calculateCurrentTimestamp(currentShow)
      : 0;
    const viewerCount = currentShow 
      ? chatService.getRoomUserCount(currentShow.id)
      : 0;

    const response: CurrentShowResponse = {
      show: currentShow,
      timestamp,
      viewerCount,
    };

    res.json(response);
  } catch (error) {
    console.error('[API] Error getting current show:', error);
    res.status(500).json({ error: 'Failed to get current show' });
  }
});

/**
 * GET /api/schedule/channels
 * Returns all channels
 */
router.get('/channels', (_req: Request, res: Response) => {
  try {
    const channels = scheduleService.getChannels();
    res.json({ channels });
  } catch (error) {
    console.error('[API] Error getting channels:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

/**
 * GET /api/schedule/check/:videoId
 * Check if a video is currently scheduled
 */
router.get('/check/:videoId', (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const show = scheduleService.getShowByVideoId(videoId);
    
    if (show) {
      const timestamp = scheduleService.calculateCurrentTimestamp(show);
      const viewerCount = chatService.getRoomUserCount(show.id);
      
      res.json({
        isScheduled: true,
        show,
        timestamp,
        viewerCount,
      });
    } else {
      res.json({
        isScheduled: false,
        show: null,
        timestamp: 0,
        viewerCount: 0,
      });
    }
  } catch (error) {
    console.error('[API] Error checking video:', error);
    res.status(500).json({ error: 'Failed to check video' });
  }
});

export default router;
