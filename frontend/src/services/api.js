import axios from 'axios';
import { API_URL } from '../constants/config';
import { io } from 'socket.io-client';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Khởi tạo Socket Client kết nối đến Backend
const SOCKET_URL = API_URL.replace('/api', ''); // Cắt bỏ /api để lấy gốc http://localhost:5000
export const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']
});

export const orderService = {
  createOrder: async (data) => {
    const response = await apiClient.post('/orders', data);
    return response.data;
  },
  getQueue: async () => {
    const response = await apiClient.get('/orders/queue');
    return response.data;
  },
  payOrder: async (id) => {
    const response = await apiClient.post(`/orders/${id}/pay`);
    return response.data;
  }
};

export const machineService = {
  dispenseDrink: async (order_id) => {
    const response = await apiClient.post('/machine/dispense', { order_id });
    return response.data;
  },
  completeOrder: async (order_id) => {
    const response = await apiClient.post('/machine/complete', { order_id });
    return response.data;
  }
};
