import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const navigate = useNavigate();
  const { 
    login, 
    register, 
    isAuthenticated, 
    isLoading, 
    error, 
    clearError 
  } = useAuthStore();
  const { setPlayerName, connectionStatus, connect } = useGameStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    setFormError('');
  }, [mode, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!username.trim() || !password.trim()) {
      setFormError('Username and password are required');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters');
        return;
      }
      if (username.length < 3) {
        setFormError('Username must be at least 3 characters');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        setFormError('Username can only contain letters, numbers, and underscores');
        return;
      }
    }

    let success: boolean;
    if (mode === 'login') {
      success = await login(username, password);
    } else {
      success = await register(username, password, email || undefined);
    }

    if (success) {
      // Set player name from username
      setPlayerName(username);
      
      // Reconnect socket with new auth token
      // This ensures the socket is authenticated for session tracking
      console.log('🔄 Reconnecting socket with auth token after login...');
      socketService.disconnect();
      await connect();
      
      navigate('/');
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setPassword('');
    setConfirmPassword('');
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
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg bg-midnight-800 hover:bg-midnight-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow">
              <span className="text-2xl">♔</span>
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Chess Online</h1>
              <p className="text-midnight-400 text-sm">
                {mode === 'login' ? 'Welcome back!' : 'Create your account'}
              </p>
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
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-midnight-300">
                {mode === 'login' 
                  ? 'Enter your credentials to continue' 
                  : 'Fill in your details to get started'}
              </p>
            </div>

            {/* Error display */}
            {(error || formError) && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {formError || error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-midnight-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="input"
                  maxLength={50}
                  autoComplete="username"
                />
              </div>

              {/* Email (register only) */}
              {mode === 'register' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-midnight-300 mb-2">
                    Email <span className="text-midnight-500">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="input"
                    autoComplete="email"
                  />
                </div>
              )}

              {/* Password */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-midnight-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {/* Confirm Password (register only) */}
              {mode === 'register' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-midnight-300 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="input"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full mb-4 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="spinner w-5 h-5 border-2"></span>
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {mode === 'login' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      )}
                    </svg>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                  </>
                )}
              </button>
            </form>

            {/* Switch mode */}
            <div className="text-center text-sm text-midnight-400">
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    onClick={switchMode}
                    className="text-accent hover:text-accent-light transition-colors font-medium"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={switchMode}
                    className="text-accent hover:text-accent-light transition-colors font-medium"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>

            {/* Guest play option */}
            <div className="mt-6 pt-6 border-t border-midnight-700">
              <p className="text-center text-sm text-midnight-400 mb-3">
                Or continue without an account
              </p>
              <button
                onClick={() => navigate('/')}
                className="btn btn-secondary w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Play as Guest
              </button>
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">📊</span>
              </div>
              <p className="text-sm text-midnight-300">Track Stats</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">🏆</span>
              </div>
              <p className="text-sm text-midnight-300">Game History</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-xl bg-midnight-800 flex items-center justify-center mb-2">
                <span className="text-2xl">🔄</span>
              </div>
              <p className="text-sm text-midnight-300">Sync Devices</p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-6 text-center text-midnight-500 text-sm">
        Built with ♔ for chess lovers
      </footer>
    </div>
  );
}
