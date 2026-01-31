import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import type { RoomListing, RoomState } from '../types';

const SERVER_URL = (import.meta.env.VITE_WS_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function BrowseRoomsPage() {
  const navigate = useNavigate();
  const { playerName, joinRoom, spectateRoom, connectionStatus } = useGameStore();
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<{
    state?: RoomState;
    hasTimeControl?: boolean;
  }>({});
  const [previewRoom, setPreviewRoom] = useState<RoomListing | null>(null);

  useEffect(() => {
    fetchRooms();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchRooms, 3000);
    
    return () => clearInterval(interval);
  }, [filters]);

  // Listen for socket room list updates
  useEffect(() => {
    socketService.setCallbacks({
      onRoomListUpdated: () => {
        fetchRooms();
      }
    });
    
    return () => {
      socketService.setCallbacks({ onRoomListUpdated: undefined });
    };
  }, []);

  const fetchRooms = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.state) params.append('state', filters.state);
      if (filters.hasTimeControl !== undefined) {
        params.append('hasTimeControl', filters.hasTimeControl.toString());
      }

      const response = await fetch(`${SERVER_URL}/api/rooms/listings?${params}`);
      const data = await response.json();
      setRooms(data.listings || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setIsLoading(false);
    }
  };

  const formatTimeControl = (tc: { initial: number; increment: number } | null): string => {
    if (!tc) return 'No Timer';
    const minutes = Math.floor(tc.initial / 60);
    return `${minutes}+${tc.increment}`;
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleJoin = async (room: RoomListing) => {
    if (!playerName) {
      navigate(`/?room=${room.roomId}`);
      return;
    }
    const success = await joinRoom(room.roomId);
    if (success) {
      navigate(`/game/${room.roomId}`);
    }
  };

  const handleSpectate = async (room: RoomListing) => {
    const success = await spectateRoom(room.roomId);
    if (success) {
      navigate(`/game/${room.roomId}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative z-10 p-6 border-b border-midnight-700">
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
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Browse Rooms</h1>
              <p className="text-midnight-400 text-sm">Find and join public games</p>
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

      {/* Filters */}
      <div className="relative z-10 p-6 bg-midnight-900 border-b border-midnight-700">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-midnight-300 mb-2">Status</label>
              <select
                value={filters.state || ''}
                onChange={(e) => setFilters({ ...filters, state: e.target.value as RoomState || undefined })}
                className="input"
              >
                <option value="">All</option>
                <option value="waiting_for_player">Waiting</option>
                <option value="in_progress">In Progress</option>
                <option value="finished">Finished</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-midnight-300 mb-2">Time Control</label>
              <select
                value={filters.hasTimeControl === undefined ? '' : filters.hasTimeControl.toString()}
                onChange={(e) => setFilters({ 
                  ...filters, 
                  hasTimeControl: e.target.value === '' ? undefined : e.target.value === 'true' 
                })}
                className="input"
              >
                <option value="">All</option>
                <option value="true">With Timer</option>
                <option value="false">No Timer</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({})}
                className="btn btn-secondary"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Room List */}
      <main className="relative z-10 flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-midnight-300">Loading rooms...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🏠</div>
              <h2 className="text-2xl font-bold text-white mb-2">No rooms found</h2>
              <p className="text-midnight-300 mb-6">Be the first to create a public room!</p>
              <button onClick={() => navigate('/')} className="btn btn-primary">
                Create Room
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <motion.div
                  key={room.roomId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-4 hover:border-accent/50 transition-colors cursor-pointer"
                  onClick={() => setPreviewRoom(room)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-white text-lg mb-1">
                        {room.roomName || `Room ${room.roomId.slice(0, 8)}`}
                      </h3>
                      <p className="text-sm text-midnight-400">Host: {room.hostName}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      room.state === 'waiting_for_player' ? 'bg-yellow-500/20 text-yellow-400' :
                      room.state === 'in_progress' ? 'bg-green-500/20 text-green-400' :
                      'bg-midnight-600 text-midnight-300'
                    }`}>
                      {room.state === 'waiting_for_player' ? 'Waiting' :
                       room.state === 'in_progress' ? 'Playing' : 'Finished'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-midnight-300 mb-3">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {room.playerCount}/2
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {room.spectatorCount}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatTimeControl(room.timeControl)}
                    </div>
                  </div>

                  <div className="text-xs text-midnight-400">
                    {formatTimeAgo(room.lastActivity)}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Room Preview Modal */}
      {previewRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold text-white">
                {previewRoom.roomName || `Room ${previewRoom.roomId.slice(0, 8)}`}
              </h3>
              <button
                onClick={() => setPreviewRoom(null)}
                className="p-2 rounded-lg bg-midnight-700 hover:bg-midnight-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Host</span>
                <span className="text-white font-medium">{previewRoom.hostName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Status</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  previewRoom.state === 'waiting_for_player' ? 'bg-yellow-500/20 text-yellow-400' :
                  previewRoom.state === 'in_progress' ? 'bg-green-500/20 text-green-400' :
                  'bg-midnight-600 text-midnight-300'
                }`}>
                  {previewRoom.state === 'waiting_for_player' ? 'Waiting for Player' :
                   previewRoom.state === 'in_progress' ? 'Game in Progress' : 'Finished'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Players</span>
                <span className="text-white">{previewRoom.playerCount}/2</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Spectators</span>
                <span className="text-white">{previewRoom.spectatorCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Time Control</span>
                <span className="text-white">{formatTimeControl(previewRoom.timeControl)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-midnight-300">Room Code</span>
                <span className="text-accent font-mono font-bold">{previewRoom.roomId}</span>
              </div>
            </div>

            <div className="flex gap-3">
              {previewRoom.state === 'waiting_for_player' && (
                <button
                  onClick={() => handleJoin(previewRoom)}
                  disabled={!playerName}
                  className="btn btn-primary flex-1"
                >
                  Join as Player
                </button>
              )}
              <button
                onClick={() => handleSpectate(previewRoom)}
                className="btn btn-secondary flex-1"
              >
                Spectate
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
