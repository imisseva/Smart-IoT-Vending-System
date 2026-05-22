import axios from 'axios';
import { API_URL, RUN_ON_RENDER } from '../constants/config';
import { io } from 'socket.io-client';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Khởi tạo Socket Client kết nối đến Backend thời gian thực
let socketInstance = null;

if (typeof window !== 'undefined') {
  if (RUN_ON_RENDER) {
    // Nếu chạy trên Render Cloud, lấy trực tiếp địa chỉ API_URL từ config
    const SOCKET_URL = API_URL.replace('/api', '');
    console.log(`[API & Socket] Chạy Cloud Render: Kết nối tới URL cố định: ${SOCKET_URL}`);
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });
  } else {
    const hostname = window.location.hostname;
    
    // Ghi đè BaseURL động cho Axios trên trình duyệt của thiết bị
    apiClient.defaults.baseURL = `http://${hostname}:5000/api`;
    
    // Khởi tạo kết nối Socket.IO động tới đúng IP LAN của server máy tính
    const socketUrl = `http://${hostname}:5000`;
    console.log(`[API & Socket] Chạy Local LAN: Đang thiết lập kết nối động tới: ${socketUrl}`);
    
    socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling']
    });
  }
} else {
  // Fallback khi chạy phía Server (SSR)
  const SOCKET_URL = API_URL.replace('/api', '');
  socketInstance = io(SOCKET_URL, {
    transports: ['websocket', 'polling']
  });
}

export const socket = socketInstance;

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
  },
  getOrder: async (id) => {
    const response = await apiClient.get(`/orders/${id}`);
    return response.data;
  }
};


export const machineService = {
  dispenseDrink: async (order_id) => {
    const response = await apiClient.post('/machine/dispense', { order_id });
    return response.data;
  },
  completeOrder: async (order_id, status) => {
    const response = await apiClient.post('/machine/complete', { order_id, status });
    return response.data;
  },
  dropCup: async (order_id) => {
    const response = await apiClient.post('/machine/drop-cup', { order_id });
    return response.data;
  },
  refillWater: async (id, water_level) => {
    const response = await apiClient.post('/machine/refill', { id, water_level });
    return response.data;
  },
  getMachineStatus: async () => {
    const response = await apiClient.get('/machine/status');
    return response.data;
  },
  getAnalytics: async () => {
    const response = await apiClient.get('/machine/analytics');
    return response.data;
  },
  loginAdmin: async (username, password) => {
    const response = await apiClient.post('/admin/login', { username, password });
    return response.data;
  }
};

