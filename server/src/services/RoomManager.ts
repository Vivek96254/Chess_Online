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
  GameStatus
} from '../types/index.js';

/**
 * RoomManager - Handles room lifecycle and game operations
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // odId -> roomId
  private disconnectedPlayers: Map<string, NodeJS.Timeout> = new Map();
  private redis: RedisService | null = null;
  private readonly RECONNECT_GRACE_PERIOD = 60000; // 60 seconds
  private readonly ROOM_CLEANUP_INTERVAL = 60000; // 1 minute

  constructor(redis?: RedisService) {
    this.redis = redis || null;
    this.startCleanupInterval();
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
   */
  async createRoom(
    hostId: string,
    hostName: string,
    settings: Partial<RoomSettings> = {}
  ): Promise<Room> {
    const roomId = this.generateRoomId();
    
    const defaultSettings: RoomSettings = {
      timeControl: null,
      allowSpectators: true,
      isPrivate: false,
      ...settings
    };

    const room: Room = {
      roomId,
      hostId,
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
    this.playerRooms.set(hostId, roomId);

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setPlayerRoom(hostId, roomId);
    }

    return room;
  }

  /**
   * Join a room as opponent
   */
  async joinRoom(
    roomId: string,
    playerId: string,
    playerName: string
  ): Promise<{ room: Room; color: PlayerColor } | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (room.state !== 'waiting_for_player') return null;
    if (room.opponentId !== null) return null;
    if (room.hostId === playerId) return null;

    room.opponentId = playerId;
    room.opponentName = playerName;
    room.state = 'in_progress';
    room.lastActivity = Date.now();

    // Create game state
    room.gameState = ChessEngine.createInitialGameState(room.settings.timeControl);

    this.playerRooms.set(playerId, roomId);

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
      await this.redis.setPlayerRoom(playerId, roomId);
      if (room.gameState) {
        await this.redis.setGameState(roomId, room.gameState);
      }
    }

    // Host is white, opponent is black
    return { room, color: 'black' };
  }

  /**
   * Join as spectator
   */
  async spectateRoom(
    roomId: string,
    spectatorId: string,
    spectatorName: string = 'Spectator'
  ): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (!room.settings.allowSpectators) return null;

    room.spectators.set(spectatorId, spectatorName);
    room.lastActivity = Date.now();

    if (this.redis) {
      await this.redis.setRoom(this.serializeRoom(room));
    }

    return room;
  }

  /**
   * Leave a room
   */
  async leaveRoom(playerId: string): Promise<{
    room: Room | null;
    wasPlayer: boolean;
    shouldEndGame: boolean;
  }> {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      // Check if spectator
      for (const [rId, room] of this.rooms.entries()) {
        if (room.spectators.has(playerId)) {
          room.spectators.delete(playerId);
          if (this.redis) {
            await this.redis.setRoom(this.serializeRoom(room));
          }
          return { room, wasPlayer: false, shouldEndGame: false };
        }
      }
      return { room: null, wasPlayer: false, shouldEndGame: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) return { room: null, wasPlayer: false, shouldEndGame: false };

    const wasHost = room.hostId === playerId;
    const wasOpponent = room.opponentId === playerId;
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
      this.rooms.delete(roomId);
      if (this.redis) {
        await this.redis.deleteRoom(roomId);
      }
    }

    this.playerRooms.delete(playerId);
    if (this.redis) {
      await this.redis.removePlayerRoom(playerId);
      if (room && this.rooms.has(roomId)) {
        await this.redis.setRoom(this.serializeRoom(room));
        if (room.gameState) {
          await this.redis.setGameState(roomId, room.gameState);
        }
      }
    }

    return { room, wasPlayer, shouldEndGame };
  }

  /**
   * Make a move
   */
  async makeMove(
    roomId: string,
    playerId: string,
    from: string,
    to: string,
    promotion?: string
  ): Promise<{ success: boolean; move?: MoveRecord; gameState?: GameState; error?: string }> {
    const room = this.rooms.get(roomId);
    
    if (!room) return { success: false, error: 'Room not found' };
    if (room.state !== 'in_progress') return { success: false, error: 'Game not in progress' };
    if (!room.gameState) return { success: false, error: 'Game state not found' };

    // Validate player is in the game
    const isHost = room.hostId === playerId;
    const isOpponent = room.opponentId === playerId;
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
   */
  async resign(roomId: string, playerId: string): Promise<GameState | null> {
    const room = this.rooms.get(roomId);
    
    if (!room) return null;
    if (room.state !== 'in_progress') return null;
    if (!room.gameState) return null;

    const isHost = room.hostId === playerId;
    const isOpponent = room.opponentId === playerId;
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
   */
  handleDisconnect(playerId: string): {
    roomId: string | null;
    isPlayer: boolean;
    gracePeriod: number;
  } {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      // Check spectators
      for (const [, room] of this.rooms.entries()) {
        if (room.spectators.has(playerId)) {
          room.spectators.delete(playerId);
          return { roomId: room.roomId, isPlayer: false, gracePeriod: 0 };
        }
      }
      return { roomId: null, isPlayer: false, gracePeriod: 0 };
    }

    const room = this.rooms.get(roomId);
    if (!room) return { roomId: null, isPlayer: false, gracePeriod: 0 };

    const isHost = room.hostId === playerId;
    const isOpponent = room.opponentId === playerId;
    const isPlayer = isHost || isOpponent;

    if (isPlayer && room.state === 'in_progress') {
      // Set up reconnection timeout
      const timeout = setTimeout(async () => {
        await this.leaveRoom(playerId);
        this.disconnectedPlayers.delete(playerId);
      }, this.RECONNECT_GRACE_PERIOD);

      this.disconnectedPlayers.set(playerId, timeout);
    }

    return { roomId, isPlayer, gracePeriod: this.RECONNECT_GRACE_PERIOD };
  }

  /**
   * Handle player reconnect
   */
  handleReconnect(playerId: string): Room | null {
    const timeout = this.disconnectedPlayers.get(playerId);
    if (timeout) {
      clearTimeout(timeout);
      this.disconnectedPlayers.delete(playerId);
    }

    const roomId = this.playerRooms.get(playerId);
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
      if (room.state === 'waiting_for_player' && !room.settings.isPrivate) {
        rooms.push(this.serializeRoom(room));
      }
    }
    return rooms;
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
   */
  isPlayerInRoom(playerId: string): boolean {
    return this.playerRooms.has(playerId);
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
