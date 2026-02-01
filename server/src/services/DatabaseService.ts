import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DatabaseService - PostgreSQL connection pooling and query execution
 */
export class DatabaseService {
  private pool: pg.Pool;
  private isConnected: boolean = false;

  constructor(connectionString?: string) {
    const dbUrl = connectionString || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      console.warn('⚠️ DATABASE_URL not provided, database features will be disabled');
      // Create a dummy pool that will fail gracefully
      this.pool = new Pool({ connectionString: 'postgresql://localhost:5432/dummy' });
      return;
    }

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Timeout after 10 seconds if can't connect
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      console.error('🔴 Unexpected database pool error:', err);
    });

    this.pool.on('connect', () => {
      if (!this.isConnected) {
        console.log('🟢 Database pool connected');
        this.isConnected = true;
      }
    });
  }

  /**
   * Test database connection
   */
  async connect(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      console.log('✅ Database connection verified');
      return true;
    } catch (error) {
      console.error('🔴 Database connection failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check if database is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Execute a query
   */
  async query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (duration > 100) {
        console.log(`⚠️ Slow query (${duration}ms):`, text.substring(0, 100));
      }
      return result;
    } catch (error) {
      console.error('🔴 Database query error:', error);
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...');

    // Create migrations tracking table
    await this.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of executed migrations
    const result = await this.query<{ name: string }>('SELECT name FROM migrations');
    const executedMigrations = new Set(result.rows.map((r: { name: string }) => r.name));

    // Get migration files
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('📁 No migrations directory found');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        console.log(`⏭️ Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`📝 Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      try {
        await this.transaction(async (client) => {
          await client.query(sql);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        });
        console.log(`✅ Migration ${file} completed`);
      } catch (error) {
        console.error(`🔴 Migration ${file} failed:`, error);
        throw error;
      }
    }

    console.log('✅ All migrations completed');
  }

  /**
   * Seed the database with initial data (for development)
   */
  async seed(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Seeding is disabled in production');
      return;
    }

    console.log('🌱 Seeding database...');
    // Add seed data here if needed
    console.log('✅ Database seeded');
  }

  /**
   * Close all connections
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    console.log('🔌 Database pool disconnected');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.query('SELECT 1');
      return {
        status: 'healthy',
        latency: Date.now() - start
      };
    } catch {
      return {
        status: 'unhealthy',
        latency: Date.now() - start
      };
    }
  }
}
