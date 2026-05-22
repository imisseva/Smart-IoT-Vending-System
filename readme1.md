Tài liệu này hướng dẫn chi tiết cách đấu nối phần cứng, cài đặt các thư viện cần thiết, cấu hình môi trường và vận hành toàn bộ hệ thống bán nước thông minh thời gian thực (giao tiếp 100% qua giao thức **WebSockets / Socket.IO v4**).
---
## 📁 1. Cấu Trúc Thư Mục Dự Án
Dự án được chia làm 3 phần chính như sau:
```text
Smart-IoT-Vending-System/
├── backend/              # Node.js Express + Socket.IO Server & Database logic
├── frontend/             # Next.js Web App (Giao diện đặt nước & Theo dõi hàng đợi realtime)
└── firmware/             # Mã nguồn C++ nạp cho phần cứng vi điều khiển
    ├── esp.cpp           # Chạy trên ESP8266 NodeMCU (Xử lý IoT, lọc nhiễu DSP & Laser VL53L0X)
    └── arduino.cpp       # Chạy trên Arduino Uno (Điều khiển Hysteresis, vòi bơm, Servo nhả ly, LCD)
```
---
## 🔌 2. Đấu Nối Sơ Đồ Phần Cứng (Hardware Wiring)
Để hệ thống hoạt động ổn định và tránh nhiễu do động cơ bơm gây ra, vui lòng đấu nối các thiết bị theo sơ đồ sau:
### A. ESP8266 NodeMCU Kết Nối Cảm Biến Laser VL53L0X:
*   `3V3` ESP8266 ─── `VIN` VL53L0X
*   `GND` ESP8266 ─── `GND` VL53L0X
*   `D5` (GPIO14) ESP8266 ─── `SDA` VL53L0X (Kết nối I2C tùy chỉnh)
*   `D6` (GPIO12) ESP8266 ─── `SCL` VL53L0X
### B. Kết Nối Giữa ESP8266 và Arduino Uno (Tín hiệu điều khiển):
*   `D1` (GPIO5) ESP8266 ─── `Pin 7` Arduino Uno (Kích hoạt vòi Coca-Cola)
*   `D2` (GPIO4) ESP8266 ─── `Pin 6` Arduino Uno (Kích hoạt vòi Pepsi)
*   **QUAN TRỌNG:** Chân `GND` của ESP8266 phải nối trực tiếp với chân `GND` của Arduino Uno để chung Mass tín hiệu.
### C. Arduino Uno Điều Khiển Thiết Bị Ngoại Vi:
*   `Pin 3` Arduino ─── `IN1` Module Relay cách ly quang (Điều khiển vòi bơm Coca-Cola - Chuyển sang Pin 3 vì Pin 4 bị cháy vật lý)
*   `Pin 5` Arduino ─── `IN2` Module Relay cách ly quang (Điều khiển vòi bơm Pepsi)
*   `Pin 9` Arduino ─── `Tín hiệu (Cam/Vàng)` Servo nhả ly (Servo SG90)
*   `GND` Arduino ─── `GND` chung của Relay, Servo, LCD
*   `5V` Arduino ─── `VCC` của LCD I2C và Servo SG90 (Khuyên dùng nguồn ngoài 5V riêng cho Servo để tránh sụt áp Uno)
---
## 💻 3. Cài Đặt & Chạy Server Backend (Port: 5000)
Thư mục `backend` chạy máy chủ Node.js Express tích hợp Socket.IO và kết nối cơ sở dữ liệu PostgreSQL đám mây (Aiven Cloud).
### Bước 3.1: Yêu cầu môi trường
*   Cài đặt **Node.js** (Khuyên dùng bản LTS v18 trở lên).
*   Công cụ quản lý gói **pnpm** (hoặc sử dụng **npm** mặc định).
### Bước 3.2: Cài đặt và cấu hình môi trường
1.  Mở terminal tại thư mục `backend/`:
    ```bash
    cd backend
    ```
2.  Cài đặt các gói phụ thuộc:
    ```bash
    pnpm install
    # hoặc sử dụng: npm install
    ```
3.  Cấu hình tệp môi trường `.env` nằm trong thư mục `backend/` (đã cấu hình mặc định database đám mây Aiven):
    ```env
    PORT=5000
    DATABASE_URL="postgres://avnadmin:AVNS_8kiWMADeZiRCsy3nyoz@vdk-bt3-lubo11892-522a.c.aivencloud.com:15171/defaultdb"
    ```
### Bước 3.3: Khởi chạy Backend
*   **Chế độ phát triển (Development Mode - Tự khởi động lại khi sửa code):**
    ```bash
    pnpm run dev
    # hoặc sử dụng: npm run dev
    ```
*   **Chế độ chạy thực tế (Production Mode):**
    ```bash
    pnpm start
    # hoặc sử dụng: npm start
    ```
    *Server sẽ hoạt động tại địa chỉ: `http://localhost:5000` và mở luồng WebSocket Socket.IO.*
---
## 🖥️ 4. Cài Đặt & Chạy Web Frontend Next.js (Port: 3000)
Giao diện Web Frontend Next.js cho phép người dùng đặt hàng qua trình duyệt và hiển thị hàng đợi, tiến trình bơm nước realtime.
### Bước 4.1: Cấu hình và cài đặt
1.  Mở terminal tại thư mục `frontend/`:
    ```bash
    cd frontend
    ```
2.  Cài đặt các gói phụ thuộc:
    ```bash
    pnpm install
    # hoặc sử dụng: npm install
    ```
3.  Tạo hoặc kiểm tra tệp `.env.local` trong thư mục `frontend/` để trỏ API đến máy chủ Backend:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:5000/api
    ```
### Bước 4.2: Khởi chạy Frontend
*   **Chạy chế độ phát triển (Realtime Hot-reload):**
    ```bash
    pnpm run dev
    # hoặc sử dụng: npm run dev
    ```
    *Mở trình duyệt truy cập: `http://localhost:3000` để sử dụng ứng dụng.*
---
## 🔌 5. Cấu Hình & Nạp Firmware Phần Cứng
### Bước 5.1: Cấu hình Arduino IDE và cài đặt thư viện
Tải và cài đặt **Arduino IDE** trên máy tính của bạn. Mở trình quản lý thư viện (Library Manager - phím tắt `Ctrl + Shift + I`) và cài đặt các thư viện sau:
1.  **Dành cho ESP8266 (esp.cpp):**
    *   `WebSockets` (Bởi tác giả **Markus Sattler** - Bản mới nhất) -> Thư viện cốt lõi cho kết nối WebSocket thô.
    *   `Adafruit VL53L0X` (Bởi **Adafruit** - Bản mới nhất) -> Dùng để đọc cảm biến laser ToF.
2.  **Dành cho Arduino Uno (arduino.cpp):**
    *   `LiquidCrystal_I2C` -> Thư viện hiển thị màn hình LCD I2C.
    *   `Servo` -> Thư viện điều khiển động cơ Servo nhả ly (Tích hợp sẵn trong Arduino IDE).
---
### Bước 5.2: Cấu hình & Nạp Code cho Arduino Uno
1.  Kết nối Arduino Uno vào máy tính qua cáp USB.
2.  Mở mã nguồn [arduino.cpp](file:///d:/MyProjects/Smart%20IoT%20Vending%20System/Smart-IoT-Vending-System/firmware/arduino.cpp) bằng Arduino IDE.
3.  Chọn đúng Board là **Arduino Uno** và đúng cổng COM tương ứng.
4.  Nhấn nút **Upload** (Mũi tên sang phải) để biên dịch và nạp code vào Uno.
---
### Bước 5.3: Cấu hình & Nạp Code cho ESP8266 NodeMCU
1.  Mở mã nguồn [esp.cpp](file:///d:/MyProjects/Smart%20IoT%20Vending%20System/Smart-IoT-Vending-System/firmware/esp.cpp) bằng Arduino IDE.
2.  **Sửa đổi thông số cấu hình mạng và IP máy tính của bạn** tại đầu tệp tin (Dòng 81 - 83):
    ```cpp
    const char* ssid = "TÊN_WIFI_CỦA_BẠN";
    const char* password = "MẬT_KHẨU_WIFI_CỦA_BẠN";
    const char* serverIP = "IP_MÁY_TÍNH_ĐANG_CHẠY_BACKEND"; // Ví dụ: "192.168.1.15" (Dùng lệnh 'ipconfig' trên Windows để xem IP máy)
    ```
3.  Kết nối ESP8266 vào máy tính qua cáp USB.
4.  Chọn Board tương ứng là **NodeMCU 1.0 (ESP-12E Module)** và đúng cổng COM.
5.  Nhấn **Upload** để nạp code. Mở Serial Monitor ở tốc độ baudrate `115200` để theo dõi nhật ký kết nối.
---
## 🚀 6. Hướng Dẫn Vận Hành & Nghiệm Thu Hệ Thống
Để nghiệm thu hệ thống một cách an toàn và đúng quy trình, thực hiện các bước sau:
1.  **Chạy thử không tải (Khuyên dùng để bảo vệ thiết bị):**
    *   *Khuyến nghị an toàn:* Rút giắc cấp nguồn 12V của bơm ra khỏi Module Relay trước khi thử để tránh chập mạch hoặc xung nhiễu sụt áp trong lần chạy đầu tiên.
2.  **Khởi chạy phần mềm:**
    *   Khởi chạy Server Backend (`pnpm run dev` tại `/backend`).
    *   Khởi chạy Frontend Web App (`pnpm run dev` tại `/frontend`).
3.  **Khởi động phần cứng:**
    *   Cắm nguồn cho ESP8266 và Arduino Uno.
    *   Xem qua Serial Monitor của ESP8266 để đảm bảo log in ra kết nối WiFi thành công và thực hiện bắt tay WebSocket trơn tru:
        ```text
        [WebSocket] Da ket noi vat ly den Server. Cho Engine.IO Handshake...
        [WebSocket] Nhan Handshake tu Engine.IO. Gui Connect Packet '40'...
        ```
    *   Màn hình LCD trên Arduino hiển thị trạng thái `"SAN SANG........"`.
4.  **Thực hiện đặt nước và rót nước:**
    *   Mở trình duyệt Web Frontend tại `http://localhost:3000`.
    *   Giao diện sẽ hiển thị trạng thái máy là **Sẵn sàng** (Ready) thời gian thực. Di chuyển tay trước cảm biến VL53L0X để giả lập đặt ly, giao diện Web sẽ đổi trạng thái ngay lập tức khi phát hiện ly.
    *   Tiến hành nhập tên và bấm chọn loại nước uống (Coca / Pepsi) kèm Size ly.
    *   Hệ thống tự động đưa đơn vào hàng đợi. Bấm "Thanh toán" (giả lập thanh toán).
    *   Động cơ Servo nhả ly hoạt động xoay gạt ly xuống khay.
    *   Sau khi đặt ly vào vị trí, bấm nút **Start Dispensing** trên giao diện Web.
    *   **Phản hồi siêu tốc:** Vòi bơm tương ứng sẽ lập tức được kích hoạt. Đèn LED trên Module Relay sáng lên và bơm chạy.
    *   Di chuyển tấm bìa hoặc tay của bạn lại gần cảm biến laser ToF để giả lập mặt nước đang dâng lên. Tiến trình `%` dâng nước sẽ nhảy liên tục thời gian thực cực kỳ mịn trên Web từ `0%` đến `100%`.
    *   Khi mực nước đạt mục tiêu đã chọn hoặc bạn đưa tay sát cảm biến quá mức an toàn (< 4.5 cm), ESP8266 phát lệnh tắt bơm tức thời, Relay ngắt điện, và giao diện Web chuyển sang thông báo "Hoàn tất!" ngay lập tức.
---
## ⚠️ 7. Một Số Lưu Ý Khi Vận Hành & Khắc Phục Sự Cố
*   **Không kết nối được WebSocket:** Kiểm tra xem ESP8266 và máy tính chạy server có đang kết nối chung một mạng Wi-Fi (cùng lớp mạng LAN) hay không. Hãy đảm bảo IP cấu hình trong `esp.cpp` trùng khớp hoàn toàn với IPv4 của máy tính chạy server.
*   **Bơm không ngắt:** Kiểm tra cảm biến VL53L0X có bị bám bụi hay giọt nước bắn lên bề mặt kính bảo vệ hay không. Hãy lau sạch để laser ToF hoạt động đúng hiệu năng. Hệ thống đã có bộ hẹn giờ bảo vệ phụ (Watchdog) tự động ngắt bơm cưỡng bức sau 20 giây chạy liên tục để chống tràn.
*   **Reset hàng đợi khi kẹt:** Nếu có nhiều đơn hàng cũ bị treo trong database ở trạng thái `Serving`, bạn có thể vào thư mục `backend/` và chạy lệnh sau để làm sạch cơ sở dữ liệu về trạng thái trống ban đầu:
    ```bash
    node reset_all_orders.js
    ```
