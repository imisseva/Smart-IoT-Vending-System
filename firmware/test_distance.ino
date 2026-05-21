// FILE: test_distance.ino
// Chương trình kiểm tra khoảng cách độc lập từ cảm biến VL53L0X tới ly nước.
// Code chạy trên ESP8266 (chân D5, D6 tùy chỉnh) hoặc trên Arduino Uno (chân A4, A5 mặc định).

#include <Wire.h>
#include <Adafruit_VL53L0X.h>

Adafruit_VL53L0X sensor = Adafruit_VL53L0X();

// ==========================================
// CẤU HÌNH LOẠI BOARD SỬ DỤNG
// ==========================================
#define RUN_ON_ESP8266 true  // Đặt true nếu chạy trên ESP8266, đặt false nếu chạy trên Arduino Uno

// Chân I2C tùy chỉnh cho ESP8266
#define SDA_PIN D5  // GPIO14
#define SCL_PIN D6  // GPIO12

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println("=== CHƯƠNG TRÌNH ĐO KHOẢNG CÁCH SENSOR VL53L0X ===");
  Serial.println("==============================================");

  // 1. Khởi tạo giao tiếp I2C
  if (RUN_ON_ESP8266) {
    Serial.println("Cấu hình chạy trên ESP8266 (SDA -> D5, SCL -> D6)...");
    Wire.begin(SDA_PIN, SCL_PIN);
  } else {
    Serial.println("Cấu hình chạy trên Arduino Uno (SDA -> A4, SCL -> A5)...");
    Wire.begin(); // Sử dụng chân mặc định A4, A5 của Uno
  }

  // 2. Khởi động cảm biến VL53L0X
  if (!sensor.begin(0x29, false, &Wire)) {
    Serial.println("LỖI: Không tìm thấy cảm biến VL53L0X!");
    Serial.println("Vui lòng kiểm tra lại dây nối nguồn và giao tiếp I2C.");
    while (1); // Dừng chương trình nếu lỗi
  }

  Serial.println("OK: Đã kết nối cảm biến VL53L0X thành công!");
  Serial.println("Đang bắt đầu đo liên tục sau mỗi 500ms...\n");
}

void loop() {
  VL53L0X_RangingMeasurementData_t measure;
  
  // Thực hiện phép đo khoảng cách
  sensor.rangingTest(&measure, false); 

  if (measure.RangeStatus != 4) { // Trạng thái đo hợp lệ (không bị quá tầm đo)
    float distanceMm = measure.RangeMilliMeter;
    float distanceCm = distanceMm / 10.0;

    Serial.print("Khoảng cách: ");
    Serial.print(distanceCm, 1);
    Serial.print(" cm  ( hoặc ");
    Serial.print(distanceMm, 0);
    Serial.println(" mm )");
  } 
  else {
    Serial.println("CẢNH BÁO: Ngoài tầm đo (Out of range) hoặc cảm biến bị che khuất!");
  }

  delay(500); // Đo sau mỗi 500ms
}
