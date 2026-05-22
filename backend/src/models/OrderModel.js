import pool from '../config/db.js';

// Đếm số order trong ngày (dùng trong transaction nên nhận client từ bên ngoài)
export const countTodayOrders = async (client) => {
    const result = await client.query(
        'SELECT COUNT(*) FROM orders WHERE CAST(created_at AS DATE) = CURRENT_DATE'
    );
    return parseInt(result.rows[0].count);
};

// Tạo order mới (dùng trong transaction nên nhận client từ bên ngoài)
export const insertOrder = async (client, { queue_number, drink_name, size }) => {
    const machine_id = drink_name && drink_name.toLowerCase().includes('coca') ? 1 : 2;
    const result = await client.query(
        `INSERT INTO orders (queue_number, machine_id, size, status) 
         VALUES ($1, $2, $3, 'Waiting') RETURNING *`,
        [queue_number, machine_id, size]
    );
    
    const order = result.rows[0];
    if (order) {
        order.drink_name = order.machine_id === 1 ? 'Coca-Cola' : 'Pepsi';
        order.username = 'Khách hàng';
        order.payment_status = 'Paid';
    }
    return order;
};

// Lấy danh sách hàng chờ (Waiting + Serving)
export const findActiveOrders = async () => {
    const result = await pool.query(
        `SELECT * FROM orders WHERE status IN ('Waiting', 'Serving') ORDER BY id ASC`
    );
    return result.rows.map(order => ({
        ...order,
        drink_name: order.machine_id === 1 ? 'Coca-Cola' : 'Pepsi',
        username: 'Khách hàng',
        payment_status: 'Paid'
    }));
};

// Cập nhật trạng thái thanh toán (Cột payment_status đã bị xóa nên trở thành hàm no-op)
export const updatePaymentStatus = async (id, status) => {
    return;
};

// Tìm order theo ID
export const findOrderById = async (id) => {
    const result = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    const order = result.rows[0] || null;
    if (order) {
        order.drink_name = order.machine_id === 1 ? 'Coca-Cola' : 'Pepsi';
        order.username = 'Khách hàng';
        order.payment_status = 'Paid';
    }
    return order;
};

// Cập nhật trạng thái order (Waiting → Serving → Done)
export const updateOrderStatus = async (id, status) => {
    await pool.query(
        `UPDATE orders SET status = $1 WHERE id = $2`,
        [status, id]
    );
};
