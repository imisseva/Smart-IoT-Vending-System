// FILE: test_auto_pump.ino
// Chương trình test tự động KHÔNG cần Serial Monitor
// Phục vụ test cách ly nguồn bằng Sạc Dự Phòng (Power Bank)
//
// Cách thức hoạt động:
// - Hệ thống chạy tự động theo chu kỳ tuần hoàn (Bơm 1 ON -> OFF -> Bơm 2 ON -> OFF -> Cả 2 ON -> OFF)
// - Hiển thị số chu kỳ chạy thành công liên tục (CYCLES) lên LCD.
// - Nếu Arduino bị reset giữa chừng, số CYCLES sẽ quay về 0.
// - Nếu Arduino chạy ổn định, số CYCLES sẽ tăng dần (1, 2, 3...).
//
// Kết nối Uno:
// - Chân 4 -> IN1 Relay (Bơm Coca)
// - Chân 5 -> IN2 Relay (Bơm Pepsi)
// - Chân 9 -> Servo nhả ly (Để xem servo có bị giật nhiễu không)
// - LCD I2C 16x2 nối vào chân A4 (SDA), A5 (SCL)

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo cupServo;

const int pumpCoca = 4;
const int pumpPepsi = 5;
const int servoPin = 9;

int cycleCount = 0; // Đếm số chu kỳ chạy thành công không bị reset

void setup() {
  // Cấu hình chân ra cho relay (Đảm bảo ban đầu tắt hoàn toàn)
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, LOW);
  pinMode(pumpCoca, OUTPUT);
  pinMode(pumpPepsi, OUTPUT);

  // Cấu hình servo về vị trí khóa mặc định
  cupServo.attach(servoPin);
  cupServo.write(0);

  // Khởi tạo LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TEST TU DONG V1");
  lcd.setCursor(0, 1);
  lcd.print("KHOI DONG TRONG 3S");
  
  delay(3000); // Chờ 3 giây ổn định nguồn trước khi bắt đầu
}

void printStatus(String statusText) {
  lcd.clear();
  // Dòng 1: Hiển thị số chu kỳ chạy thành công liên tục
  lcd.setCursor(0, 0);
  lcd.print("CYCLES: ");
  lcd.print(cycleCount);
  
  // Dòng 2: Hiển thị trạng thái bơm hiện tại
  lcd.setCursor(0, 1);
  lcd.print(statusText);
}

void loop() {
  cycleCount++; // Bắt đầu một chu kỳ mới
  
  // ==========================================
  // BƯỚC 1: BẬT BƠM COCA (2 giây)
  // ==========================================
  printStatus("COCA ON (2s)...");
  digitalWrite(pumpCoca, HIGH);
  digitalWrite(pumpPepsi, LOW);
  delay(2000);
  
  // TẮT BƠM CHỜ 2 GIÂY
  printStatus("WAITING (2s)...");
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, LOW);
  delay(2000);

  // ==========================================
  // BƯỚC 2: BẬT BƠM PEPSI (2 giây)
  // ==========================================
  printStatus("PEPSI ON (2s)...");
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, HIGH);
  delay(2000);
  
  // TẮT BƠM CHỜ 2 GIÂY
  printStatus("WAITING (2s)...");
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, LOW);
  delay(2000);

  // ==========================================
  // BƯỚC 3: BẬT CẢ HAI BƠM (2 giây)
  // ==========================================
  printStatus("BOTH ON (2s)...");
  digitalWrite(pumpCoca, HIGH);
  digitalWrite(pumpPepsi, HIGH);
  delay(2000);
  
  // TẮT BƠM CHỜ 2 GIÂY
  printStatus("WAITING (2s)...");
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, LOW);
  delay(2000);
  
  // ==========================================
  // BƯỚC 4: NHÁ SERVO NHẢ LY (Để test nhiễu servo)
  // ==========================================
  printStatus("SERVO TEST (1.5s)");
  cupServo.write(90); // Xoay nhả ly
  delay(1000);
  cupServo.write(0);  // Xoay khóa lại
  delay(500);
}
