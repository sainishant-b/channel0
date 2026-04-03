import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupWebSocket } from './websocket-server.js';
import scheduleRoutes from './routes/schedule.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Configuration
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// Middleware
app.use(cors({
  origin: '*', // In production, restrict to extension origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Serve static admin page
app.use('/admin', express.static(join(__dirname, 'admin')));

// Request logging
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/schedule', scheduleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Setup WebSocket
const io = setupWebSocket(httpServer);

// Start server
httpServer.listen(Number(PORT), HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Watch Party Server Started             ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  HTTP:      http://${HOST}:${PORT}          ║`);
  console.log(`║  WebSocket: ws://${HOST}:${PORT}            ║`);
  console.log(`║  Admin:     http://${HOST}:${PORT}/admin    ║`);
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                ║');
  console.log('║    GET  /health                            ║');
  console.log('║    GET  /api/schedule                      ║');
  console.log('║    GET  /api/schedule/current              ║');
  console.log('║    GET  /api/schedule/check/:videoId       ║');
  console.log('║    GET  /api/chat/:showId/history          ║');
  console.log('║    GET  /api/admin/queue                   ║');
  console.log('║    POST /api/admin/queue                   ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  io.close();
  httpServer.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  io.close();
  httpServer.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
