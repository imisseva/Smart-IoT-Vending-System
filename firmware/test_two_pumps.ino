// FILE: test_two_pumps.ino
// Chạy trên ARDUINO UNO để kiểm tra 2 bơm hoạt động độc lập và đồng thời.
//
// SƠ ĐỒ CẮM DÂY TRÊN ARDUINO UNO:
// - Chân Pin 3 -> Kết nối vào chân điều khiển IN3 trên Module Relay (Bơm 1 - Coca)
// - Chân Pin 5 -> Kết nối vào chân điều khiển IN2 trên Module Relay (Bơm 2 - Pepsi)
// - Chân GND của Arduino Uno -> Nối chung với chân GND của Module Relay.
// - Chân 5V của Arduino Uno -> Nối vào chân VCC của Module Relay.
//
// LƯU Ý QUAN TRỌNG VỀ LOẠI RELAY:
// - Nếu Relay kích mức cao (Active HIGH): Sét cấu hình RELAY_ACTIVE_HIGH thành true.
// - Nếu Relay kích mức thấp (Active LOW): Sét cấu hình RELAY_ACTIVE_HIGH thành false.

#define PUMP1_COCA_PIN 3   // Chân điều khiển Bơm 1 (Coca) - cắm vào IN3 của Relay
#define PUMP2_PEPSI_PIN 5  // Chân điều khiển Bơm 2 (Pepsi) - cắm vào IN2 của Relay

// === CẤU HÌNH LOẠI RELAY ===
// Thay đổi giá trị dưới đây nếu bơm chạy ngược (Ví dụ: Đáng lẽ tắt lại bật)
const bool RELAY_ACTIVE_HIGH = true; // true: Kích HIGH để BẬT | false: Kích LOW để BẬT

// Hàm bật/tắt relay chuẩn hóa dựa theo cấu hình
void setPumpState(int pumpPin, bool turnOn) {
  if (RELAY_ACTIVE_HIGH) {
    digitalWrite(pumpPin, turnOn ? HIGH : LOW);
  } else {
    digitalWrite(pumpPin, turnOn ? LOW : HIGH);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println("=== CHƯƠNG TRÌNH TEST ĐỘC LẬP 2 VÒI BƠM NƯỚC ===");
  Serial.println("==============================================");
  Serial.print("Cấu hình Relay: ");
  Serial.println(RELAY_ACTIVE_HIGH ? "ACTIVE HIGH (Kích HIGH bật)" : "ACTIVE LOW (Kích LOW bật)");

  // Cấu hình các chân là OUTPUT
  pinMode(PUMP1_COCA_PIN, OUTPUT);
  pinMode(PUMP2_PEPSI_PIN, OUTPUT);

  // Tắt cả 2 bơm lập tức lúc khởi động
  setPumpState(PUMP1_COCA_PIN, false);
  setPumpState(PUMP2_PEPSI_PIN, false);

  Serial.println("Hệ thống sẵn sàng. Bắt đầu chu trình test sau 3 giây...");
  delay(3000);
}

void loop() {
  // ===================================================
  // CHU KỲ 1: BẬT RIÊNG BƠM 1 (COCA-COLA - PIN 3)
  // ===================================================
  Serial.println("\n>>> [TEST] BẬT BƠM 1 (Coca - Pin 3) trong 3 giây...");
  setPumpState(PUMP1_COCA_PIN, true);
  setPumpState(PUMP2_PEPSI_PIN, false);
  delay(3000);

  Serial.println(">>> [TEST] TẮT BƠM 1...");
  setPumpState(PUMP1_COCA_PIN, false);
  
  Serial.println("Nghỉ 2 giây ổn định hệ thống...");
  delay(2000);

  // ===================================================
  // CHU KỲ 2: BẬT RIÊNG BƠM 2 (PEPSI - PIN 5)
  // ===================================================
  Serial.println("\n>>> [TEST] BẬT BƠM 2 (Pepsi - Pin 5) trong 3 giây...");
  setPumpState(PUMP1_COCA_PIN, false);
  setPumpState(PUMP2_PEPSI_PIN, true);
  delay(3000);

  Serial.println(">>> [TEST] TẮT BƠM 2...");
  setPumpState(PUMP2_PEPSI_PIN, false);

  Serial.println("Nghỉ 2 giây ổn định hệ thống...");
  delay(2000);

  // ===================================================
  // CHU KỲ 3: BẬT ĐỒNG THỜI CẢ 2 BƠM 
  // ===================================================
  Serial.println("\n>>> [TEST] BẬT ĐỒNG THỜI CẢ 2 BƠM trong 3 giây...");
  setPumpState(PUMP1_COCA_PIN, true);
  setPumpState(PUMP2_PEPSI_PIN, true);
  delay(3000);

  Serial.println(">>> [TEST] TẮT CẢ 2 BƠM...");
  setPumpState(PUMP1_COCA_PIN, false);
  setPumpState(PUMP2_PEPSI_PIN, false);

  Serial.println("Kết thúc chu kỳ. Chờ 5 giây trước khi lặp lại...");
  delay(5000);
}
