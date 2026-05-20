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
