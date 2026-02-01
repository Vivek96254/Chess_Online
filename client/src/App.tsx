import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { useAuthStore, setupAutoRefresh, clearAutoRefresh } from './store/authStore';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import BrowseRoomsPage from './pages/BrowseRoomsPage';
import AuthPage from './pages/AuthPage';
import Notification from './components/Notification';

function App() {
  const { connect, connectionStatus, notification, clearNotification, setPlayerName } = useGameStore();
  const { isAuthenticated, user, verifySession } = useAuthStore();

  useEffect(() => {
    connect();
  }, [connect]);

  // Verify auth session on startup
  useEffect(() => {
    const initAuth = async () => {
      if (isAuthenticated) {
        const valid = await verifySession();
        if (valid && user) {
          // Sync player name with auth username
          setPlayerName(user.displayName || user.username);
          setupAutoRefresh();
        }
      }
    };

    initAuth();

    return () => {
      clearAutoRefresh();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-950 via-midnight-900 to-midnight-800">
      {/* Connection status indicator */}
      {connectionStatus !== 'connected' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600 text-white text-center py-2 text-sm">
          {connectionStatus === 'connecting' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner w-4 h-4 border-2"></span>
              Connecting to server...
            </span>
          ) : connectionStatus === 'reconnecting' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner w-4 h-4 border-2"></span>
              Reconnecting...
            </span>
          ) : (
            <span>Disconnected from server. Please refresh the page.</span>
          )}
        </div>
      )}

      {/* Main content */}
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/browse" element={<BrowseRoomsPage />} />
          <Route path="/room/:roomId" element={<GamePage />} />
          <Route path="/game/:roomId" element={<GamePage />} />
        </Routes>
      </AnimatePresence>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <Notification
            type={notification.type}
            message={notification.message}
            onClose={clearNotification}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
