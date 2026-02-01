import { io, Socket } from 'socket.io-client';
import type {
  Room,
  GameState,
  MoveRecord,
  Player,
  RoomResponse,
  MoveResponse,
  BaseResponse,
  ChatMessage,
  RoomSettings,
  SessionRestoreResponse
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
  onRoomKicked?: (data: { roomId: string; reason: string }) => void;
  onRoomListUpdated?: () => void;
  onSessionRestored?: (data: SessionRestoreResponse) => void;
}

// Function to get auth token from storage
function getAuthToken(): string | null {
  try {
    const authStorage = localStorage.getItem('chess-auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      return parsed?.state?.tokens?.accessToken || null;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isAuthenticated = false;

  /**
   * Connect to the server with optional JWT authentication
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // Get auth token if available
      const token = getAuthToken();
      this.isAuthenticated = !!token;

      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        // Send auth token if available
        auth: token ? { token } : undefined
      });

      this.socket.on('connect', () => {
        console.log(`🔌 Connected to server${this.isAuthenticated ? ' (authenticated)' : ' (anonymous)'}`);
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
   * Check if socket is authenticated
   */
  isAuthenticatedConnection(): boolean {
    return this.isAuthenticated;
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

    // Room management events
    this.socket.on('room:kicked', (data) => {
      this.callbacks.onRoomKicked?.(data);
    });

    this.socket.on('room:list-updated', () => {
      this.callbacks.onRoomListUpdated?.();
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
   * Kick a player from room (host only)
   */
  kickPlayer(roomId: string, playerId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:kick', { roomId, playerId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Lock/unlock room (host only)
   */
  lockRoom(roomId: string, locked: boolean): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:lock', { roomId, locked }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Update room settings (host only)
   */
  updateRoomSettings(roomId: string, settings: Partial<RoomSettings>): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:update-settings', { roomId, settings }, (response: BaseResponse) => {
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

  /**
   * Restore session for authenticated users
   * This should be called after connecting to check if the user has an active game session
   */
  restoreSession(): Promise<SessionRestoreResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      if (!this.isAuthenticated) {
        resolve({ success: false, error: 'Not authenticated' });
        return;
      }

      this.socket.emit('session:restore', (response: SessionRestoreResponse) => {
        if (response.success) {
          console.log('🔄 Session restored:', response.session?.roomId);
          this.callbacks.onSessionRestored?.(response);
        }
        resolve(response);
      });
    });
  }

  /**
   * Reconnect with fresh auth token (useful after login)
   */
  async reconnectWithAuth(): Promise<void> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
    return this.connect();
  }
}

// Export singleton instance
export const socketService = new SocketService();
