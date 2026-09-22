import { Pool } from 'pg';

// The connection string used to fall back to a hardcoded production Neon DSN,
// owner credential included. That fallback was not a convenience: it meant a
// run with no DATABASE_URL in the environment did not fail, it applied itself
// to the live database — and this repository is public. It fails closed now.
// NOTE: the credential is still present in this repository HISTORY. Removing
// it here does not un-publish it; the password must be rotated.
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set. Refusing to connect to an unknown database.');
  process.exit(1);
}

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
