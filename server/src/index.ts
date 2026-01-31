import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { RoomManager } from './services/RoomManager.js';
import { RedisService } from './services/RedisService.js';
import { registerSocketHandlers } from './sockets/handlers.js';
import type { ServerToClientEvents, ClientToServerEvents } from './types/index.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';
const REDIS_URL = process.env.REDIS_URL;

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow WebSocket connections
}));

// CORS configuration
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? CLIENT_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api', limiter);

// Initialize Socket.IO
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024
  }
});

// Initialize services
let redis: RedisService | null = null;
let roomManager: RoomManager;

async function initializeServices(): Promise<void> {
  // Try to connect to Redis if URL is provided
  if (REDIS_URL) {
    try {
      redis = new RedisService(REDIS_URL);
      await redis.connect();
      roomManager = new RoomManager(redis);
      console.log('✅ Using Redis for state management');
    } catch (error) {
      console.warn('⚠️ Redis connection failed, using in-memory storage:', error);
      redis = null;
      roomManager = new RoomManager();
    }
  } else {
    console.log('ℹ️ No REDIS_URL provided, using in-memory storage');
    roomManager = new RoomManager();
  }
}

// Health check endpoint
app.get('/health', async (_req, res) => {
  const redisHealthy = redis ? await redis.ping() : true;
  
  res.json({
    status: redisHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redis ? (redisHealthy ? 'connected' : 'disconnected') : 'not configured',
    version: '1.0.0'
  });
});

// Get server stats
app.get('/api/stats', (_req, res) => {
  const stats = roomManager.getStats();
  res.json(stats);
});

// Get public waiting rooms
app.get('/api/rooms', (_req, res) => {
  const rooms = roomManager.getPublicWaitingRooms();
  res.json({ rooms });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  res.json({ room: roomManager.serializeRoom(room) });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket, roomManager);
});

// Connection count middleware for Socket.IO
io.engine.on('connection', () => {
  const count = io.engine.clientsCount;
  if (count % 100 === 0) {
    console.log(`📊 Active connections: ${count}`);
  }
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close all socket connections
  io.disconnectSockets(true);
  
  // Close HTTP server
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Disconnect Redis
  if (redis) {
    await redis.disconnect();
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start(): Promise<void> {
  await initializeServices();

  httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ♔ Chess Online Server                                   ║
║                                                           ║
║   🚀 Server running on port ${PORT}                       ║
║   🌍 Environment: ${NODE_ENV.padEnd(10)}                  ║
║   🔗 Client URL: ${CLIENT_URL.slice(0, 30).padEnd(30)}    ║
║   📦 Redis: ${redis ? 'Connected' : 'In-Memory'.padEnd(10)}                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
