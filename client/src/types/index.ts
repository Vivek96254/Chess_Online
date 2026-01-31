// Room states
export type RoomState = 'waiting_for_player' | 'in_progress' | 'finished';

// Game status
export type GameStatus = 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned' | 'timeout' | 'abandoned';

// Player colors
export type PlayerColor = 'white' | 'black';

// Player role
export type PlayerRole = 'host' | 'opponent' | 'spectator';

// Time control
export interface TimeControl {
  initial: number; // seconds
  increment: number; // seconds per move
}

// Room settings
export interface RoomSettings {
  timeControl: TimeControl | null;
  allowSpectators: boolean;
  isPrivate: boolean;
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

// Game state
export interface GameState {
  fen: string;
  turn: PlayerColor;
  moves: MoveRecord[];
  status: GameStatus;
  winner: PlayerColor | null;
  whiteTime: number | null;
  blackTime: number | null;
  lastMoveAt: number | null;
  startedAt: number;
}

// Room data structure
export interface Room {
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

// Player info
export interface Player {
  odId: string;
  odName: string;
  color: PlayerColor | null;
  isConnected: boolean;
}

// Chat message
export interface ChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

// Connection status
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// Piece types
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

// Square position
export interface Position {
  row: number;
  col: number;
}

// Board state
export type BoardState = (Piece | null)[][];

// Response types
export interface BaseResponse {
  success: boolean;
  error?: string;
}

export interface RoomResponse extends BaseResponse {
  room?: Room;
  playerId?: string;
  color?: PlayerColor;
}

export interface MoveResponse extends BaseResponse {
  move?: MoveRecord;
  gameState?: GameState;
}
