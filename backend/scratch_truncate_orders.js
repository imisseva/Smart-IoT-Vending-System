import pool from './src/config/db.js';

async function truncateAllOrders() {
  try {
    console.log('=== ĐANG XÓA TRẮNG HOÀN TOÀN DỮ LIỆU ĐƠN HÀNG ===');
    
    // 1. Xóa sạch và reset ID tự tăng của bảng Orders
    await pool.query('TRUNCATE TABLE Orders RESTART IDENTITY CASCADE');
    console.log('✓ Đã xóa trắng bảng Orders và đặt lại chỉ mục tự tăng (ID) về 1.');

    // 2. Reset trạng thái máy bán nước về mặc định ban đầu
    await pool.query(
      `INSERT INTO Machine_Status (id, water_level, machine_state, current_queue, updated_at) 
       VALUES (1, 0, 'Ready', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE 
       SET machine_state = 'Ready', current_queue = NULL, water_level = 0, updated_at = CURRENT_TIMESTAMP`
    );
    console.log('✓ Đã reset trạng thái máy bán nước về "Ready" với mực nước 0cm.');

    console.log('=== XÓA SẠCH VÀ RESET HỆ THỐNG THÀNH CÔNG! ===');
  } catch (err) {
    console.error('Lỗi khi xóa dữ liệu:', err);
  } finally {
    pool.end();
    process.exit(0);
  }
}

truncateAllOrders();
