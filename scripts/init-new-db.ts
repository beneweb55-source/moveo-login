import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_htHL3N0DKzTA@ep-ancient-forest-ai8bpw82-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  try {
    console.log('Initializing new database...');

    // 1. Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        google_id VARCHAR(255) UNIQUE,
        avatar_url TEXT,
        banner_url TEXT,
        bio TEXT,
        role VARCHAR(50) DEFAULT 'Membre',
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_token_expires TIMESTAMP WITH TIME ZONE,
        twitter_url VARCHAR(255),
        instagram_url VARCHAR(255),
        website_url VARCHAR(255),
        is_banned BOOLEAN DEFAULT FALSE,
        ban_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created users table');

    // 2. Create roles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        color VARCHAR(50) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created roles table');

    // Add role_id to users
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
    `);

    // 3. Create user_list table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_list (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        list_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        poster_path VARCHAR(255),
        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, media_type, media_id, list_type)
      );
    `);
    console.log('Created user_list table');

    // 4. Create watch_history table
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
    `);
    console.log('Created watch_history table');

    // 5. Create reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reported_item_type VARCHAR(50) NOT NULL,
        reported_item_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created reports table');

    // 6. Create content_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created content_settings table');

    // 7. Create online_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS online_users (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
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
    console.log('Created online_users table');

    // 8. Create catalogue table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogue (
        id SERIAL PRIMARY KEY,
        tmdb_id INT NOT NULL UNIQUE,
        title VARCHAR(300),
        original_title VARCHAR(300),
        year CHAR(4),
        overview TEXT,
        poster_path VARCHAR(200),
        backdrop_path VARCHAR(200),
        genres VARCHAR(300),
        vote_average FLOAT,
        runtime INT,
        original_language CHAR(5),
        vidoza_url VARCHAR(512),
        voe_url VARCHAR(512),
        lang VARCHAR(20),
        date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created catalogue table');

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
      console.log('Created default Admin role');
    }

    // Create default User role if it doesn't exist
    const userRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'User'`);
    if (userRoleRes.rows.length === 0) {
      await pool.query(`
        INSERT INTO roles (name, color, permissions, priority)
        VALUES ('User', '#808080', '[]', 0)
      `);
      console.log('Created default User role');
    }

    console.log('Database initialization successful!');
  } catch (error) {
    console.error('Database initialization failed:', error);
  } finally {
    await pool.end();
  }
}

initDb();
