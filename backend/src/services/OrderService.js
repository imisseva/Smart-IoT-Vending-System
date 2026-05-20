import pool from '../config/db.js';
import { getIo } from '../config/socket.js';
import * as OrderModel from '../models/OrderModel.js';

const MAX_RETRIES = 3;

// Tạo order mới với số thứ tự atomic (chống race condition)
export const createOrder = async ({ username, drink_name, size }) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const client = await pool.connect();
        try {
            // Transaction SERIALIZABLE để COUNT + INSERT là atomic
            await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

            const count = await OrderModel.countTodayOrders(client);
            const queue_number = (count + 1).toString().padStart(3, '0');

            const newOrder = await OrderModel.insertOrder(client, {
                queue_number, username, drink_name, size
            });

            await client.query('COMMIT');

            // Báo cho Web App biết có người mới vào hàng chờ
            getIo().emit('queue_updated');

            return newOrder;
        } catch (error) {
            await client.query('ROLLBACK');

            // Lỗi 40001 = serialization_failure → retry
            if (error.code === '40001' && attempt < MAX_RETRIES) {
                continue;
            }
            throw error;
        } finally {
            client.release();
        }
    }
};

// Lấy danh sách hàng chờ
export const getQueue = async () => {
    return await OrderModel.findActiveOrders();
};

// Xử lý thanh toán
export const payOrder = async (id) => {
    await OrderModel.updatePaymentStatus(id, 'Paid');
    const order = await OrderModel.findOrderById(id);

    // Gửi tín hiệu thanh toán thành công qua Socket
    getIo().emit('payment_success', order);
    getIo().emit('queue_updated');

    return order;
};
