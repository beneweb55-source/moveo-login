import pool from './lib/db';

async function main() {
  try {
    const res = await pool.query('SELECT tmdb_id, title, vidoza_url, voe_url FROM catalogue LIMIT 10');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

main();
