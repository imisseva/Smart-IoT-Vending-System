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

    // Phát lệnh tức thì qua WebSocket tới ESP8266
    getIo().emit('machine_command', currentCommand);

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
    getIo().emit('machine_command', "STOP");
    currentServingOrderId = null;
    currentServingQueueNumber = null;

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
    getIo().emit('machine_command', "DROP_CUP");
    console.log(`[Drop Cup] Đã phát lệnh nhả ly cho Order ID: ${orderId} qua WebSocket`);
    return { command: currentCommand };
};

// Lấy lệnh hiện tại (ESP8266 polling)
export const getCommand = () => {
    return currentCommand;
};

// Xử lý dữ liệu cảm biến từ ESP8266
export const updateSensor = async (waterLevel, isCupPlaced, dispensingProgress, pourStatus) => {
    console.log(`[Sensor] Mực nước: ${waterLevel} cm | Đã đặt ly: ${isCupPlaced} | Tiến trình: ${dispensingProgress}% | Trạng thái: ${pourStatus}`);

    // Lưu giữ thông tin đơn hàng đang hoạt động trước khi bị xóa bởi hàm completeOrder
    const activeOrderId = currentServingOrderId;
    const activeQueueNumber = currentServingQueueNumber;

    // An toàn: Nếu nước quá đầy (khoảng cách < 5cm) → tắt bơm khẩn cấp
    if (waterLevel < 5 && currentCommand !== 'STOP') {
        currentCommand = 'STOP';
        getIo().emit('machine_command', 'STOP');
        console.log(`[CẢNH BÁO KHẨN CẤP] Nước sắp tràn! Đã phát lệnh ngắt bơm khẩn cấp.`);
    }

    // ESP8266 xác nhận đã nhận lệnh (Acknowledge) hoặc đang rót nước -> tự động reset lệnh về STOP
    if (pourStatus === 'ACK' || (dispensingProgress !== undefined && dispensingProgress > 0)) {
        if (currentCommand !== 'STOP') {
            console.log(`[Command] ESP8266 xác nhận đã nhận lệnh '${currentCommand}'. Đã tự động reset lệnh về STOP để bảo vệ an toàn.`);
            currentCommand = 'STOP';
        }
    }

    // Cập nhật mực nước vào DB
    await MachineModel.updateWaterLevel(waterLevel);

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

    // Báo frontend realtime, gửi kèm cả phần trăm tiến trình và ID đơn hàng đang phục vụ để cô lập phiên người dùng
    getIo().emit('sensor_update', { 
        water_level: waterLevel, 
        is_cup_placed: isCupPlaced,
        dispensing_progress: dispensingProgress !== undefined ? parseInt(dispensingProgress) : undefined,
        order_id: activeOrderId,
        queue_number: activeQueueNumber
    });
};
