// FILE: arduino.cpp
// Chạy trên Arduino Uno
#include <Wire.h> 
#include <LiquidCrystal_I2C.h>

// Địa chỉ LCD 0x27
LiquidCrystal_I2C lcd(0x27, 16, 2);

const int in1 = 7; // Từ D1 của ESP
const int in2 = 6; // Từ D2 của ESP
const int out1 = 4; // Tới IN1 Relay
const int out2 = 5; // Tới IN2 Relay

int lastState = -1;

void setup() {
  Serial.begin(115200);
  pinMode(in1, INPUT); 
  pinMode(in2, INPUT);
  
  // Bơm 1: Active HIGH (LOW = Tắt, HIGH = Bật)
  // Bơm 2: Bị ngược (HIGH = Tắt, LOW = Bật) do phần cứng/jumper
  digitalWrite(out1, LOW); 
  digitalWrite(out2, HIGH); 
  pinMode(out1, OUTPUT); 
  pinMode(out2, OUTPUT);

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("MAY BAN NUOC V5");
  lcd.setCursor(0, 1);
  lcd.print("DANG SAN SANG...");
  Serial.println("Arduino Uno Da San Sang!");
}

void loop() {
  bool cmd1 = digitalRead(in1);
  bool cmd2 = digitalRead(in2);
  
  // Xử lý bù trừ logic cho phần cứng:
  // - Bơm 1 giữ nguyên tín hiệu từ ESP
  // - Bơm 2 ĐẢO NGƯỢC tín hiệu từ ESP
  digitalWrite(out1, cmd1); 
  digitalWrite(out2, !cmd2);

  // Hiển thị LCD (Chỉ in khi thay đổi trạng thái để không bị lác màn hình)
  int currentState = 0;
  if (cmd1) currentState = 1;
  else if (cmd2) currentState = 2;

  if (currentState != lastState) {
    lcd.setCursor(0, 1);
    if (currentState == 1) {
      lcd.print("ROT COCA-COLA...");
    } else if (currentState == 2) {
      lcd.print("ROT PEPSI...    ");
    } else {
      lcd.print("DANG SAN SANG...");
    }
    lastState = currentState;
  }
}
