import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

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

async function migrate() {
  try {
    console.log('Running migration...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT;
      ALTER TABLE users ALTER COLUMN banner_url TYPE TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);
    `);
    console.log('Migration successful');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

migrate();
