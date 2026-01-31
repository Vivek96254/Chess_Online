import { useRef, useEffect } from 'react';
import type { MoveRecord } from '../types';

interface MoveListProps {
  moves: MoveRecord[];
}

export default function MoveList({ moves }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves]);

  // Group moves into pairs (white move, black move)
  const movePairs: Array<{ number: number; white: MoveRecord | null; black: MoveRecord | null }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i] || null,
      black: moves[i + 1] || null
    });
  }

  return (
    <div className="card p-4 flex-1">
      <h3 className="text-sm font-medium text-midnight-400 mb-3">Move History</h3>
      
      <div
        ref={scrollRef}
        className="move-list h-48 overflow-y-auto pr-2 space-y-1"
      >
        {movePairs.length === 0 ? (
          <p className="text-midnight-500 text-sm text-center py-4">
            No moves yet
          </p>
        ) : (
          movePairs.map((pair, index) => (
            <div
              key={pair.number}
              className="flex items-center gap-2 text-sm"
            >
              <span className="w-8 text-midnight-500 text-right font-mono">
                {pair.number}.
              </span>
              <span className={`flex-1 px-2 py-1 rounded ${
                index === movePairs.length - 1 && pair.black === null
                  ? 'bg-accent/20 text-accent'
                  : 'hover:bg-midnight-700'
              }`}>
                {pair.white?.san || '...'}
              </span>
              <span className={`flex-1 px-2 py-1 rounded ${
                index === movePairs.length - 1 && pair.black !== null
                  ? 'bg-accent/20 text-accent'
                  : pair.black ? 'hover:bg-midnight-700' : ''
              }`}>
                {pair.black?.san || ''}
              </span>
            </div>
          ))
        )}
      </div>

      {moves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-midnight-700">
          <p className="text-xs text-midnight-400 text-center">
            {moves.length} move{moves.length !== 1 ? 's' : ''} played
          </p>
        </div>
      )}
    </div>
  );
}
