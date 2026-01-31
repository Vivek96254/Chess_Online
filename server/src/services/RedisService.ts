import Redis from 'ioredis';
import type { SerializableRoom, GameState } from '../types/index.js';

/**
 * RedisService - Handles all Redis operations
 * Manages room storage, game state, and pub/sub for scaling
 */
export class RedisService {
  private redis: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private readonly ROOM_PREFIX = 'room:';
  private readonly GAME_PREFIX = 'game:';
  private readonly PLAYER_ROOM_PREFIX = 'player:room:';
  private readonly ROOM_TTL = 3600 * 24; // 24 hours
  private readonly INACTIVE_ROOM_TTL = 1800; // 30 minutes

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.publisher = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('error', (err) => console.error('Redis error:', err));
    this.subscriber.on('error', (err) => console.error('Redis subscriber error:', err));
    this.publisher.on('error', (err) => console.error('Redis publisher error:', err));
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.redis.connect(),
      this.subscriber.connect(),
      this.publisher.connect()
    ]);
    console.log('✅ Redis connected');
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.redis.quit(),
      this.subscriber.quit(),
      this.publisher.quit()
    ]);
    console.log('Redis disconnected');
  }

  /**
   * Store a room
   */
  async setRoom(room: SerializableRoom): Promise<void> {
    const key = `${this.ROOM_PREFIX}${room.roomId}`;
    await this.redis.setex(key, this.ROOM_TTL, JSON.stringify(room));
  }

  /**
   * Get a room by ID
   */
  async getRoom(roomId: string): Promise<SerializableRoom | null> {
    const key = `${this.ROOM_PREFIX}${roomId}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as SerializableRoom;
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomId: string): Promise<void> {
    const key = `${this.ROOM_PREFIX}${roomId}`;
    await this.redis.del(key);
  }

  /**
   * Update room's last activity timestamp
   */
  async touchRoom(roomId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    if (room) {
      room.lastActivity = Date.now();
      await this.setRoom(room);
    }
  }

  /**
   * Get all active rooms
   */
  async getAllRooms(): Promise<SerializableRoom[]> {
    const keys = await this.redis.keys(`${this.ROOM_PREFIX}*`);
    if (keys.length === 0) return [];
    
    const rooms: SerializableRoom[] = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        rooms.push(JSON.parse(data));
      }
    }
    return rooms;
  }

  /**
   * Get public rooms waiting for players
   */
  async getPublicWaitingRooms(): Promise<SerializableRoom[]> {
    const rooms = await this.getAllRooms();
    return rooms.filter(r => 
      r.state === 'waiting_for_player' && 
      !r.settings.isPrivate
    );
  }

  /**
   * Store game state
   */
  async setGameState(roomId: string, gameState: GameState): Promise<void> {
    const key = `${this.GAME_PREFIX}${roomId}`;
    await this.redis.setex(key, this.ROOM_TTL, JSON.stringify(gameState));
  }

  /**
   * Get game state
   */
  async getGameState(roomId: string): Promise<GameState | null> {
    const key = `${this.GAME_PREFIX}${roomId}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as GameState;
  }

  /**
   * Delete game state
   */
  async deleteGameState(roomId: string): Promise<void> {
    const key = `${this.GAME_PREFIX}${roomId}`;
    await this.redis.del(key);
  }

  /**
   * Map player to room
   */
  async setPlayerRoom(playerId: string, roomId: string): Promise<void> {
    const key = `${this.PLAYER_ROOM_PREFIX}${playerId}`;
    await this.redis.setex(key, this.ROOM_TTL, roomId);
  }

  /**
   * Get player's current room
   */
  async getPlayerRoom(playerId: string): Promise<string | null> {
    const key = `${this.PLAYER_ROOM_PREFIX}${playerId}`;
    return await this.redis.get(key);
  }

  /**
   * Remove player from room mapping
   */
  async removePlayerRoom(playerId: string): Promise<void> {
    const key = `${this.PLAYER_ROOM_PREFIX}${playerId}`;
    await this.redis.del(key);
  }

  /**
   * Publish event for horizontal scaling
   */
  async publish(channel: string, message: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  /**
   * Subscribe to events
   */
  async subscribe(channel: string, callback: (message: unknown) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        callback(JSON.parse(msg));
      }
    });
  }

  /**
   * Clean up inactive rooms
   */
  async cleanupInactiveRooms(): Promise<number> {
    const rooms = await this.getAllRooms();
    const now = Date.now();
    let cleaned = 0;

    for (const room of rooms) {
      const inactiveTime = now - room.lastActivity;
      
      // Clean up finished games after 30 minutes
      if (room.state === 'finished' && inactiveTime > this.INACTIVE_ROOM_TTL * 1000) {
        await this.deleteRoom(room.roomId);
        await this.deleteGameState(room.roomId);
        cleaned++;
        continue;
      }

      // Clean up waiting rooms after 1 hour
      if (room.state === 'waiting_for_player' && inactiveTime > this.ROOM_TTL * 1000) {
        await this.deleteRoom(room.roomId);
        cleaned++;
        continue;
      }

      // Clean up abandoned games after 1 hour of inactivity
      if (room.state === 'in_progress' && inactiveTime > this.ROOM_TTL * 1000) {
        await this.deleteRoom(room.roomId);
        await this.deleteGameState(room.roomId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get Redis instance for Socket.IO adapter
   */
  getRedisInstance(): Redis {
    return this.redis;
  }

  getPublisher(): Redis {
    return this.publisher;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }
}
