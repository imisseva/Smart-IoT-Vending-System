// FILE: esp.cpp
// Chạy trên ESP8266
// PHIÊN BẢN V8.6: Continuous Level Control (Dùng cảm biến laser VL53L0X + Lọc DSP)
//
// NGUYÊN TẮC HOẠT ĐỘNG CỰC KỲ ĐƠN GIẢN:
// - Khi cần bơm: ESP GIỮ chân tương ứng ở mức LOW suốt thời gian rót nước
// - Khi cần tắt: ESP ĐƯA chân về HIGH
// - Arduino Uno chỉ đọc mức và lái relay tương ứng, không có logic phức tạp
// - Khi cần nhả ly: ESP kéo CẢ HAI chân LOW trong 2 giây rồi trả về HIGH
//
// KẾT NỐI DÂY:
// - D1 (GPIO5) → Nối vào chân 7 Arduino Uno (Lệnh Coca)
// - D2 (GPIO4) → Nối vào chân 6 Arduino Uno (Lệnh Pepsi)
// - D5 (GPIO14) → Chân SDA của cảm biến laser VL53L0X
// - D6 (GPIO12) → Chân SCL của cảm biến laser VL53L0X
// - GND ESP8266 phải NỐI CHUNG với GND Arduino Uno
//

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <Adafruit_VL53L0X.h>

// Khai báo chân I2C tùy chỉnh cho ESP8266 (giữ nguyên dây cắm cũ)
#define SDA_PIN 14  // GPIO14 (Tương đương chân D5 trên NodeMCU)
#define SCL_PIN 12  // GPIO12 (Tương đương chân D6 trên NodeMCU)

Adafruit_VL53L0X sensor = Adafruit_VL53L0X();

float emptyDistance = 26.0;
const float CUP_THRESHOLD = 0.8;
bool isSensorReady = false;

// ============================================================
// Hàm đọc khoảng cách thô từ cảm biến laser VL53L0X (cm)
// ============================================================
float getRawDistance() {
  VL53L0X_RangingMeasurementData_t measure;
  sensor.rangingTest(&measure, false);
  
  // Chỉ lấy dữ liệu đo khi trạng thái hoàn hảo (RangeStatus == 0)
  if (measure.RangeStatus == 0) {
    float dist = (float)measure.RangeMilliMeter / 10.0; // Đổi sang cm
    return dist;
  }
  return -1.0; // Trả về lỗi đo
}

// Cấu hình chiều cao cột nước mục tiêu cho từng Size (tính theo cm dâng lên từ đáy ly)
const float TARGET_HEIGHT_S = 4.0;   // Size S dâng lên 4.0 cm
const float TARGET_HEIGHT_M = 6.5;   // Size M dâng lên 6.5 cm
const float TARGET_HEIGHT_L = 9.0;   // Size L dâng lên 9.0 cm

// Cấu hình thời gian bơm dự phòng (mili-giây) nếu cảm biến lỗi
const unsigned long PUMP_TIME_S = 8000;   // 8 giây cho size S
const unsigned long PUMP_TIME_M = 12000;  // 12 giây cho size M
const unsigned long PUMP_TIME_L = 16000;  // 16 giây cho size L
const float SAFE_MIN_DISTANCE = 4.5;      // Khoảng cách an toàn tối thiểu tránh tràn ly (cm)
const float MAX_PHYSICAL_DISTANCE = 35.0;

// Trạng thái rót nước thời gian thực
bool isDispensing = false;
unsigned long targetPourTime = 0; // Thời gian bơm mục tiêu dự phòng (ms)
float targetHeight = 0.0;        // Chiều cao nước mục tiêu của order hiện tại (cm)
float cupBaseDistance = 15.0;
float filteredDistance = 15.0;   // Khoảng cách đã lọc qua bộ lọc thông thấp (cm)
int currentActivePump = -1;
unsigned long lastDispensingMeasure = 0;
unsigned long lastDispensingReport = 0;
unsigned long pourStartTime = 0;
int consecutiveTargetCount = 0;
int consecutiveDangerCount = 0;
int consecutiveOutliers = 0;

// Điều khiển Arduino Uno (Dùng số hiệu GPIO trực tiếp để chống sai lệch Board Profile)
const int triggerCoca = 5;  // GPIO5 (Tương đương chân D1 trên NodeMCU) → Chân 7 Uno
const int triggerPepsi = 4; // GPIO4 (Tương đương chân D2 trên NodeMCU) → Chân 6 Uno

// Cấu hình mạng
const char* ssid = "11 Thanh Vinh 5 Tang 2";
const char* password = "11thanhvinh5";
const char* serverIP = "192.168.1.60"; 
const uint16_t serverPort = 5000;  

unsigned long lastPolling = 0;
unsigned long wifiDropTime = 0;
const int POLLING_INTERVAL = 1000;

// Hàm gửi báo cáo tiến trình rót nước lên backend
void guiBaoCaoRot(float dCurrent, float progress, String pourStatus) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    String statusUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/status";
    
    String jsonPayload = "{\"water_level\": " + String(dCurrent, 1) + 
                         ", \"is_cup_placed\": true" + 
                         ", \"dispensing_progress\": " + String(progress, 0);
    
    if (pourStatus != "") {
      jsonPayload += ", \"pour_status\": \"" + pourStatus + "\"";
    }
    jsonPayload += "}";

    int retries = (pourStatus == "DONE") ? 3 : 1;
    
    for (int i = 0; i < retries; i++) {
      http.begin(client, statusUrl);
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonPayload);
      
      Serial.print("[HTTP Status] Gui bao cao (Lan ");
      Serial.print(i + 1);
      Serial.print("/");
      Serial.print(retries);
      Serial.print("): ");
      Serial.print(jsonPayload);
      Serial.print(" -> Response Code: ");
      Serial.println(httpCode);
      
      if (httpCode > 0 && httpCode < 400) {
        http.end();
        break;
      } else {
        Serial.print("[HTTP Status] Loi: ");
        Serial.println(httpCode <= 0 ? http.errorToString(httpCode).c_str() : String(httpCode));
      }
      http.end();
      if (i < retries - 1) {
        delay(300); // Đợi 300ms trước khi thử lại
      }
    }
  } else {
    Serial.println("[HTTP Status] Loi: Mat ket noi WiFi, khong the gui bao cao!");
  }
}

// ============================================================
// Hàm BẬT BƠM: Chuyển chân sang OUTPUT và kéo LOW (Cơ chế Open-Drain)
// ============================================================
void batBom(int pumpPin) {
  currentActivePump = pumpPin;
  pinMode(currentActivePump, OUTPUT);
  digitalWrite(currentActivePump, LOW); // LOW = Active → Arduino bật relay
  Serial.print("[V8-OpenDrain] BAT BOM: Keo chan ");
  Serial.print(pumpPin == triggerCoca ? "GPIO5 (Coca)" : "GPIO4 (Pepsi)");
  Serial.println(" xuong LOW (OUTPUT)");
}

// ============================================================
// Hàm TẮT BƠM: Chuyển chân về INPUT (Trở kháng cao để Arduino tự kéo lên 5V)
// ============================================================
void tatBom(String reason) {
  pinMode(triggerCoca, INPUT);  // Trả về INPUT = Idle nhàn rỗi
  pinMode(triggerPepsi, INPUT);
  isDispensing = false;
  currentActivePump = -1;
  Serial.print("[V8.5-OpenDrain] TAT BOM (Ly do: ");
  Serial.print(reason);
  Serial.println("): Da tra tat ca chan ve INPUT (Trở kháng cao)");
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== ESP8266 V8.6-Sensor (VL53L0X + EMA + Rate Limiting) ===");

  // Khởi tạo I2C với chân tùy chỉnh
  Wire.begin(SDA_PIN, SCL_PIN);

  // Khởi động và kiểm tra cảm biến VL53L0X
  Serial.println("Dang kiem tra ket noi cam bien VL53L0X...");
  if (sensor.begin(0x29, false, &Wire)) {
    Serial.println("OK: Da ket noi va doc duoc tin hieu tu VL53L0X!");
    isSensorReady = true;
    Serial.print("Khoang cach khay trong: ");
    Serial.print(emptyDistance);
    Serial.println(" cm");
  } else {
    Serial.println("LOI: Khong tim thay hoac loi doc cam bien VL53L0X! He thong se tu dong chay che do du phong (Fallback).");
    isSensorReady = false;
  }
  
  // KHỞI TẠO CHÂN: Đưa về INPUT để Arduino kéo lên 5V nhàn rỗi an toàn (Open-Drain)
  pinMode(triggerCoca, INPUT);
  pinMode(triggerPepsi, INPUT);

  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA); 
  delay(100);

  Serial.println("Dang ket noi WiFi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi da ket noi!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long now = millis();

  // ============================================================
  // LUỒNG 1: ĐANG RÓT NƯỚC (ĐO TẦN SUẤT CAO 150ms ĐỂ TỰ NGẮT CHÍNH XÁC)
  // ============================================================
  if (isDispensing) {
    unsigned long elapsed = now - pourStartTime;
    
    // An toàn mạng: nếu mất WiFi > 5.0s khi đang rót → tắt bơm khẩn cấp
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiDropTime == 0) wifiDropTime = millis();
      if (millis() - wifiDropTime > 5000) {
        tatBom("Mat WiFi qua 5.0s");
        delay(150);
        guiBaoCaoRot(emptyDistance, 0.0, "DONE");
      }
      WiFi.reconnect();
      return;
    } else {
      wifiDropTime = 0;
    }

    // Tránh tràn ly tuyệt đối bằng Watchdog thời gian 20 giây
    if (elapsed >= 20000) {
      tatBom("Watchdog thoi gian 20s");
      delay(150);
      guiBaoCaoRot(emptyDistance, 100.0, "DONE");
      return;
    }

    if (now - lastDispensingMeasure >= 150) {
      lastDispensingMeasure = now;
      
      float distance = -1;
      bool readSuccess = false;

      if (isSensorReady) {
        float dist = getRawDistance();
        if (dist > 0.0) {
          // Giới hạn vật lý: khoảng cách không vượt quá khay trống + 2cm và phải lớn hơn 2cm
          if (dist > 2.0 && dist <= emptyDistance + 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
            // Tính độ lệch so với khoảng cách đã lọc trước đó
            float diff = dist - filteredDistance;
            
            // Bộ lọc tốc độ thay đổi (Rate-of-Change): 
            // Mặt nước dâng lên không thể nhảy đột biến quá 2.0 cm trong 150ms.
            // Nếu độ lệch > 2.0 cm, đây chắc chắn là nhiễu động (sóng sánh chất lỏng, bọt nước dâng lên...)
            if (abs(diff) <= 2.0) {
              // Bộ lọc thông thấp Exponential Moving Average (EMA)
              // Hệ số 0.35 giúp làm mịn bọt nước nhưng vẫn bám sát cực tốt mực nước thực
              filteredDistance = 0.35 * dist + 0.65 * filteredDistance;
              distance = filteredDistance;
              readSuccess = true;
              consecutiveOutliers = 0;
            } else {
              consecutiveOutliers++;
              Serial.print("[Nhiễu đột biến] Bỏ qua cú nhảy khoảng cách: ");
              Serial.print(dist, 1);
              Serial.print(" cm (Độ lệch: ");
              Serial.print(diff, 1);
              Serial.println(" cm)");

              // CƠ CHẾ TỰ KHÔI PHỤC (Latching Recovery):
              // Nếu gặp 5 lần nhảy khoảng cách liên tiếp, chấp nhận đây là khoảng cách thực tế mới
              // (Tránh kẹt bộ lọc khi mặt nước dâng lên nhanh hoặc người dùng rót nước thủ công tốc độ cao)
              if (consecutiveOutliers >= 5) {
                filteredDistance = dist;
                distance = filteredDistance;
                readSuccess = true;
                consecutiveOutliers = 0;
                Serial.println("[Bộ lọc] Đã tự khôi phục và cập nhật khoảng cách mới!");
              }
            }
          } else {
            consecutiveOutliers++;
            Serial.print("[Nhiễu giới hạn] Bỏ qua khoảng cách ngoài tầm vật lý: ");
            Serial.print(dist, 1);
            Serial.println(" cm");
          }
        } else {
          consecutiveOutliers++;
          Serial.println("[Cảm biến] Lỗi đọc tín hiệu laser (RangeStatus != 0)");
        }
      }

      // Xử lý khi cảm biến đo thành công
      if (readSuccess && distance > 0) {
        float hWater = cupBaseDistance - distance;
        if (hWater < 0) hWater = 0;
        
        float progress = (hWater / targetHeight) * 100.0;
        if (progress > 100.0) progress = 100.0;

        Serial.print("[Rot-Sensor] Mực nước: ");
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
          consecutiveTargetCount = 0;
          Serial.print("[Cảnh báo] Phát hiện nước sát cảm biến lần thứ: ");
          Serial.println(consecutiveDangerCount);
        } else if (isTargetReached) {
          consecutiveTargetCount++;
          consecutiveDangerCount = 0;
          Serial.print("[Cảnh báo] Đạt mực nước mục tiêu lần thứ: ");
          Serial.println(consecutiveTargetCount);
        } else {
          consecutiveDangerCount = 0;
          consecutiveTargetCount = 0;
        }

        // Tự động ngắt khi có 1 lần xác nhận đạt đích hoặc 2 lần chạm ngưỡng nguy hiểm (Phản hồi siêu tốc)
        if (consecutiveTargetCount >= 1 || consecutiveDangerCount >= 2) {
          String reason = (consecutiveTargetCount >= 1) ? "Dat muc nuoc muc tieu" : "Chong tran ly (sat cam bien)";
          tatBom(reason);
          delay(150); // Cho phép nguồn điện và nhiễu sóng ổn định sau khi ngắt bơm
          guiBaoCaoRot(distance, 100.0, "DONE");
        } 
        // Báo cáo tiến trình định kỳ mỗi 1000ms (giảm tải cho WiFi stack)
        else if (now - lastDispensingReport >= 1000) {
          lastDispensingReport = now;
          guiBaoCaoRot(distance, progress, "");
        }
      }
      // CHẾ ĐỘ DỰ PHÒNG (FALLBACK TIMER):
      // Nếu cảm biến bị lỗi vật lý/nhiễu liên tục quá 30 lần (~4.5 giây), hoặc cảm biến hỏng ngay từ đầu
      else if (!isSensorReady || consecutiveOutliers >= 30) {
        float timeProgress = ((float)elapsed / (float)targetPourTime) * 100.0;
        if (timeProgress > 100.0) timeProgress = 100.0;

        Serial.print("[Rot-FALLBACK-Timer] Thời gian: ");
        Serial.print(elapsed / 1000.0, 1);
        Serial.print("/");
        Serial.print(targetPourTime / 1000.0, 1);
        Serial.print("s | Tiến trình: ");
        Serial.print(timeProgress, 0);
        Serial.println("% (Cảm biến lỗi/mất tín hiệu)");

        if (elapsed >= targetPourTime) {
          tatBom("Hoan thanh theo thoi gian du phong (Fallback)");
          delay(150); // Cho phép nguồn điện và nhiễu sóng ổn định sau khi ngắt bơm
          guiBaoCaoRot(emptyDistance, 100.0, "DONE");
        } else if (now - lastDispensingReport >= 1000) {
          lastDispensingReport = now;
          guiBaoCaoRot(emptyDistance, timeProgress, "");
        }
      }
    }

    return; // Thoát sớm loop để dành trọn tài nguyên cho chu kỳ rót nước tốc độ cao
  }

  // ============================================================
  // LUỒNG 2: CHỜ LỆNH — Polling backend mỗi 1 giây
  // ============================================================
  if (now - lastPolling >= POLLING_INTERVAL) {
    lastPolling = now;

    // Đo cảm biến khi chờ
    float distance = -1;
    if (isSensorReady) {
      float dist = getRawDistance();
      if (dist > 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
        distance = dist;
        Serial.print("[Sensor-Idle] Khoang cach: ");
        Serial.print(distance, 1);
        Serial.print(" cm | Phat hien ly: ");
        Serial.println(distance <= 25.0 ? "CO LY" : "KHONG LY");
      } else {
        Serial.println("[Sensor-Idle] Canh bao: Cam bien doc loi hoac ngoai tam vat ly!");
      }
    }

    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient client;
      HTTPClient http;
      
      // Gửi trạng thái cảm biến lên server
      if (distance != -1) {
        bool isCupPlaced = (distance <= 25.0 && distance > 0);
        String cupPlacedStr = isCupPlaced ? "true" : "false";

        String statusUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/status";
        http.begin(client, statusUrl);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"water_level\": " + String(distance) + ", \"is_cup_placed\": " + cupPlacedStr + "}");
        http.end();
      }

      // Lấy lệnh từ backend
      String cmdUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/command";
      http.begin(client, cmdUrl);
      int httpCode = http.GET();
      
      if (httpCode == 200) {  // Chỉ lọc và xử lý khi HTTP Code = 200 OK
        String payload = http.getString();
        payload.trim(); 

        // LỆNH RÓT NƯỚC (Ví dụ: POUR_COCA_S, POUR_PEPSI_M, v.v.)
        if (payload.startsWith("POUR_COCA_") || payload.startsWith("POUR_PEPSI_")) {
          Serial.print("=== NHẬN LỆNH RÓT: ");
          Serial.println(payload);

          // Gửi ACK ngay để backend xóa lệnh
          guiBaoCaoRot(distance != -1 ? distance : emptyDistance, 0.0, "ACK");

          // Xác định bơm
          int pumpPin = payload.startsWith("POUR_COCA_") ? triggerCoca : triggerPepsi;
          
          // Xác định size, targetHeight và thời gian dự phòng (targetPourTime)
          char sizeChar = payload.charAt(payload.length() - 1);
          if (sizeChar == 'S') {
            targetHeight = TARGET_HEIGHT_S;
            targetPourTime = PUMP_TIME_S;
          } else if (sizeChar == 'L') {
            targetHeight = TARGET_HEIGHT_L;
            targetPourTime = PUMP_TIME_L;
          } else { // Size M hoặc mặc định
            targetHeight = TARGET_HEIGHT_M;
            targetPourTime = PUMP_TIME_M;
          }

          // Tự động hiệu chuẩn đáy ly trước khi rót (đo trung bình nhanh 3 lần)
          Serial.println("Đang đo tự động hiệu chuẩn đáy ly trước khi rót...");
          float sum = 0;
          int validSamples = 0;
          for (int i = 0; i < 3; i++) {
            float dist = getRawDistance();
            if (dist > 2.0 && dist <= emptyDistance + 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
              sum += dist;
              validSamples++;
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
          Serial.print(" cm | Thời gian dự phòng: ");
          Serial.print(targetPourTime / 1000.0, 1);
          Serial.println(" giây");

          // Bật bơm vật lý và chuyển sang luồng rót nước
          isDispensing = true;
          batBom(pumpPin);
          pourStartTime = millis();
          lastDispensingMeasure = millis();
          lastDispensingReport = 0;
          filteredDistance = cupBaseDistance; // Khởi tạo bằng khoảng cách đáy cốc
          consecutiveTargetCount = 0;
          consecutiveDangerCount = 0;
          consecutiveOutliers = 0;
        } 
        // LỆNH NHẢ LY
        else if (payload == "DROP_CUP") {
          Serial.println("=== NHẬN LỆNH NHẢ LY ===");
          guiBaoCaoRot(distance != -1 ? distance : emptyDistance, 0.0, "ACK");
          
          // Kéo cả 2 chân xuống LOW (OUTPUT) để kích hoạt nhả ly (Open-Drain)
          pinMode(triggerCoca, OUTPUT);
          digitalWrite(triggerCoca, LOW);
          pinMode(triggerPepsi, OUTPUT);
          digitalWrite(triggerPepsi, LOW);
          
          delay(2500);
          
          // Trả về INPUT (Idle) để nhả tín hiệu
          pinMode(triggerCoca, INPUT);
          pinMode(triggerPepsi, INPUT);
          Serial.println("=== ĐÃ GỬI LỆNH NHẢ LY XONG ===");
        }
        // STOP hoặc lệnh không xác định → ĐƯA VỀ INPUT (Idle nhàn rỗi)
        else {
          pinMode(triggerCoca, INPUT);
          pinMode(triggerPepsi, INPUT);
        }
      }
      http.end();
      wifiDropTime = 0;
    } else {
      if (wifiDropTime == 0) {
        wifiDropTime = millis();
      }
      // Mất WiFi: đưa về INPUT (an toàn tuyệt đối)
      if (millis() - wifiDropTime > 2000) {
        pinMode(triggerCoca, INPUT);
        pinMode(triggerPepsi, INPUT);
      }
      WiFi.reconnect();
    }
  }
}