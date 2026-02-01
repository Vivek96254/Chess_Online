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
      const token = parsed?.state?.tokens?.accessToken || null;
      if (token) {
        console.log('🔑 Found auth token in storage');
      } else {
        console.log('ℹ️ No access token in auth storage');
      }
      return token;
    }
    console.log('ℹ️ No auth storage found');
  } catch (e) {
    console.error('⚠️ Error reading auth token:', e);
  }
  return null;
}

// Guest ID management for persistent guest identity
const GUEST_ID_KEY = 'chess-guest-id';

function getOrCreateGuestId(): string {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    // Generate a UUID-like guest ID
    guestId = 'guest_' + crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, guestId);
    console.log('🆔 Created new guest ID:', guestId);
  } else {
    console.log('🆔 Using existing guest ID:', guestId);
  }
  return guestId;
}

function getGuestId(): string | null {
  return localStorage.getItem(GUEST_ID_KEY);
}

class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isAuthenticated = false;

  /**
   * Connect to the server with JWT authentication or guest ID
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

      // For non-authenticated users, use a persistent guest ID
      const guestId = !token ? getOrCreateGuestId() : undefined;

      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        // Send auth token or guest ID
        auth: token ? { token } : { guestId }
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
   * Check if socket is authenticated (JWT user)
   */
  isAuthenticatedConnection(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Check if socket has any persistent identity (JWT or guestId)
   * This is used to determine if session restoration should be attempted
   */
  hasPersistentIdentity(): boolean {
    return this.isAuthenticated || !!getGuestId();
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
   * @param roomId - Room ID to join
   * @param playerName - Player display name
   * @param password - Room password (required if room is locked)
   */
  joinRoom(roomId: string, playerName: string, password?: string): Promise<RoomResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:join', { roomId, playerName, password }, (response: RoomResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Spectate a room
   * @param roomId - Room ID to spectate
   * @param spectatorName - Spectator display name
   * @param password - Room password (required if room is locked)
   */
  spectateRoom(roomId: string, spectatorName?: string, password?: string): Promise<RoomResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:spectate', { roomId, spectatorName, password }, (response: RoomResponse) => {
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
   * @param roomId - Room ID
   * @param message - Message content
   * @param chatType - 'public' for everyone, 'private' for players only
   */
  sendChatMessage(roomId: string, message: string, chatType: 'public' | 'private' = 'public'): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('chat:send', { roomId, message, chatType }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Kick a spectator from room (host only)
   * Note: Only spectators can be kicked, not players
   */
  kickSpectator(roomId: string, odId: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:kick', { roomId, odId }, (response: BaseResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Lock/unlock room with password (host only)
   * @param roomId - Room ID
   * @param locked - Whether to lock the room
   * @param password - Password for the room (required when locking)
   */
  lockRoom(roomId: string, locked: boolean, password?: string): Promise<BaseResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('room:lock', { roomId, locked, password }, (response: BaseResponse) => {
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
   * Restore session for users with persistent identity (JWT or guestId)
   * This should be called after connecting to check if the user has an active game session
   */
  restoreSession(): Promise<SessionRestoreResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      // Session restore works for both authenticated users and guests with persistent IDs
      if (!this.hasPersistentIdentity()) {
        resolve({ success: false, error: 'No persistent identity' });
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
