import pool from './src/config/db.js';

async function run() {
  try {
    const res = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM orders 
      GROUP BY status
    `);
    console.log("=== ALL ORDER STATUS COUNTS ===");
    console.table(res.rows);

    const activeOrders = await pool.query(`
      SELECT id, machine_id, queue_number, status, created_at 
      FROM orders 
      WHERE status NOT IN ('Done', 'Failed') 
      ORDER BY id ASC
    `);
    console.log("=== ACTIVE OR STUCK ORDERS (NOT Done OR Failed) ===");
    console.table(activeOrders.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
