import { Pool } from 'pg';

const dbUrl = "postgresql://neondb_owner:npg_htHL3N0DKzTA@ep-ancient-forest-ai8bpw82-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  try {
    await pool.query(`DROP TABLE IF EXISTS user_list;`);
    await pool.query(`
      CREATE TABLE user_list (
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
    console.log('user_list table recreated successfully');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await pool.end();
  }
}

initDb();
