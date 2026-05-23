import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Lấy đúng đường dẫn file .env ở thư mục root của backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=Asia/Ho_Chi_Minh",
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(client => {
    console.log('Đã kết nối thành công tới Database PostgreSQL (Session Timezone: Asia/Ho_Chi_Minh)');
    client.release();
  })
  .catch(err => {
    console.error('Lỗi kết nối Database:', err.stack);
  });

export default pool;
