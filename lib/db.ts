import { Pool, PoolConfig } from 'pg';

// Global types for TypeScript
declare global {
  var _dbPool: Pool | undefined;
  var _scraperPool: Pool | undefined;
}

const dbConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

const scraperConfig: PoolConfig = {
  connectionString: process.env.SCRAPER_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = globalThis._dbPool || new Pool(dbConfig);
if (process.env.NODE_ENV !== 'production') {
  globalThis._dbPool = pool;
}

export const scraperPool = globalThis._scraperPool || new Pool(scraperConfig);
if (process.env.NODE_ENV !== 'production') {
  globalThis._scraperPool = scraperPool;
}

export default pool;
