import { motion } from 'framer-motion';
import type { GameState, PlayerColor } from '../types';

interface GameEndModalProps {
  gameState: GameState;
  playerColor: PlayerColor | null;
  isSpectator: boolean;
  onClose: () => void;
  onRematch: () => void;
}

export default function GameEndModal({ 
  gameState, 
  playerColor, 
  isSpectator, 
  onRematch 
}: GameEndModalProps) {
  const isDraw = gameState.winner === null;
  const isWinner = !isSpectator && gameState.winner === playerColor;
  const isLoser = !isSpectator && !isDraw && gameState.winner !== playerColor;

  const getTitle = () => {
    if (isDraw) return 'Draw!';
    if (isSpectator) return `${gameState.winner === 'white' ? 'White' : 'Black'} Wins!`;
    if (isWinner) return 'Victory!';
    return 'Defeat';
  };

  const getEmoji = () => {
    if (isDraw) return '🤝';
    if (isWinner) return '🏆';
    if (isLoser) return '😔';
    return '👏';
  };

  const getDescription = () => {
    switch (gameState.status) {
      case 'checkmate':
        return 'Checkmate!';
      case 'stalemate':
        return 'Stalemate - no legal moves available';
      case 'draw':
        return 'Game drawn by agreement';
      case 'resigned':
        return `${gameState.winner === 'white' ? 'Black' : 'White'} resigned`;
      case 'timeout':
        return `${gameState.winner === 'white' ? 'Black' : 'White'} ran out of time`;
      case 'abandoned':
        return `${gameState.winner === 'white' ? 'Black' : 'White'} left the game`;
      default:
        return 'Game ended';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 15 }}
        className="card p-8 w-full max-w-sm text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', damping: 10 }}
          className="text-6xl mb-4"
        >
          {getEmoji()}
        </motion.div>

        <h2 className={`font-display text-3xl font-bold mb-2 ${
          isWinner ? 'text-gold' : isDraw ? 'text-accent' : 'text-white'
        }`}>
          {getTitle()}
        </h2>

        <p className="text-midnight-300 mb-6">
          {getDescription()}
        </p>

        {/* Game stats */}
        <div className="bg-midnight-900 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-midnight-400">Moves</p>
              <p className="text-lg font-bold text-white">{gameState.moves.length}</p>
            </div>
            <div>
              <p className="text-midnight-400">Duration</p>
              <p className="text-lg font-bold text-white">
                {formatDuration(Date.now() - gameState.startedAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={onRematch}
            className="btn btn-primary w-full"
          >
            New Game
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
