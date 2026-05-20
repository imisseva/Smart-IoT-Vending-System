import pool from '../config/db.js';

// Đếm số order trong ngày (dùng trong transaction nên nhận client từ bên ngoài)
export const countTodayOrders = async (client) => {
    const result = await client.query(
        'SELECT COUNT(*) FROM Orders WHERE CAST(created_at AS DATE) = CURRENT_DATE'
    );
    return parseInt(result.rows[0].count);
};

// Tạo order mới (dùng trong transaction nên nhận client từ bên ngoài)
export const insertOrder = async (client, { queue_number, username, drink_name, size }) => {
    const result = await client.query(
        `INSERT INTO Orders (queue_number, username, drink_name, size, status, payment_status) 
         VALUES ($1, $2, $3, $4, 'Waiting', 'Unpaid') RETURNING *`,
        [queue_number, username, drink_name, size]
    );
    return result.rows[0];
};

// Lấy danh sách hàng chờ (Waiting + Serving)
export const findActiveOrders = async () => {
    const result = await pool.query(
        `SELECT * FROM Orders WHERE status IN ('Waiting', 'Serving') ORDER BY id ASC`
    );
    return result.rows;
};

// Cập nhật trạng thái thanh toán
export const updatePaymentStatus = async (id, status) => {
    await pool.query(
        `UPDATE Orders SET payment_status = $1 WHERE id = $2`,
        [status, id]
    );
};

// Tìm order theo ID
export const findOrderById = async (id) => {
    const result = await pool.query(`SELECT * FROM Orders WHERE id = $1`, [id]);
    return result.rows[0] || null;
};

// Cập nhật trạng thái order (Waiting → Serving → Done)
export const updateOrderStatus = async (id, status) => {
    await pool.query(
        `UPDATE Orders SET status = $1 WHERE id = $2`,
        [status, id]
    );
};
