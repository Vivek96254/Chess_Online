import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SERVER_URL = (import.meta.env.VITE_WS_URL || 'http://localhost:3001').replace(/\/$/, '');

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  stats?: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDrawn: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthState {
  // State
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  register: (username: string, password: string, email?: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  verifySession: () => Promise<boolean>;
  updateProfile: (updates: { displayName?: string; avatarUrl?: string }) => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Register new user
      register: async (username: string, password: string, email?: string): Promise<boolean> => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${SERVER_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email })
          });

          const data = await response.json();

          if (!response.ok) {
            set({ isLoading: false, error: data.error || 'Registration failed' });
            return false;
          }

          set({
            user: data.user,
            tokens: data.tokens,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          return true;
        } catch (error) {
          set({ isLoading: false, error: 'Network error. Please try again.' });
          return false;
        }
      },

      // Login with credentials
      login: async (username: string, password: string): Promise<boolean> => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${SERVER_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const data = await response.json();

          if (!response.ok) {
            set({ isLoading: false, error: data.error || 'Login failed' });
            return false;
          }

          set({
            user: data.user,
            tokens: data.tokens,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          return true;
        } catch (error) {
          set({ isLoading: false, error: 'Network error. Please try again.' });
          return false;
        }
      },

      // Logout
      logout: async (): Promise<void> => {
        const { tokens } = get();

        try {
          if (tokens?.refreshToken) {
            await fetch(`${SERVER_URL}/api/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: tokens.refreshToken })
            });
          }
        } catch {
          // Ignore errors during logout
        }

        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          error: null
        });
      },

      // Refresh tokens
      refreshTokens: async (): Promise<boolean> => {
        const { tokens } = get();

        if (!tokens?.refreshToken) {
          set({ isAuthenticated: false, user: null, tokens: null });
          return false;
        }

        try {
          const response = await fetch(`${SERVER_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refreshToken })
          });

          const data = await response.json();

          if (!response.ok) {
            set({ isAuthenticated: false, user: null, tokens: null });
            return false;
          }

          set({
            user: data.user,
            tokens: data.tokens,
            isAuthenticated: true
          });

          return true;
        } catch {
          set({ isAuthenticated: false, user: null, tokens: null });
          return false;
        }
      },

      // Verify current session
      verifySession: async (): Promise<boolean> => {
        const { tokens } = get();

        if (!tokens?.accessToken) {
          return false;
        }

        set({ isLoading: true });

        try {
          const response = await fetch(`${SERVER_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${tokens.accessToken}`
            }
          });

          if (!response.ok) {
            // Try to refresh tokens
            const refreshed = await get().refreshTokens();
            set({ isLoading: false });
            return refreshed;
          }

          const data = await response.json();

          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false
          });

          return true;
        } catch {
          set({ isLoading: false });
          return false;
        }
      },

      // Update user profile
      updateProfile: async (updates: { displayName?: string; avatarUrl?: string }): Promise<boolean> => {
        const { tokens } = get();

        if (!tokens?.accessToken) {
          set({ error: 'Not authenticated' });
          return false;
        }

        try {
          const response = await fetch(`${SERVER_URL}/api/auth/profile`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tokens.accessToken}`
            },
            body: JSON.stringify(updates)
          });

          const data = await response.json();

          if (!response.ok) {
            set({ error: data.error || 'Failed to update profile' });
            return false;
          }

          set(state => ({
            user: state.user ? { ...state.user, ...data.user } : data.user,
            error: null
          }));

          return true;
        } catch {
          set({ error: 'Network error. Please try again.' });
          return false;
        }
      },

      // Clear error
      clearError: () => set({ error: null })
    }),
    {
      name: 'chess-auth-storage',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Helper function to get auth header
export function getAuthHeader(): { Authorization: string } | Record<string, never> {
  const tokens = useAuthStore.getState().tokens;
  if (tokens?.accessToken) {
    return { Authorization: `Bearer ${tokens.accessToken}` };
  }
  return {};
}

// Auto-refresh token before expiry
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function setupAutoRefresh(): void {
  const checkAndRefresh = async () => {
    const state = useAuthStore.getState();
    if (state.tokens && state.isAuthenticated) {
      // Refresh 5 minutes before expiry
      const expiresIn = state.tokens.expiresIn * 1000;
      const refreshIn = expiresIn - 5 * 60 * 1000;
      
      if (refreshIn > 0) {
        refreshTimer = setTimeout(async () => {
          await state.refreshTokens();
          setupAutoRefresh(); // Setup next refresh
        }, refreshIn);
      } else {
        // Token about to expire, refresh now
        await state.refreshTokens();
        setupAutoRefresh();
      }
    }
  };

  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  checkAndRefresh();
}

export function clearAutoRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
