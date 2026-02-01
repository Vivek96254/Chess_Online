import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/AuthService.js';
import { User } from '../services/UserService.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      tokenPayload?: JWTPayload;
    }
  }
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(authService: AuthService) {
  /**
   * Require valid JWT token
   */
  const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const token = authHeader.substring(7);
      const payload = authService.verifyAccessToken(token);

      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      // Get full user data
      const user = await authService.getUserFromToken(token);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Attach to request
      req.user = user;
      req.userId = payload.userId;
      req.tokenPayload = payload;

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token
   */
  const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);
      const payload = authService.verifyAccessToken(token);

      if (payload) {
        const user = await authService.getUserFromToken(token);
        if (user) {
          req.user = user;
          req.userId = payload.userId;
          req.tokenPayload = payload;
        }
      }

      next();
    } catch {
      // Don't fail on optional auth errors
      next();
    }
  };

  return { requireAuth, optionalAuth };
}

/**
 * Extract token from request
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check cookies
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}
