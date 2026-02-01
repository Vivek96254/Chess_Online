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
  MoveResponse,
  RoomSettings,
  SessionRestoreResponse,
  SocketAuthData
} from '../types/index.js';

type ChessSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: SocketAuthData;
};
type ChessServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Shared draw offers map across all socket connections
// roomId -> offerer id (userId or socketId)
const drawOffers = new Map<string, string>();

/**
 * Get the persistent player ID (userId for authenticated, socketId for anonymous)
 */
function getPlayerId(socket: ChessSocket): { socketId: string; odId?: string } {
  return {
    socketId: socket.id,
    odId: socket.data?.userId
  };
}

/**
 * Register all socket event handlers
 */
export function registerSocketHandlers(
  io: ChessServer,
  socket: ChessSocket,
  roomManager: RoomManager
): void {
  const { odId } = getPlayerId(socket);
  const isAuthenticated = !!odId;
  
  console.log(`🔌 Client connected: ${socket.id}${isAuthenticated ? ` (user: ${odId})` : ' (anonymous)'}`);

  // Handle session restoration for authenticated users and guests
  socket.on('session:restore', async (callback: (response: SessionRestoreResponse) => void) => {
    try {
      const { odId } = getPlayerId(socket);
      const isGuest = socket.data?.isGuest || false;
      
      console.log(`📋 Session restore requested - socket: ${socket.id}, userId: ${odId || 'none'}, isGuest: ${isGuest}`);
      
      if (!odId) {
        console.log('❌ Session restore failed: No persistent identity');
        callback({ success: false, error: 'No persistent identity' });
        return;
      }

      // Check if user has an existing session
      const existingSession = roomManager.getUserSession(odId);
      console.log(`📋 Existing session for ${odId}:`, existingSession ? {
        roomId: existingSession.roomId,
        role: existingSession.role,
        color: existingSession.color,
        isConnected: existingSession.isConnected
      } : 'none');

      const result = await roomManager.restoreSession(odId, socket.id);
      
      if (!result) {
        console.log(`❌ Session restore failed: No active session found for ${isGuest ? 'guest' : 'user'} ${odId}`);
        callback({ success: false, error: 'No active session found' });
        return;
      }

      const { room, session } = result;

      // Rejoin the socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);

      // Notify room about reconnection
      io.to(room.roomId).emit('player:reconnected', {
        playerId: odId
      });

      callback({
        success: true,
        session: {
          roomId: room.roomId,
          role: session.role,
          color: session.color
        },
        room: serializedRoom
      });

      console.log(`✅ Session restored for ${isGuest ? 'guest' : 'user'} ${odId} in room ${room.roomId} as ${session.role}`);
    } catch (error) {
      console.error('Error restoring session:', error);
      callback({ success: false, error: 'Failed to restore session' });
    }
  });

  // Handle room creation
  socket.on('room:create', async (payload: CreateRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = CreateRoomSchema.parse(payload);
      const { socketId, odId } = getPlayerId(socket);
      
      // Check if player is already in a room
      if (roomManager.isPlayerInRoom(socketId, odId)) {
        callback({ success: false, error: 'Already in a room' });
        return;
      }

      const room = await roomManager.createRoom(
        socketId,
        validated.playerName,
        validated.settings,
        odId // Pass userId for authenticated users
      );

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);
      
      callback({
        success: true,
        room: serializedRoom,
        playerId: odId || socketId,
        color: 'white'
      });

      console.log(`🏠 Room created: ${room.roomId} by ${validated.playerName}${odId ? ` (user: ${odId})` : ''}`);
      if (odId) {
        console.log(`📋 Session registered for user ${odId} in room ${room.roomId} as host`);
      }
    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  // Handle joining a room as opponent
  socket.on('room:join', async (payload: JoinRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = JoinRoomSchema.parse(payload);
      const { socketId, odId } = getPlayerId(socket);
      
      // Check if player is already in a room
      if (roomManager.isPlayerInRoom(socketId, odId)) {
        callback({ success: false, error: 'Already in a room' });
        return;
      }

      const result = await roomManager.joinRoom(
        validated.roomId,
        socketId,
        validated.playerName,
        odId // Pass userId for authenticated users
      );

      if (!result) {
        callback({ success: false, error: 'Cannot join room' });
        return;
      }

      const { room, color } = result;

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);
      const persistentId = odId || socketId;

      // Notify everyone in the room
      io.to(room.roomId).emit('player:joined', {
        player: {
          odId: persistentId,
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
        playerId: persistentId,
        color
      });

      // Notify public room list watchers
      io.emit('room:list-updated');

      console.log(`👤 Player joined room ${room.roomId}: ${validated.playerName}${odId ? ` (user: ${odId})` : ''}`);
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  // Handle spectating a room
  socket.on('room:spectate', async (payload: SpectateRoomPayload, callback: (response: RoomResponse) => void) => {
    try {
      const validated = SpectateRoomSchema.parse(payload);
      const { socketId, odId } = getPlayerId(socket);
      
      const room = await roomManager.spectateRoom(
        validated.roomId,
        socketId,
        validated.spectatorName || `Spectator-${socketId.slice(0, 4)}`,
        odId // Pass userId for authenticated users
      );

      if (!room) {
        callback({ success: false, error: 'Cannot spectate room' });
        return;
      }

      // Join socket room
      socket.join(room.roomId);

      const serializedRoom = roomManager.serializeRoom(room);
      const persistentId = odId || socketId;

      // Notify room about new spectator
      io.to(room.roomId).emit('spectator:joined', {
        spectatorId: persistentId,
        name: validated.spectatorName || `Spectator-${socketId.slice(0, 4)}`,
        count: room.spectators.size
      });

      callback({
        success: true,
        room: serializedRoom,
        playerId: persistentId
      });

      console.log(`👁️ Spectator joined room ${room.roomId}${odId ? ` (user: ${odId})` : ''}`);
    } catch (error) {
      console.error('Error spectating room:', error);
      callback({ success: false, error: 'Failed to spectate room' });
    }
  });

  // Handle leaving a room
  socket.on('room:leave', async (callback: (response: BaseResponse) => void) => {
    try {
      const { socketId, odId } = getPlayerId(socket);
      const { room, wasPlayer, shouldEndGame } = await roomManager.leaveRoom(socketId, odId);
      const persistentId = odId || socketId;

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
            playerId: persistentId,
            reason: 'Player left'
          });
        } else {
          const serializedRoom = roomManager.serializeRoom(room);
          io.to(room.roomId).emit('spectator:left', {
            spectatorId: persistentId,
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
      const { socketId, odId } = getPlayerId(socket);
      
      const result = await roomManager.makeMove(
        validated.roomId,
        socketId,
        validated.from,
        validated.to,
        validated.promotion,
        odId // Pass userId for authenticated users
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
      const { socketId, odId } = getPlayerId(socket);
      const gameState = await roomManager.resign(payload.roomId, socketId, odId);

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
      const { socketId, odId } = getPlayerId(socket);
      const persistentId = odId || socketId;
      
      const room = roomManager.getRoom(payload.roomId);
      if (!room || room.state !== 'in_progress') {
        callback({ success: false, error: 'Cannot offer draw' });
        return;
      }

      const isPlayer = room.hostId === persistentId || room.opponentId === persistentId;
      if (!isPlayer) {
        callback({ success: false, error: 'Not a player' });
        return;
      }

      drawOffers.set(payload.roomId, persistentId);
      
      // Notify everyone in the room (players and spectators)
      io.to(payload.roomId).emit('draw:offered', { fromPlayerId: persistentId });
      
      callback({ success: true });
    } catch (error) {
      console.error('Error offering draw:', error);
      callback({ success: false, error: 'Failed to offer draw' });
    }
  });

  socket.on('game:accept-draw', async (payload: { roomId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const { socketId, odId } = getPlayerId(socket);
      const persistentId = odId || socketId;
      
      const offerer = drawOffers.get(payload.roomId);
      if (!offerer) {
        callback({ success: false, error: 'No draw offer to accept' });
        return;
      }

      // Only the opponent (not the offerer) can accept
      if (offerer === persistentId) {
        callback({ success: false, error: 'Cannot accept your own draw offer' });
        return;
      }

      // Verify the acceptor is a player in the room
      const room = roomManager.getRoom(payload.roomId);
      if (!room || room.state !== 'in_progress') {
        callback({ success: false, error: 'Game is not in progress' });
        return;
      }

      const isPlayer = room.hostId === persistentId || room.opponentId === persistentId;
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
      const { socketId, odId } = getPlayerId(socket);
      const persistentId = odId || socketId;
      
      const room = roomManager.getRoom(validated.roomId);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      // Get sender name using persistent ID
      let senderName = 'Unknown';
      if (room.hostId === persistentId) {
        senderName = room.hostName;
      } else if (room.opponentId === persistentId) {
        senderName = room.opponentName || 'Opponent';
      } else {
        const spectator = room.spectators.get(persistentId);
        if (spectator) {
          senderName = spectator;
        }
      }

      io.to(validated.roomId).emit('chat:message', {
        senderId: persistentId,
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

  // Host controls: Kick player
  socket.on('room:kick', async (payload: { roomId: string; playerId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const result = await roomManager.kickPlayer(payload.roomId, socket.id, payload.playerId);
      
      if (!result.success) {
        callback({ success: false, error: 'Cannot kick player' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        // Notify the kicked player
        io.to(payload.playerId).emit('room:kicked', {
          roomId: payload.roomId,
          reason: 'You were kicked from the room'
        });

        // Notify room about the kick
        if (result.wasPlayer && result.shouldEndGame && room.gameState) {
          io.to(payload.roomId).emit('game:ended', {
            gameState: room.gameState,
            reason: 'Player was kicked'
          });
        }

        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers
        io.emit('room:list-updated');
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error kicking player:', error);
      callback({ success: false, error: 'Failed to kick player' });
    }
  });

  // Host controls: Lock/unlock room
  socket.on('room:lock', async (payload: { roomId: string; locked: boolean }, callback: (response: BaseResponse) => void) => {
    try {
      const success = await roomManager.setRoomLocked(payload.roomId, socket.id, payload.locked);
      
      if (!success) {
        callback({ success: false, error: 'Cannot lock/unlock room' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers
        io.emit('room:list-updated');
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error locking room:', error);
      callback({ success: false, error: 'Failed to lock/unlock room' });
    }
  });

  // Host controls: Update room settings
  socket.on('room:update-settings', async (payload: { roomId: string; settings: Partial<RoomSettings> }, callback: (response: BaseResponse) => void) => {
    try {
      const success = await roomManager.updateRoomSettings(payload.roomId, socket.id, payload.settings);
      
      if (!success) {
        callback({ success: false, error: 'Cannot update room settings' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers if visibility changed
        if (payload.settings.isPrivate !== undefined || payload.settings.allowJoin !== undefined) {
          io.emit('room:list-updated');
        }
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error updating room settings:', error);
      callback({ success: false, error: 'Failed to update room settings' });
    }
  });

  // Host controls: Kick player
  socket.on('room:kick', async (payload: { roomId: string; playerId: string }, callback: (response: BaseResponse) => void) => {
    try {
      const result = await roomManager.kickPlayer(payload.roomId, socket.id, payload.playerId);
      
      if (!result.success) {
        callback({ success: false, error: 'Cannot kick player' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        // Notify the kicked player
        io.to(payload.playerId).emit('room:kicked', {
          roomId: payload.roomId,
          reason: 'You were kicked from the room'
        });

        // Notify room about the kick
        if (result.wasPlayer && result.shouldEndGame && room.gameState) {
          io.to(payload.roomId).emit('game:ended', {
            gameState: room.gameState,
            reason: 'Player was kicked'
          });
        }

        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers
        io.emit('room:list-updated');
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error kicking player:', error);
      callback({ success: false, error: 'Failed to kick player' });
    }
  });

  // Host controls: Lock/unlock room
  socket.on('room:lock', async (payload: { roomId: string; locked: boolean }, callback: (response: BaseResponse) => void) => {
    try {
      const success = await roomManager.setRoomLocked(payload.roomId, socket.id, payload.locked);
      
      if (!success) {
        callback({ success: false, error: 'Cannot lock/unlock room' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers
        io.emit('room:list-updated');
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error locking room:', error);
      callback({ success: false, error: 'Failed to lock/unlock room' });
    }
  });

  // Host controls: Update room settings
  socket.on('room:update-settings', async (payload: { roomId: string; settings: Partial<RoomSettings> }, callback: (response: BaseResponse) => void) => {
    try {
      const success = await roomManager.updateRoomSettings(payload.roomId, socket.id, payload.settings);
      
      if (!success) {
        callback({ success: false, error: 'Cannot update room settings' });
        return;
      }

      const room = roomManager.getRoom(payload.roomId);
      if (room) {
        io.to(payload.roomId).emit('room:updated', roomManager.serializeRoom(room));
        // Notify public room list watchers if visibility changed
        if (payload.settings.isPrivate !== undefined || payload.settings.allowJoin !== undefined) {
          io.emit('room:list-updated');
        }
      }

      callback({ success: true });
    } catch (error) {
      console.error('Error updating room settings:', error);
      callback({ success: false, error: 'Failed to update room settings' });
    }
  });

  // Ping for latency measurement
  socket.on('ping', (callback: (response: { timestamp: number }) => void) => {
    callback({ timestamp: Date.now() });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    const { socketId, odId } = getPlayerId(socket);
    console.log(`🔌 Client disconnected: ${socketId}${odId ? ` (user: ${odId})` : ''}`);

    const { roomId, isPlayer, gracePeriod, odId: disconnectedUserId } = roomManager.handleDisconnect(socketId);
    const persistentId = disconnectedUserId || socketId;

    if (roomId) {
      if (isPlayer) {
        io.to(roomId).emit('player:disconnected', {
          playerId: persistentId,
          gracePeriod
        });

        // Set up auto-forfeit after grace period
        // For both authenticated and anonymous users, we emit the game:ended event here
        setTimeout(async () => {
          const room = roomManager.getRoom(roomId);
          if (room && room.state === 'in_progress') {
            // Check if user reconnected
            let stillDisconnected = false;
            
            if (disconnectedUserId) {
              // For authenticated users, check if they have an active session
              const session = roomManager.getUserSession(disconnectedUserId);
              stillDisconnected = !session || !session.isConnected;
            } else {
              // For anonymous users, check if socket is still connected
              stillDisconnected = !io.sockets.sockets.has(socketId);
            }
            
            if (stillDisconnected) {
              const { shouldEndGame, room: updatedRoom } = await roomManager.leaveRoom(socketId, disconnectedUserId || undefined);
              if (shouldEndGame && updatedRoom?.gameState) {
                // Clear any pending draw offers
                drawOffers.delete(roomId);
                
                io.to(roomId).emit('game:ended', {
                  gameState: updatedRoom.gameState,
                  reason: 'Player disconnected'
                });
                
                console.log(`⏱️ Player ${persistentId} forfeited due to disconnect timeout`);
              }
            }
          }
        }, gracePeriod);
      } else {
        const room = roomManager.getRoom(roomId);
        if (room) {
          io.to(roomId).emit('spectator:left', {
            spectatorId: persistentId,
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
