// CẤU HÌNH HỆ THỐNG CHẠY CLOUD RENDER HOẶC LOCAL
// - Đặt true: Chạy 100% qua Backend Cloud Render vừa deploy
// - Đặt false: Chạy qua máy tính cá nhân local (LAN IP)
export const RUN_ON_RENDER = true;

const RENDER_BACKEND_URL = 'https://water-pouring.onrender.com';
const LOCAL_IP_LAN = '192.168.1.119'; // Đã cập nhật IP LAN thực tế mới của máy tính anh

let detectedApiUrl = `${RENDER_BACKEND_URL}/api`;

if (!RUN_ON_RENDER) {
  detectedApiUrl = `http://${LOCAL_IP_LAN}:5000/api`;
  if (typeof window !== 'undefined') {
    let hostname = window.location.hostname;
    // Nếu chạy local hoặc lỗi phân giải hostname, ép về IP LAN thực tế của server máy tính
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      hostname = LOCAL_IP_LAN;
    }
    detectedApiUrl = `http://${hostname}:5000/api`;
  }
} else if (process.env.NEXT_PUBLIC_API_URL) {
  // Dự phòng nếu Next.js được build trên hosting
  detectedApiUrl = process.env.NEXT_PUBLIC_API_URL;
}

export const API_URL = detectedApiUrl;
