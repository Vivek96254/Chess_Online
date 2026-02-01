import { create } from 'zustand';
import { Chess, Square } from 'chess.js';
import { socketService } from '../services/socket';
import type {
  Room,
  GameState,
  PlayerColor,
  ConnectionStatus,
  ChatMessage,
  Piece,
  BoardState,
  RoomSettings,
  PlayerRole
} from '../types';

interface GameStore {
  // Connection state
  connectionStatus: ConnectionStatus;
  playerId: string | null;
  playerName: string;
  latency: number;

  // Room state
  room: Room | null;
  playerColor: PlayerColor | null;
  isSpectator: boolean;

  // Session restoration state
  sessionRestoring: boolean;
  sessionRestored: boolean;

  // Game state
  gameState: GameState | null;
  chess: Chess | null;
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  isCheck: boolean;
  promotionPending: { from: string; to: string } | null;

  // UI state
  isFlipped: boolean;
  showChat: boolean;
  chatMessages: ChatMessage[];
  drawOffered: boolean;
  drawOfferFrom: string | null;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;

  // Actions
  setPlayerName: (name: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  createRoom: (settings?: Partial<RoomSettings>) => Promise<boolean>;
  kickPlayer: (playerId: string) => Promise<void>;
  lockRoom: (locked: boolean) => Promise<void>;
  updateRoomSettings: (settings: Partial<RoomSettings>) => Promise<void>;
  joinRoom: (roomId: string) => Promise<boolean>;
  spectateRoom: (roomId: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  makeMove: (from: string, to: string, promotion?: string) => Promise<boolean>;
  selectSquare: (square: string | null) => void;
  resign: () => Promise<void>;
  offerDraw: () => Promise<void>;
  acceptDraw: () => Promise<void>;
  declineDraw: () => Promise<void>;
  sendChat: (message: string) => Promise<void>;
  flipBoard: () => void;
  toggleChat: () => void;
  clearNotification: () => void;
  setPromotionPending: (data: { from: string; to: string } | null) => void;
  getBoardState: () => BoardState;
  restoreSession: () => Promise<{ roomId: string; role: PlayerRole; color: PlayerColor | null } | null>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  playerId: null,
  playerName: localStorage.getItem('playerName') || '',
  latency: 0,

  room: null,
  playerColor: null,
  isSpectator: false,

  // Session restoration state
  sessionRestoring: false,
  sessionRestored: false,

  gameState: null,
  chess: null,
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  isCheck: false,
  promotionPending: null,

  isFlipped: false,
  showChat: false,
  chatMessages: [],
  drawOffered: false,
  drawOfferFrom: null,
  notification: null,

  // Actions
  setPlayerName: (name: string) => {
    localStorage.setItem('playerName', name);
    set({ playerName: name });
  },

  connect: async () => {
    set({ connectionStatus: 'connecting', sessionRestored: false, sessionRestoring: false });
    
    try {
      // Setup callbacks BEFORE connecting so they're ready when events fire
      socketService.setCallbacks({
        onConnect: () => {
          set({ 
            connectionStatus: 'connected',
            playerId: socketService.getSocketId()
          });
        },
        onDisconnect: () => {
          set({ connectionStatus: 'disconnected' });
        },
        onError: (error) => {
          set({ notification: { type: 'error', message: error.message } });
        },
        onRoomUpdated: (room) => {
          set({ room });
        },
        onRoomClosed: (data) => {
          set({ 
            room: null, 
            gameState: null, 
            chess: null,
            notification: { type: 'info', message: `Room closed: ${data.reason}` }
          });
        },
        onGameStarted: (gameState) => {
          const chess = new Chess(gameState.fen);
          set({ 
            gameState, 
            chess,
            notification: { type: 'success', message: 'Game started!' }
          });
        },
        onGameMove: (data) => {
          const chess = new Chess(data.gameState.fen);
          const lastMove = { from: data.move.from, to: data.move.to };
          const isCheck = chess.isCheck();
          set({ 
            gameState: data.gameState, 
            chess,
            lastMove,
            isCheck,
            selectedSquare: null,
            legalMoves: []
          });
        },
        onGameEnded: (data) => {
          set({ 
            gameState: data.gameState,
            notification: { type: 'info', message: `Game ended: ${data.reason}` }
          });
        },
        onGameSync: (gameState) => {
          const chess = new Chess(gameState.fen);
          set({ gameState, chess });
        },
        onPlayerJoined: (data) => {
          set({ 
            room: data.room,
            notification: { type: 'success', message: `${data.player.odName} joined the game!` }
          });
        },
        onPlayerLeft: (data) => {
          set({ 
            notification: { type: 'info', message: `Player left: ${data.reason}` }
          });
        },
        onPlayerDisconnected: (data) => {
          set({ 
            notification: { type: 'info', message: `Player disconnected. Waiting ${data.gracePeriod / 1000}s for reconnection...` }
          });
        },
        onPlayerReconnected: () => {
          set({ 
            notification: { type: 'success', message: 'Player reconnected!' }
          });
        },
        onSpectatorJoined: (data) => {
          const room = get().room;
          if (room) {
            set({ 
              room: { ...room, spectatorCount: data.count }
            });
          }
        },
        onSpectatorLeft: (data) => {
          const room = get().room;
          if (room) {
            set({ 
              room: { ...room, spectatorCount: data.count }
            });
          }
        },
        onChatMessage: (message) => {
          set(state => ({ 
            chatMessages: [...state.chatMessages, message]
          }));
        },
        onDrawOffered: (data) => {
          set({ 
            drawOffered: true, 
            drawOfferFrom: data.fromPlayerId,
            notification: { type: 'info', message: 'Draw offer received!' }
          });
        },
        onDrawDeclined: () => {
          set({ 
            drawOffered: false, 
            drawOfferFrom: null,
            notification: { type: 'info', message: 'Draw offer declined' }
          });
        },
        onRoomKicked: (data) => {
          set({ 
            room: null,
            gameState: null,
            chess: null,
            notification: { type: 'error', message: data.reason }
          });
        },
        onRoomListUpdated: () => {
          // Room list updated - could trigger refresh if on browse page
        }
      });

      // Now connect to the server
      await socketService.connect();

      set({ connectionStatus: 'connected', playerId: socketService.getSocketId() });

      // Automatically try to restore session for authenticated users AFTER connection is established
      if (socketService.isAuthenticatedConnection()) {
        console.log('🔄 Attempting session restoration for authenticated user...');
        await get().restoreSession();
      } else {
        console.log('ℹ️ Anonymous user - no session to restore');
        set({ sessionRestored: true });
      }

      // Start latency measurement
      setInterval(async () => {
        const latency = await socketService.ping();
        set({ latency });
      }, 5000);
    } catch {
      set({ 
        connectionStatus: 'disconnected',
        sessionRestored: true, // Mark as restored even on failure to unblock UI
        notification: { type: 'error', message: 'Failed to connect to server' }
      });
    }
  },

  disconnect: () => {
    socketService.disconnect();
    set({ 
      connectionStatus: 'disconnected',
      room: null,
      gameState: null,
      chess: null
    });
  },

  createRoom: async (settings) => {
    const { playerName } = get();
    if (!playerName) {
      set({ notification: { type: 'error', message: 'Please enter your name' } });
      return false;
    }

    const response = await socketService.createRoom(playerName, settings);
    
    if (response.success && response.room) {
      const chess = response.room.gameState ? new Chess(response.room.gameState.fen) : null;
      set({ 
        room: response.room,
        playerId: response.playerId || null,
        playerColor: 'white',
        isSpectator: false,
        gameState: response.room.gameState,
        chess
      });
      return true;
    } else {
      set({ notification: { type: 'error', message: response.error || 'Failed to create room' } });
      return false;
    }
  },

  joinRoom: async (roomId: string) => {
    const { playerName } = get();
    if (!playerName) {
      set({ notification: { type: 'error', message: 'Please enter your name' } });
      return false;
    }

    const response = await socketService.joinRoom(roomId, playerName);
    
    if (response.success && response.room) {
      const chess = response.room.gameState ? new Chess(response.room.gameState.fen) : null;
      set({ 
        room: response.room,
        playerId: response.playerId || null,
        playerColor: response.color || 'black',
        isSpectator: false,
        gameState: response.room.gameState,
        chess,
        isFlipped: response.color === 'black'
      });
      return true;
    } else {
      set({ notification: { type: 'error', message: response.error || 'Failed to join room' } });
      return false;
    }
  },

  spectateRoom: async (roomId: string) => {
    const { playerName } = get();
    const response = await socketService.spectateRoom(roomId, playerName || undefined);
    
    if (response.success && response.room) {
      const chess = response.room.gameState ? new Chess(response.room.gameState.fen) : null;
      set({ 
        room: response.room,
        playerId: response.playerId || null,
        playerColor: null,
        isSpectator: true,
        gameState: response.room.gameState,
        chess
      });
      return true;
    } else {
      set({ notification: { type: 'error', message: response.error || 'Failed to spectate room' } });
      return false;
    }
  },

  leaveRoom: async () => {
    await socketService.leaveRoom();
    set({ 
      room: null,
      playerColor: null,
      isSpectator: false,
      gameState: null,
      chess: null,
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
      isCheck: false,
      chatMessages: [],
      drawOffered: false,
      drawOfferFrom: null
    });
  },

  makeMove: async (from: string, to: string, promotion?: string) => {
    const { room, playerColor, gameState, chess, isSpectator } = get();
    
    if (!room || !gameState || !chess || isSpectator) return false;
    if (gameState.turn !== playerColor) return false;

    // Check if promotion is needed
    const piece = chess.get(from as Square);
    if (piece?.type === 'p') {
      const targetRank = playerColor === 'white' ? '8' : '1';
      if (to[1] === targetRank && !promotion) {
        set({ promotionPending: { from, to } });
        return false;
      }
    }

    const response = await socketService.makeMove(room.roomId, from, to, promotion);
    
    if (response.success) {
      set({ promotionPending: null });
      return true;
    } else {
      set({ notification: { type: 'error', message: response.error || 'Invalid move' } });
      return false;
    }
  },

  selectSquare: (square: string | null) => {
    const { chess, playerColor, gameState, isSpectator, selectedSquare } = get();
    
    if (!chess || isSpectator || !gameState || gameState.status !== 'active') {
      set({ selectedSquare: null, legalMoves: [] });
      return;
    }

    // If clicking on the same square, deselect
    if (square === selectedSquare) {
      set({ selectedSquare: null, legalMoves: [] });
      return;
    }

    // If a square is selected and clicking on a legal move, make the move
    if (selectedSquare && square) {
      const { legalMoves } = get();
      if (legalMoves.includes(square)) {
        get().makeMove(selectedSquare, square);
        set({ selectedSquare: null, legalMoves: [] });
        return;
      }
    }

    // Select a new square if it has a piece of the player's color
    if (square) {
      const piece = chess.get(square as Square);
      if (piece && 
          ((piece.color === 'w' && playerColor === 'white') ||
           (piece.color === 'b' && playerColor === 'black')) &&
          gameState.turn === playerColor) {
        const moves = chess.moves({ square: square as Square, verbose: true });
        set({ 
          selectedSquare: square,
          legalMoves: moves.map(m => m.to)
        });
        return;
      }
    }

    set({ selectedSquare: null, legalMoves: [] });
  },

  resign: async () => {
    const { room } = get();
    if (!room) return;
    await socketService.resign(room.roomId);
  },

  offerDraw: async () => {
    const { room } = get();
    if (!room) return;
    await socketService.offerDraw(room.roomId);
    set({ notification: { type: 'info', message: 'Draw offer sent' } });
  },

  acceptDraw: async () => {
    const { room } = get();
    if (!room) return;
    await socketService.acceptDraw(room.roomId);
    set({ drawOffered: false, drawOfferFrom: null });
  },

  declineDraw: async () => {
    const { room } = get();
    if (!room) return;
    await socketService.declineDraw(room.roomId);
    set({ drawOffered: false, drawOfferFrom: null });
  },

  sendChat: async (message: string) => {
    const { room } = get();
    if (!room) return;
    await socketService.sendChatMessage(room.roomId, message);
  },

  flipBoard: () => {
    set(state => ({ isFlipped: !state.isFlipped }));
  },

  toggleChat: () => {
    set(state => ({ showChat: !state.showChat }));
  },

  clearNotification: () => {
    set({ notification: null });
  },

  setPromotionPending: (data) => {
    set({ promotionPending: data });
  },

  getBoardState: (): BoardState => {
    const { chess } = get();
    if (!chess) {
      // Return empty board
      return Array(8).fill(null).map(() => Array(8).fill(null));
    }

    const board: BoardState = [];
    for (let row = 0; row < 8; row++) {
      const rowPieces: (Piece | null)[] = [];
      for (let col = 0; col < 8; col++) {
        const square = String.fromCharCode(97 + col) + (8 - row) as Square;
        const piece = chess.get(square);
        if (piece) {
          rowPieces.push({ type: piece.type, color: piece.color });
        } else {
          rowPieces.push(null);
        }
      }
      board.push(rowPieces);
    }
    return board;
  },

  kickPlayer: async (targetPlayerId: string) => {
    const { room } = get();
    if (!room) return;
    
    const response = await socketService.kickPlayer(room.roomId, targetPlayerId);
    if (!response.success) {
      set({ notification: { type: 'error', message: response.error || 'Failed to kick player' } });
    }
  },

  lockRoom: async (locked: boolean) => {
    const { room } = get();
    if (!room) return;
    
    const response = await socketService.lockRoom(room.roomId, locked);
    if (!response.success) {
      set({ notification: { type: 'error', message: response.error || 'Failed to lock/unlock room' } });
    }
  },

  updateRoomSettings: async (settings: Partial<RoomSettings>) => {
    const { room } = get();
    if (!room) return;
    
    const response = await socketService.updateRoomSettings(room.roomId, settings);
    if (!response.success) {
      set({ notification: { type: 'error', message: response.error || 'Failed to update room settings' } });
    }
  },

  restoreSession: async () => {
    // Only try to restore if authenticated
    if (!socketService.isAuthenticatedConnection()) {
      set({ sessionRestored: true, sessionRestoring: false });
      return null;
    }

    set({ sessionRestoring: true });

    try {
      const response = await socketService.restoreSession();

      if (response.success && response.session && response.room) {
        const { session, room } = response;
        const chess = room.gameState ? new Chess(room.gameState.fen) : null;
        const isSpectator = session.role === 'spectator';
        
        // Determine player ID based on role
        let playerId: string | null = null;
        if (session.role === 'host') {
          playerId = room.hostId;
        } else if (session.role === 'opponent') {
          playerId = room.opponentId;
        }
        
        set({
          room,
          playerId,
          playerColor: session.color,
          isSpectator,
          gameState: room.gameState,
          chess,
          isFlipped: session.color === 'black',
          sessionRestored: true,
          sessionRestoring: false,
          notification: { type: 'success', message: 'Session restored! Welcome back.' }
        });

        console.log(`🔄 Session restored: room ${session.roomId}, role ${session.role}, color ${session.color}`);
        return session;
      } else {
        set({ sessionRestored: true, sessionRestoring: false });
        return null;
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      set({ sessionRestored: true, sessionRestoring: false });
      return null;
    }
  }
}));
