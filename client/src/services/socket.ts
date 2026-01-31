import { io, Socket } from 'socket.io-client';
import type {
  Room,
  GameState,
  MoveRecord,
  Player,
  RoomResponse,
  MoveResponse,
  BaseResponse,
  ChatMessage
} from '../types';

// Server URL from environment or default
const SERVER_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

// Event callbacks type
interface SocketCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: { code: string; message: string }) => void;
  onRoomUpdated?: (room: Room) => void;
  onRoomClosed?: (data: { roomId: string; reason: string }) => void;
  onGameStarted?: (gameState: GameState) => void;
  onGameMove?: (data: { move: MoveRecord; gameState: GameState }) => void;
  onGameEnded?: (data: { gameState: GameState; reason: string }) => void;
  onGameSync?: (gameState: GameState) => void;
  onPlayerJoined?: (data: { player: Player; room: Room }) => void;
  onPlayerLeft?: (data: { playerId: string; reason: string }) => void;
  onPlayerReconnected?: (data: { playerId: string }) => void;
  onPlayerDisconnected?: (data: { playerId: string; gracePeriod: number }) => void;
  onSpectatorJoined?: (data: { spectatorId: string; name: string; count: number }) => void;
  onSpectatorLeft?: (data: { spectatorId: string; count: number }) => void;
  onChatMessage?: (data: ChatMessage) => void;
  onDrawOffered?: (data: { fromPlayerId: string }) => void;
  onDrawDeclined?: () => void;
}

class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to the server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      this.socket.on('connect', () => {
        console.log('🔌 Connected to server');
        this.reconnectAttempts = 0;
        this.callbacks.onConnect?.();
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 Disconnected from server');
        this.callbacks.onDisconnect?.();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to server'));
        }
      });

      this.setupEventListeners();
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | null {
    return this.socket?.id ?? null;
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: SocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Error handling
    this.socket.on('error', (data) => {
      console.error('Socket error:', data);
      this.callbacks.onError?.(data);
    });

    // Room events
    this.socket.on('room:updated', (room) => {
      this.callbacks.onRoomUpdated?.(room);
    });

    this.socket.on('room:closed', (data) => {
      this.callbacks.onRoomClosed?.(data);
    });

    // Game events
    this.socket.on('game:started', (gameState) => {
      this.callbacks.onGameStarted?.(gameState);
    });

    this.socket.on('game:move', (data) => {
      this.callbacks.onGameMove?.(data);
    });

    this.socket.on('game:ended', (data) => {
      this.callbacks.onGameEnded?.(data);
    });

    this.socket.on('game:sync', (gameState) => {
      this.callbacks.onGameSync?.(gameState);
    });

    // Player events
    this.socket.on('player:joined', (data) => {
      this.callbacks.onPlayerJoined?.(data);
    });

    this.socket.on('player:left', (data) => {
      this.callbacks.onPlayerLeft?.(data);
    });

    this.socket.on('player:reconnected', (data) => {
      this.callbacks.onPlayerReconnected?.(data);
    });

    this.socket.on('player:disconnected', (data) => {
      this.callbacks.onPlayerDisconnected?.(data);
    });

    // Spectator events
    this.socket.on('spectator:joined', (data) => {
      this.callbacks.onSpectatorJoined?.(data);
    });

    this.socket.on('spectator:left', (data) => {
      this.callbacks.onSpectatorLeft?.(data);
    });

    // Chat events
    this.socket.on('chat:message', (data) => {
      this.callbacks.onChatMessage?.(data);
    });

    // Draw events
    this.socket.on('draw:offered', (data) => {
      this.callbacks.onDrawOffered?.(data);
    });

    this.socket.on('draw:declined', () => {
      this.callbacks.onDrawDeclined?.();
    });
  }

  /**
   * Create a new room
   */
  createRoom(playerName: string, settings?: Partial<{ timeControl: { initial: number; increment: number } | null; allowSpectators: boolean; isPrivate: boolean }>): Promise<RoomResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:create', { playerName, settings }, (response: RoomResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Join a room as opponent
   */
  joinRoom(roomId: string, playerName: string): Promise<RoomResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:join', { roomId, playerName }, (response: RoomResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Spectate a room
   */
  spectateRoom(roomId: string, spectatorName?: string): Promise<RoomResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:spectate', { roomId, spectatorName }, (response: RoomResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Leave current room
   */
  leaveRoom(): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:leave', (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Make a move
   */
  makeMove(roomId: string, from: string, to: string, promotion?: string): Promise<MoveResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('game:move', { roomId, from, to, promotion }, (response: MoveResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Resign the game
   */
  resign(roomId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('game:resign', { roomId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Offer a draw
   */
  offerDraw(roomId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('game:offer-draw', { roomId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Accept draw offer
   */
  acceptDraw(roomId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('game:accept-draw', { roomId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Decline draw offer
   */
  declineDraw(roomId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('game:decline-draw', { roomId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Send chat message
   */
  sendChatMessage(roomId: string, message: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('chat:send', { roomId, message }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Ping for latency measurement
   */
  ping(): Promise<number> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve(-1);
        return;
      }

      const start = Date.now();
      this.socket.emit('ping', () => {
        resolve(Date.now() - start);
      });
    });
  }
}

// Export singleton instance
export const socketService = new SocketService();
