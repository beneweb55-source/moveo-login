import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_htHL3N0DKzTA@ep-ancient-forest-ai8bpw82-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watch_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        minutes_watched INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, media_type, media_id)
      );
      
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT;
      ALTER TABLE users ALTER COLUMN banner_url TYPE TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);
      
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        color VARCHAR(50) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reported_item_type VARCHAR(50) NOT NULL,
        reported_item_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS content_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS online_users (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ip_address VARCHAR(255),
        country VARCHAR(100),
        city VARCHAR(100),
        pages_visited JSONB DEFAULT '[]',
        last_ping TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        current_movie_id INTEGER,
        current_movie_title VARCHAR(255)
      );
    `);
    
    // Create default Admin role if it doesn't exist
    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'Admin'`);
    if (adminRoleRes.rows.length === 0) {
      const allPermissions = JSON.stringify([
        'view_users', 'edit_users', 'ban_users', 'edit_roles',
        'edit_hero', 'pin_sections',
        'view_reports', 'handle_reports',
        'view_stats', 'manage_watch_time', 'manage_roles', 'access_admin_panel'
      ]);
      await pool.query(`
        INSERT INTO roles (name, color, permissions, priority)
        VALUES ('Admin', '#E50914', $1, 100)
      `, [allPermissions]);
    }

    // Create default User role if it doesn't exist
    const userRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    if (userRoleRes.rows.length === 0) {
      await pool.query(`
        INSERT INTO roles (name, color, permissions, priority)
        VALUES ('User', '#808080', '[]', 0)
      `);
    }

    console.log('Migration successful');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
