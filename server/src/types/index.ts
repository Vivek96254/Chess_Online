import { z } from 'zod';

// Room states
export type RoomState = 'waiting_for_player' | 'in_progress' | 'finished';

// Game status
export type GameStatus = 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned' | 'timeout' | 'abandoned';

// Player colors
export type PlayerColor = 'white' | 'black';

// Player role
export type PlayerRole = 'host' | 'opponent' | 'spectator';

// Room data structure
export interface Room {
  roomId: string;
  hostId: string;
  hostName: string;
  opponentId: string | null;
  opponentName: string | null;
  spectators: Map<string, string>; // odId -> name
  state: RoomState;
  createdAt: number;
  lastActivity: number;
  gameState: GameState | null;
  settings: RoomSettings;
}

// Serializable room for Redis/client
export interface SerializableRoom {
  roomId: string;
  hostId: string;
  hostName: string;
  opponentId: string | null;
  opponentName: string | null;
  spectatorCount: number;
  spectators: Array<{ odId: string; name: string }>;
  state: RoomState;
  createdAt: number;
  lastActivity: number;
  gameState: GameState | null;
  settings: RoomSettings;
}

// Room listing for browse page
export interface RoomListing {
  roomId: string;
  roomName: string | null;
  hostName: string;
  state: RoomState;
  playerCount: number; // 1 or 2
  spectatorCount: number;
  timeControl: TimeControl | null;
  createdAt: number;
  lastActivity: number;
}

// Room settings
export interface RoomSettings {
  timeControl: TimeControl | null;
  allowSpectators: boolean;
  allowJoin: boolean; // Allow players to join as opponent
  isPrivate: boolean;
  roomName?: string; // Optional room name
  isLocked: boolean; // Host can lock room to prevent new joins
}

// Time control
export interface TimeControl {
  initial: number; // seconds
  increment: number; // seconds per move
}

// Game state
export interface GameState {
  fen: string;
  turn: PlayerColor;
  moves: MoveRecord[];
  status: GameStatus;
  winner: PlayerColor | null;
  whiteTime: number | null; // remaining time in ms
  blackTime: number | null;
  lastMoveAt: number | null;
  startedAt: number;
}

// Move record
export interface MoveRecord {
  from: string;
  to: string;
  san: string;
  fen: string;
  timestamp: number;
  promotion?: string;
}

// Player info
export interface Player {
  odId: string;
  odName: string;
  color: PlayerColor | null;
  isConnected: boolean;
}

// Socket event payloads
export interface CreateRoomPayload {
  playerName: string;
  settings?: Partial<RoomSettings>;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface SpectateRoomPayload {
  roomId: string;
  spectatorName?: string;
}

export interface MakeMovePayload {
  roomId: string;
  from: string;
  to: string;
  promotion?: string;
}

export interface ResignPayload {
  roomId: string;
}

export interface OfferDrawPayload {
  roomId: string;
}

export interface ChatMessagePayload {
  roomId: string;
  message: string;
}

// Server -> Client events
export interface ServerToClientEvents {
  'room:created': (data: { room: SerializableRoom; playerId: string }) => void;
  'room:joined': (data: { room: SerializableRoom; playerId: string; color: PlayerColor }) => void;
  'room:spectating': (data: { room: SerializableRoom; spectatorId: string }) => void;
  'room:updated': (room: SerializableRoom) => void;
  'room:closed': (data: { roomId: string; reason: string }) => void;
  'room:list-updated': () => void; // Notify when public room list changes
  'room:kicked': (data: { roomId: string; reason: string }) => void;
  
  'game:started': (gameState: GameState) => void;
  'game:move': (data: { move: MoveRecord; gameState: GameState }) => void;
  'game:ended': (data: { gameState: GameState; reason: string }) => void;
  'game:sync': (gameState: GameState) => void;
  
  'player:joined': (data: { player: Player; room: SerializableRoom }) => void;
  'player:left': (data: { playerId: string; reason: string }) => void;
  'player:reconnected': (data: { playerId: string }) => void;
  'player:disconnected': (data: { playerId: string; gracePeriod: number }) => void;
  
  'spectator:joined': (data: { spectatorId: string; name: string; count: number }) => void;
  'spectator:left': (data: { spectatorId: string; count: number }) => void;
  
  'chat:message': (data: { senderId: string; senderName: string; message: string; timestamp: number }) => void;
  
  'draw:offered': (data: { fromPlayerId: string }) => void;
  'draw:declined': () => void;
  
  'error': (data: { code: string; message: string }) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, callback: (response: RoomResponse) => void) => void;
  'room:join': (payload: JoinRoomPayload, callback: (response: RoomResponse) => void) => void;
  'room:spectate': (payload: SpectateRoomPayload, callback: (response: RoomResponse) => void) => void;
  'room:leave': (callback: (response: BaseResponse) => void) => void;
  'room:kick': (payload: { roomId: string; playerId: string }, callback: (response: BaseResponse) => void) => void;
  'room:lock': (payload: { roomId: string; locked: boolean }, callback: (response: BaseResponse) => void) => void;
  'room:update-settings': (payload: { roomId: string; settings: Partial<RoomSettings> }, callback: (response: BaseResponse) => void) => void;
  
  'game:move': (payload: MakeMovePayload, callback: (response: MoveResponse) => void) => void;
  'game:resign': (payload: ResignPayload, callback: (response: BaseResponse) => void) => void;
  'game:offer-draw': (payload: OfferDrawPayload, callback: (response: BaseResponse) => void) => void;
  'game:accept-draw': (payload: { roomId: string }, callback: (response: BaseResponse) => void) => void;
  'game:decline-draw': (payload: { roomId: string }, callback: (response: BaseResponse) => void) => void;
  
  'chat:send': (payload: ChatMessagePayload, callback: (response: BaseResponse) => void) => void;
  
  'ping': (callback: (response: { timestamp: number }) => void) => void;
}

// Response types
export interface BaseResponse {
  success: boolean;
  error?: string;
}

export interface RoomResponse extends BaseResponse {
  room?: SerializableRoom;
  playerId?: string;
  color?: PlayerColor;
}

export interface MoveResponse extends BaseResponse {
  move?: MoveRecord;
  gameState?: GameState;
}

// Zod schemas for validation
export const CreateRoomSchema = z.object({
  playerName: z.string().min(1).max(20).trim(),
  settings: z.object({
    timeControl: z.object({
      initial: z.number().min(60).max(3600),
      increment: z.number().min(0).max(60)
    }).nullable().optional(),
    allowSpectators: z.boolean().optional(),
    allowJoin: z.boolean().optional(),
    isPrivate: z.boolean().optional(),
    roomName: z.string().min(1).max(50).trim().optional(),
    isLocked: z.boolean().optional()
  }).optional()
});

export const JoinRoomSchema = z.object({
  roomId: z.string().min(1).max(50),
  playerName: z.string().min(1).max(20).trim()
});

export const SpectateRoomSchema = z.object({
  roomId: z.string().min(1).max(50),
  spectatorName: z.string().min(1).max(20).trim().optional()
});

export const MakeMoveSchema = z.object({
  roomId: z.string().min(1).max(50),
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional()
});

export const ChatMessageSchema = z.object({
  roomId: z.string().min(1).max(50),
  message: z.string().min(1).max(500).trim()
});
