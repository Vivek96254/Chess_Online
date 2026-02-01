import bcrypt from 'bcrypt';
import { DatabaseService } from './DatabaseService.js';

export interface User {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

const SALT_ROUNDS = 12;

/**
 * UserService - User management and password operations
 */
export class UserService {
  constructor(private db: DatabaseService) {}

  /**
   * Create a new user
   */
  async createUser(input: CreateUserInput): Promise<User> {
    // Validate input
    if (!input.username || input.username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(input.username)) {
      throw new Error('Username can only contain letters, numbers, and underscores');
    }

    // Check if username exists
    const existingUser = await this.findByUsername(input.username);
    if (existingUser) {
      throw new Error('Username already taken');
    }

    // Check if email exists
    if (input.email) {
      const existingEmail = await this.findByEmail(input.email);
      if (existingEmail) {
        throw new Error('Email already registered');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Insert user
    const result = await this.db.query<UserWithPassword>(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at`,
      [input.username, input.email || null, passwordHash, input.displayName || input.username]
    );

    return this.mapUser(result.rows[0]);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, username, email, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapUser(result.rows[0]);
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, username, email, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    if (result.rows.length === 0) return null;
    return this.mapUser(result.rows[0]);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, username, email, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rows.length === 0) return null;
    return this.mapUser(result.rows[0]);
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(username: string, password: string): Promise<User | null> {
    const result = await this.db.query<any>(
      `SELECT id, username, email, password_hash, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at
       FROM users WHERE LOWER(username) = LOWER($1) AND is_active = true`,
      [username]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) return null;

    // Update last login
    await this.db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    return this.mapUser(user);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: {
    displayName?: string;
    avatarUrl?: string;
    email?: string;
  }): Promise<User | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex++}`);
      values.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex++}`);
      values.push(updates.avatarUrl);
    }
    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }

    if (setClauses.length === 0) return this.findById(userId);

    values.push(userId);
    const result = await this.db.query(
      `UPDATE users SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, display_name, avatar_url, is_active, is_verified, last_login_at, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) return null;
    return this.mapUser(result.rows[0]);
  }

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    // Get current password hash
    const result = await this.db.query<any>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) return false;

    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) return false;

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, userId]
    );

    return true;
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE users SET is_active = false WHERE id = $1',
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get user stats
   */
  async getUserStats(userId: string): Promise<{
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDrawn: number;
  }> {
    const result = await this.db.query<{
      games_played: string;
      games_won: string;
      games_lost: string;
    }>(
      `SELECT 
        COUNT(*) as games_played,
        COUNT(CASE WHEN (white_player_id = $1 AND winner = 'white') OR (black_player_id = $1 AND winner = 'black') THEN 1 END) as games_won,
        COUNT(CASE WHEN (white_player_id = $1 AND winner = 'black') OR (black_player_id = $1 AND winner = 'white') THEN 1 END) as games_lost
       FROM game_history
       WHERE white_player_id = $1 OR black_player_id = $1`,
      [userId]
    );

    const row = result.rows[0];
    const played = parseInt(row.games_played) || 0;
    const won = parseInt(row.games_won) || 0;
    const lost = parseInt(row.games_lost) || 0;

    return {
      gamesPlayed: played,
      gamesWon: won,
      gamesLost: lost,
      gamesDrawn: played - won - lost
    };
  }

  /**
   * Map database row to User object
   */
  private mapUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isActive: row.is_active,
      isVerified: row.is_verified,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
