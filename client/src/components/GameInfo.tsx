import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Room, PlayerColor } from '../types';
import clsx from 'clsx';

interface GameInfoProps {
  room: Room;
  playerColor: PlayerColor | null;
  isSpectator: boolean;
  onLeave: () => void;
  onCopyCode: () => void;
}

export default function GameInfo({ room, playerColor, isSpectator, onLeave, onCopyCode }: GameInfoProps) {
  const { resign, offerDraw, gameState, latency, playerId, kickPlayer, lockRoom } = useGameStore();
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showKickMenu, setShowKickMenu] = useState(false);

  const isPlaying = room.state === 'in_progress' && !isSpectator;
  const isFinished = room.state === 'finished';
  const isHost = playerId === room.hostId && !isSpectator;

  const handleCopyCode = () => {
    onCopyCode();
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleResign = () => {
    resign();
    setShowResignConfirm(false);
  };

  const formatTime = (ms: number | null): string => {
    if (ms === null) return '--:--';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-white">Game Info</h2>
          <div className="flex items-center gap-2 text-sm text-midnight-400">
            <span className="status-dot online"></span>
            <span>{latency}ms</span>
          </div>
        </div>

        {/* Room name and code */}
        {room.settings.roomName && (
          <div className="mb-3">
            <p className="text-xs text-midnight-400 mb-1">Room Name</p>
            <p className="text-lg font-bold text-white">{room.settings.roomName}</p>
          </div>
        )}
        
        <div className="bg-midnight-900 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-midnight-400">Room Code</p>
              <p className="font-mono text-lg font-bold text-accent">{room.roomId}</p>
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2 rounded-lg bg-midnight-700 hover:bg-midnight-600 text-white transition-colors"
              title="Copy room code"
            >
              {codeCopied ? (
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Game status */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={clsx(
            'px-2 py-1 rounded-full text-xs font-medium',
            room.state === 'waiting_for_player' && 'bg-yellow-500/20 text-yellow-400',
            room.state === 'in_progress' && 'bg-green-500/20 text-green-400',
            room.state === 'finished' && 'bg-midnight-600 text-midnight-300'
          )}>
            {room.state === 'waiting_for_player' && 'Waiting for player'}
            {room.state === 'in_progress' && 'In Progress'}
            {room.state === 'finished' && 'Finished'}
          </span>
          {isSpectator && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent">
              Spectating
            </span>
          )}
          {room.settings.isPrivate && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
              Private
            </span>
          )}
          {room.settings.isLocked && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Locked
            </span>
          )}
        </div>
      </div>

      {/* Players */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-midnight-400 mb-3">Players</h3>
        
        {/* White player (Host) */}
        <div className={clsx(
          'flex items-center justify-between p-3 rounded-lg mb-2',
          gameState?.turn === 'white' && gameState.status === 'active' 
            ? 'bg-accent/10 border border-accent/30' 
            : 'bg-midnight-900'
        )}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-lg">
              ♔
            </div>
            <div>
              <p className="font-medium text-white">
                {room.hostName}
                {playerColor === 'white' && !isSpectator && (
                  <span className="text-accent text-xs ml-2">(You)</span>
                )}
              </p>
              <p className="text-xs text-midnight-400">White</p>
            </div>
          </div>
          {gameState && room.settings.timeControl && (
            <div className={clsx(
              'font-mono text-lg font-bold',
              gameState.whiteTime !== null && gameState.whiteTime < 30000 ? 'text-red-500' : 'text-white'
            )}>
              {formatTime(gameState.whiteTime)}
            </div>
          )}
        </div>

        {/* Black player (Opponent) */}
        <div className={clsx(
          'flex items-center justify-between p-3 rounded-lg',
          gameState?.turn === 'black' && gameState.status === 'active'
            ? 'bg-accent/10 border border-accent/30'
            : 'bg-midnight-900'
        )}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-midnight-950 flex items-center justify-center text-lg border border-midnight-600">
              ♚
            </div>
            <div>
              <p className="font-medium text-white">
                {room.opponentName || 'Waiting...'}
                {playerColor === 'black' && !isSpectator && (
                  <span className="text-accent text-xs ml-2">(You)</span>
                )}
              </p>
              <p className="text-xs text-midnight-400">Black</p>
            </div>
          </div>
          {gameState && room.settings.timeControl && (
            <div className={clsx(
              'font-mono text-lg font-bold',
              gameState.blackTime !== null && gameState.blackTime < 30000 ? 'text-red-500' : 'text-white'
            )}>
              {formatTime(gameState.blackTime)}
            </div>
          )}
        </div>
      </div>

      {/* Spectators */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-midnight-400">Spectators</h3>
          <span className="text-accent font-medium">{room.spectatorCount}</span>
        </div>
        {room.spectators.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {room.spectators.slice(0, 10).map((spectator) => (
              <span
                key={spectator.odId}
                className="px-2 py-1 text-xs bg-midnight-700 rounded-full text-midnight-300"
              >
                {spectator.name}
              </span>
            ))}
            {room.spectators.length > 10 && (
              <span className="px-2 py-1 text-xs bg-midnight-700 rounded-full text-midnight-300">
                +{room.spectators.length - 10} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Game result */}
      {isFinished && gameState && (
        <div className="card p-4 border-gold/30">
          <h3 className="text-sm font-medium text-midnight-400 mb-2">Result</h3>
          <p className="text-lg font-bold text-gold">
            {gameState.status === 'checkmate' && `${gameState.winner === 'white' ? 'White' : 'Black'} wins by checkmate!`}
            {gameState.status === 'stalemate' && 'Draw by stalemate'}
            {gameState.status === 'draw' && 'Game drawn'}
            {gameState.status === 'resigned' && `${gameState.winner === 'white' ? 'White' : 'Black'} wins by resignation!`}
            {gameState.status === 'timeout' && `${gameState.winner === 'white' ? 'White' : 'Black'} wins on time!`}
            {gameState.status === 'abandoned' && `${gameState.winner === 'white' ? 'White' : 'Black'} wins by abandonment!`}
          </p>
        </div>
      )}

      {/* Host Controls */}
      {isHost && !isFinished && (
        <div className="card p-4 mb-4 border-accent/30">
          <h3 className="text-sm font-medium text-midnight-400 mb-3">Host Controls</h3>
          
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={room.settings.isLocked}
                onChange={(e) => lockRoom(e.target.checked)}
                className="w-5 h-5 rounded bg-midnight-700 border-midnight-600 text-accent focus:ring-accent"
              />
              <span className="text-sm text-midnight-300">Lock Room</span>
            </label>

            {room.opponentId && (
              <div className="relative">
                <button
                  onClick={() => setShowKickMenu(!showKickMenu)}
                  className="btn btn-secondary w-full text-sm"
                >
                  Manage Players
                </button>
                {showKickMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 card p-2 z-10">
                    <button
                      onClick={() => {
                        kickPlayer(room.opponentId!);
                        setShowKickMenu(false);
                      }}
                      className="btn btn-danger w-full text-sm"
                    >
                      Kick {room.opponentName || 'Opponent'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {room.spectators.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-midnight-400 mb-2">Spectators:</p>
                {room.spectators.map((spec) => (
                  <div key={spec.odId} className="flex items-center justify-between p-2 bg-midnight-900 rounded mb-1">
                    <span className="text-sm text-midnight-300">{spec.name}</span>
                    <button
                      onClick={() => kickPlayer(spec.odId)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {isPlaying && !isFinished && (
          <>
            <button
              onClick={() => offerDraw()}
              className="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Offer Draw
            </button>

            {showResignConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResign}
                  className="btn btn-danger flex-1"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResignConfirm(true)}
                className="btn btn-danger w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                Resign
              </button>
            )}
          </>
        )}

        <button
          onClick={onLeave}
          className="btn btn-secondary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Leave Room
        </button>
      </div>
    </div>
  );
}
