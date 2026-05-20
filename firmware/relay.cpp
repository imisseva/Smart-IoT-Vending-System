// FILE: relay.cpp
// Dành cho Arduino Uno
// Kết nối:
// Chân 7 nhận tín hiệu từ D1 của ESP8266
// Chân 6 nhận tín hiệu từ D2 của ESP8266
// Chân 4 nối với IN1 của module Relay (Bơm 1)
// Chân 5 nối với IN2 của module Relay (Bơm 2)

const int in1 = 7; 
const int in2 = 6;
const int out1 = 4; 
const int out2 = 5;

void setup() {
  Serial.begin(115200);
  pinMode(in1, INPUT); 
  pinMode(in2, INPUT);
  
  // Relay của bạn là loại ACTIVE HIGH (Kích mức cao)
  // Nên phải ghi LOW để TẮT Relay lúc khởi động
  digitalWrite(out1, LOW); 
  digitalWrite(out2, LOW); 
  
  pinMode(out1, OUTPUT); 
  pinMode(out2, OUTPUT);
  
  Serial.println("Arduino Uno san sang nhan lenh tu ESP8266...");
}

void loop() {
  // Đọc tín hiệu từ ESP8266
  bool cmd1 = digitalRead(in1);
  bool cmd2 = digitalRead(in2);
  
  // Logic thẳng: ESP báo HIGH -> Bật Relay (HIGH), ESP báo LOW -> Tắt Relay (LOW)
  digitalWrite(out1, cmd1); 
  digitalWrite(out2, cmd2);
}
