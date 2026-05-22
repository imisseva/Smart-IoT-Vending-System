// FILE: esp.cpp
// Chạy trên ESP8266
// PHIÊN BẢN V9.0: Giao tiếp 100% qua WebSockets (Socket.IO v4 Protocol)
// Kế thừa: Thuật toán đo khoảng cách laser VL53L0X + Bộ lọc DSP EMA + Khôi phục Latching
//
// NGUYÊN TẮC HOẠT ĐỘNG:
// - Kết nối WebSocket hai chiều thời gian thực đến Backend (Express + Socket.IO) cổng 5000.
// - Lắng nghe lệnh trực tiếp qua sự kiện "machine_command" (POUR_COCA_M, POUR_PEPSI_S, DROP_CUP, STOP).
// - Phát trạng thái cảm biến liên tục qua sự kiện "machine_sensor" (Không còn dùng HTTP Polling).
// - Duy trì kết nối bằng cơ chế bắt tay Engine.IO v4 và Ping-Pong Heartbeat tự động.
//
// KẾT NỐI DÂY:
// - D1 (GPIO5) → Nối vào chân 10 Arduino Uno (Lệnh Coca)
// - D2 (GPIO4) → Nối vào chân 6 Arduino Uno (Lệnh Pepsi)
// - D5 (GPIO14) → Chân SDA của cảm biến laser VL53L0X
// - D6 (GPIO12) → Chân SCL của cảm biến laser VL53L0X
// - GND ESP8266 phải NỐI CHUNG với GND Arduino Uno
//

#include <ESP8266WiFi.h>
#include <WebSocketsClient.h> // Thư viện Markus Sattler (cực kỳ nhẹ, hoạt động ở tầng TCP Socket thô)
#include <Wire.h>
#include <Adafruit_VL53L0X.h>

// Khai báo chân I2C tùy chỉnh cho ESP8266 (giữ nguyên dây cắm cũ)
#define SDA_PIN 14  // GPIO14 (Tương đương chân D5 trên NodeMCU)
#define SCL_PIN 12  // GPIO12 (Tương đương chân D6 trên NodeMCU)

Adafruit_VL53L0X sensor = Adafruit_VL53L0X();
WebSocketsClient webSocket;

float emptyDistance = 26.0;
const float CUP_THRESHOLD = 0.8;
bool isSensorReady = false;

// ============================================================
// Hàm đọc khoảng cách thô từ cảm biến laser VL53L0X (cm)
// ============================================================
float getRawDistance() {
  VL53L0X_RangingMeasurementData_t measure;
  sensor.rangingTest(&measure, false);
  
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

// Trạng thái nhả ly phi tuần tự (Non-blocking)
bool isDropCupActive = false;
unsigned long dropCupStartTime = 0;

// Điều khiển Arduino Uno
const int triggerCoca = 5;  // GPIO5 (D1) → Chân 10 Uno
const int triggerPepsi = 4; // GPIO4 (D2) → Chân 6 Uno

// ============================================================
// CHẾ ĐỘ HOẠT ĐỘNG: ĐẶT 1 ĐỂ CHẠY CLOUD (RENDER), ĐẶT 0 ĐỂ CHẠY LOCAL (LAN)
// ============================================================
#define USE_CLOUD 1 

// Cấu hình mạng & Server
const char* ssid = "11 Thanh Vinh 5 Tang 2";
const char* password = "11thanhvinh5";

#if USE_CLOUD
const char* serverHost = "water-pouring.onrender.com";
const uint16_t serverPort = 443;
#else
const char* serverIP = "192.168.1.119"; 
const uint16_t serverPort = 5000;  
#endif

unsigned long lastSensorIdleReport = 0;
unsigned long wifiDropTime = 0;
const int IDLE_REPORT_INTERVAL = 1000; // Gửi báo cáo định kỳ khi rỗi mỗi 1 giây

void xuLyLenh(String command);

// ============================================================
// Gửi dữ liệu cảm biến thời gian thực lên Server qua WebSocket
// Định dạng: 42["machine_sensor", { ...json... }]
// ============================================================
void guiBaoCaoRotWebSocket(float dCurrent, float progress, String pourStatus) {
  // Xác định xem cốc có đang được đặt hay không
  bool isCupPlaced = (dCurrent <= 25.0 && dCurrent > 0);
  String cupPlacedStr = isCupPlaced ? "true" : "false";

  String statusPart = "";
  if (pourStatus != "") {
    statusPart = ", \"pour_status\": \"" + pourStatus + "\"";
  }

  // Đóng gói chuỗi sự kiện Socket.IO v4
  String payload = "42[\"machine_sensor\",{\"water_level\": " + String(dCurrent, 1) + 
                   ", \"is_cup_placed\": " + cupPlacedStr + 
                   ", \"dispensing_progress\": " + String(progress, 0) + 
                   statusPart + "}]";

  Serial.print("[WebSocket Send] ");
  Serial.println(payload);

  webSocket.sendTXT(payload);
}

// ============================================================
// Hàm BẬT BƠM (Open-Drain)
// ============================================================
void batBom(int pumpPin) {
  currentActivePump = pumpPin;
  pinMode(currentActivePump, OUTPUT);
  digitalWrite(currentActivePump, LOW); // LOW = Active
  Serial.print("[V9-OpenDrain] BAT BOM: Keo chan ");
  Serial.print(pumpPin == triggerCoca ? "GPIO5 (Coca)" : "GPIO4 (Pepsi)");
  Serial.println(" xuong LOW");
}

// ============================================================
// Hàm TẮT BƠM (Open-Drain Trở kháng cao)
// ============================================================
void tatBom(String reason) {
  pinMode(triggerCoca, INPUT); 
  pinMode(triggerPepsi, INPUT);
  isDispensing = false;
  currentActivePump = -1;
  Serial.print("[V9-OpenDrain] TAT BOM (Ly do: ");
  Serial.print(reason);
  Serial.println("): Da dua cac chan ve INPUT (Trở kháng cao)");
}

// ============================================================
// Bộ xử lý sự kiện WebSocket (WebSocket Event Handler)
// ============================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WebSocket] Mat ket noi voi Server! Dang tu dong ket noi lai...");
      break;

    case WStype_CONNECTED:
      Serial.println("[WebSocket] Da ket noi vat ly den Server. Cho Engine.IO Handshake...");
      break;

    case WStype_TEXT:
      {
        String text = String((char*)payload);
        
        // Bỏ qua log Ping/Pong để tránh rác log serial
        if (text != "2" && text != "3") {
          Serial.printf("[WebSocket Received] %s\n", text.c_str());
        }

        // 1. Engine.IO Open Packet ('0') -> Trả lời ngay Socket.IO Connect ('40')
        if (text.startsWith("0")) {
          Serial.println("[WebSocket] Nhan Handshake tu Engine.IO. Gui Connect Packet '40'...");
          webSocket.sendTXT("40");
        }

        // 2. Engine.IO Ping ('2') -> Trả lời ngay Pong ('3') để giữ kết nối
        else if (text == "2") {
          webSocket.sendTXT("3");
        }

        // 3. Socket.IO Event Packet ('42')
        else if (text.startsWith("42")) {
          // Lọc sự kiện "machine_command"
          int firstQuote = text.indexOf('"');
          int secondQuote = text.indexOf('"', firstQuote + 1);
          if (firstQuote != -1 && secondQuote != -1) {
            String eventName = text.substring(firstQuote + 1, secondQuote);
            if (eventName == "machine_command") {
              // Lấy nội dung lệnh (nằm trong cặp nháy kép tiếp theo của mảng JSON)
              int payloadStart = text.indexOf('"', secondQuote + 1);
              int payloadEnd = text.indexOf('"', payloadStart + 1);
              if (payloadStart != -1 && payloadEnd != -1) {
                String command = text.substring(payloadStart + 1, payloadEnd);
                Serial.print("[WebSocket] Nhan lenh tu Server: ");
                Serial.println(command);
                
                xuLyLenh(command);
              }
            }
          }
        }
      }
      break;

    case WStype_BIN:
      break;
    
    default:
      break;
  }
}

// ============================================================
// Bộ xử lý thực thi lệnh
// ============================================================
void xuLyLenh(String command) {
  float distance = -1;
  if (isSensorReady) {
    float dist = getRawDistance();
    if (dist > 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
      distance = dist;
    }
  }

  // A. LỆNH RÓT NƯỚC (Ví dụ: POUR_COCA_S, POUR_PEPSI_M, v.v.)
  if (command.startsWith("POUR_COCA_") || command.startsWith("POUR_PEPSI_")) {
    Serial.print("=== BAT DAU QUY TRINH ROT NUOC (WebSockets): ");
    Serial.println(command);

    // Gửi ACK lập tức qua WebSocket để backend xác nhận
    guiBaoCaoRotWebSocket(distance != -1 ? distance : emptyDistance, 0.0, "ACK");

    // Xác định chân kích hoạt bơm tương ứng
    int pumpPin = command.startsWith("POUR_COCA_") ? triggerCoca : triggerPepsi;
    
    // Xác định chiều cao nước mục tiêu và thời gian bơm dự phòng
    char sizeChar = command.charAt(command.length() - 1);
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

    // Hiệu chuẩn đáy ly tự động trước khi rót (đo trung bình nhanh 3 lần)
    Serial.println("Dang do tu dong hieu chuan day ly...");
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

    Serial.printf("► Day ly hieu chuan: %.1f cm | Muc tieu: %.1f cm | Thoi gian an toan: %.1fs\n", 
                  cupBaseDistance, targetHeight, targetPourTime / 1000.0);

    // Kích hoạt bơm vật lý và chuyển trạng thái
    isDispensing = true;
    batBom(pumpPin);
    pourStartTime = millis();
    lastDispensingMeasure = millis();
    lastDispensingReport = 0;
    filteredDistance = cupBaseDistance; // Khởi tạo bộ lọc bằng khoảng cách đáy
    consecutiveTargetCount = 0;
    consecutiveDangerCount = 0;
    consecutiveOutliers = 0;
  } 
  
  // B. LỆNH NHẢ LY (DROP_CUP)
  else if (command == "DROP_CUP") {
    Serial.println("=== BAT DAU QUY TRINH NHA LY (WebSockets - Non-blocking) ===");
    guiBaoCaoRotWebSocket(distance != -1 ? distance : emptyDistance, 0.0, "ACK");
    
    // Kích hoạt nhả ly (Kéo cả 2 chân xuống LOW và sử dụng bộ đếm thời gian phi tuần tự)
    pinMode(triggerCoca, OUTPUT);
    digitalWrite(triggerCoca, LOW);
    pinMode(triggerPepsi, OUTPUT);
    digitalWrite(triggerPepsi, LOW);
    
    isDropCupActive = true;
    dropCupStartTime = millis();
  }
  
  // C. LỆNH STOP KHẨN CẤP
  else if (command == "STOP") {
    tatBom("Nhan lenh STOP tu Server qua WebSocket");
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== ESP8266 V9.0-WebSockets (VL53L0X + EMA + Rate Limiting) ===");

  // Khởi tạo I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // Kiểm tra cảm biến VL53L0X
  Serial.println("Dang kiem tra ket noi cam bien VL53L0X...");
  if (sensor.begin(0x29, false, &Wire)) {
    Serial.println("OK: Da ket noi va doc duoc tin hieu tu VL53L0X!");
    isSensorReady = true;
    Serial.printf("Khoang cach khay trong: %.1f cm\n", emptyDistance);
  } else {
    Serial.println("LOI: Khong tim thay VL53L0X! Se tu dong su dung che do du phong (Fallback Timer).");
    isSensorReady = false;
  }
  
  // Đặt chân điều khiển về INPUT (Open-Drain nhàn rỗi)
  pinMode(triggerCoca, INPUT);
  pinMode(triggerPepsi, INPUT);

  // Kết nối WiFi
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA); 
  delay(100);

  Serial.printf("Dang ket noi WiFi: %s\n", ssid);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi da ket noi!");
  Serial.print("IP ESP: ");
  Serial.println(WiFi.localIP());

  // Cấu hình WebSocket Client kết nối Socket.IO Server của Node.js
  // Endpoint WebSocket Socket.IO v4 mặc định: /socket.io/?EIO=4&transport=websocket
#if USE_CLOUD
  Serial.printf("Dang khoi dong WebSocket (SSL) ket noi toi Cloud: %s...\n", serverHost);
  webSocket.beginSSL(serverHost, serverPort, "/socket.io/?EIO=4&transport=websocket");
#else
  Serial.printf("Dang khoi dong WebSocket ket noi toi Local: %s:%d...\n", serverIP, serverPort);
  webSocket.begin(serverIP, serverPort, "/socket.io/?EIO=4&transport=websocket");
#endif
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000); // Thử lại sau 5s nếu rớt kết nối
}

void loop() {
  // Duy trì vòng lặp WebSocket để nhận tin và xử lý Ping/Pong Heartbeat
  webSocket.loop();
  
  unsigned long now = millis();

  // Xử lý hoàn tất nhả ly phi tuần tự (Non-blocking)
  if (isDropCupActive) {
    if (now - dropCupStartTime >= 2500) {
      pinMode(triggerCoca, INPUT);
      pinMode(triggerPepsi, INPUT);
      isDropCupActive = false;
      Serial.println("=== HOAN TAT QUY TRINH NHA LY (Non-blocking) ===");
    }
  }

  // ============================================================
  // LUỒNG 1: ĐANG RÓT NƯỚC (ĐO TẦN SUẤT CAO 150ms ĐỂ TỰ NGẮT CHÍNH XÁC)
  // ============================================================
  if (isDispensing) {
    unsigned long elapsed = now - pourStartTime;
    
    // Ngắt khẩn cấp nếu mất WiFi > 5.0s khi đang bơm nước
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiDropTime == 0) wifiDropTime = millis();
      if (millis() - wifiDropTime > 5000) {
        tatBom("Mat WiFi qua 5.0s khi dang rot");
        delay(150);
        guiBaoCaoRotWebSocket(emptyDistance, 0.0, "DONE");
      }
      WiFi.reconnect();
      return;
    } else {
      wifiDropTime = 0;
    }

    // Bộ hẹn giờ bảo vệ tuyệt đối (Watchdog thời gian 20 giây)
    if (elapsed >= 20000) {
      tatBom("Watchdog an toan thoi gian 20s");
      delay(150);
      guiBaoCaoRotWebSocket(emptyDistance, 100.0, "DONE");
      return;
    }

    // Đọc cảm biến laser VL53L0X định kỳ 150ms
    if (now - lastDispensingMeasure >= 150) {
      lastDispensingMeasure = now;
      
      float distance = -1;
      bool readSuccess = false;

      if (isSensorReady) {
        float dist = getRawDistance();
        if (dist > 0.0) {
          // Giới hạn vật lý
          if (dist > 2.0 && dist <= emptyDistance + 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
            float diff = dist - filteredDistance;
            
            // Bộ lọc tốc độ thay đổi (Rate-of-Change): Ngăn nhiễu nhảy vọt mặt nước dâng > 2cm trong 150ms
            if (abs(diff) <= 2.0) {
              // Bộ lọc làm mịn Exponential Moving Average (EMA) với hệ số alpha = 0.35
              filteredDistance = 0.35 * dist + 0.65 * filteredDistance;
              distance = filteredDistance;
              readSuccess = true;
              consecutiveOutliers = 0;
            } else {
              consecutiveOutliers++;
              Serial.printf("[DSP Rate-of-Change] Bo qua nhiễu dot bien: %.1f cm (Lech: %.1f cm)\n", dist, diff);

              // Tự khôi phục (Latching Recovery): 5 lần lệch liên tiếp -> cập nhật thực tế mới
              if (consecutiveOutliers >= 5) {
                filteredDistance = dist;
                distance = filteredDistance;
                readSuccess = true;
                consecutiveOutliers = 0;
                Serial.println("[DSP Bộ lọc] Tu khoi phuc sau 5 lan nhiễu liên tiep!");
              }
            }
          } else {
            consecutiveOutliers++;
            Serial.printf("[DSP Gioi han] Khoang cach ngoai tam: %.1f cm\n", dist);
          }
        } else {
          consecutiveOutliers++;
          Serial.println("[Laser] Loi doc tin hieu sensor");
        }
      }

      // Xử lý khi đo đạc cảm biến thành công
      if (readSuccess && distance > 0) {
        float hWater = cupBaseDistance - distance;
        if (hWater < 0) hWater = 0;
        
        float progress = (hWater / targetHeight) * 100.0;
        if (progress > 100.0) progress = 100.0;

        Serial.printf("[Sens-Rot] Nuoc: %.1f/%.1f cm | Khoang cach: %.1f cm | Tien trinh: %.0f%%\n", 
                      hWater, targetHeight, distance, progress);

        // KIỂM TRA ĐIỀU KIỆN TỰ NGẮT AN TOÀN
        bool isDanger = (distance <= SAFE_MIN_DISTANCE);
        bool isTargetReached = (hWater >= targetHeight);

        if (isDanger) {
          consecutiveDangerCount++;
          consecutiveTargetCount = 0;
          Serial.printf("[Canh bao] Nuoc sat cam bien lan thu: %d\n", consecutiveDangerCount);
        } else if (isTargetReached) {
          consecutiveTargetCount++;
          consecutiveDangerCount = 0;
          Serial.printf("[Canh bao] Dat muc nuoc muc tieu lan thu: %d\n", consecutiveTargetCount);
        } else {
          consecutiveDangerCount = 0;
          consecutiveTargetCount = 0;
        }

        // Tự ngắt: 1 lần đạt đích hoặc 2 lần chạm ngưỡng nguy hiểm chống tràn ly
        if (consecutiveTargetCount >= 1 || consecutiveDangerCount >= 2) {
          String reason = (consecutiveTargetCount >= 1) ? "Dat muc nuoc muc tieu" : "Chong tran ly (sat cam bien)";
          tatBom(reason);
          delay(150); // Độ trễ ổn định điện áp và sóng nhiễu
          guiBaoCaoRotWebSocket(distance, 100.0, "DONE");
        } 
        // Báo cáo tiến trình định kỳ mỗi 1000ms qua WebSocket
        else if (now - lastDispensingReport >= 1000) {
          lastDispensingReport = now;
          guiBaoCaoRotWebSocket(distance, progress, "");
        }
      }
      // CHẾ ĐỘ DỰ PHÒNG (FALLBACK TIMER): Khi cảm biến lỗi/mất tín hiệu liên tục quá 30 lần (~4.5s)
      else if (!isSensorReady || consecutiveOutliers >= 30) {
        float timeProgress = ((float)elapsed / (float)targetPourTime) * 100.0;
        if (timeProgress > 100.0) timeProgress = 100.0;

        Serial.printf("[Rot-Fallback-Timer] %.1f/%.1fs | Tien trinh: %.0f%% (Laser loi)\n", 
                      elapsed / 1000.0, targetPourTime / 1000.0, timeProgress);

        if (elapsed >= targetPourTime) {
          tatBom("Hoan thanh theo thoi gian du phong (Fallback)");
          delay(150);
          guiBaoCaoRotWebSocket(emptyDistance, 100.0, "DONE");
        } else if (now - lastDispensingReport >= 1000) {
          lastDispensingReport = now;
          guiBaoCaoRotWebSocket(emptyDistance, timeProgress, "");
        }
      }
    }

    return; // Thoát sớm loop khi rót nước để tối đa hóa CPU cho việc đo cảm biến và lọc DSP
  }

  // ============================================================
  // LUỒNG 2: CHỜ LỆNH (IDLE) - Đo cảm biến & gửi trạng thái mỗi 1 giây
  // ============================================================
  if (now - lastSensorIdleReport >= IDLE_REPORT_INTERVAL) {
    lastSensorIdleReport = now;

    float distance = -1;
    if (isSensorReady) {
      float dist = getRawDistance();
      if (dist > 2.0 && dist <= MAX_PHYSICAL_DISTANCE) {
        distance = dist;
        Serial.printf("[Sensor-Idle] Khoang cach: %.1f cm | Phat hien ly: %s\n", 
                      distance, (distance <= 25.0 ? "CO LY" : "KHONG LY"));
      } else {
        Serial.println("[Sensor-Idle] Canh bao: Cam bien loi hoac ngoai tam vat ly!");
      }
    }

    // Gửi trạng thái cảm biến lên server qua WebSocket (Thay thế hoàn toàn cho HTTP POST cũ)
    if (WiFi.status() == WL_CONNECTED) {
      if (distance != -1) {
        guiBaoCaoRotWebSocket(distance, 0.0, "");
      }
      wifiDropTime = 0;
    } else {
      if (wifiDropTime == 0) wifiDropTime = millis();
      // An toàn: Mất mạng quá 2 giây đưa các chân về INPUT
      if (millis() - wifiDropTime > 2000) {
        pinMode(triggerCoca, INPUT);
        pinMode(triggerPepsi, INPUT);
      }
      WiFi.reconnect();
    }
  }
}