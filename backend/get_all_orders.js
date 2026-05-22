import pool from './src/config/db.js';

async function run() {
  try {
    const res = await pool.query(`
      SELECT id, machine_id, queue_number, size, status, created_at 
      FROM orders 
      ORDER BY id DESC 
      LIMIT 30
    `);
    console.log("=== LATEST 30 ORDERS ===");
    console.table(res.rows);

    const machineStatus = await pool.query(`
      SELECT * FROM Machine_Status
    `);
    console.log("=== MACHINE STATUS ===");
    console.table(machineStatus.rows);

    const activeOrders = await pool.query(`
      SELECT * FROM orders WHERE status NOT IN ('Done', 'Failed')
    `);
    console.log("=== ACTIVE/PENDING ORDERS ===");
    console.table(activeOrders.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
