// FILE: test_uno_pumps_check.ino
// Chạy trên ARDUINO UNO
//
// MỤC TIÊU:
// - Kiểm tra hoạt động đóng ngắt của Module Relay và 2 chiếc Bơm 12V độc lập.
// - Xác nhận xem các bơm có hoạt động ổn định, không bị rò điện hay sụt áp nguồn.
//
// KẾT NỐI DÂY TRÊN ARDUINO UNO:
// - Pin 3 → Kết nối với chân IN3 trên module Relay (Bơm 1 - Coca)
// - Pin 5 → Kết nối với chân IN2 trên module Relay (Bơm 2 - Pepsi)
// - Chân GND Arduino nối với GND nguồn của Relay (hoặc nối chung GND nếu dùng chung nguồn).
// - Relay hoạt động ở mức tích cực THẤP (LOW = BẬT, HIGH = TẮT).
//

#define PUMP1_COCA_PIN 3  // Chân điều khiển Bơm 1 (Coca) - đã chuyển từ Pin 4 sang Pin 3 lành lặn
#define PUMP2_PEPSI_PIN 5 // Chân điều khiển Bơm 2 (Pepsi)

void setup() {
  Serial.begin(9600);
  delay(1000);
  Serial.println("\n=== ARDUINO UNO PUMP CHECK SYSTEM ===");
  Serial.println("Khoi tao cac chan dieu khien...");

  // Cấu hình chân là OUTPUT
  pinMode(PUMP1_COCA_PIN, OUTPUT);
  pinMode(PUMP2_PEPSI_PIN, OUTPUT);

  // MẶC ĐỊNH BAN ĐẦU: Đưa ngay các chân lên HIGH để TẮT bơm (Ngăn bơm tự chạy khi vừa cấp điện)
  digitalWrite(PUMP1_COCA_PIN, HIGH);
  digitalWrite(PUMP2_PEPSI_PIN, HIGH);
  
  Serial.println("He thong da san sang. Chuan bi bat dau chu ky kiem tra!");
  delay(2000); // Chờ 2 giây ổn định hệ thống
}

void loop() {
  // ==========================================
  // CHU KỲ 1: KIỂM TRA BƠM 1 (COCA-COLA - PIN 3)
  // ==========================================
  Serial.println("\n>>> [Kiem Tra] BAT BOM 1 (Coca - Pin 3)...");
  digitalWrite(PUMP1_COCA_PIN, LOW); // LOW = Kích hoạt Relay đóng mạch -> Bơm chạy
  delay(3000);                      // Chạy trong 3 giây

  Serial.println(">>> [Kiem Tra] TAT BOM 1 (Coca - Pin 3)...");
  digitalWrite(PUMP1_COCA_PIN, HIGH); // HIGH = Ngắt Relay -> Bơm dừng
  
  // Đợi 2 giây nghỉ giữa hai bơm để chống sụt áp tức thời
  Serial.println("Cho 2 giay de he thong on dinh...");
  delay(2000);

  // ==========================================
  // CHU KỲ 2: KIỂM TRA BƠM 2 (PEPSI - PIN 5)
  // ==========================================
  Serial.println("\n>>> [Kiem Tra] BAT BOM 2 (Pepsi - Pin 5)...");
  digitalWrite(PUMP2_PEPSI_PIN, LOW); // LOW = Kích hoạt Relay đóng mạch -> Bơm chạy
  delay(3000);                       // Chạy trong 3 giây

  Serial.println(">>> [Kiem Tra] TAT BOM 2 (Pepsi - Pin 5)...");
  digitalWrite(PUMP2_PEPSI_PIN, HIGH); // HIGH = Ngắt Relay -> Bơm dừng

  // Đợi 5 giây trước khi lặp lại toàn bộ chu kỳ tiếp theo
  Serial.println("Cho 5 giay de bat dau lai chu ky kiem tra moi...");
  delay(5000);
}
