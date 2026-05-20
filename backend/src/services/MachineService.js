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

    const { drink_name, queue_number } = order;

    // 1. Cập nhật order sang trạng thái Serving
    await OrderModel.updateOrderStatus(orderId, 'Serving');

    // 2. Cập nhật Machine_Status sang Dispensing
    await MachineModel.setDispensing(queue_number);

    // 3. Báo frontend
    getIo().emit('queue_updated');

    // 4. Chuẩn bị lệnh cho ESP8266
    currentCommand = drink_name === 'Coca-Cola' ? 'POUR_COCA' : 'POUR_PEPSI';

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

// Lấy lệnh hiện tại (ESP8266 polling)
export const getCommand = () => {
    return currentCommand;
};

// Xử lý dữ liệu cảm biến từ ESP8266
export const updateSensor = async (waterLevel) => {
    // An toàn: Nếu mực nước quá cao (khoảng cách < 5cm) → tắt bơm
    if (waterLevel < 5 && currentCommand !== 'STOP') {
        currentCommand = 'STOP';
    }

    // Cập nhật mực nước vào DB
    await MachineModel.updateWaterLevel(waterLevel);

    // Báo frontend realtime
    getIo().emit('sensor_update', { water_level: waterLevel });
};
