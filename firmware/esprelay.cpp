// FILE: esprelay.cpp
// Dành cho ESP8266
// Kết nối:
// D1 (GPIO5) nối với chân 7 của Arduino Uno
// D2 (GPIO4) nối với chân 6 của Arduino Uno

const int trigger1 = D1; 
const int trigger2 = D2; 

unsigned long prev = 0;
int state = 0; 

void setup() {
  Serial.begin(115200);
  pinMode(trigger1, OUTPUT);
  pinMode(trigger2, OUTPUT);
  
  // Vừa cắm điện là nhảy vào Trạng thái 0 (BẬT BƠM 1) luôn
  digitalWrite(trigger1, HIGH); // Bật bơm 1
  digitalWrite(trigger2, LOW);  // Tắt bơm 2
  
  Serial.println("Bat dau chu trinh test Relay... BẬT BƠM 1 (5s)");
}

void loop() {
  unsigned long now = millis();

  // TRẠNG THÁI 0: BẬT BƠM 1
  if (state == 0) {
    if (now - prev >= 5000) {
      // Khi HẾT 5 giây -> Chuyển sang NGHỈ
      state = 1;
      prev = now;
      
      digitalWrite(trigger1, LOW); // Tắt bơm 1 ngay lập tức
      digitalWrite(trigger2, LOW);
      Serial.println(">> [CHUYEN TRANG THAI] NGHỈ 1 (1 giây)...");
    }
  } 
  // TRẠNG THÁI 1: NGHỈ 1
  else if (state == 1) {
    if (now - prev >= 1000) {
      // Khi HẾT 1 giây nghỉ -> Chuyển sang BẬT BƠM 2
      state = 2;
      prev = now;
      
      digitalWrite(trigger1, LOW); 
      digitalWrite(trigger2, HIGH); // Bật bơm 2
      Serial.println(">> [CHUYEN TRANG THAI] BẬT BƠM 2 (5 giây)...");
    }
  }
  // TRẠNG THÁI 2: BẬT BƠM 2
  else if (state == 2) {
    if (now - prev >= 5000) {
      // Khi HẾT 5 giây -> Chuyển sang NGHỈ 2
      state = 3;
      prev = now;
      
      digitalWrite(trigger1, LOW); 
      digitalWrite(trigger2, LOW); // Tắt bơm 2 ngay lập tức
      Serial.println(">> [CHUYEN TRANG THAI] NGHỈ 2 (2 giây)...");
    }
  }
  // TRẠNG THÁI 3: NGHỈ 2
  else if (state == 3) {
    if (now - prev >= 2000) {
      // Khi HẾT 2 giây nghỉ -> Lặp lại BẬT BƠM 1
      state = 0;
      prev = now;
      
      digitalWrite(trigger1, HIGH); // Bật bơm 1
      digitalWrite(trigger2, LOW); 
      Serial.println(">> [CHUYEN TRANG THAI] BẬT BƠM 1 (5 giây)...");
    }
  }
}
