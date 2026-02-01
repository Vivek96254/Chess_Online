import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { DatabaseService } from './DatabaseService.js';
import { UserService, User } from './UserService.js';

export interface JWTPayload {
  userId: string;
  username: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '30d';
const ACCESS_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * AuthService - JWT token generation and validation
 */
export class AuthService {
  private jwtSecret: string;

  constructor(
    private db: DatabaseService,
    private userService: UserService
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    
    if (process.env.NODE_ENV === 'production' && this.jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
      console.warn('⚠️ WARNING: Using default JWT secret in production! Set JWT_SECRET environment variable.');
    }
  }

  /**
   * Register a new user
   */
  async register(username: string, password: string, email?: string): Promise<AuthResult> {
    const user = await this.userService.createUser({
      username,
      password,
      email,
      displayName: username
    });

    const tokens = await this.generateTokens(user);
    return { user, tokens };
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string, deviceInfo?: string, ipAddress?: string): Promise<AuthResult | null> {
    const user = await this.userService.validateCredentials(username, password);
    if (!user) return null;

    const tokens = await this.generateTokens(user, deviceInfo, ipAddress);
    return { user, tokens };
  }

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user: User, deviceInfo?: string, ipAddress?: string): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Store refresh token hash in database
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, deviceInfo || null, ipAddress || null, expiresAt]
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS
    };
  }

  /**
   * Generate access token
   */
  private generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      type: 'access'
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY
    });
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      type: 'refresh'
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: REFRESH_TOKEN_EXPIRY
    });
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;
      if (payload.type !== 'access') return null;
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Verify refresh token and generate new tokens
   */
  async refreshTokens(refreshToken: string): Promise<AuthResult | null> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtSecret) as JWTPayload;
      if (payload.type !== 'refresh') return null;

      // Check if token exists in database and is not revoked
      const tokenHash = this.hashToken(refreshToken);
      const result = await this.db.query<{ id: string; revoked_at: Date | null }>(
        `SELECT id, revoked_at FROM refresh_tokens 
         WHERE token_hash = $1 AND user_id = $2 AND expires_at > CURRENT_TIMESTAMP`,
        [tokenHash, payload.userId]
      );

      if (result.rows.length === 0 || result.rows[0].revoked_at) {
        return null;
      }

      // Get user
      const user = await this.userService.findById(payload.userId);
      if (!user || !user.isActive) return null;

      // Revoke old refresh token
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
        [tokenHash]
      );

      // Generate new tokens
      const tokens = await this.generateTokens(user);
      return { user, tokens };
    } catch {
      return null;
    }
  }

  /**
   * Revoke a refresh token (logout)
   */
  async revokeToken(refreshToken: string): Promise<boolean> {
    try {
      const tokenHash = this.hashToken(refreshToken);
      const result = await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
        [tokenHash]
      );
      return (result.rowCount ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Revoke all tokens for a user (logout everywhere)
   */
  async revokeAllTokens(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  /**
   * Get user from access token
   */
  async getUserFromToken(token: string): Promise<User | null> {
    const payload = this.verifyAccessToken(token);
    if (!payload) return null;

    return this.userService.findById(payload.userId);
  }

  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL'
    );
    return result.rowCount ?? 0;
  }
}
