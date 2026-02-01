import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';

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
  
  const { isAuthenticated, user, logout } = useAuthStore();

  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSpectateModal, setShowSpectateModal] = useState(false);
  const [showJoinModeModal, setShowJoinModeModal] = useState(false);
  const [timeControl, setTimeControl] = useState<'none' | 'rapid' | 'blitz'>('none');
  const [isPrivate] = useState(false);
  const [allowJoin] = useState(true);
  const [allowSpectators] = useState(true);
  const [roomName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    // Check for room in URL params
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomCode(room);
      setShowJoinModeModal(true);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return;
    
    setIsCreating(true);
    const settings = {
      timeControl: timeControl === 'none' ? null : 
        timeControl === 'rapid' ? { initial: 600, increment: 5 } :
        { initial: 180, increment: 2 },
      allowSpectators,
      allowJoin,
      isPrivate,
      roomName: roomName.trim() || undefined,
      isLocked: false
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
    const success = await joinRoom(roomCode.toUpperCase(), needsPassword ? joinPassword : undefined);
    setIsJoining(false);
    
    if (success) {
      setShowJoinModal(false);
      setRoomCode('');
      setJoinPassword('');
      setNeedsPassword(false);
      navigate(`/game/${roomCode.toUpperCase()}`);
    } else {
      // Check if the error indicates password is required
      const notification = useGameStore.getState().notification;
      if (notification?.message?.toLowerCase().includes('password') || 
          notification?.message?.toLowerCase().includes('locked')) {
        setNeedsPassword(true);
      }
    }
  };

  const handleSpectate = async () => {
    if (!roomCode.trim()) return;
    
    setIsJoining(true);
    const success = await spectateRoom(roomCode.toUpperCase(), needsPassword ? joinPassword : undefined);
    setIsJoining(false);
    
    if (success) {
      setShowSpectateModal(false);
      setRoomCode('');
      setJoinPassword('');
      setNeedsPassword(false);
      navigate(`/game/${roomCode.toUpperCase()}`);
    } else {
      // Check if the error indicates password is required
      const notification = useGameStore.getState().notification;
      if (notification?.message?.toLowerCase().includes('password') || 
          notification?.message?.toLowerCase().includes('locked')) {
        setNeedsPassword(true);
      }
    }
  };

  const handleJoinAsPlayerFromModal = async () => {
    if (!playerName.trim()) {
      // Focus on name input
      return;
    }
    
    setIsJoining(true);
    const success = await joinRoom(roomCode.toUpperCase(), needsPassword ? joinPassword : undefined);
    setIsJoining(false);
    
    if (success) {
      setShowJoinModeModal(false);
      setJoinPassword('');
      setNeedsPassword(false);
      navigate(`/game/${roomCode.toUpperCase()}`);
    } else {
      // Check if the error indicates password is required
      const notification = useGameStore.getState().notification;
      if (notification?.message?.toLowerCase().includes('password') || 
          notification?.message?.toLowerCase().includes('locked')) {
        setNeedsPassword(true);
      }
    }
  };

  const handleJoinAsSpectatorFromModal = async () => {
    setIsJoining(true);
    const success = await spectateRoom(roomCode.toUpperCase(), needsPassword ? joinPassword : undefined);
    setIsJoining(false);
    
    if (success) {
      setShowJoinModeModal(false);
      setJoinPassword('');
      setNeedsPassword(false);
      navigate(`/game/${roomCode.toUpperCase()}`);
    } else {
      // Check if the error indicates password is required
      const notification = useGameStore.getState().notification;
      if (notification?.message?.toLowerCase().includes('password') || 
          notification?.message?.toLowerCase().includes('locked')) {
        setNeedsPassword(true);
      }
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`status-dot ${connectionStatus === 'connected' ? 'online' : 'offline'}`}></span>
              <span className="text-sm text-midnight-300">
                {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {/* Auth buttons */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-midnight-800 border border-midnight-700">
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-midnight-950">
                    {(user.displayName || user.username).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-white font-medium">
                    {user.displayName || user.username}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                    setPlayerName('');
                  }}
                  className="text-sm text-midnight-400 hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="btn btn-secondary text-sm py-1.5 px-4"
              >
                Sign In
              </button>
            )}
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

            {/* Browse Rooms Button */}
            <button
              onClick={() => navigate('/browse')}
              disabled={connectionStatus !== 'connected'}
              className="btn btn-secondary w-full mb-3 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Browse Public Rooms
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

            {/* Password field - shows after failed attempt or if known to be locked */}
            {needsPassword && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium text-purple-400">This room requires a password</span>
                </div>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="input border-purple-500/30 focus:border-purple-500"
                  maxLength={50}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setRoomCode('');
                  setJoinPassword('');
                  setNeedsPassword(false);
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

            {/* Password field - shows after failed attempt or if known to be locked */}
            {needsPassword && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium text-purple-400">This room requires a password</span>
                </div>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="input border-purple-500/30 focus:border-purple-500"
                  maxLength={50}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSpectateModal(false);
                  setRoomCode('');
                  setJoinPassword('');
                  setNeedsPassword(false);
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

      {/* Join Mode Selection Modal (from link) */}
      {showJoinModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 w-full max-w-sm"
          >
            <h3 className="font-display text-xl font-bold text-white mb-2">
              Join Game
            </h3>
            <p className="text-midnight-300 mb-4">
              Room Code: <span className="font-mono font-bold text-accent">{roomCode}</span>
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
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="input"
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}

            {/* Password field - shows after failed attempt */}
            {needsPassword && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium text-purple-400">This room requires a password</span>
                </div>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="input border-purple-500/30 focus:border-purple-500"
                  maxLength={50}
                />
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleJoinAsPlayerFromModal}
                disabled={isJoining || !playerName.trim()}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Join as Player
              </button>

              <button
                onClick={handleJoinAsSpectatorFromModal}
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
                setRoomCode('');
                setJoinPassword('');
                setNeedsPassword(false);
                // Clear room param from URL
                const url = new URL(window.location.href);
                url.searchParams.delete('room');
                window.history.replaceState({}, '', url);
              }}
              className="btn btn-secondary w-full mt-3"
            >
              Cancel
            </button>
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
