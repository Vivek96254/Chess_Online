import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

export default function HomePage() {
  const navigate = useNavigate();
  const { 
    playerName, 
    setPlayerName, 
    createRoom, 
    joinRoom, 
    spectateRoom,
    connectionStatus 
  } = useGameStore();

  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSpectateModal, setShowSpectateModal] = useState(false);
  const [timeControl, setTimeControl] = useState<'none' | 'rapid' | 'blitz'>('none');

  useEffect(() => {
    // Check for room in URL params
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomCode(room);
      setShowJoinModal(true);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return;
    
    setIsCreating(true);
    const settings = {
      timeControl: timeControl === 'none' ? null : 
        timeControl === 'rapid' ? { initial: 600, increment: 5 } :
        { initial: 180, increment: 2 },
      allowSpectators: true,
      isPrivate: false
    };
    
    const success = await createRoom(settings);
    setIsCreating(false);
    
    if (success) {
      const room = useGameStore.getState().room;
      if (room) {
        navigate(`/game/${room.roomId}`);
      }
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    
    setIsJoining(true);
    const success = await joinRoom(roomCode.toUpperCase());
    setIsJoining(false);
    
    if (success) {
      navigate(`/game/${roomCode.toUpperCase()}`);
    }
  };

  const handleSpectate = async () => {
    if (!roomCode.trim()) return;
    
    setIsJoining(true);
    const success = await spectateRoom(roomCode.toUpperCase());
    setIsJoining(false);
    
    if (success) {
      navigate(`/game/${roomCode.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow">
              <span className="text-2xl">♔</span>
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Chess Online</h1>
              <p className="text-midnight-400 text-sm">Play with friends worldwide</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${connectionStatus === 'connected' ? 'online' : 'offline'}`}></span>
            <span className="text-sm text-midnight-300">
              {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="card p-8">
            {/* Title */}
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold text-white mb-2">
                Ready to Play?
              </h2>
              <p className="text-midnight-300">
                Create a room or join an existing game
              </p>
            </div>

            {/* Name input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-midnight-300 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="input"
                maxLength={20}
              />
            </div>

            {/* Time control */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-midnight-300 mb-2">
                Time Control
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['none', 'rapid', 'blitz'] as const).map((tc) => (
                  <button
                    key={tc}
                    onClick={() => setTimeControl(tc)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      timeControl === tc
                        ? 'bg-accent text-midnight-950'
                        : 'bg-midnight-700 text-white hover:bg-midnight-600'
                    }`}
                  >
                    {tc === 'none' ? 'No Timer' : tc === 'rapid' ? '10+5' : '3+2'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-midnight-400 mt-2">
                {timeControl === 'none' && 'Play without time limits'}
                {timeControl === 'rapid' && '10 minutes + 5 seconds per move'}
                {timeControl === 'blitz' && '3 minutes + 2 seconds per move'}
              </p>
            </div>

            {/* Create room button */}
            <button
              onClick={handleCreateRoom}
              disabled={!playerName.trim() || isCreating || connectionStatus !== 'connected'}
              className="btn btn-primary w-full mb-4 flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <span className="spinner w-5 h-5 border-2"></span>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Room
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-midnight-600"></div>
              <span className="text-midnight-400 text-sm">or</span>
              <div className="flex-1 h-px bg-midnight-600"></div>
            </div>

            {/* Join/Spectate buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowJoinModal(true)}
                disabled={connectionStatus !== 'connected'}
                className="btn btn-secondary flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Join Game
              </button>
              <button
                onClick={() => setShowSpectateModal(true)}
                disabled={connectionStatus !== 'connected'}
                className="btn btn-secondary flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Spectate
              </button>
            </div>
          </div>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">🎮</span>
              </div>
              <p className="text-sm text-midnight-300">Real-time Play</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">👥</span>
              </div>
              <p className="text-sm text-midnight-300">Spectator Mode</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">🔗</span>
              </div>
              <p className="text-sm text-midnight-300">Share & Play</p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 w-full max-w-sm"
          >
            <h3 className="font-display text-xl font-bold text-white mb-4">Join Game</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-midnight-300 mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="input font-mono text-center text-lg tracking-wider"
                maxLength={8}
                autoFocus
              />
            </div>

            {!playerName && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-midnight-300 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="input"
                  maxLength={20}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setRoomCode('');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleJoinRoom}
                disabled={!roomCode.trim() || !playerName.trim() || isJoining}
                className="btn btn-primary flex-1"
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Spectate Modal */}
      {showSpectateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 w-full max-w-sm"
          >
            <h3 className="font-display text-xl font-bold text-white mb-4">Spectate Game</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-midnight-300 mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="input font-mono text-center text-lg tracking-wider"
                maxLength={8}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSpectateModal(false);
                  setRoomCode('');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSpectate}
                disabled={!roomCode.trim() || isJoining}
                className="btn btn-primary flex-1"
              >
                {isJoining ? 'Joining...' : 'Watch'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 p-6 text-center text-midnight-500 text-sm">
        Built with ♔ for chess lovers
      </footer>
    </div>
  );
}
