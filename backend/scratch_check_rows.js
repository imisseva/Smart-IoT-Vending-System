import pool from './src/config/db.js';

async function run() {
  try {
    const res = await pool.query("SELECT * FROM admin");
    console.log("=== admin ROWS ===");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
