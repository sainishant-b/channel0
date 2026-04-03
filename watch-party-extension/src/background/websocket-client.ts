import { io, Socket } from 'socket.io-client';
import { WS_URL, TIMING } from '@shared/constants';
import type { ChatMessage } from '@shared/types';

// ============================================
// Types
// ============================================

type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

interface WSEventHandlers {
  onMessage: (message: ChatMessage) => void;
  onUserCount: (showId: string, count: number) => void;
  onSync: (showId: string, timestamp: number) => void;
  onConnectionChange: (status: ConnectionStatus) => void;
  onHistory: (messages: ChatMessage[]) => void;
  onError: (error: string) => void;
  onVideoChange?: (videoId: string, timestamp: number) => void;
}

// ============================================
// WebSocket Client
// ============================================

class WebSocketClient {
  private socket: Socket | null = null;
  private currentShowId: string | null = null;
  private userId: string | null = null;
  private username: string | null = null;
  private handlers: WSEventHandlers | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get connectionStatus(): ConnectionStatus {
    if (!this.socket) return 'disconnected';
    if (this.socket.connected) return 'connected';
    if (this.reconnectAttempts > 0) return 'reconnecting';
    return 'connecting';
  }

  /**
   * Initialize the WebSocket connection
   */
  connect(handlers: WSEventHandlers): void {
    if (this.socket?.connected) {
      console.log('[WS Client] Already connected');
      return;
    }

    this.handlers = handlers;

    console.log('[WS Client] Connecting to', WS_URL);

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: TIMING.RECONNECT_BASE_DELAY,
      reconnectionDelayMax: TIMING.RECONNECT_MAX_DELAY,
      timeout: 10000,
    });

    this.setupEventListeners();
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.currentShowId) {
      this.leaveRoom();
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.reconnectAttempts = 0;
    console.log('[WS Client] Disconnected');
  }

  /**
   * Join a chat room for a show
   */
  joinRoom(showId: string, odId: string, odname: string): void {
    if (!this.socket?.connected) {
      console.warn('[WS Client] Cannot join room - not connected');
      return;
    }

    // Leave current room first
    if (this.currentShowId && this.currentShowId !== showId) {
      this.leaveRoom();
    }

    this.currentShowId = showId;
    this.userId = odId;
    this.username = odname;

    console.log('[WS Client] Joining room:', showId, 'as', odname);

    this.socket.emit('join', {
      showId,
      userId: odId,
      username: odname,
    });
  }

  /**
   * Leave the current chat room
   */
  leaveRoom(): void {
    if (!this.socket?.connected || !this.currentShowId) {
      return;
    }

    console.log('[WS Client] Leaving room:', this.currentShowId);

    this.socket.emit('leave', {
      showId: this.currentShowId,
    });

    this.currentShowId = null;
  }

  /**
   * Send a chat message
   */
  sendMessage(content: string): boolean {
    if (!this.socket?.connected) {
      console.warn('[WS Client] Cannot send message - not connected');
      return false;
    }

    if (!this.currentShowId) {
      console.warn('[WS Client] Cannot send message - not in a room');
      return false;
    }

    console.log('[WS Client] Sending message:', content.substring(0, 50));

    this.socket.emit('message', {
      showId: this.currentShowId,
      content,
    });

    return true;
  }
  
  /**
   * Notify server that video ended
   */
  sendVideoEnded(showId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WS Client] Cannot send videoEnded - not connected');
      return;
    }
    
    console.log('[WS Client] Sending videoEnded for show:', showId);
    
    this.socket.emit('videoEnded', { showId });
  }

  /**
   * Set up Socket.io event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('[WS Client] Connected');
      this.reconnectAttempts = 0;
      this.handlers?.onConnectionChange('connected');

      // Rejoin room if we were in one
      if (this.currentShowId && this.userId && this.username) {
        this.joinRoom(this.currentShowId, this.userId, this.username);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS Client] Disconnected:', reason);
      this.handlers?.onConnectionChange('disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WS Client] Connection error:', error.message);
      this.reconnectAttempts++;
      this.handlers?.onConnectionChange('reconnecting');
    });

    // Chat events
    this.socket.on('welcome', (data: { odId: string }) => {
      console.log('[WS Client] Welcome received, userId:', data.odId);
    });

    this.socket.on('history', (data: { messages: ChatMessage[] }) => {
      console.log('[WS Client] History received:', data.messages.length, 'messages');
      this.handlers?.onHistory(data.messages);
    });

    this.socket.on('message', (data: { data: ChatMessage }) => {
      console.log('[WS Client] Message received from:', data.data.username);
      this.handlers?.onMessage(data.data);
    });

    this.socket.on('userCount', (data: { showId: string; count: number }) => {
      console.log('[WS Client] User count update:', data.count);
      this.handlers?.onUserCount(data.showId, data.count);
    });

    this.socket.on('sync', (data: { showId: string; timestamp: number }) => {
      this.handlers?.onSync(data.showId, data.timestamp);
    });

    this.socket.on('error', (data: { code: string; message: string }) => {
      console.error('[WS Client] Server error:', data.code, data.message);
      this.handlers?.onError(data.message);
    });
    
    this.socket.on('videoChange', (data: { videoId: string; timestamp: number }) => {
      console.log('[WS Client] Video changed to:', data.videoId);
      this.handlers?.onVideoChange?.(data.videoId, data.timestamp);
    });
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
