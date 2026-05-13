import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // React app của bạn
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`Thiết bị kết nối mới: ${socket.id}`);

        // Xử lý các sự kiện logic ở đây hoặc tách ra file riêng
        socket.on('disconnect', () => {
            console.log('Một kết nối đã ngắt.');
        });
    });

    return io;
};

// Hàm này cực quan trọng: Dùng để lấy instance io ở các file khác (như Controller)
export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io chưa được khởi tạo!");
    }
    return io;
};