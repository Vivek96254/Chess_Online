import { Server, Socket } from 'socket.io';
import { RoomManager } from '../services/RoomManager.js';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  SpectateRoomSchema,
  MakeMoveSchema,
  ChatMessageSchema
} from '../types/index.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CreateRoomPayload,
  JoinRoomPayload,
  SpectateRoomPayload,
  MakeMovePayload,
  ChatMessagePayload,
  RoomResponse,
  BaseResponse,
  MoveResponse
} from '../types/index.js';

type ChessSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type ChessServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Shared draw offers map across all socket connections
// roomId -> offerer socket id
const drawOffers = new Map<string, string>();

/**
 * Register all socket event handlers
 */
export function registerSocketHandlers(
  io: ChessServer,
  socket: ChessSocket,
  roomManager: RoomManager
): void {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Handle room creation
  socket.on('room:create', async (payload: CreateRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = CreateRoomSchema.parse(payload);
      
      // Check if player is already in a room
      if (roomManager.isPlayerInRoom(socket.id)) {
        callback({ success: false, error: 'Already in a room' });
        return;
      }

      const room = await roomManager.createRoom(
        socket.id,
        validated.playerName,
        validated.settings
      );

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);
      
      callback({
        success: true,
        room: serializedRoom,
        playerId: socket.id,
        color: 'white'
      });

      console.log(`🏠 Room created: ${room.roomId} by ${validated.playerName}`);
    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  // Handle joining a room as opponent
  socket.on('room:join', async (payload: JoinRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = JoinRoomSchema.parse(payload);
      
      // Check if player is already in a room
      if (roomManager.isPlayerInRoom(socket.id)) {
        callback({ success: false, error: 'Already in a room' });
        return;
      }

      const result = await roomManager.joinRoom(
        validated.roomId,
        socket.id,
        validated.playerName
      );

      if (!result) {
        callback({ success: false, error: 'Cannot join room' });
        return;
      }

      const { room, color } = result;

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);

      // Notify everyone in the room
      io.to(room.roomId).emit('player:joined', {
        player: {
          odId: socket.id,
          odName: validated.playerName,
          color,
          isConnected: true
        },
        room: serializedRoom
      });

      // Emit game started event
      if (room.gameState) {
        io.to(room.roomId).emit('game:started', room.gameState);
      }

      callback({
        success: true,
        room: serializedRoom,
        playerId: socket.id,
        color
      });

      console.log(`👤 Player joined room ${room.roomId}: ${validated.playerName}`);
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  // Handle spectating a room
  socket.on('room:spectate', async (payload: SpectateRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = SpectateRoomSchema.parse(payload);
      
      const room = await roomManager.spectateRoom(
        validated.roomId,
        socket.id,
        validated.spectatorName || `Spectator-${socket.id.slice(0, 4)}`
      );

      if (!room) {
        callback({ success: false, error: 'Cannot spectate room' });
        return;
      }

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);

      // Notify room about new spectator
      io.to(room.roomId).emit('spectator:joined', {
        spectatorId: socket.id,
        name: validated.spectatorName || `Spectator-${socket.id.slice(0, 4)}`,
        count: room.spectators.size
      });

      callback({
        success: true,
        room: serializedRoom,
        playerId: socket.id
      });

      console.log(`👁️ Spectator joined room ${room.roomId}`);
    } catch (error) {
      console.error('Error spectating room:', error);
      callback({ success: false, error: 'Failed to spectate room' });
    }
  });

  // Handle leaving a room
  socket.on('room:leave', async (callback: (response: BaseResponse) => void) => {
    try {
      const { room, wasPlayer, shouldEndGame } = await roomManager.leaveRoom(socket.id);

      if (room) {
        socket.leave(room.roomId);

        // Clear any pending draw offers for this room
        drawOffers.delete(room.roomId);

        if (shouldEndGame && room.gameState) {
          io.to(room.roomId).emit('game:ended', {
            gameState: room.gameState,
            reason: 'Player left the game'
          });
        }

        if (wasPlayer) {
          io.to(room.roomId).emit('player:left', {
            playerId: socket.id,
            reason: 'Player left'
          });
        } else {
          const serializedRoom = roomManager.serializeRoom(room);
          io.to(room.roomId).emit('spectator:left', {
            spectatorId: socket.id,
            count: serializedRoom.spectatorCount
          });
        }
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error leaving room:', error);
      callback({ success: false, error: 'Failed to leave room' });
    }
  });

  // Handle making a move
  socket.on('game:move', async (payload: MakeMovePayload, callback: (response: MoveResponse) => void) => {
    try {
      const validated = MakeMoveSchema.parse(payload);
      
      const result = await roomManager.makeMove(
        validated.roomId,
        socket.id,
        validated.from,
        validated.to,
        validated.promotion
      );

      if (!result.success) {
        callback({ success: false, error: result.error });
        return;
      }

      // Broadcast move to all players and spectators
      io.to(validated.roomId).emit('game:move', {
        move: result.move!,
        gameState: result.gameState!
      });

      // Check if game ended
      if (result.gameState?.status !== 'active') {
        // Clear any pending draw offers
        drawOffers.delete(validated.roomId);
        
        const room = roomManager.getRoom(validated.roomId);
        io.to(validated.roomId).emit('game:ended', {
          gameState: result.gameState!,
          reason: getGameEndReason(result.gameState!.status)
        });
        
        if (room) {
          io.to(validated.roomId).emit('room:updated', roomManager.serializeRoom(room));
        }
      }

      callback({
        success: true,
        move: result.move,
        gameState: result.gameState
      });
    } catch (error) {
      console.error('Error making move:', error);
      callback({ success: false, error: 'Failed to make move' });
    }
  });

  // Handle resignation
  socket.on('game:resign', async (payload: { roomId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const gameState = await roomManager.resign(payload.roomId, socket.id);

      if (!gameState) {
        callback({ success: false, error: 'Cannot resign' });
        return;
      }

      // Clear any pending draw offers
      drawOffers.delete(payload.roomId);

      io.to(payload.roomId).emit('game:ended', {
        gameState,
        reason: 'Player resigned'
      });

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
      }

      callback({ success: true });
      console.log(`🏳️ Player resigned in room ${payload.roomId}`);
    } catch (error) {
      console.error('Error resigning:', error);
      callback({ success: false, error: 'Failed to resign' });
    }
  });

  // Draw offer/accept/decline
  socket.on('game:offer-draw', async (payload: { roomId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room || room.state !== 'in_progress') {
        callback({ success: false, error: 'Cannot offer draw' });
        return;
      }

      const isPlayer = room.hostId === socket.id || room.opponentId === socket.id;
      if (!isPlayer) {
        callback({ success: false, error: 'Not a player' });
        return;
      }

      drawOffers.set(payload.roomId, socket.id);
      
      // Notify everyone in the room (players and spectators)
      io.to(payload.roomId).emit('draw:offered', { fromPlayerId: socket.id });
      
      callback({ success: true });
    } catch (error) {
      console.error('Error offering draw:', error);
      callback({ success: false, error: 'Failed to offer draw' });
    }
  });

  socket.on('game:accept-draw', async (payload: { roomId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const offerer = drawOffers.get(payload.roomId);
      if (!offerer) {
        callback({ success: false, error: 'No draw offer to accept' });
        return;
      }

      // Only the opponent (not the offerer) can accept
      if (offerer === socket.id) {
        callback({ success: false, error: 'Cannot accept your own draw offer' });
        return;
      }

      // Verify the acceptor is a player in the room
      const room = roomManager.getRoom(payload.roomId);
      if (!room || room.state !== 'in_progress') {
        callback({ success: false, error: 'Game is not in progress' });
        return;
      }

      const isPlayer = room.hostId === socket.id || room.opponentId === socket.id;
      if (!isPlayer) {
        callback({ success: false, error: 'Only players can accept draw offers' });
        return;
      }

      const gameState = await roomManager.drawGame(payload.roomId);
      if (!gameState) {
        callback({ success: false, error: 'Cannot accept draw' });
        return;
      }

      drawOffers.delete(payload.roomId);

      io.to(payload.roomId).emit('game:ended', {
        gameState,
        reason: 'Draw agreed'
      });

      // Get updated room state after draw
      const updatedRoom = roomManager.getRoom(payload.roomId);
      if (updatedRoom) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(updatedRoom));
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error accepting draw:', error);
      callback({ success: false, error: 'Failed to accept draw' });
    }
  });

  socket.on('game:decline-draw', async (payload: { roomId: string }, callback: (response: BaseResponse) => void) => {
    try {
      drawOffers.delete(payload.roomId);
      socket.to(payload.roomId).emit('draw:declined');
      callback({ success: true });
    } catch (error) {
      console.error('Error declining draw:', error);
      callback({ success: false, error: 'Failed to decline draw' });
    }
  });

  // Handle chat messages
  socket.on('chat:send', async (payload: ChatMessagePayload, callback: (response: BaseResponse) => void) => {
    try {
      const validated = ChatMessageSchema.parse(payload);
      
      const room = roomManager.getRoom(validated.roomId);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      // Get sender name
      let senderName = 'Unknown';
      if (room.hostId === socket.id) {
        senderName = room.hostName;
      } else if (room.opponentId === socket.id) {
        senderName = room.opponentName || 'Opponent';
      } else {
        const spectator = room.spectators.get(socket.id);
        if (spectator) {
          senderName = spectator;
        }
      }

      io.to(validated.roomId).emit('chat:message', {
        senderId: socket.id,
        senderName,
        message: validated.message,
        timestamp: Date.now()
      });

      callback({ success: true });
    } catch (error) {
      console.error('Error sending chat:', error);
      callback({ success: false, error: 'Failed to send message' });
    }
  });

  // Ping for latency measurement
  socket.on('ping', (callback: (response: { timestamp: number }) => void) => {
    callback({ timestamp: Date.now() });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    const { roomId, isPlayer, gracePeriod } = roomManager.handleDisconnect(socket.id);

    if (roomId) {
      if (isPlayer) {
        io.to(roomId).emit('player:disconnected', {
          playerId: socket.id,
          gracePeriod
        });

        // Set up auto-forfeit after grace period
        setTimeout(async () => {
          const room = roomManager.getRoom(roomId);
          if (room && room.state === 'in_progress') {
            const stillDisconnected = !io.sockets.sockets.has(socket.id);
            if (stillDisconnected) {
              const { shouldEndGame, room: updatedRoom } = await roomManager.leaveRoom(socket.id);
              if (shouldEndGame && updatedRoom?.gameState) {
                // Clear any pending draw offers
                drawOffers.delete(roomId);
                
                io.to(roomId).emit('game:ended', {
                  gameState: updatedRoom.gameState,
                  reason: 'Player disconnected'
                });
              }
            }
          }
        }, gracePeriod);
      } else {
        const room = roomManager.getRoom(roomId);
        if (room) {
          io.to(roomId).emit('spectator:left', {
            spectatorId: socket.id,
            count: room.spectators.size
          });
        }
      }
    }
  });
}

/**
 * Get human-readable game end reason
 */
function getGameEndReason(status: string): string {
  switch (status) {
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    case 'draw':
      return 'Draw';
    case 'resigned':
      return 'Resignation';
    case 'timeout':
      return 'Time out';
    case 'abandoned':
      return 'Game abandoned';
    default:
      return 'Game ended';
  }
}
