import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogue (
        tmdb_id           VARCHAR(20),
        season            INTEGER DEFAULT 0,
        episode           INTEGER DEFAULT 0,
        imdb_id           VARCHAR(20),
        title             VARCHAR(500),
        original_title    VARCHAR(500),
        year              CHAR(4),
        overview          TEXT,
        poster_path       VARCHAR(200),
        backdrop_path     VARCHAR(200),
        genres            VARCHAR(300),
        vote_average      FLOAT,
        runtime           INT,
        original_language CHAR(5),
        vidoza_url        VARCHAR(512),
        voe_url           VARCHAR(512),
        lang              VARCHAR(20),
        date_ajout        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tmdb_id, season, episode)
      );

      CREATE TABLE IF NOT EXISTS film_requests (
        id SERIAL PRIMARY KEY,
        tmdb_id VARCHAR(20) UNIQUE NOT NULL,
        title VARCHAR(500),
        year CHAR(4),
        requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS pinned_sections (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        endpoint TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE pinned_sections ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT '';
      ALTER TABLE pinned_sections ADD COLUMN IF NOT EXISTS endpoint VARCHAR(255) NOT NULL DEFAULT '/';

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

      -- Remove duplicates before adding constraint
      DELETE FROM online_users a USING online_users b
      WHERE a.created_at < b.created_at AND a.user_id = b.user_id AND a.user_id IS NOT NULL;

      -- Add unique constraint on user_id if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_id') THEN
          ALTER TABLE online_users ADD CONSTRAINT unique_user_id UNIQUE (user_id);
        END IF;
      END $$;
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

    // Assign 'User' role to existing users without a role
    await pool.query(`
      UPDATE users 
      SET role_id = (SELECT id FROM roles WHERE name = 'User' LIMIT 1) 
      WHERE role_id IS NULL
    `);

    return NextResponse.json({ message: 'Migration successful' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
