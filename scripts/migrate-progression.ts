import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Running migration: add progression columns & admin infrastructure...');

    // 1. Add progression columns to watch_history
    const progressionColumns = [
      { name: 'title', type: 'VARCHAR(500)' },
      { name: 'poster_path', type: 'VARCHAR(500)' },
      { name: 'current_time', type: 'FLOAT' },
      { name: 'total_duration', type: 'FLOAT' },
      { name: 'season', type: 'INTEGER' },
      { name: 'episode', type: 'INTEGER' },
    ];

    for (const col of progressionColumns) {
      try {
        await pool.query(`ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`  ✅ Added column watch_history.${col.name}`);
      } catch (e: any) {
        if (e.code === '42701') {
          console.log(`  ⏭️  Column watch_history.${col.name} already exists`);
        } else {
          throw e;
        }
      }
    }

    // 2. Create admin_logs table for real system logging
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        admin_name VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(100),
        target_id VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'success',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ Created admin_logs table');

    // 3. Create index on admin_logs for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
    `);
    console.log('  ✅ Created index on admin_logs');

    // 4. Ensure content_settings table exists for maintenance mode etc.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ Ensured content_settings table exists');

    // 5. Insert default maintenance_mode setting if not exists
    await pool.query(`
      INSERT INTO content_settings (setting_key, setting_value)
      VALUES ('maintenance_mode', '{"enabled": false, "message": "Site en maintenance. Nous revenons bientôt."}')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    console.log('  ✅ Ensured maintenance_mode setting exists');

    // 6. Create anonymous_watch_history table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anonymous_watch_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        media_type VARCHAR(50) NOT NULL,
        media_id INTEGER NOT NULL,
        minutes_watched INTEGER DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, media_type, media_id)
      );
    `);
    console.log('  ✅ Ensured anonymous_watch_history table exists');

    // 7. Create index on watch_history for efficient progress queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_watch_history_user_updated 
      ON watch_history(user_id, last_updated DESC);
    `);
    console.log('  ✅ Created index on watch_history');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
