// FILE: vl53l0x_test.cpp
// MỤC ĐÍCH: Test cảm biến VL53L0X trên ESP8266 (Standalone - không dùng WiFi)
// ĐẤU DÂY:
//   VL53L0X VIN  → ESP8266 3.3V  ⚠️ KHÔNG CẮM VÀO 5V!
//   VL53L0X GND  → ESP8266 GND
//   VL53L0X SDA  → ESP8266 D5 (GPIO14)
//   VL53L0X SCL  → ESP8266 D6 (GPIO12)
//
// THƯ VIỆN CẦN CÀI:
//   Arduino IDE → Manage Libraries → "Adafruit VL53L0X" → Install

#include <Wire.h>
#include <Adafruit_VL53L0X.h>

// Khai báo chân I2C tùy chỉnh cho ESP8266
#define SDA_PIN D5  // GPIO14
#define SCL_PIN D6  // GPIO12

Adafruit_VL53L0X sensor = Adafruit_VL53L0X();

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== TEST VL53L0X TREN ESP8266 ===");
  Serial.println("SDA: D5 (GPIO14), SCL: D6 (GPIO12)");

  // Khởi tạo I2C với chân tùy chỉnh
  Wire.begin(SDA_PIN, SCL_PIN);

  // Khởi động cảm biến VL53L0X
  if (!sensor.begin(0x29, false, &Wire)) {
    Serial.println("LOI: Khong tim thay VL53L0X!");
    Serial.println("Kiem tra lai day SDA/SCL va nguon 3.3V");
    while (1) {
      delay(500);
      Serial.print(".");
    }
  }

  Serial.println("OK: Da ket noi VL53L0X thanh cong!");
  Serial.println("Bat dau do khoang cach...\n");
}

void loop() {
  VL53L0X_RangingMeasurementData_t measure;

  // Lấy kết quả đo
  sensor.rangingTest(&measure, false);

  if (measure.RangeStatus != 4) { // 4 = out of range (ngoài tầm)
    int distance_mm = measure.RangeMilliMeter;
    float distance_cm = distance_mm / 10.0;

    Serial.print("Khoang cach: ");
    Serial.print(distance_mm);
    Serial.print(" mm  =  ");
    Serial.print(distance_cm, 1);
    Serial.println(" cm");
  } else {
    Serial.println("Ngoai tam do! (> 200cm hoac bi che)");
  }

  delay(500); // Đo 2 lần/giây
}
