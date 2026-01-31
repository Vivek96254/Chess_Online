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
    playerId
  } = useGameStore();

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initRoom = async () => {
      if (!roomId) {
        navigate('/');
        return;
      }

      // If already in this room, no need to rejoin
      if (room?.roomId === roomId) {
        setIsLoading(false);
        return;
      }

      // Try to join or spectate
      setIsLoading(true);
      
      if (playerName) {
        const joined = await joinRoom(roomId);
        if (!joined) {
          // Try to spectate instead
          const spectated = await spectateRoom(roomId);
          if (!spectated) {
            navigate('/');
            return;
          }
        }
      } else {
        // Spectate without name
        const spectated = await spectateRoom(roomId);
        if (!spectated) {
          navigate('/');
          return;
        }
      }
      
      setIsLoading(false);
    };

    initRoom();
  }, [roomId, room?.roomId, playerName, joinRoom, spectateRoom, navigate]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-midnight-300">Loading game...</p>
        </div>
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
          onCopyLink={copyRoomLink}
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
              Waiting for Opponent
            </h2>
            <p className="text-midnight-300 mb-6">
              Share the room code or link with a friend
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
