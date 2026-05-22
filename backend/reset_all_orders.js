// File: reset_all_orders.js
import pool from './src/config/db.js';

async function resetSystem() {
  try {
    console.log('=== ĐANG KHỞI CHẠY KHÔI PHỤC HỆ THỐNG ===');
    
    // 1. Tìm các đơn hàng đang Serving hoặc Waiting
    const activeOrders = await pool.query(
      `SELECT id, queue_number, status FROM orders WHERE status IN ('Serving', 'Waiting')`
    );
    
    console.log(`Tìm thấy ${activeOrders.rows.length} đơn hàng đang hoạt động/chờ.`);
    
    if (activeOrders.rows.length > 0) {
      for (const order of activeOrders.rows) {
        console.log(`Đang xử lý hoàn tất đơn hàng ID: ${order.id} (Số thứ tự: ${order.queue_number})`);
        
        // Cập nhật trạng thái đơn hàng thành Done
        await pool.query(
          `UPDATE orders SET status = 'Done' WHERE id = $1`,
          [order.id]
        );
      }
      console.log('✓ Đã cập nhật trạng thái toàn bộ đơn hàng sang "Done".');
    }

    // 2. Reset trạng thái máy bán nước về 'Ready'
    await pool.query(
      `UPDATE Machine_Status SET machine_state = 'Ready', current_queue = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
    );
    console.log('✓ Đã reset trạng thái máy về "Ready".');

    console.log('=== KHÔI PHỤC HỆ THỐNG THÀNH CÔNG! ===');
  } catch (err) {
    console.error('Lỗi trong quá trình khôi phục:', err);
  } finally {
    pool.end();
    process.exit(0);
  }
}

resetSystem();
