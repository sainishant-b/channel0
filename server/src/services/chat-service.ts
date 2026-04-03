import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, UserSession } from '../types.js';

// Simple profanity filter - expand as needed
const PROFANITY_LIST = ['badword1', 'badword2']; // Add actual words

class ChatService {
  private messageHistory: Map<string, ChatMessage[]> = new Map();
  private userSessions: Map<string, UserSession> = new Map();
  private roomUsers: Map<string, Set<string>> = new Map(); // showId -> Set of socketIds
  private rateLimits: Map<string, number[]> = new Map(); // userId -> timestamps

  private readonly MAX_MESSAGES = 200;
  private readonly RATE_LIMIT_MESSAGES = 5;
  private readonly RATE_LIMIT_WINDOW = 10000; // 10 seconds
  private readonly MAX_MESSAGE_LENGTH = 300;

  // ============================================
  // Room Management
  // ============================================

  joinRoom(socketId: string, showId: string, userId: string, username: string): void {
    // Add to room
    if (!this.roomUsers.has(showId)) {
      this.roomUsers.set(showId, new Set());
    }
    this.roomUsers.get(showId)!.add(socketId);

    // Store session
    this.userSessions.set(socketId, {
      userId,
      username,
      showId,
      joinedAt: new Date().toISOString(),
    });

    console.log(`[Chat] User ${username} (${socketId}) joined room ${showId}`);
  }

  leaveRoom(socketId: string): string | null {
    const session = this.userSessions.get(socketId);
    if (!session) return null;

    const { showId, username } = session;

    // Remove from room
    const room = this.roomUsers.get(showId);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) {
        this.roomUsers.delete(showId);
      }
    }

    // Remove session
    this.userSessions.delete(socketId);

    console.log(`[Chat] User ${username} (${socketId}) left room ${showId}`);
    return showId;
  }

  getRoomUserCount(showId: string): number {
    return this.roomUsers.get(showId)?.size || 0;
  }

  getUserSession(socketId: string): UserSession | null {
    return this.userSessions.get(socketId) || null;
  }

  // ============================================
  // Message Management
  // ============================================

  createMessage(
    socketId: string,
    content: string
  ): { success: boolean; message?: ChatMessage; error?: string } {
    const session = this.userSessions.get(socketId);
    if (!session) {
      return { success: false, error: 'Not in a room' };
    }

    // Validate message length
    if (content.length > this.MAX_MESSAGE_LENGTH) {
      return { success: false, error: 'Message too long' };
    }

    if (content.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Check rate limit
    if (!this.checkRateLimit(session.userId)) {
      return { success: false, error: 'Rate limit exceeded. Please wait.' };
    }

    // Filter profanity
    const filteredContent = this.filterProfanity(content);

    // Create message
    const message: ChatMessage = {
      id: `msg_${uuidv4()}`,
      userId: session.userId,
      username: session.username,
      message: filteredContent,
      timestamp: new Date().toISOString(),
      showId: session.showId,
    };

    // Store message
    this.addMessageToHistory(session.showId, message);

    // Update rate limit
    this.recordMessage(session.userId);

    return { success: true, message };
  }

  private addMessageToHistory(showId: string, message: ChatMessage): void {
    if (!this.messageHistory.has(showId)) {
      this.messageHistory.set(showId, []);
    }

    const history = this.messageHistory.get(showId)!;
    history.push(message);

    // Trim to max messages
    if (history.length > this.MAX_MESSAGES) {
      history.shift();
    }
  }

  getMessageHistory(showId: string): ChatMessage[] {
    return this.messageHistory.get(showId) || [];
  }

  // ============================================
  // Rate Limiting
  // ============================================

  private checkRateLimit(userId: string): boolean {
    const timestamps = this.rateLimits.get(userId) || [];
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;

    // Filter to only recent timestamps
    const recentTimestamps = timestamps.filter(t => t > windowStart);
    this.rateLimits.set(userId, recentTimestamps);

    return recentTimestamps.length < this.RATE_LIMIT_MESSAGES;
  }

  private recordMessage(userId: string): void {
    const timestamps = this.rateLimits.get(userId) || [];
    timestamps.push(Date.now());
    this.rateLimits.set(userId, timestamps);
  }

  // ============================================
  // Content Filtering
  // ============================================

  private filterProfanity(content: string): string {
    let filtered = content;
    for (const word of PROFANITY_LIST) {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
    return filtered;
  }

  // ============================================
  // Cleanup
  // ============================================

  clearOldMessages(): void {
    // Clear messages older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    for (const [showId, messages] of this.messageHistory) {
      const filtered = messages.filter(
        m => new Date(m.timestamp).getTime() > cutoff
      );
      if (filtered.length === 0) {
        this.messageHistory.delete(showId);
      } else {
        this.messageHistory.set(showId, filtered);
      }
    }
  }
}

export const chatService = new ChatService();
