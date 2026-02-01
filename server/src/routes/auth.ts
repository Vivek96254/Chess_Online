import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/AuthService.js';
import { UserService } from '../services/UserService.js';
import { createAuthMiddleware } from '../middleware/auth.js';

// Validation schemas
const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be at most 100 characters'),
  email: z.string().email('Invalid email').optional()
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

/**
 * Create authentication routes
 */
export function createAuthRoutes(authService: AuthService, userService: UserService): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(authService);

  /**
   * POST /auth/register
   * Register a new user
   */
  router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: validation.error.errors 
        });
        return;
      }

      const { username, password, email } = validation.data;
      const result = await authService.register(username, password, email);

      res.status(201).json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          displayName: result.user.displayName,
          email: result.user.email
        },
        tokens: result.tokens
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  });

  /**
   * POST /auth/login
   * Login with username and password
   */
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: validation.error.errors 
        });
        return;
      }

      const { username, password } = validation.data;
      const deviceInfo = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(username, password, deviceInfo, ipAddress);

      if (!result) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          displayName: result.user.displayName,
          email: result.user.email
        },
        tokens: result.tokens
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = refreshSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: validation.error.errors 
        });
        return;
      }

      const { refreshToken } = validation.data;
      const result = await authService.refreshTokens(refreshToken);

      if (!result) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
      }

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          displayName: result.user.displayName,
          email: result.user.email
        },
        tokens: result.tokens
      });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  /**
   * POST /auth/logout
   * Logout and revoke refresh token
   */
  router.post('/logout', async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        await authService.revokeToken(refreshToken);
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  /**
   * POST /auth/logout-all
   * Logout from all devices
   */
  router.post('/logout-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      await authService.revokeAllTokens(req.userId!);
      res.json({ success: true, message: 'Logged out from all devices' });
    } catch (error) {
      console.error('Logout all error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  /**
   * GET /auth/me
   * Get current user info
   */
  router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await userService.getUserStats(req.userId!);
      
      res.json({
        success: true,
        user: {
          id: req.user!.id,
          username: req.user!.username,
          displayName: req.user!.displayName,
          email: req.user!.email,
          avatarUrl: req.user!.avatarUrl,
          isVerified: req.user!.isVerified,
          createdAt: req.user!.createdAt,
          stats
        }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  /**
   * GET /auth/verify
   * Verify if token is valid
   */
  router.get('/verify', requireAuth, (_req: Request, res: Response): void => {
    res.json({ success: true, message: 'Token is valid' });
  });

  /**
   * PATCH /auth/profile
   * Update user profile
   */
  router.patch('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { displayName, avatarUrl } = req.body;
      
      const updatedUser = await userService.updateProfile(req.userId!, {
        displayName,
        avatarUrl
      });

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  /**
   * POST /auth/change-password
   * Change user password
   */
  router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current and new passwords are required' });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters' });
        return;
      }

      const success = await userService.changePassword(req.userId!, currentPassword, newPassword);

      if (!success) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      // Revoke all tokens to force re-login
      await authService.revokeAllTokens(req.userId!);

      res.json({ success: true, message: 'Password changed successfully. Please login again.' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  return router;
}
