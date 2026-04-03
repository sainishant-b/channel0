import { Router, Request, Response } from 'express';
import { chatService } from '../services/chat-service.js';
import type { ChatHistoryResponse } from '../types.js';

const router = Router();

/**
 * GET /api/chat/:showId/history
 * Returns chat history for a show
 */
router.get('/:showId/history', (req: Request, res: Response) => {
  try {
    const { showId } = req.params;
    const messages = chatService.getMessageHistory(showId);

    const response: ChatHistoryResponse = {
      messages,
    };

    res.json(response);
  } catch (error) {
    console.error('[API] Error getting chat history:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

/**
 * GET /api/chat/:showId/users
 * Returns user count for a show
 */
router.get('/:showId/users', (req: Request, res: Response) => {
  try {
    const { showId } = req.params;
    const count = chatService.getRoomUserCount(showId);

    res.json({ showId, count });
  } catch (error) {
    console.error('[API] Error getting user count:', error);
    res.status(500).json({ error: 'Failed to get user count' });
  }
});

export default router;
