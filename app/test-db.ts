import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const userRes = await pool.query("SELECT id, email, role_id FROM users WHERE email = 'tvmystral@gmail.com'");
    console.log("USER:", userRes.rows[0]);
    
    const rolesRes = await pool.query("SELECT id, name, permissions FROM roles");
    console.log("ROLES:", rolesRes.rows);
    
    if (userRes.rows.length > 0) {
      const joinRes = await pool.query(`
        SELECT u.id, u.email, u.role_id, r.id as r_id, r.name, r.permissions
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.email = 'tvmystral@gmail.com'
      `);
      console.log("JOIN:", joinRes.rows[0]);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
