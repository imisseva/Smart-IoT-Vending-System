// FILE: esp.cpp
// Chạy trên ESP8266
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

const int trigPin = D5;
const int echoPin = D6;

// Điều khiển Arduino Uno
const int triggerCoca = D1;  // Nối vào chân 7 Uno
const int triggerPepsi = D2; // Nối vào chân 6 Uno

// Cấu hình mạng
const char* ssid = "11 Thanh Vinh 5 Tang 2";
const char* password = "11thanhvinh5";
const char* serverIP = "192.168.1.119"; 
const uint16_t serverPort = 5000;  

unsigned long lastPolling = 0;
unsigned long wifiDropTime = 0;
const int POLLING_INTERVAL = 1000; // Gọi API mỗi 1 giây để phản hồi lập tức

void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  
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
  
  if (now - lastPolling >= POLLING_INTERVAL) {
    lastPolling = now;

    // Đo cảm biến siêu âm
    digitalWrite(trigPin, LOW); delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    
    long duration = pulseIn(echoPin, HIGH, 10000); 
    int distance = (duration > 0) ? (duration * 0.034 / 2) : -1;

    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient client;
      HTTPClient http;
      
      // GỬI MỰC NƯỚC (POST)
      if (distance != -1) {
        String statusUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/status";
        http.begin(client, statusUrl);
        http.addHeader("Content-Type", "application/json");
        http.POST("{\"water_level\": " + String(distance) + "}");
        http.end();
      }

      // LẤY LỆNH ĐIỀU KHIỂN BƠM (GET)
      String cmdUrl = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/machine/command";
      http.begin(client, cmdUrl);
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        String payload = http.getString();
        payload.trim(); 

        // Xử lý an toàn: Nếu nước quá đầy (khoảng cách < 5cm) -> Tắt bơm ngay
        if (distance > 0 && distance < 5) {
          digitalWrite(triggerCoca, LOW);
          digitalWrite(triggerPepsi, LOW);
          Serial.println("CẢNH BÁO: LY ĐÃ ĐẦY - ĐÃ NGẮT BƠM KHẨN CẤP!");
        } else {
          // Bật tắt bơm theo yêu cầu từ Web App
          if (payload == "POUR_COCA") {
            digitalWrite(triggerCoca, HIGH);
            digitalWrite(triggerPepsi, LOW);
          } 
          else if (payload == "POUR_PEPSI") {
            digitalWrite(triggerCoca, LOW);
            digitalWrite(triggerPepsi, HIGH);
          } 
          else { // "STOP"
            digitalWrite(triggerCoca, LOW);
            digitalWrite(triggerPepsi, LOW);
          }
        }
      }
      http.end();
      wifiDropTime = 0; // Reset bộ đếm khi WiFi ổn định
    } else {
      // Cơ chế Debounce: Chống nhiễu sụt mạng chớp nhoáng (0.1 giây)
      if (wifiDropTime == 0) {
        wifiDropTime = millis(); // Đánh dấu thời điểm bắt đầu rớt mạng
      }
      
      // CHỈ KHI rớt mạng QUÁ 2 giây (2000ms), mới kích hoạt tắt bơm an toàn
      if (millis() - wifiDropTime > 2000) {
        digitalWrite(triggerCoca, LOW);
        digitalWrite(triggerPepsi, LOW);
      }
      
      WiFi.reconnect();
    }
  }
}