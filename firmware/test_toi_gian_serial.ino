// FILE: test_toi_gian_serial.ino
// Bản test tối giản có hiển thị LCD và in log Serial Monitor tốc độ 115200
// Dành cho Arduino Uno kết nối với Máy tính

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

const int pumpCoca = 4;
const int pumpPepsi = 5;
int cycle = 0;

void setup() {
  // Cấu hình chân đầu ra cho bơm
  pinMode(pumpCoca, OUTPUT);
  pinMode(pumpPepsi, OUTPUT);
  
  // Khởi động Serial Monitor tốc độ 115200
  Serial.begin(115200);
  delay(1000); // Chờ Serial ổn định
  
  Serial.println("\n================================================");
  Serial.println("=== CHUONG TRINH TEST TOI GIAN CO SERIAL LOG ===");
  Serial.println("================================================");
  Serial.println("[Setup] Khoi dong he thong...");

  // Khởi động LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("TEST TOI GIAN");
  
  Serial.println("[Setup] San sang! Cho 2 giay de bat dau...");
  delay(2000);
}

void loop() {
  cycle++;
  
  // 1. Ghi log lên Serial Monitor
  Serial.println("------------------------------------------------");
  Serial.print("[Chu ky: ");
  Serial.print(cycle);
  Serial.println("] Bat dau kiem tra...");

  // 2. Ghi log lên màn hình LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CYCLE: ");
  lcd.print(cycle);
  
  // ====================================================
  // THỬ NGHIỆM 1: Bật bơm ở mức KÍCH HIGH (Active HIGH)
  // ====================================================
  Serial.println(" -> KICH HOAT: DigitalWrite HIGH (Chan 4 & 5)");
  lcd.setCursor(0, 1);
  lcd.print("PUMP ON (HIGH)");
  
  digitalWrite(pumpCoca, HIGH);
  digitalWrite(pumpPepsi, HIGH);
  delay(3000); // Giữ trong 3 giây
  
  // ====================================================
  // THỬ NGHIỆM 2: Bật bơm ở mức KÍCH LOW (Active LOW)
  // ====================================================
  Serial.println(" -> KICH HOAT: DigitalWrite LOW (Chan 4 & 5)");
  lcd.setCursor(0, 1);
  lcd.print("PUMP ON (LOW) ");
  
  digitalWrite(pumpCoca, LOW);
  digitalWrite(pumpPepsi, LOW);
  delay(3000); // Giữ trong 3 giây
}
