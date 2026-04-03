import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { chatService } from './services/chat-service.js';
import { scheduleService } from './services/schedule-service.js';
import type { WSJoinData, WSMessageData } from './types.js';

export function setupWebSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // In production, restrict to extension origin
      methods: ['GET', 'POST'],
    },
    pingInterval: 30000,
    pingTimeout: 45000,
  });

  // Sync broadcast interval
  let syncInterval: NodeJS.Timeout | null = null;

  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Handle join
    socket.on('join', (data: WSJoinData) => {
      handleJoin(socket, data, io);
    });

    // Handle message
    socket.on('message', (data: WSMessageData) => {
      handleMessage(socket, data, io);
    });
    
    // Handle video ended
    socket.on('videoEnded', (data: { showId: string }) => {
      handleVideoEnded(socket, data, io);
    });

    // Handle leave
    socket.on('leave', () => {
      handleLeave(socket, io);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[WS] Client disconnected: ${socket.id}, reason: ${reason}`);
      handleLeave(socket, io);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[WS] Socket error for ${socket.id}:`, error);
    });
  });

  // Start sync broadcast
  syncInterval = setInterval(() => {
    broadcastSync(io);
    
    // Check if show changed and broadcast
    const newShow = scheduleService.checkForShowChange();
    if (newShow) {
      console.log('[WS] Broadcasting video change:', newShow.videoId);
      io.emit('videoChange', { 
        videoId: newShow.videoId,
        timestamp: 0,
        title: newShow.title 
      });
    }
  }, 5000);

  // Cleanup on server close
  io.on('close', () => {
    if (syncInterval) {
      clearInterval(syncInterval);
    }
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

function handleJoin(socket: Socket, data: WSJoinData, io: SocketIOServer): void {
  const { showId, userId, username } = data;

  if (!showId || !userId || !username) {
    socket.emit('error', { code: 'INVALID_DATA', message: 'Missing required fields' });
    return;
  }

  // Leave any existing room first
  const existingSession = chatService.getUserSession(socket.id);
  if (existingSession) {
    socket.leave(existingSession.showId);
    chatService.leaveRoom(socket.id);
  }

  // Join new room
  socket.join(showId);
  chatService.joinRoom(socket.id, showId, userId, username);

  // Send welcome
  socket.emit('welcome', { userId });

  // Send chat history
  const history = chatService.getMessageHistory(showId);
  socket.emit('history', { messages: history });

  // Broadcast user count to room
  const userCount = chatService.getRoomUserCount(showId);
  io.to(showId).emit('userCount', { showId, count: userCount });

  // Send current sync timestamp
  const currentShow = scheduleService.getShowByVideoId(showId);
  if (currentShow) {
    const timestamp = scheduleService.calculateCurrentTimestamp(currentShow);
    socket.emit('sync', { showId, timestamp });
  }

  console.log(`[WS] User ${username} joined room ${showId}, total users: ${userCount}`);
}

function handleMessage(socket: Socket, data: WSMessageData, io: SocketIOServer): void {
  const { content } = data;

  if (!content || typeof content !== 'string') {
    socket.emit('error', { code: 'INVALID_MESSAGE', message: 'Invalid message content' });
    return;
  }

  const result = chatService.createMessage(socket.id, content);

  if (!result.success) {
    socket.emit('error', { code: 'MESSAGE_FAILED', message: result.error });
    return;
  }

  // Broadcast message to room
  const session = chatService.getUserSession(socket.id);
  if (session && result.message) {
    io.to(session.showId).emit('message', { data: result.message });
    console.log(`[WS] Message from ${session.username} in ${session.showId}: ${content.substring(0, 50)}...`);
  }
}

function handleVideoEnded(socket: Socket, data: { showId: string }, io: SocketIOServer): void {
  console.log(`[WS] Client reported video ended for show: ${data.showId}`);
  
  // Advance to next video
  scheduleService.skipCurrent();
  
  // Get the new current show
  const newShow = scheduleService.getCurrentShow();
  
  if (newShow) {
    console.log(`[WS] Broadcasting video change to: ${newShow.videoId}`);
    
    // Broadcast to all connected clients
    io.emit('videoChange', {
      videoId: newShow.videoId,
      timestamp: 0,
      title: newShow.title,
    });
  } else {
    console.log('[WS] No more videos in queue');
  }
}

function handleLeave(socket: Socket, io: SocketIOServer): void {
  const showId = chatService.leaveRoom(socket.id);
  
  if (showId) {
    socket.leave(showId);
    
    // Broadcast updated user count
    const userCount = chatService.getRoomUserCount(showId);
    io.to(showId).emit('userCount', { showId, count: userCount });
  }
}

function broadcastSync(io: SocketIOServer): void {
  // Get all active rooms and broadcast sync for each
  const rooms = io.sockets.adapter.rooms;
  
  for (const [roomId, sockets] of rooms) {
    // Skip socket ID rooms (Socket.io creates a room for each socket)
    if (sockets.size === 0 || roomId.startsWith('socket_')) continue;
    
    // Check if this is a show room (not a socket ID)
    const currentShow = scheduleService.getCurrentShow();
    if (currentShow && currentShow.id === roomId) {
      const timestamp = scheduleService.calculateCurrentTimestamp(currentShow);
      io.to(roomId).emit('sync', { showId: roomId, timestamp });
    }
  }
}
