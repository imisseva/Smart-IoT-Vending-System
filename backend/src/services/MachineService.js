import pool from '../config/db.js';
import { getIo } from '../config/socket.js';
import * as OrderModel from '../models/OrderModel.js';
import * as MachineModel from '../models/MachineModel.js';

let currentCommand = "STOP";
let currentServingOrderId = null;
let currentServingQueueNumber = null;
let safetyTimeoutTimer = null;

// Khôi phục trạng thái đang rót từ DB khi khởi động lại server
const initServingState = async () => {
    try {
        const activeOrders = await OrderModel.findActiveOrders();
        const servingOrder = activeOrders.find(o => o.status === 'Serving');
        if (servingOrder) {
            currentServingOrderId = servingOrder.id;
            currentServingQueueNumber = servingOrder.queue_number;
            console.log(`[Init] Đã khôi phục trạng thái rót nước từ DB: ID ${currentServingOrderId} | Số thứ tự ${currentServingQueueNumber}`);
        }
    } catch (err) {
        console.error('[Init Error] Không thể khôi phục trạng thái rót nước:', err);
    }
};

// Đợi 1 giây để các module cấu hình Pool và Socket.IO sẵn sàng rồi mới khôi phục
setTimeout(initServingState, 1000);

// Bắt đầu rót nước
export const dispenseDrink = async (orderId) => {
    const order = await OrderModel.findOrderById(orderId);
    if (!order) {
        throw new Error('Không tìm thấy order');
    }

    const { drink_name, size, queue_number } = order;

    // 1. Cập nhật order sang trạng thái Serving
    await OrderModel.updateOrderStatus(orderId, 'Serving');

    // 2. Cập nhật Machine_Status sang Dispensing
    await MachineModel.setDispensing(queue_number);

    // Ghi nhận thông tin đơn hàng đang rót vào RAM
    currentServingOrderId = orderId;
    currentServingQueueNumber = queue_number;

    // Thiết lập bộ đếm thời gian an toàn 25 giây (Safety Fail-safe Timeout)
    if (safetyTimeoutTimer) {
        clearTimeout(safetyTimeoutTimer);
    }
    safetyTimeoutTimer = setTimeout(async () => {
        console.warn(`[SAFETY TIMEOUT] Đơn hàng ID ${orderId} đang rót vượt quá 25 giây mà chưa nhận được tín hiệu hoàn tất. Tiến hành tự động khôi phục an toàn...`);
        try {
            await completeOrder(orderId);
        } catch (err) {
            console.error('[SAFETY TIMEOUT ERROR] Không thể tự động khôi phục đơn hàng:', err);
        }
    }, 25000);

    // 3. Báo frontend
    getIo().emit('queue_updated');

    // 4. Chuẩn bị lệnh cho ESP8266 kèm theo Size (Ví dụ: POUR_COCA_M)
    currentCommand = drink_name === 'Coca-Cola' ? `POUR_COCA_${size}` : `POUR_PEPSI_${size}`;

    return { command: currentCommand };
};

// Hoàn tất order
export const completeOrder = async (orderId) => {
    // Hủy bộ đếm thời gian an toàn nếu đơn hàng hoàn thành bình thường
    if (safetyTimeoutTimer) {
        clearTimeout(safetyTimeoutTimer);
        safetyTimeoutTimer = null;
    }

    currentCommand = "STOP";
    currentServingOrderId = null;
    currentServingQueueNumber = null;

    // Tự động trừ đi mực nước trong bình chứa ảo tùy theo kích cỡ cốc đã chọn
    try {
        const order = await OrderModel.findOrderById(orderId);
        if (order) {
            let mlToSubtract = 0;
            if (order.size === 'S') mlToSubtract = 330;
            else if (order.size === 'M') mlToSubtract = 500;
            else if (order.size === 'L') mlToSubtract = 700;

            if (mlToSubtract > 0) {
                // Xác định bình chứa tương ứng (id=1: Coca, id=2: Pepsi)
                const tankId = order.drink_name.includes("Coca") ? 1 : 2;
                await MachineModel.subtractWaterLevel(tankId, mlToSubtract);
                console.log(`[Machine Service] Rót xong! Đã tự động trừ ${mlToSubtract}ml khỏi bình chứa ${order.drink_name} (ID: ${tankId}).`);
            }
        }
    } catch (err) {
        console.error('[Machine Service Error] Lỗi khi trừ nước bình chứa:', err);
    }

    // 1. Đánh dấu order đã hoàn thành
    await OrderModel.updateOrderStatus(orderId, 'Done');

    // 2. Reset máy về Ready
    await MachineModel.setReady();

    // 3. Báo frontend
    getIo().emit('queue_updated');
};

// Tiếp nước bình chứa ảo (Nạp thêm nước - dành cho Admin)
export const refillWater = async (id, level) => {
    const parsedId = parseInt(id) || 1;
    await MachineModel.updateWaterLevel(parsedId, level);
    console.log(`[Machine Service] Tiếp nước thành công cho bình ${parsedId}! Mức nước mới: ${level}ml`);
    
    // Phát tín hiệu đồng bộ về Web App
    getIo().emit('queue_updated');
    return { success: true, id: parsedId, water_level: level };
};

// Bắt đầu nhả ly nước
export const dropCup = async (orderId) => {
    const order = await OrderModel.findOrderById(orderId);
    if (!order) {
        throw new Error('Không tìm thấy order');
    }

    // Thiết lập lệnh DROP_CUP cho ESP8266
    currentCommand = "DROP_CUP";
    console.log(`[Drop Cup] Đã tạo lệnh nhả ly cho Order ID: ${orderId}`);
    return { command: currentCommand };
};

// Lấy lệnh hiện tại (ESP8266 polling)
export const getCommand = () => {
    return currentCommand;
};

// Xử lý dữ liệu cảm biến từ ESP8266
export const updateSensor = async (waterLevel, isCupPlaced, dispensingProgress, pourStatus) => {
    // waterLevel ở đây là khoảng cách đo từ cảm biến VL53L0X xuống cốc (được ESP gửi về)
    console.log(`[Sensor ESP8266] Đo khoảng cách cốc ToF: ${waterLevel} cm | Đã đặt ly: ${isCupPlaced} | Tiến trình: ${dispensingProgress}% | Trạng thái: ${pourStatus}`);

    // Lưu giữ thông tin đơn hàng đang hoạt động trước khi bị xóa bởi hàm completeOrder
    const activeOrderId = currentServingOrderId;
    const activeQueueNumber = currentServingQueueNumber;

    // ESP8266 xác nhận đã nhận lệnh (Acknowledge) hoặc đang rót nước -> tự động reset lệnh về STOP
    if (pourStatus === 'ACK' || (dispensingProgress !== undefined && dispensingProgress > 0)) {
        if (currentCommand !== 'STOP') {
            console.log(`[Command] ESP8266 xác nhận đã nhận lệnh '${currentCommand}'. Đã tự động reset lệnh về STOP để bảo vệ an toàn.`);
            currentCommand = 'STOP';
        }
    }

    // Xử lý tự động hoàn thành khi máy báo cáo "DONE"
    if (pourStatus === 'DONE') {
        console.log(`[Sensor] Máy đã rót xong nước! Đang tự động hoàn tất order...`);
        if (currentServingOrderId) {
            await completeOrder(currentServingOrderId);
        } else {
            const activeOrders = await OrderModel.findActiveOrders();
            const servingOrder = activeOrders.find(o => o.status === 'Serving');
            if (servingOrder) {
                await completeOrder(servingOrder.id);
            } else {
                currentCommand = 'STOP';
                currentServingOrderId = null;
                currentServingQueueNumber = null;
                await MachineModel.setReady();
                getIo().emit('queue_updated');
            }
        }
    }

    // Xử lý khẩn cấp khi người dùng rút ly trong lúc rót nước
    if (pourStatus === 'CUP_REMOVED') {
        console.log(`[Sensor - CẢNH BÁO KHẨN CẤP] Ly nước bị rút khỏi khay hứng! Đang tự động ngắt bơm và hoàn tất đơn...`);
        if (currentServingOrderId) {
            await completeOrder(currentServingOrderId);
        } else {
            const activeOrders = await OrderModel.findActiveOrders();
            const servingOrder = activeOrders.find(o => o.status === 'Serving');
            if (servingOrder) {
                await completeOrder(servingOrder.id);
            } else {
                currentCommand = 'STOP';
                currentServingOrderId = null;
                currentServingQueueNumber = null;
                await MachineModel.setReady();
                getIo().emit('queue_updated');
            }
        }
    }

    // Lấy lượng nước ảo được quản lý bằng phần mềm cho cả 2 bình để báo cáo lên frontend
    let statuses = [];
    try {
        statuses = await MachineModel.getAllMachineStatus();
    } catch (err) {
        console.error('[Machine Service Error] Lỗi khi đọc lượng nước ảo từ DB:', err);
    }

    // Báo frontend realtime, gửi kèm cả phần trạng thái tiến trình và ID đơn hàng đang phục vụ để cô lập phiên người dùng
    getIo().emit('sensor_update', { 
        statuses: statuses, 
        is_cup_placed: isCupPlaced,
        dispensing_progress: dispensingProgress !== undefined ? parseInt(dispensingProgress) : undefined,
        order_id: activeOrderId,
        queue_number: activeQueueNumber
    });
};

// Lấy trạng thái máy hiện tại
export const getMachineStatus = async () => {
    return await MachineModel.getMachineStatus();
};

// Lấy tất cả thông tin bình nước (Coca + Pepsi)
export const getAllMachineStatus = async () => {
    return await MachineModel.getAllMachineStatus();
};

// Tự động seed dữ liệu mẫu nếu bảng orders trống hoặc quá ít bản ghi
export const seedOrdersIfEmpty = async () => {
    try {
        const checkRes = await pool.query("SELECT COUNT(*) FROM orders");
        const count = parseInt(checkRes.rows[0].count);
        
        if (count < 15) {
            console.log(`[Analytics Seeder] Phát hiện chỉ có ${count} orders. Tiến hành chèn 45 orders mẫu phân bổ trong 7 ngày qua để vẽ biểu đồ...`);
            
            const drinkIds = [1, 2];
            const sizes = ['S', 'M', 'L'];
            const statuses = ['Done', 'Done', 'Done', 'Done', 'Failed']; // 80% thành công
            
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                for (let i = 0; i < 45; i++) {
                    const daysAgo = Math.floor(Math.random() * 7); // 0 đến 6 ngày trước
                    const randomHour = Math.floor(Math.random() * 15) + 8; // 8h đến 22h
                    const randomMinute = Math.floor(Math.random() * 60);
                    const randomSecond = Math.floor(Math.random() * 60);
                    
                    const createdDate = new Date();
                    createdDate.setDate(createdDate.getDate() - daysAgo);
                    createdDate.setHours(randomHour, randomMinute, randomSecond);
                    
                    const queue_number = (Math.floor(Math.random() * 900) + 100).toString();
                    const machine_id = drinkIds[Math.floor(Math.random() * drinkIds.length)];
                    const size = sizes[Math.floor(Math.random() * sizes.length)];
                    const status = statuses[Math.floor(Math.random() * statuses.length)];
                    
                    await client.query(
                        `INSERT INTO orders (queue_number, machine_id, size, status, created_at) 
                         VALUES ($1, $2, $3, $4, $5)`,
                        [queue_number, machine_id, size, status, createdDate]
                    );
                }
                
                await client.query('COMMIT');
                console.log('[Analytics Seeder] Seed dữ liệu orders mẫu thành công!');
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('[Analytics Seeder Error] Lỗi khi seed dữ liệu:', err);
            } finally {
                client.release();
            }
        }
    } catch (err) {
        console.error('[Analytics Seeder Error Outer] Không thể kiểm tra và seed dữ liệu:', err);
    }
};

// Dịch ngày tiếng Anh sang tiếng Việt
const translateDayName = (dayName) => {
    const name = dayName.trim().toLowerCase();
    if (name.includes('monday')) return 'Thứ Hai';
    if (name.includes('tuesday')) return 'Thứ Ba';
    if (name.includes('wednesday')) return 'Thứ Tư';
    if (name.includes('thursday')) return 'Thứ Năm';
    if (name.includes('friday')) return 'Thứ Sáu';
    if (name.includes('saturday')) return 'Thứ Bảy';
    if (name.includes('sunday')) return 'Chủ Nhật';
    return dayName;
};

// Lấy dữ liệu phân tích thống kê 7 ngày qua
export const getAnalytics = async () => {
    // 1. Tự động seed nếu DB trống
    await seedOrdersIfEmpty();

    // 2. Lấy dữ liệu thống kê loại nước uống nhiều nhất
    const drinkRes = await pool.query(`
        SELECT 
            machine_id,
            COUNT(*) as count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'Done'
        GROUP BY machine_id
    `);
    
    let cocaCount = 0;
    let pepsiCount = 0;
    drinkRes.rows.forEach(row => {
        if (row.machine_id === 1) cocaCount = parseInt(row.count);
        if (row.machine_id === 2) pepsiCount = parseInt(row.count);
    });

    // 3. Khung giờ cao điểm bán được nhiều nhất
    const hourRes = await pool.query(`
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'Done'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY count DESC, hour ASC
        LIMIT 1
    `);
    const peakHour = hourRes.rows[0] ? parseInt(hourRes.rows[0].hour) : null;
    const peakHourCount = hourRes.rows[0] ? parseInt(hourRes.rows[0].count) : 0;

    // 4. Ngày cao điểm bán được nhiều nhất trong tuần
    const dayRes = await pool.query(`
        SELECT 
            TO_CHAR(created_at, 'YYYY-MM-DD') as date_str,
            TO_CHAR(created_at, 'Day') as day_name,
            COUNT(*) as count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'Done'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), TO_CHAR(created_at, 'Day')
        ORDER BY count DESC, date_str DESC
        LIMIT 1
    `);
    const peakDayName = dayRes.rows[0] ? dayRes.rows[0].day_name.trim() : null;
    const peakDayCount = dayRes.rows[0] ? parseInt(dayRes.rows[0].count) : 0;

    // 5. Chi tiết 7 ngày qua để vẽ biểu đồ
    const dailyStatsRes = await pool.query(`
        SELECT 
            TO_CHAR(created_at, 'YYYY-MM-DD') as date_str,
            SUM(CASE WHEN machine_id = 1 THEN 1 ELSE 0 END) as coca,
            SUM(CASE WHEN machine_id = 2 THEN 1 ELSE 0 END) as pepsi,
            COUNT(*) as total
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'Done'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date_str ASC
    `);

    // 6. Chi tiết khung giờ 24h để vẽ biểu đồ
    const hourlyStatsRes = await pool.query(`
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            SUM(CASE WHEN machine_id = 1 THEN 1 ELSE 0 END) as coca,
            SUM(CASE WHEN machine_id = 2 THEN 1 ELSE 0 END) as pepsi,
            COUNT(*) as total
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days' AND status = 'Done'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour ASC
    `);

    // Tạo danh sách 24 giờ với dữ liệu mặc định là 0
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        coca: 0,
        pepsi: 0,
        total: 0
    }));
    hourlyStatsRes.rows.forEach(row => {
        const h = parseInt(row.hour);
        if (h >= 0 && h < 24) {
            hourlyData[h] = {
                hour: h,
                coca: parseInt(row.coca),
                pepsi: parseInt(row.pepsi),
                total: parseInt(row.total)
            };
        }
    });

    // Tạo danh sách 7 ngày qua với dữ liệu đầy đủ
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const yyyymmdd = d.toISOString().split('T')[0];
        
        const daysVi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayLabel = daysVi[d.getDay()];

        const found = dailyStatsRes.rows.find(row => row.date_str === yyyymmdd);
        dailyData.push({
            date: yyyymmdd,
            label: dayLabel,
            coca: found ? parseInt(found.coca) : 0,
            pepsi: found ? parseInt(found.pepsi) : 0,
            total: found ? parseInt(found.total) : 0
        });
    }

    return {
        summary: {
            most_sold_drink: cocaCount > pepsiCount ? 'Coca-Cola' : (pepsiCount > cocaCount ? 'Pepsi' : (cocaCount === 0 && pepsiCount === 0 ? 'N/A' : 'Cả hai bằng nhau')),
            coca_total: cocaCount,
            pepsi_total: pepsiCount,
            peak_hour: peakHour !== null ? `${peakHour}h` : 'N/A',
            peak_hour_count: peakHourCount,
            peak_day: peakDayName ? translateDayName(peakDayName) : 'N/A',
            peak_day_count: peakDayCount
        },
        dailyData,
        hourlyData
    };
};

