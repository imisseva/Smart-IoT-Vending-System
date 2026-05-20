Smart Mood Drink Vending Machine - System Flow & Database Design
Đề tài: Hệ thống máy bán nước thông minh theo cảm xúc sử dụng ESP8266, WebSocket và Database.
1. Tổng quan hệ thống
Hệ thống cho phép nhiều người dùng truy cập thông qua QR Code, chọn loại nước/mood, xếp hàng realtime và nhận đồ uống khi tới lượt.
2. Luồng hoạt động hệ thống
1.	1. User quét QR code trên máy.
2.	2. User truy cập Web App.
3.	3. User nhập tên hoặc nickname.
4.	4. User chọn loại nước / mood / size.
5.	5. Hệ thống tạo số thứ tự (Queue Number).
6.	6. User được đưa vào hàng chờ realtime.
7.	7. LCD hiển thị số thứ tự đang phục vụ.
8.	8. Khi tới lượt, WebSocket gửi thông báo realtime.
9.	9. User thực hiện fake payment.
10.	10. ESP8266 nhận tín hiệu payment success.
11.	11. Servo mở cửa kho ly.
12.	12. User lấy ly và đặt vào vị trí rót.
13.	13. User nhấn nút START DISPENSING.
14.	14. ESP8266 điều khiển pump để rót nước.
15.	15. Hoàn thành order.
16.	16. Database lưu lịch sử order.
17.	17. Hệ thống chuyển sang người tiếp theo trong queue.
3. Thành phần phần cứng
Thiết bị	Chức năng
ESP8266	Điều khiển trung tâm
Servo Motor	Mở cửa kho ly
Pump 12V DC x2	Rót nước
LCD I2C 16x2	Hiển thị queue
Push Button	Xác nhận bắt đầu rót
Water Level Sensor	Kiểm tra mức nước
Relay/MOSFET	Điều khiển pump
Nguồn 12V	Cấp nguồn cho pump
4. Thiết kế Database
4.1 Bảng Orders
Field	Type	Description
id	INT	Primary Key
queue_number	VARCHAR(10)	Số thứ tự
username	VARCHAR(50)	Tên người dùng
drink_name	VARCHAR(50)	Tên nước
mood	VARCHAR(50)	Mood được chọn
size	VARCHAR(10)	Size đồ uống
status	VARCHAR(20)	Waiting / Serving / Done
payment_status	VARCHAR(20)	Paid / Unpaid
created_at	DATETIME	Thời gian tạo
4.2 Bảng Machine_Status
Field	Type	Description
id	INT	Primary Key
water_level	INT	Mức nước
machine_state	VARCHAR(30)	Ready / Dispensing / Offline
current_queue	VARCHAR(10)	Số thứ tự hiện tại
updated_at	DATETIME	Thời gian cập nhật
4.3 Bảng Admins
Field	Type	Description
id	INT	Primary Key
username	VARCHAR(50)	Tên đăng nhập
password	VARCHAR(255)	Mật khẩu
5. WebSocket Realtime Features
•	Realtime queue update
•	Realtime serving number
•	Realtime dispensing status
•	Realtime low water warning
•	Realtime order completion
6. Phân tích dữ liệu
•	Loại nước được chọn nhiều nhất
•	Mood phổ biến nhất
•	Khung giờ sử dụng nhiều nhất
•	Số lượng order theo ngày
•	Thời gian chờ trung bình
