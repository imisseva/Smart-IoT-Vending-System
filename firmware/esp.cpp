// FILE: esp.cpp
// Chạy trên ESP8266
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <Adafruit_VL53L0X.h>

// Chân I2C tùy chỉnh cho VL53L0X (trùng chân cảm biến cũ để giữ nguyên vị trí nối dây)
#define SDA_PIN D5  // GPIO14 (Trùng Trig cũ)
#define SCL_PIN D6  // GPIO12 (Trùng Echo cũ)

Adafruit_VL53L0X sensor = Adafruit_VL53L0X();
float emptyDistance = 26.0; // Khoảng cách khay trống thực tế đo được (cm)
const float CUP_THRESHOLD = 0.8; // Ngưỡng hụt khoảng cách tối thiểu để xác nhận có ly (0.8 cm cho ly mỏng)
bool isSensorReady = false; // Cờ lưu trạng thái kết nối cảm biến

// Cấu hình chiều cao cột nước mục tiêu cho từng Size (tính theo cm dâng lên từ đáy ly)
const float TARGET_HEIGHT_S = 4.0;   // Size S dâng lên 4.0 cm
const float TARGET_HEIGHT_M = 6.5;   // Size M dâng lên 6.5 cm
const float TARGET_HEIGHT_L = 9.0;   // Size L dâng lên 9.0 cm
const float SAFE_MIN_DISTANCE = 4.5; // Khoảng cách an toàn tối thiểu tới cảm biến để tránh tràn ly (cm)
const float MAX_PHYSICAL_DISTANCE = 35.0; // Khoảng cách tối đa vật lý từ cảm biến tới khay hứng (cm)

// Quản lý trạng thái rót nước thời gian thực
bool isDispensing = false;            // Cờ báo hiệu đang trong chu trình rót nước
float targetHeight = 0;               // Chiều cao nước mục tiêu của order hiện tại (cm)
float cupBaseDistance = 15.0;         // Khoảng cách tới đáy cốc rỗng (cm)
float minDistanceMeasured = 100.0;    // Khoảng cách nhỏ nhất đo được trong chu kỳ rót hiện tại (cm)
int currentActivePump = -1;           // Chân trigger bơm đang hoạt động
unsigned long lastDispensingMeasure = 0; // Thời điểm đo mực nước gần nhất
unsigned long lastDispensingReport = 0;  // Thời điểm gửi report gần nhất
int consecutiveTargetCount = 0;       // Đếm số lần liên tiếp đạt mực nước mục tiêu
int consecutiveDangerCount = 0;       // Đếm số lần liên tiếp quá sát cảm biến (nguy hiểm)

// Điều khiển Arduino Uno
const int triggerCoca = D1;  // Nối vào chân 7 Uno
const int triggerPepsi = D2; // Nối vào chân 6 Uno

// Cấu hình mạng
const char* ssid = "11 Thanh Vinh 5 Tang 2";
const char* password = "11thanhvinh5";
const char* serverIP = "192.168.1.156"; 
const uint16_t serverPort = 5000;  

unsigned long lastPolling = 0;
unsigned long wifiDropTime = 0;
const int POLLING_INTERVAL = 1000; // Gọi API mỗi 1 giây để phản hồi lập tức

// Hàm hỗ trợ gửi báo cáo tiến trình rót nước lên backend
void guiBaoCaoRot(float dCurrent, float progress, String pourStatus) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    String statusUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/status";
    http.begin(client, statusUrl);
    http.addHeader("Content-Type", "application/json");
    
    String isCupPlacedStr = "true";
    String jsonPayload = "{\"water_level\": " + String(dCurrent, 1) + 
                         ", \"is_cup_placed\": " + isCupPlacedStr + 
                         ", \"dispensing_progress\": " + String(progress, 0);
    
    if (pourStatus != "") {
      jsonPayload += ", \"pour_status\": \"" + pourStatus + "\"";
    }
    jsonPayload += "}";

    http.POST(jsonPayload);
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000); // Chờ 2 giây để Serial Monitor của máy tính kịp mở và kết nối ổn định
  Serial.println("\n=== KHOI DONG ESP8266 VOI VL53L0X ===");

  // Khởi tạo I2C với chân tùy chỉnh
  Wire.begin(SDA_PIN, SCL_PIN);

  // Khởi động cảm biến VL53L0X
  if (!sensor.begin(0x29, false, &Wire)) {
    Serial.println("LOI KHAN CAP: Khong tim thay VL53L0X!");
    Serial.println("Kiem tra day nguon 3.3V va cac chan D5 (SDA), D6 (SCL)");
    isSensorReady = false;
  } else {
    Serial.println("OK: Da ket noi VL53L0X thanh cong!");
    isSensorReady = true;

    // SỬ DỤNG KHOẢNG CÁCH KHAY TRỐNG CỐ ĐỊNH THỰC TẾ
    Serial.print("Sử dụng khoảng cách khay trống cố định thực tế: ");
    Serial.print(emptyDistance);
    Serial.println(" cm");
  }
  
  pinMode(triggerCoca, OUTPUT);
  pinMode(triggerPepsi, OUTPUT);
  digitalWrite(triggerCoca, LOW); 
  digitalWrite(triggerPepsi, LOW);

  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA); 
  delay(100);

  Serial.println("\nĐang kết nối WiFi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi đã kết nối!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long now = millis();

  // LUỒNG 1: ĐANG RÓT NƯỚC (ĐO TẦN SUẤT CAO 150ms ĐỂ TỰ NGẮT TỨC THÌ)
  if (isDispensing) {
    if (now - lastDispensingMeasure >= 150) {
      lastDispensingMeasure = now;
      
      float distance = -1;
      if (isSensorReady) {
        VL53L0X_RangingMeasurementData_t measure;
        sensor.rangingTest(&measure, false);
        if (measure.RangeStatus != 4) {
          float dist = measure.RangeMilliMeter / 10.0; // cm
          if (dist <= cupBaseDistance + 0.5 && dist <= MAX_PHYSICAL_DISTANCE) {
            // Chỉ chấp nhận nếu khoảng cách không lớn hơn minDistanceMeasured quá 0.5 cm (chống nhiễu nhảy ngược)
            if (dist <= minDistanceMeasured + 0.5) {
              if (dist < minDistanceMeasured) {
                minDistanceMeasured = dist;
              }
              distance = minDistanceMeasured;
            } else {
              Serial.print("[Nhiễu bọt] Bỏ qua khoảng cách tăng đột ngột: ");
              Serial.print(dist);
              Serial.println(" cm");
            }
          } else {
            Serial.print("[Nhiễu phản xạ] Bỏ qua khoảng cách bất thường: ");
            Serial.print(dist);
            Serial.println(" cm");
          }
        }
      }

      if (distance > 0) {
        float hWater = cupBaseDistance - distance;
        if (hWater < 0) hWater = 0;
        
        float progress = (hWater / targetHeight) * 100.0;
        if (progress > 100.0) progress = 100.0;

        Serial.print("[Đang rót] Mực nước: ");
        Serial.print(hWater, 1);
        Serial.print(" cm / ");
        Serial.print(targetHeight, 1);
        Serial.print(" cm | Khoảng cách: ");
        Serial.print(distance, 1);
        Serial.print(" cm | Tiến trình: ");
        Serial.print(progress, 0);
        Serial.println("%");

        // KIỂM TRA ĐIỀU KIỆN NGẮT AN TOÀN
        bool isDanger = (distance <= SAFE_MIN_DISTANCE);
        bool isTargetReached = (hWater >= targetHeight);

        if (isDanger) {
          consecutiveDangerCount++;
          consecutiveTargetCount = 0; // Reset bộ đếm đạt mục tiêu
          Serial.print("[Cảnh báo] Phát hiện nước sát cảm biến lần thứ: ");
          Serial.println(consecutiveDangerCount);
        } else if (isTargetReached) {
          consecutiveTargetCount++;
          consecutiveDangerCount = 0; // Reset bộ đếm khẩn cấp
          Serial.print("[Cảnh báo] Đạt mực nước mục tiêu lần thứ: ");
          Serial.println(consecutiveTargetCount);
        } else {
          consecutiveDangerCount = 0;
          consecutiveTargetCount = 0;
        }

        if (consecutiveTargetCount >= 3 || consecutiveDangerCount >= 3) {
          // 1. Tắt bơm lập tức trước để đảm bảo an toàn tuyệt đối
          digitalWrite(currentActivePump, LOW);
          isDispensing = false;
          
          String reason = (consecutiveTargetCount >= 3) ? "Đã đạt mực nước mục tiêu (Xác nhận 3 lần)!" : "Ngắt khẩn cấp chống tràn ly (Xác nhận 3 lần)!";
          Serial.print("=== NGẮT BƠM AN TOÀN: ");
          Serial.println(reason);

          // 2. Gửi báo cáo hoàn tất lên Server để đổi trạng thái đơn hàng thành Done
          guiBaoCaoRot(distance, 100.0, "DONE");
          currentActivePump = -1;
        } 
        // Nếu chưa đạt mục tiêu, gửi report tiến trình lên Web App mỗi 300ms
        else if (now - lastDispensingReport >= 300) {
          lastDispensingReport = now;
          guiBaoCaoRot(distance, progress, "");
        }
      }
    }
    
    // Đảm bảo an toàn mạng trong lúc đang rót
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiDropTime == 0) wifiDropTime = millis();
      // Nếu mất mạng quá 1.5 giây trong lúc rót, tắt bơm ngay để đảm bảo an toàn
      if (millis() - wifiDropTime > 1500) {
        digitalWrite(triggerCoca, LOW);
        digitalWrite(triggerPepsi, LOW);
        isDispensing = false;
        currentActivePump = -1;
        Serial.println("NGẮT BƠM KHẨN CẤP: Rớt mạng WiFi quá 1.5s khi đang rót!");
      }
      WiFi.reconnect();
    } else {
      wifiDropTime = 0;
    }
    
    return; // Thoát sớm loop để dành trọn tài nguyên cho chu kỳ rót nước tốc độ cao
  }

  // LUỒNG 2: THỜI GIAN CHỜ (POLLING LẤY LỆNH VÀ KIỂM TRA CỐC MỖI 1 GIÂY)
  if (now - lastPolling >= POLLING_INTERVAL) {
    lastPolling = now;

    float distance = -1;
    if (isSensorReady) {
      VL53L0X_RangingMeasurementData_t measure;
      sensor.rangingTest(&measure, false);
      
      if (measure.RangeStatus != 4) {
        float dist = measure.RangeMilliMeter / 10.0; // Đổi từ mm sang cm
        if (dist <= MAX_PHYSICAL_DISTANCE) {
          distance = dist;
          Serial.print("Cảm biến VL53L0X -> Khoảng cách: ");
          Serial.print(distance);
          Serial.println(" cm");
        } else {
          Serial.print("Cảm biến VL53L0X -> Bỏ qua khoảng cách nhiễu: ");
          Serial.print(dist);
          Serial.println(" cm");
        }
      } else {
        Serial.println("Cảm biến VL53L0X -> LỖI: Ngoài tầm đo!");
      }
    } else {
      Serial.println("Cảm biến VL53L0X -> LỖI: Cảm biến chưa được kết nối vật lý thành công!");
    }

    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient client;
      HTTPClient http;
      
      // A. GỬI MỰC NƯỚC VÀ TRẠNG THÁI ĐẶT CỐC LÊN SERVER (POST)
      if (distance != -1) {
        bool isCupPlaced = (distance <= 25.9 && distance > 0);
        String cupPlacedStr = isCupPlaced ? "true" : "false";

        String statusUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/status";
        http.begin(client, statusUrl);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"water_level\": " + String(distance) + ", \"is_cup_placed\": " + cupPlacedStr + "}");
        http.end();
      }

      // B. LẤY LỆNH ĐIỀU KHIỂN TỪ BACKEND (GET)
      String cmdUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/command";
      http.begin(client, cmdUrl);
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        String payload = http.getString();
        payload.trim(); 

        // Kiểm tra lệnh rót nước chi tiết kèm size từ backend (Ví dụ: POUR_COCA_M, POUR_PEPSI_S)
        if (payload.startsWith("POUR_COCA_") || payload.startsWith("POUR_PEPSI_")) {
          Serial.print("=== NHẬN LỆNH RÓT KÈM SIZE: ");
          Serial.println(payload);

          // 1. Phân biệt chân kích hoạt bơm
          int pumpPin = payload.startsWith("POUR_COCA_") ? triggerCoca : triggerPepsi;
          
          // 2. Xác định chiều cao cột nước mục tiêu dựa trên size ký tự cuối cùng
          char sizeChar = payload.charAt(payload.length() - 1);
          if (sizeChar == 'S') targetHeight = TARGET_HEIGHT_S;
          else if (sizeChar == 'L') targetHeight = TARGET_HEIGHT_L;
          else targetHeight = TARGET_HEIGHT_M; // Mặc định là size M

          // 3. Tự động lấy mẫu đo xác định đáy cốc (đo trung bình nhanh 3 lần)
          Serial.println("Đang đo tự động hiệu chuẩn đáy ly trước khi rót...");
          float sum = 0;
          int validSamples = 0;
          for (int i = 0; i < 3; i++) {
            VL53L0X_RangingMeasurementData_t measure;
            sensor.rangingTest(&measure, false);
            if (measure.RangeStatus != 4) {
              float dist = measure.RangeMilliMeter / 10.0;
              if (dist <= emptyDistance + 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
                sum += dist;
                validSamples++;
              }
            }
            delay(50);
          }
          
          if (validSamples > 0) {
            cupBaseDistance = sum / validSamples;
          } else {
            cupBaseDistance = (distance > 0 && distance <= MAX_PHYSICAL_DISTANCE) ? distance : emptyDistance; 
          }

          Serial.print("► Đáy ly đo được: ");
          Serial.print(cupBaseDistance);
          Serial.print(" cm | Chiều cao nước mục tiêu: ");
          Serial.print(targetHeight);
          Serial.println(" cm");

          // 4. Bật bơm vật lý và chuyển sang luồng rót nước
          currentActivePump = pumpPin;
          digitalWrite(currentActivePump, HIGH);
          isDispensing = true;
          lastDispensingMeasure = millis();
          lastDispensingReport = 0;
          minDistanceMeasured = cupBaseDistance; // Khởi tạo bằng khoảng cách đáy cốc
          consecutiveTargetCount = 0;
          consecutiveDangerCount = 0;
        } 
        else if (payload == "DROP_CUP") {
          Serial.println("=== NHẬN LỆNH LẤY LY ===");
          digitalWrite(triggerCoca, HIGH);
          digitalWrite(triggerPepsi, HIGH); // Bật cả 2 chân để Uno nhận diện lệnh nhả ly
          delay(2000);                      // Giữ tín hiệu trong 2 giây
          digitalWrite(triggerCoca, LOW);
          digitalWrite(triggerPepsi, LOW);  // Tắt cả 2 chân về trạng thái bình thường
          Serial.println("=== ĐÃ GỬI LỆNH NHẢ LY XONG ===");
        }
        else { // "STOP" hoặc các lệnh không xác định
          digitalWrite(triggerCoca, LOW);
          digitalWrite(triggerPepsi, LOW);
        }
      }
      http.end();
      wifiDropTime = 0; // Reset bộ đếm khi WiFi ổn định
    } else {
      if (wifiDropTime == 0) {
        wifiDropTime = millis();
      }
      if (millis() - wifiDropTime > 2000) {
        digitalWrite(triggerCoca, LOW);
        digitalWrite(triggerPepsi, LOW);
      }
      WiFi.reconnect();
    }
  }
}