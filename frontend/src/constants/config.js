let detectedApiUrl = 'http://192.168.1.156:5000/api'; // Mặc định dùng thẳng IP LAN của máy tính

if (typeof window !== 'undefined') {
  let hostname = window.location.hostname;
  // Nếu chạy local hoặc lỗi phân giải hostname, ép về IP LAN thực tế của server máy tính
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    hostname = '192.168.1.156';
  }
  detectedApiUrl = `http://${hostname}:5000/api`;
} else if (process.env.NEXT_PUBLIC_API_URL) {
  detectedApiUrl = process.env.NEXT_PUBLIC_API_URL;
}

export const API_URL = detectedApiUrl;
