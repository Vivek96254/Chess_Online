import { Chess, Square, PieceSymbol } from 'chess.js';
import type { GameState, MoveRecord, PlayerColor, GameStatus } from '../types/index.js';

/**
 * ChessEngine - Handles all chess game logic
 * Uses chess.js for FIDE-compliant move validation
 */
export class ChessEngine {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  /**
   * Get current FEN string
   */
  getFen(): string {
    return this.chess.fen();
  }

  /**
   * Get current turn
   */
  getTurn(): PlayerColor {
    return this.chess.turn() === 'w' ? 'white' : 'black';
  }

  /**
   * Check if a move is valid
   */
  isValidMove(from: string, to: string, promotion?: string): boolean {
    try {
      const moves = this.chess.moves({ square: from as Square, verbose: true });
      return moves.some(m => m.to === to && (!promotion || m.promotion === promotion));
    } catch {
      return false;
    }
  }

  /**
   * Make a move and return the move record
   * Returns null if the move is invalid
   */
  makeMove(from: string, to: string, promotion?: string): MoveRecord | null {
    try {
      const move = this.chess.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion as PieceSymbol | undefined
      });

      if (!move) {
        return null;
      }

      return {
        from: move.from,
        to: move.to,
        san: move.san,
        fen: this.chess.fen(),
        timestamp: Date.now(),
        promotion: move.promotion
      };
    } catch {
      return null;
    }
  }

  /**
   * Get legal moves for a square
   */
  getLegalMoves(square: string): string[] {
    try {
      const moves = this.chess.moves({ square: square as Square, verbose: true });
      return moves.map(m => m.to);
    } catch {
      return [];
    }
  }

  /**
   * Get all legal moves
   */
  getAllLegalMoves(): Array<{ from: string; to: string; promotion?: string }> {
    const moves = this.chess.moves({ verbose: true });
    return moves.map(m => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion
    }));
  }

  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /**
   * Check if current player is in check
   */
  isCheck(): boolean {
    return this.chess.isCheck();
  }

  /**
   * Check if current position is checkmate
   */
  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  /**
   * Check if current position is stalemate
   */
  isStalemate(): boolean {
    return this.chess.isStalemate();
  }

  /**
   * Check if game is drawn
   */
  isDraw(): boolean {
    return this.chess.isDraw();
  }

  /**
   * Check for threefold repetition
   */
  isThreefoldRepetition(): boolean {
    return this.chess.isThreefoldRepetition();
  }

  /**
   * Check for insufficient material
   */
  isInsufficientMaterial(): boolean {
    return this.chess.isInsufficientMaterial();
  }

  /**
   * Check for fifty move rule
   */
  isFiftyMoveRule(): boolean {
    return this.chess.history().length >= 100 && this.isDraw();
  }

  /**
   * Get game status
   */
  getGameStatus(): GameStatus {
    if (this.isCheckmate()) return 'checkmate';
    if (this.isStalemate()) return 'stalemate';
    if (this.isDraw()) return 'draw';
    return 'active';
  }

  /**
   * Get winner if game is over
   */
  getWinner(): PlayerColor | null {
    if (this.isCheckmate()) {
      // The player who just moved wins
      return this.chess.turn() === 'w' ? 'black' : 'white';
    }
    return null;
  }

  /**
   * Get move history in SAN notation
   */
  getHistory(): string[] {
    return this.chess.history();
  }

  /**
   * Get detailed move history
   */
  getDetailedHistory(): MoveRecord[] {
    const moves = this.chess.history({ verbose: true });
    return moves.map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      fen: m.after,
      timestamp: 0, // Will be set by the room manager
      promotion: m.promotion
    }));
  }

  /**
   * Get board state as 2D array
   */
  getBoard(): Array<Array<{ type: string; color: 'w' | 'b' } | null>> {
    return this.chess.board();
  }

  /**
   * Undo the last move
   */
  undo(): boolean {
    const move = this.chess.undo();
    return move !== null;
  }

  /**
   * Reset to starting position
   */
  reset(): void {
    this.chess.reset();
  }

  /**
   * Load a FEN position
   */
  loadFen(fen: string): boolean {
    try {
      this.chess.load(fen);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get PGN string
   */
  getPgn(): string {
    return this.chess.pgn();
  }

  /**
   * Create initial game state
   */
  static createInitialGameState(timeControl: { initial: number; increment: number } | null): GameState {
    const engine = new ChessEngine();
    return {
      fen: engine.getFen(),
      turn: 'white',
      moves: [],
      status: 'active',
      winner: null,
      whiteTime: timeControl ? timeControl.initial * 1000 : null,
      blackTime: timeControl ? timeControl.initial * 1000 : null,
      lastMoveAt: null,
      startedAt: Date.now()
    };
  }

  /**
   * Create a new engine from game state
   */
  static fromGameState(gameState: GameState): ChessEngine {
    return new ChessEngine(gameState.fen);
  }
}
