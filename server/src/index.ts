import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { RoomManager } from './services/RoomManager.js';
import { RedisService } from './services/RedisService.js';
import { DatabaseService } from './services/DatabaseService.js';
import { UserService } from './services/UserService.js';
import { AuthService } from './services/AuthService.js';
import { registerSocketHandlers } from './sockets/handlers.js';
import { createAuthRoutes } from './routes/auth.js';
import type { ServerToClientEvents, ClientToServerEvents, RoomState } from './types/index.js';

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
const allowedOrigins = NODE_ENV === 'production' 
  ? CLIENT_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

console.log('🔒 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

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
let database: DatabaseService | null = null;
let userService: UserService | null = null;
let authService: AuthService | null = null;
let roomManager: RoomManager;

async function initializeServices(): Promise<void> {
  // Try to connect to PostgreSQL if DATABASE_URL is provided
  if (process.env.DATABASE_URL) {
    try {
      database = new DatabaseService(process.env.DATABASE_URL);
      const connected = await database.connect();
      
      if (connected) {
        await database.runMigrations();
        userService = new UserService(database);
        authService = new AuthService(database, userService);
        console.log('✅ PostgreSQL connected and migrations complete');
        
        // Register auth routes
        app.use('/api/auth', createAuthRoutes(authService, userService));
        console.log('✅ Auth routes registered');
      }
    } catch (error) {
      console.warn('⚠️ PostgreSQL connection failed:', error);
      database = null;
    }
  } else {
    console.log('ℹ️ No DATABASE_URL provided, auth features disabled');
  }

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
  const dbHealth = database ? await database.healthCheck() : { status: 'not configured', latency: 0 };
  
  res.json({
    status: redisHealthy && dbHealth.status !== 'unhealthy' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redis ? (redisHealthy ? 'connected' : 'disconnected') : 'not configured',
    database: dbHealth.status,
    dbLatency: dbHealth.latency,
    authEnabled: !!authService,
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

// Get public room listings for browse page
app.get('/api/rooms/listings', (req, res) => {
  const filters: {
    state?: 'waiting_for_player' | 'in_progress' | 'finished';
    hasTimeControl?: boolean;
  } = {};

  if (req.query.state) {
    filters.state = req.query.state as RoomState;
  }
  if (req.query.hasTimeControl !== undefined) {
    filters.hasTimeControl = req.query.hasTimeControl === 'true';
  }

  const listings = roomManager.getPublicRoomListings(filters);
  res.json({ listings });
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

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    // Check for JWT token in auth header, handshake query, or auth object
    const token = 
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (token && authService) {
      // Verify the token
      const decoded = authService.verifyAccessToken(token as string);
      if (decoded) {
        // Attach user data to socket
        socket.data = {
          userId: decoded.userId,
          username: decoded.username
        };
        console.log(`🔐 Authenticated socket for user: ${decoded.username}`);
      }
    }
    
    // Always allow connection (auth is optional for guest play)
    next();
  } catch (error) {
    // Invalid token - still allow connection as anonymous user
    console.log(`⚠️ Socket auth failed, connecting as anonymous`);
    next();
  }
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

  // Disconnect Database
  if (database) {
    await database.disconnect();
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
║   📦 Redis: ${(redis ? 'Connected' : 'In-Memory').padEnd(10)}                        ║
║   🗄️  Database: ${(database ? 'Connected' : 'Disabled').padEnd(10)}                     ║
║   🔐 Auth: ${(authService ? 'Enabled' : 'Disabled').padEnd(10)}                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
