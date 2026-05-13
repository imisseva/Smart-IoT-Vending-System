import express from 'express';
import { createServer } from 'http';
import { initSocket } from './config/socket.js';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Khởi tạo socket
initSocket(httpServer);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});