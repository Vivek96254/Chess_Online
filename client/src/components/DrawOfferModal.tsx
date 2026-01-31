import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

export default function DrawOfferModal() {
  const { acceptDraw, declineDraw } = useGameStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-6 w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🤝</div>
          <h3 className="font-display text-xl font-bold text-white mb-2">
            Draw Offered
          </h3>
          <p className="text-midnight-300">
            Your opponent is offering a draw. Do you accept?
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={declineDraw}
            className="btn btn-secondary flex-1"
          >
            Decline
          </button>
          <button
            onClick={acceptDraw}
            className="btn btn-primary flex-1"
          >
            Accept
          </button>
        </div>
      </motion.div>
    </div>
  );
}
