import { motion } from 'framer-motion';
import ChessPiece from './ChessPiece';
import type { PlayerColor } from '../types';

interface PromotionModalProps {
  color: PlayerColor;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

export default function PromotionModal({ color, onSelect, onCancel }: PromotionModalProps) {
  const pieces: Array<{ type: 'q' | 'r' | 'b' | 'n'; name: string }> = [
    { type: 'q', name: 'Queen' },
    { type: 'r', name: 'Rook' },
    { type: 'b', name: 'Bishop' },
    { type: 'n', name: 'Knight' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-6 w-full max-w-xs"
      >
        <h3 className="font-display text-xl font-bold text-white mb-4 text-center">
          Promote Pawn
        </h3>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          {pieces.map(({ type, name }) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="flex flex-col items-center gap-2 p-4 bg-midnight-700 hover:bg-midnight-600 rounded-lg transition-colors"
            >
              <div className="w-12 h-12">
                <ChessPiece
                  type={type}
                  color={color === 'white' ? 'w' : 'b'}
                  size="lg"
                />
              </div>
              <span className="text-sm text-midnight-300">{name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="btn btn-secondary w-full"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
