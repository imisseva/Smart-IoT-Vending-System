import { Server } from 'socket.io';

let ioInstance;

export const initSocket = (httpServer) => {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"]
    }
  });

  ioInstance.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Lắng nghe dữ liệu cảm biến thời gian thực từ ESP8266 qua WebSocket
    socket.on('machine_sensor', async (data) => {
      try {
        const payload = typeof data === 'string' ? JSON.parse(data) : data;
        const { water_level, is_cup_placed, dispensing_progress, pour_status } = payload;
        
        // Sử dụng dynamic import ở runtime để tránh lỗi Circular Dependency với MachineService
        const MachineService = await import('../services/MachineService.js');
        await MachineService.updateSensor(water_level, is_cup_placed, dispensing_progress, pour_status);
      } catch (err) {
        console.error('[Socket - machine_sensor Error] Lỗi xử lý cảm biến từ ESP8266:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  console.log('Đã khởi tạo Socket.IO Server thành công');
  return ioInstance;
};

export const getIo = () => {
  if (!ioInstance) throw new Error("Socket.io chưa được khởi tạo!");
  return ioInstance;
};
