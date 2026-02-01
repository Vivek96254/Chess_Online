import { v4 as uuidv4 } from 'uuid';
import { ChessEngine } from './ChessEngine.js';
import { RedisService } from './RedisService.js';
import type {
  Room,
  SerializableRoom,
  RoomSettings,
  GameState,
  MoveRecord,
  PlayerColor,
  RoomListing,
  RoomState,
  UserSession,
  PlayerRole
} from '../types/index.js';

/**
 * RoomManager - Handles room lifecycle and game operations
 * 
 * Session tracking strategy:
 * - userSessions: Maps authenticated userId to session data (for reconnect support)
 * - playerRooms: Maps socketId/odId to roomId (for backward compatibility)
 * - socketToUser: Maps socketId to userId (for looking up user from socket)
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomId
  private disconnectedPlayers: Map<string, NodeJS.Timeout> = new Map();
  private redis: RedisService | null = null;
  private readonly RECONNECT_GRACE_PERIOD = 60000; // 60 seconds
  private readonly ROOM_CLEANUP_INTERVAL = 60000; // 1 minute

  // Session management for authenticated users
  private userSessions: Map<string, UserSession> = new Map(); // odId -> session
  private socketToUser: Map<string, string> = new Map(); // socketId -> odId

  constructor(redis?: RedisService) {
    this.redis = redis || null;
    this.startCleanupInterval();
  }

  /**
   * Register a user session (for authenticated users)
   */
  registerUserSession(
    odId: string,
    odName: string,
    roomId: string,
    role: PlayerRole,
    socketId: string,
    color: PlayerColor | null
  ): void {
    const session: UserSession = {
      odId,
      odName,
      roomId,
      role,
      socketId,
      color,
      isConnected: true,
      disconnectedAt: null
    };
    this.userSessions.set(odId, session);
    this.socketToUser.set(socketId, odId);
  }

  /**
   * Get user session by user ID
   */
  getUserSession(odId: string): UserSession | null {
    return this.userSessions.get(odId) || null;
  }

  /**
   * Get user ID from socket ID
   */
  getUserIdFromSocket(socketId: string): string | null {
    return this.socketToUser.get(socketId) || null;
  }

  /**
   * Update socket ID for a user (on reconnect)
   */
  updateUserSocket(odId: string, newSocketId: string): boolean {
    const session = this.userSessions.get(odId);
    if (!session) return false;

    // Clean up old socket mapping
    this.socketToUser.delete(session.socketId);
    
    // Update session
    session.socketId = newSocketId;
    session.isConnected = true;
    session.disconnectedAt = null;
    
    // Register new socket mapping
    this.socketToUser.set(newSocketId, odId);

    // Update playerRooms mapping
    const oldRoomId = this.playerRooms.get(session.socketId);
    if (oldRoomId) {
      this.playerRooms.delete(session.socketId);
    }
    this.playerRooms.set(newSocketId, session.roomId);

    // Update room's player socket ID
    const room = this.rooms.get(session.roomId);
    if (room) {
      if (session.role === 'host' && room.hostId === session.odId) {
        // hostId stays as odId for auth users
      } else if (session.role === 'opponent' && room.opponentId === session.odId) {
        // opponentId stays as odId for auth users
      }
    }

    return true;
  }

  /**
   * Remove user session
   */
  removeUserSession(odId: string): void {
    const session = this.userSessions.get(odId);
    if (session) {
      this.socketToUser.delete(session.socketId);
      this.userSessions.delete(odId);
    }
  }

  /**
   * Mark user as disconnected (start grace period)
   */
  markUserDisconnected(odId: string): void {
    const session = this.userSessions.get(odId);
    if (session) {
      session.isConnected = false;
      session.disconnectedAt = Date.now();
    }
  }

  /**
   * Check if user has an active session in a room
   */
  hasActiveSession(odId: string): boolean {
    const session = this.userSessions.get(odId);
    if (!session) return false;
    
    const room = this.rooms.get(session.roomId);
    if (!room) return false;
    
    // Session is active if room exists and is not finished
    return room.state !== 'finished';
  }

  /**
   * Start periodic cleanup of inactive rooms
   */
  private startCleanupInterval(): void {
    setInterval(async () => {
      await this.cleanupInactiveRooms();
    }, this.ROOM_CLEANUP_INTERVAL);
  }

  /**
   * Clean up inactive rooms
   */
  private async cleanupInactiveRooms(): Promise<void> {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [roomId, room] of this.rooms.entries()) {
      const inactiveTime = now - room.lastActivity;

      if (room.state === 'finished' && inactiveTime > inactiveThreshold) {
        this.rooms.delete(roomId);
        continue;
      }

      if (room.state === 'waiting_for_player' && inactiveTime > 60 * 60 * 1000) {
        this.rooms.delete(roomId);
      }
    }

    if (this.redis) {
      await this.redis.cleanupInactiveRooms();
    }
  }

  /**
   * Generate a short room ID
   */
  private generateRoomId(): string {
    return uuidv4().split('-')[0].toUpperCase();
  }

  /**
   * Create a new room
   * @param hostId - Socket ID or User ID for authenticated users
   * @param hostName - Display name of the host
   * @param settings - Room settings
   * @param odId - Authenticated user ID (optional, for session tracking)
   */
  async createRoom(
    hostId: string,
    hostName: string,
    settings: Partial<RoomSettings> = {},
    odId?: string
  ): Promise<Room> {
    const roomId = this.generateRoomId();
    
    const defaultSettings: RoomSettings = {
      timeControl: null,
      allowSpectators: true,
      allowJoin: true,
      isPrivate: false,
      isLocked: false,
      ...settings
    };

    // Use userId as hostId for authenticated users (persistent identity)
    const persistentHostId = odId || hostId;

    const room: Room = {
      roomId,
      hostId: persistentHostId,
      hostName,
      opponentId: null,
      opponentName: null,
      spectators: new Map(),
      state: 'waiting_for_player',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      gameState: null,
      settings: defaultSettings
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId); // Map socket to room

    // Register user session for authenticated users
    if (odId) {
      this.registerUserSession(odId, hostName, roomId, 'host', hostId, 'white');
    }

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setPlayerRoom(persistentHostId, roomId);
    }

    return room;
  }

  /**
   * Join a room as opponent
   * @param roomId - Room to join
   * @param playerId - Socket ID
   * @param playerName - Display name
   * @param odId - Authenticated user ID (optional, for session tracking)
   */
  async joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    odId?: string
  ): Promise<{ room: Room; color: PlayerColor } | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (room.state !== 'waiting_for_player') return null;
    if (room.opponentId !== null) return null;
    
    // Use persistent ID for comparison
    const persistentPlayerId = odId || playerId;
    if (room.hostId === persistentPlayerId) return null;
    if (!room.settings.allowJoin) return null; // Check if joining is allowed
    if (room.settings.isLocked) return null; // Check if room is locked

    // Use userId as opponentId for authenticated users (persistent identity)
    room.opponentId = persistentPlayerId;
    room.opponentName = playerName;
    room.state = 'in_progress';
    room.lastActivity = Date.now();

    // Create game state
    room.gameState = ChessEngine.createInitialGameState(room.settings.timeControl);

    this.playerRooms.set(playerId, roomId); // Map socket to room

    // Register user session for authenticated users
    if (odId) {
      this.registerUserSession(odId, playerName, roomId, 'opponent', playerId, 'black');
    }

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setPlayerRoom(persistentPlayerId, roomId);
      if (room.gameState) {
        await this.redis.setGameState(roomId, room.gameState);
      }
    }

    // Host is white, opponent is black
    return { room, color: 'black' };
  }

  /**
   * Join as spectator
   * @param roomId - Room to spectate
   * @param spectatorId - Socket ID
   * @param spectatorName - Display name
   * @param odId - Authenticated user ID (optional, for session tracking)
   */
  async spectateRoom(
    roomId: string,
    spectatorId: string,
    spectatorName: string = 'Spectator',
    odId?: string
  ): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (!room.settings.allowSpectators) return null;

    // Use persistent ID for spectator map
    const persistentId = odId || spectatorId;
    room.spectators.set(persistentId, spectatorName);
    room.lastActivity = Date.now();

    // Register user session for authenticated spectators
    if (odId) {
      this.registerUserSession(odId, spectatorName, roomId, 'spectator', spectatorId, null);
    }

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
    }

    return room;
  }

  /**
   * Restore session for a reconnecting user
   * Returns the room and session info if the user has an active session
   */
  async restoreSession(
    odId: string,
    newSocketId: string
  ): Promise<{ room: Room; session: UserSession } | null> {
    const session = this.userSessions.get(odId);
    
    if (!session) return null;

    const room = this.rooms.get(session.roomId);
    if (!room) {
      // Room no longer exists, clean up session
      this.removeUserSession(odId);
      return null;
    }

    // Don't restore finished games (let user start fresh)
    if (room.state === 'finished') {
      // Clean up session for finished game
      this.removeUserSession(odId);
      return null;
    }

    // Clear any disconnect timeout
    const timeout = this.disconnectedPlayers.get(odId);
    if (timeout) {
      clearTimeout(timeout);
      this.disconnectedPlayers.delete(odId);
    }

    // Update socket mapping
    this.updateUserSocket(odId, newSocketId);

    console.log(`🔄 Session restored for user ${odId} in room ${session.roomId}`);

    return { room, session };
  }

  /**
   * Leave a room
   * @param socketId - Socket ID of the leaving player
   * @param odId - User ID (for authenticated users)
   */
  async leaveRoom(socketId: string, odId?: string): Promise<{
    room: Room | null;
    wasPlayer: boolean;
    shouldEndGame: boolean;
  }> {
    // Determine the persistent ID to use for room lookup
    const persistentId = odId || socketId;
    
    const roomId = this.playerRooms.get(socketId);
    let room: Room | null = null;
    
    if (roomId) {
      room = this.rooms.get(roomId) || null;
    }

    // If not found by socket, try by userId (for authenticated users who reconnected with different socket)
    if (!room && odId) {
      const session = this.userSessions.get(odId);
      if (session) {
        room = this.rooms.get(session.roomId) || null;
      }
    }

    if (!room) {
      // Check if spectator
      for (const [, r] of this.rooms.entries()) {
        if (r.spectators.has(persistentId)) {
          r.spectators.delete(persistentId);
          if (odId) {
            this.removeUserSession(odId);
          }
          if (this.redis) {
            await this.redis.setRoom(this.serializeRoom(r));
          }
          return { room: r, wasPlayer: false, shouldEndGame: false };
        }
      }
      return { room: null, wasPlayer: false, shouldEndGame: false };
    }

    const wasHost = room.hostId === persistentId;
    const wasOpponent = room.opponentId === persistentId;
    const wasPlayer = wasHost || wasOpponent;
    let shouldEndGame = false;

    if (wasPlayer && room.state === 'in_progress') {
      // End game due to abandonment
      if (room.gameState) {
        room.gameState.status = 'abandoned';
        room.gameState.winner = wasHost ? 'black' : 'white';
      }
      room.state = 'finished';
      shouldEndGame = true;
    } else if (room.state === 'waiting_for_player' && wasHost) {
      // Delete room if host leaves before game starts
      this.rooms.delete(room.roomId);
      if (this.redis) {
        await this.redis.deleteRoom(room.roomId);
      }
    }

    this.playerRooms.delete(socketId);
    if (odId) {
      this.removeUserSession(odId);
    }

    if (this.redis) {
      await this.redis.removePlayerRoom(persistentId);
      if (room && this.rooms.has(room.roomId)) {
        await this.redis.setRoom(this.serializeRoom(room));
        if (room.gameState) {
          await this.redis.setGameState(room.roomId, room.gameState);
        }
      }
    }

    return { room, wasPlayer, shouldEndGame };
  }

  /**
   * Make a move
   * @param roomId - Room ID
   * @param socketId - Socket ID of the player
   * @param from - Source square
   * @param to - Target square
   * @param promotion - Promotion piece
   * @param odId - User ID (for authenticated users)
   */
  async makeMove(
    roomId: string,
    socketId: string,
    from: string,
    to: string,
    promotion?: string,
    odId?: string
  ): Promise<{ success: boolean; move?: MoveRecord; gameState?: GameState; error?: string }> {
    const room = this.rooms.get(roomId);
    
    if (!room) return { success: false, error: 'Room not found' };
    if (room.state !== 'in_progress') return { success: false, error: 'Game not in progress' };
    if (!room.gameState) return { success: false, error: 'Game state not found' };

    // Use persistent ID for player validation
    const persistentId = odId || socketId;

    // Validate player is in the game
    const isHost = room.hostId === persistentId;
    const isOpponent = room.opponentId === persistentId;
    if (!isHost && !isOpponent) return { success: false, error: 'Not a player in this game' };

    // Validate it's the player's turn
    const playerColor: PlayerColor = isHost ? 'white' : 'black';
    if (room.gameState.turn !== playerColor) return { success: false, error: 'Not your turn' };

    // Create chess engine from current state
    const engine = ChessEngine.fromGameState(room.gameState);

    // Validate and make the move
    const move = engine.makeMove(from, to, promotion);
    if (!move) return { success: false, error: 'Invalid move' };

    // Update time if time control is enabled
    if (room.settings.timeControl && room.gameState.lastMoveAt) {
      const elapsed = Date.now() - room.gameState.lastMoveAt;
      if (playerColor === 'white' && room.gameState.whiteTime !== null) {
        room.gameState.whiteTime -= elapsed;
        room.gameState.whiteTime += room.settings.timeControl.increment * 1000;
        if (room.gameState.whiteTime <= 0) {
          room.gameState.status = 'timeout';
          room.gameState.winner = 'black';
          room.state = 'finished';
        }
      } else if (playerColor === 'black' && room.gameState.blackTime !== null) {
        room.gameState.blackTime -= elapsed;
        room.gameState.blackTime += room.settings.timeControl.increment * 1000;
        if (room.gameState.blackTime <= 0) {
          room.gameState.status = 'timeout';
          room.gameState.winner = 'white';
          room.state = 'finished';
        }
      }
    }

    // Update game state
    room.gameState.fen = engine.getFen();
    room.gameState.turn = engine.getTurn();
    room.gameState.moves.push(move);
    room.gameState.lastMoveAt = Date.now();
    room.lastActivity = Date.now();

    // Check for game end
    if (engine.isGameOver()) {
      room.gameState.status = engine.getGameStatus();
      room.gameState.winner = engine.getWinner();
      room.state = 'finished';
    }

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setGameState(roomId, room.gameState);
    }

    return { success: true, move, gameState: room.gameState };
  }

  /**
   * Player resigns
   * @param roomId - Room ID
   * @param socketId - Socket ID
   * @param odId - User ID (for authenticated users)
   */
  async resign(roomId: string, socketId: string, odId?: string): Promise<GameState | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (room.state !== 'in_progress') return null;
    if (!room.gameState) return null;

    const persistentId = odId || socketId;

    const isHost = room.hostId === persistentId;
    const isOpponent = room.opponentId === persistentId;
    if (!isHost && !isOpponent) return null;

    room.gameState.status = 'resigned';
    room.gameState.winner = isHost ? 'black' : 'white';
    room.state = 'finished';
    room.lastActivity = Date.now();

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setGameState(roomId, room.gameState);
    }

    return room.gameState;
  }

  /**
   * End game in draw
   */
  async drawGame(roomId: string): Promise<GameState | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (room.state !== 'in_progress') return null;
    if (!room.gameState) return null;

    room.gameState.status = 'draw';
    room.gameState.winner = null;
    room.state = 'finished';
    room.lastActivity = Date.now();

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setGameState(roomId, room.gameState);
    }

    return room.gameState;
  }

  /**
   * Handle player disconnect
   * @param socketId - The disconnecting socket ID
   */
  handleDisconnect(socketId: string): {
    roomId: string | null;
    isPlayer: boolean;
    gracePeriod: number;
    odId: string | null;
  } {
    // Check if this socket belongs to an authenticated user
    const odId = this.socketToUser.get(socketId);
    
    if (odId) {
      // Authenticated user disconnect
      const session = this.userSessions.get(odId);
      if (session) {
        const room = this.rooms.get(session.roomId);
        if (!room) {
          this.removeUserSession(odId);
          return { roomId: null, isPlayer: false, gracePeriod: 0, odId };
        }

        const isPlayer = session.role === 'host' || session.role === 'opponent';

        if (session.role === 'spectator') {
          // Spectators can be removed immediately (no grace period needed)
          room.spectators.delete(odId);
          this.removeUserSession(odId);
          return { roomId: room.roomId, isPlayer: false, gracePeriod: 0, odId };
        }

        if (isPlayer && room.state === 'in_progress') {
          // Mark user as disconnected but don't remove session yet
          // The actual timeout/forfeit is handled by the socket handler
          this.markUserDisconnected(odId);
        }

        return { 
          roomId: session.roomId, 
          isPlayer, 
          gracePeriod: this.RECONNECT_GRACE_PERIOD,
          odId 
        };
      }
    }

    // Anonymous user (socket-based tracking)
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) {
      // Check spectators (anonymous)
      for (const [, room] of this.rooms.entries()) {
        if (room.spectators.has(socketId)) {
          room.spectators.delete(socketId);
          return { roomId: room.roomId, isPlayer: false, gracePeriod: 0, odId: null };
        }
      }
      return { roomId: null, isPlayer: false, gracePeriod: 0, odId: null };
    }

    const room = this.rooms.get(roomId);
    if (!room) return { roomId: null, isPlayer: false, gracePeriod: 0, odId: null };

    const isHost = room.hostId === socketId;
    const isOpponent = room.opponentId === socketId;
    const isPlayer = isHost || isOpponent;

    if (isPlayer && room.state === 'in_progress') {
      // Set up reconnection timeout
      const timeout = setTimeout(async () => {
        await this.leaveRoom(socketId);
        this.disconnectedPlayers.delete(socketId);
      }, this.RECONNECT_GRACE_PERIOD);

      this.disconnectedPlayers.set(socketId, timeout);
    }

    return { roomId, isPlayer, gracePeriod: this.RECONNECT_GRACE_PERIOD, odId: null };
  }

  /**
   * Handle player reconnect
   * @param socketId - Socket ID (for anonymous users)
   * @param odId - User ID (for authenticated users)
   */
  handleReconnect(socketId: string, odId?: string): Room | null {
    // For authenticated users
    if (odId) {
      const timeout = this.disconnectedPlayers.get(odId);
      if (timeout) {
        clearTimeout(timeout);
        this.disconnectedPlayers.delete(odId);
      }

      const session = this.userSessions.get(odId);
      if (!session) return null;

      return this.rooms.get(session.roomId) || null;
    }

    // For anonymous users
    const timeout = this.disconnectedPlayers.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.disconnectedPlayers.delete(socketId);
    }

    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return null;

    return this.rooms.get(roomId) || null;
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Get room by player ID
   */
  getRoomByPlayer(playerId: string): Room | null {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  /**
   * Get all public waiting rooms
   */
  getPublicWaitingRooms(): SerializableRoom[] {
    const rooms: SerializableRoom[] = [];
    for (const room of this.rooms.values()) {
      if (room.state === 'waiting_for_player' && !room.settings.isPrivate && room.settings.allowJoin) {
        rooms.push(this.serializeRoom(room));
      }
    }
    return rooms;
  }

  /**
   * Get public room listings for browse page
   */
  getPublicRoomListings(filters?: {
    state?: RoomState;
    hasTimeControl?: boolean;
  }): RoomListing[] {
    const listings: RoomListing[] = [];
    for (const room of this.rooms.values()) {
      // Only show public rooms that allow joining
      if (room.settings.isPrivate || !room.settings.allowJoin) continue;
      
      // Apply filters
      if (filters?.state && room.state !== filters.state) continue;
      if (filters?.hasTimeControl !== undefined) {
        const hasTimeControl = room.settings.timeControl !== null;
        if (hasTimeControl !== filters.hasTimeControl) continue;
      }

      listings.push({
        roomId: room.roomId,
        roomName: room.settings.roomName || null,
        hostName: room.hostName,
        state: room.state,
        playerCount: room.opponentId ? 2 : 1,
        spectatorCount: room.spectators.size,
        timeControl: room.settings.timeControl,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity
      });
    }
    // Sort by last activity (most recent first)
    return listings.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Kick a spectator from a room (host only)
   * Note: Only spectators can be kicked, not players. This prevents game disruption.
   */
  async kickSpectator(roomId: string, hostId: string, targetSpectatorId: string): Promise<{
    success: boolean;
    reason?: string;
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, reason: 'Room not found' };
    
    // Only host can kick
    if (room.hostId !== hostId) return { success: false, reason: 'Only host can kick' };
    
    // Can't kick yourself
    if (targetSpectatorId === hostId) return { success: false, reason: 'Cannot kick yourself' };

    // Cannot kick players - only spectators
    if (room.opponentId === targetSpectatorId) {
      return { success: false, reason: 'Cannot kick players. Only spectators can be kicked.' };
    }

    // Check if target is spectator
    if (room.spectators.has(targetSpectatorId)) {
      room.spectators.delete(targetSpectatorId);
      
      // Also remove their session if they have one
      this.removeUserSession(targetSpectatorId);
      
      if (this.redis) {
        await this.redis.setRoom(this.serializeRoom(room));
      }
      return { success: true };
    }

    return { success: false, reason: 'Spectator not found' };
  }

  /**
   * Lock/unlock a room (host only)
   */
  async setRoomLocked(roomId: string, hostId: string, locked: boolean): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostId) return false;

    room.settings.isLocked = locked;
    room.lastActivity = Date.now();

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
    }

    return true;
  }

  /**
   * Update room settings (host only)
   */
  async updateRoomSettings(
    roomId: string,
    hostId: string,
    settings: Partial<RoomSettings>
  ): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== hostId) return false;

    room.settings = { ...room.settings, ...settings };
    room.lastActivity = Date.now();

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
    }

    return true;
  }

  /**
   * Get player's color in a room
   */
  getPlayerColor(roomId: string, playerId: string): PlayerColor | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.hostId === playerId) return 'white';
    if (room.opponentId === playerId) return 'black';
    return null;
  }

  /**
   * Check if player is in a room
   * Returns false if the player's room is finished (allowing them to create/join new rooms)
   * @param socketId - Socket ID
   * @param odId - User ID (for authenticated users)
   */
  isPlayerInRoom(socketId: string, odId?: string): boolean {
    // Check by userId first for authenticated users
    if (odId) {
      const session = this.userSessions.get(odId);
      if (session) {
        const room = this.rooms.get(session.roomId);
        if (room && room.state !== 'finished') {
          return true;
        }
      }
    }

    // Check by socket ID
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return false;
    
    const room = this.rooms.get(roomId);
    // If room is finished, player is not considered "in a room" for the purpose of joining new rooms
    if (room && room.state === 'finished') {
      return false;
    }
    
    return true;
  }

  /**
   * Serialize room for network/storage
   */
  serializeRoom(room: Room): SerializableRoom {
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      hostName: room.hostName,
      opponentId: room.opponentId,
      opponentName: room.opponentName,
      spectatorCount: room.spectators.size,
      spectators: Array.from(room.spectators.entries()).map(([odId, name]) => ({ odId, name })),
      state: room.state,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      gameState: room.gameState,
      settings: room.settings
    };
  }

  /**
   * Get stats
   */
  getStats(): {
    totalRooms: number;
    waitingRooms: number;
    activeGames: number;
    finishedGames: number;
    totalPlayers: number;
    totalSpectators: number;
  } {
    let waitingRooms = 0;
    let activeGames = 0;
    let finishedGames = 0;
    let totalSpectators = 0;

    for (const room of this.rooms.values()) {
      switch (room.state) {
        case 'waiting_for_player':
          waitingRooms++;
          break;
        case 'in_progress':
          activeGames++;
          break;
        case 'finished':
          finishedGames++;
          break;
      }
      totalSpectators += room.spectators.size;
    }

    return {
      totalRooms: this.rooms.size,
      waitingRooms,
      activeGames,
      finishedGames,
      totalPlayers: this.playerRooms.size,
      totalSpectators
    };
  }
}
