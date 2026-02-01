import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import ChessBoard from '../components/ChessBoard';
import GameInfo from '../components/GameInfo';
import MoveList from '../components/MoveList';
import ChatBox from '../components/ChatBox';
import PromotionModal from '../components/PromotionModal';
import GameEndModal from '../components/GameEndModal';
import DrawOfferModal from '../components/DrawOfferModal';

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const {
    room,
    gameState,
    playerColor,
    isSpectator,
    leaveRoom,
    joinRoom,
    spectateRoom,
    playerName,
    promotionPending,
    makeMove,
    setPromotionPending,
    drawOffered,
    drawOfferFrom,
    playerId,
    connectionStatus,
    sessionRestoring,
    sessionRestored
  } = useGameStore();

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModeModal, setShowJoinModeModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const initRoom = async () => {
      if (!roomId) {
        navigate('/');
        return;
      }

      // If already in this room, no need to rejoin
      if (room?.roomId === roomId) {
        setIsLoading(false);
        setShowJoinModeModal(false);
        return;
      }

      // Wait for connection to be established (but don't wait too long)
      if (connectionStatus !== 'connected') {
        // Wait a bit for connection
        let attempts = 0;
        while (attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 200));
          attempts++;
          // Re-check connection status from store
          const currentStatus = useGameStore.getState().connectionStatus;
          if (currentStatus === 'connected') break;
        }
      }

      // Wait for session restoration to complete before showing join modal
      // This prevents showing the join modal when the user is being reconnected to their game
      if (!sessionRestored) {
        let sessionAttempts = 0;
        while (sessionAttempts < 25) { // Wait up to 5 seconds for session restore
          await new Promise(resolve => setTimeout(resolve, 200));
          sessionAttempts++;
          const state = useGameStore.getState();
          
          // Session restored - check if we're now in the right room
          if (state.sessionRestored) {
            if (state.room?.roomId === roomId) {
              // Session was restored and we're in the right room!
              setIsLoading(false);
              setShowJoinModeModal(false);
              return;
            }
            break; // Session restored but not in this room
          }
        }
      }

      // Re-check room state after session restoration
      const currentRoom = useGameStore.getState().room;
      if (currentRoom?.roomId === roomId) {
        setIsLoading(false);
        setShowJoinModeModal(false);
        return;
      }

      // If not already in a room, show join mode selection modal
      // This handles direct link navigation
      if (!currentRoom) {
        setIsLoading(false);
        setShowJoinModeModal(true);
        return;
      }

      // If in a different room, show modal to join new room
      if (currentRoom.roomId !== roomId) {
        setIsLoading(false);
        setShowJoinModeModal(true);
        return;
      }
      
      setIsLoading(false);
    };

    initRoom();
  }, [roomId, room?.roomId, connectionStatus, sessionRestored]);

  const handleLeave = async () => {
    await leaveRoom();
    navigate('/');
  };

  const handlePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (promotionPending) {
      makeMove(promotionPending.from, promotionPending.to, piece);
      setPromotionPending(null);
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/game/${roomId}`;
    navigator.clipboard.writeText(link);
  };

  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
    }
  };

  const handleJoinAsPlayer = async () => {
    const currentPlayerName = useGameStore.getState().playerName;
    if (!currentPlayerName?.trim()) {
      // If no name, show error
      useGameStore.setState({ 
        notification: { 
          type: 'error', 
          message: 'Please enter your name to join as a player' 
        } 
      });
      return;
    }
    
    setIsJoining(true);
    const success = await joinRoom(roomId!);
    setIsJoining(false);
    
    if (success) {
      setShowJoinModeModal(false);
      setIsLoading(false);
    } else {
      // If join failed, show error but keep modal open
      useGameStore.setState({ 
        notification: { 
          type: 'error', 
          message: 'Failed to join room. The room may not exist or may be full.' 
        } 
      });
    }
  };

  const handleJoinAsSpectator = async () => {
    setIsJoining(true);
    const success = await spectateRoom(roomId!);
    setIsJoining(false);
    
    if (success) {
      setShowJoinModeModal(false);
      setIsLoading(false);
    } else {
      // If spectate failed, show error but keep modal open
      useGameStore.setState({ 
        notification: { 
          type: 'error', 
          message: 'Failed to spectate room. The room may not exist.' 
        } 
      });
    }
  };

  if (isLoading || sessionRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-midnight-300">
            {sessionRestoring ? 'Restoring your session...' : 'Loading game...'}
          </p>
        </div>
      </div>
    );
  }

  // Show join mode modal if needed (before checking if room exists)
  if (showJoinModeModal) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-6 w-full max-w-sm"
        >
          <h3 className="font-display text-xl font-bold text-white mb-2">
            Join Game
          </h3>
          <p className="text-midnight-300 mb-4">
            Room Code: <span className="font-mono font-bold text-accent">{roomId}</span>
          </p>
          <p className="text-midnight-300 mb-6">
            How would you like to join this game?
          </p>

          {!playerName && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-midnight-300 mb-2">
                Your Name (required for playing)
              </label>
              <input
                type="text"
                value={playerName || ''}
                onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                maxLength={20}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleJoinAsPlayer}
              disabled={isJoining || !playerName?.trim()}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Join as Player
            </button>

            <button
              onClick={handleJoinAsSpectator}
              disabled={isJoining}
              className="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Join as Spectator
            </button>
          </div>

          <button
            onClick={() => {
              setShowJoinModeModal(false);
              navigate('/');
            }}
            className="btn btn-secondary w-full mt-3"
          >
            Cancel
          </button>
        </motion.div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Room not found</h2>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isWaiting = room.state === 'waiting_for_player';
  const isFinished = room.state === 'finished';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left sidebar - Game Info */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:w-80 p-4 lg:p-6 lg:h-screen lg:overflow-y-auto"
      >
        <GameInfo
          room={room}
          playerColor={playerColor}
          isSpectator={isSpectator}
          onLeave={() => setShowLeaveConfirm(true)}
          onCopyCode={copyRoomCode}
        />
      </motion.aside>

      {/* Main content - Chess Board */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6">
        {isWaiting ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-8 text-center max-w-md"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-midnight-700 flex items-center justify-center animate-pulse">
              <span className="text-4xl">⏳</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              {room.settings.roomName || 'Waiting for Opponent'}
            </h2>
            <p className="text-midnight-300 mb-6">
              {room.settings.isPrivate 
                ? 'Share the room code or link with a friend' 
                : 'Your room is public and visible in Browse Rooms'}
            </p>
            
            <div className="bg-midnight-900 rounded-lg p-4 mb-6">
              <p className="text-sm text-midnight-400 mb-2">Room Code</p>
              <p className="font-mono text-3xl font-bold text-accent tracking-wider">
                {room.roomId}
              </p>
            </div>

            <button
              onClick={copyRoomLink}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Invite Link
            </button>

            <p className="text-midnight-400 text-sm mt-4">
              👁️ {room.spectatorCount} spectator{room.spectatorCount !== 1 ? 's' : ''} watching
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="chess-board-container"
          >
            <ChessBoard />
          </motion.div>
        )}
      </main>

      {/* Right sidebar - Move List & Chat */}
      <motion.aside
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:w-80 p-4 lg:p-6 lg:h-screen lg:overflow-y-auto flex flex-col gap-4"
      >
        {gameState && (
          <MoveList moves={gameState.moves} />
        )}
        <ChatBox />
      </motion.aside>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 w-full max-w-sm"
          >
            <h3 className="font-display text-xl font-bold text-white mb-4">
              Leave Game?
            </h3>
            <p className="text-midnight-300 mb-6">
              {isSpectator 
                ? 'You will stop watching this game.'
                : 'Leaving during a game will result in a loss.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="btn btn-secondary flex-1"
              >
                Stay
              </button>
              <button
                onClick={handleLeave}
                className="btn btn-danger flex-1"
              >
                Leave
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Promotion Modal */}
      {promotionPending && (
        <PromotionModal
          color={playerColor || 'white'}
          onSelect={handlePromotion}
          onCancel={() => setPromotionPending(null)}
        />
      )}

      {/* Game End Modal */}
      {isFinished && gameState && (
        <GameEndModal
          gameState={gameState}
          playerColor={playerColor}
          isSpectator={isSpectator}
          onClose={() => {}}
          onRematch={() => navigate('/')}
        />
      )}

      {/* Draw Offer Modal */}
      {drawOffered && drawOfferFrom !== playerId && (
        <DrawOfferModal isSpectator={isSpectator} />
      )}

    </div>
  );
}
