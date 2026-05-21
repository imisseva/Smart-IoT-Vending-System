import { getIo } from '../config/socket.js';
import * as OrderModel from '../models/OrderModel.js';
import * as MachineModel from '../models/MachineModel.js';

let currentCommand = "STOP";

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

    // 3. Báo frontend
    getIo().emit('queue_updated');

    // 4. Chuẩn bị lệnh cho ESP8266 kèm theo Size (Ví dụ: POUR_COCA_M)
    currentCommand = drink_name === 'Coca-Cola' ? `POUR_COCA_${size}` : `POUR_PEPSI_${size}`;

    return { command: currentCommand };
};

// Hoàn tất order
export const completeOrder = async (orderId) => {
    currentCommand = "STOP";

    // 1. Đánh dấu order đã hoàn thành
    await OrderModel.updateOrderStatus(orderId, 'Done');

    // 2. Reset máy về Ready
    await MachineModel.setReady();

    // 3. Báo frontend
    getIo().emit('queue_updated');
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
    const cmd = currentCommand;
    if (currentCommand.startsWith("POUR_") || currentCommand === "DROP_CUP") {
        currentCommand = "STOP"; // Tự động reset về STOP sau khi ESP lấy lệnh thành công (self-clearing)
        console.log(`[Command] ESP8266 đã lấy lệnh '${cmd}'. Đã tự động reset lệnh về STOP để bảo vệ an toàn.`);
    }
    return cmd;
};

// Xử lý dữ liệu cảm biến từ ESP8266
export const updateSensor = async (waterLevel, isCupPlaced, dispensingProgress, pourStatus) => {
    console.log(`[Sensor] Mực nước: ${waterLevel} cm | Đã đặt ly: ${isCupPlaced} | Tiến trình: ${dispensingProgress}% | Trạng thái: ${pourStatus}`);

    // An toàn: Nếu nước quá đầy (khoảng cách < 5cm) → tắt bơm khẩn cấp
    if (waterLevel < 5 && currentCommand !== 'STOP') {
        currentCommand = 'STOP';
        console.log(`[CẢNH BÁO KHẨN CẤP] Nước sắp tràn! Đã ngắt lệnh bơm.`);
    }

    // Cập nhật mực nước vào DB
    await MachineModel.updateWaterLevel(waterLevel);

    // Xử lý tự động hoàn thành khi máy báo cáo "DONE"
    if (pourStatus === 'DONE') {
        console.log(`[Sensor] Máy đã rót xong nước! Đang tự động hoàn tất order...`);
        const activeOrders = await OrderModel.findActiveOrders();
        const servingOrder = activeOrders.find(o => o.status === 'Serving');
        if (servingOrder) {
            await completeOrder(servingOrder.id);
        } else {
            currentCommand = 'STOP';
            await MachineModel.setReady();
            getIo().emit('queue_updated');
        }
    }

    // Báo frontend realtime, gửi kèm cả phần trăm tiến trình
    getIo().emit('sensor_update', { 
        water_level: waterLevel, 
        is_cup_placed: isCupPlaced,
        dispensing_progress: dispensingProgress !== undefined ? parseInt(dispensingProgress) : undefined
    });
};
