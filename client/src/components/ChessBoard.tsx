import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import ChessPiece from './ChessPiece';
import clsx from 'clsx';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export default function ChessBoard() {
  const {
    getBoardState,
    isFlipped,
    selectedSquare,
    legalMoves,
    lastMove,
    isCheck,
    gameState,
    selectSquare,
    playerColor,
    isSpectator,
    flipBoard
  } = useGameStore();

  const board = getBoardState();

  // Determine which squares to display based on orientation
  const displayFiles = useMemo(() => isFlipped ? [...FILES].reverse() : FILES, [isFlipped]);
  const displayRanks = useMemo(() => isFlipped ? [...RANKS].reverse() : RANKS, [isFlipped]);

  // Find king in check
  const kingInCheck = useMemo(() => {
    if (!isCheck || !gameState) return null;
    
    const kingColor = gameState.turn === 'white' ? 'w' : 'b';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece?.type === 'k' && piece.color === kingColor) {
          return FILES[col] + RANKS[row];
        }
      }
    }
    return null;
  }, [isCheck, gameState, board]);

  const handleSquareClick = (square: string) => {
    if (isSpectator || !gameState || gameState.status !== 'active') return;
    selectSquare(square);
  };

  const isMyTurn = gameState?.turn === playerColor && gameState?.status === 'active';

  return (
    <div className="relative">
      {/* Board container with shadow */}
      <div className="shadow-board rounded-lg overflow-hidden">
        {/* Chess board grid */}
        <div className="grid grid-cols-8 aspect-square">
          {displayRanks.map((rank, rowIndex) =>
            displayFiles.map((file, colIndex) => {
              const square = file + rank;
              const isLight = (rowIndex + colIndex) % 2 === 0;
              
              // Get actual board position
              const actualRow = isFlipped ? 7 - rowIndex : rowIndex;
              const actualCol = isFlipped ? 7 - colIndex : colIndex;
              const piece = board[actualRow]?.[actualCol];

              const isSelected = selectedSquare === square;
              const isLegalMove = legalMoves.includes(square);
              const isLastMoveSquare = lastMove?.from === square || lastMove?.to === square;
              const isKingCheck = kingInCheck === square;
              const hasPiece = piece !== null;

              return (
                <div
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  className={clsx(
                    'board-square relative aspect-square',
                    isLight ? 'light' : 'dark',
                    isSelected && 'highlighted',
                    isLastMoveSquare && 'last-move',
                    isKingCheck && 'check',
                    isLegalMove && !hasPiece && 'legal-move',
                    isLegalMove && hasPiece && 'legal-capture',
                    isMyTurn && !isSpectator && 'cursor-pointer'
                  )}
                >
                  {/* Coordinate labels */}
                  {colIndex === 0 && (
                    <span className={clsx(
                      'coordinate rank',
                      isLight ? 'light' : 'dark'
                    )}>
                      {rank}
                    </span>
                  )}
                  {rowIndex === 7 && (
                    <span className={clsx(
                      'coordinate file',
                      isLight ? 'light' : 'dark'
                    )}>
                      {file}
                    </span>
                  )}

                  {/* Chess piece */}
                  {piece && (
                    <ChessPiece
                      type={piece.type}
                      color={piece.color}
                      isDraggable={!isSpectator && isMyTurn && piece.color === (playerColor === 'white' ? 'w' : 'b')}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Board controls */}
      <div className="absolute -bottom-12 left-0 right-0 flex justify-center gap-4">
        <button
          onClick={flipBoard}
          className="p-2 rounded-lg bg-midnight-700 hover:bg-midnight-600 text-white transition-colors"
          title="Flip board"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* Turn indicator */}
      {gameState && gameState.status === 'active' && (
        <div className={clsx(
          'absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium',
          isFlipped ? 'top-full mt-16' : '-top-12',
          gameState.turn === playerColor && !isSpectator
            ? 'bg-accent text-midnight-950'
            : 'bg-midnight-700 text-white'
        )}>
          {isSpectator 
            ? `${gameState.turn === 'white' ? 'White' : 'Black'}'s turn`
            : gameState.turn === playerColor 
              ? 'Your turn' 
              : "Opponent's turn"}
        </div>
      )}
    </div>
  );
}
