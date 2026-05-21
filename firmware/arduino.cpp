// FILE: arduino.cpp
// Chạy trên Arduino Uno
#include <Wire.h> 
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

// Địa chỉ LCD 0x27
LiquidCrystal_I2C lcd(0x27, 16, 2);

Servo cupServo;         // Khai báo đối tượng Servo điều khiển nhả ly
const int servoPin = 9; // Dây tín hiệu Servo cắm vào chân D9 Uno

const int in1 = 7; // Từ D1 của ESP (Lệnh Coca)
const int in2 = 6; // Từ D2 của ESP (Lệnh Pepsi)
const int out1 = 4; // Tới IN1 Relay (Bơm Coca)
const int out2 = 5; // Tới IN2 Relay (Bơm Pepsi)

int lastState = -1;
bool isDispensing = false; // Trạng thái đang thực hiện chu trình rót nước

// Watchdog ngắt bơm an toàn (Failsafe Watchdog)
unsigned long pumpStartTime = 0;
bool isPumpRunning = false;
const unsigned long MAX_PUMP_TIME = 15000; // 15 giây chạy bơm liên tục tối đa
bool pumpSafetyTripped = false;

// Góc quay của Servo (Có thể điều chỉnh lại cho khớp với cơ cấu cơ khí của bạn)
const int SERVO_LOCK_ANGLE = 0;    // Góc khóa ly (Không cho rơi)
const int SERVO_RELEASE_ANGLE = 90; // Góc mở chốt (Nhả 1 ly xuống)

void setup() {
  Serial.begin(115200);
  pinMode(in1, INPUT); 
  pinMode(in2, INPUT);
  
  // Thiết lập ban đầu cho các bơm tắt hoàn toàn (Cả hai đều Active HIGH: LOW = Tắt, HIGH = Bật)
  digitalWrite(out1, LOW); 
  digitalWrite(out2, LOW); 
  pinMode(out1, OUTPUT); 
  pinMode(out2, OUTPUT);

  // Khởi tạo Servo
  cupServo.attach(servoPin);
  cupServo.write(SERVO_LOCK_ANGLE); // Khóa chốt ly lúc khởi động
  
  // Khởi tạo LCD
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
  
  // 0. Failsafe watchdog cho bơm nước
  bool isCommandingPump = ((cmd1 && !cmd2) || (!cmd1 && cmd2));
  
  if (isCommandingPump) {
    if (!isPumpRunning) {
      isPumpRunning = true;
      pumpStartTime = millis();
    } else {
      if (millis() - pumpStartTime > MAX_PUMP_TIME) {
        if (!pumpSafetyTripped) {
          pumpSafetyTripped = true;
          Serial.println("[LOI KHAN CAP] Bơm chạy liên tục vượt ngưỡng 15s. Đã kích hoạt chốt bảo vệ ngắt bơm!");
          
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("LOI KHAN CAP!!! ");
          lcd.setCursor(0, 1);
          lcd.print("QUET GIO HAN PUMP");
        }
      }
    }
  } else {
    isPumpRunning = false;
    // Tự động khôi phục chế độ an toàn khi ESP dừng kích hoạt (cả 2 chân LOW)
    if (pumpSafetyTripped && !cmd1 && !cmd2) {
      pumpSafetyTripped = false;
      Serial.println("[An toàn] Đã khôi phục trạng thái sẵn sàng sau khi ngắt khẩn cấp.");
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MAY BAN NUOC V5");
      lcd.setCursor(0, 1);
      lcd.print("DANG SAN SANG...");
      lastState = -1; // Buộc vẽ lại trạng thái
    }
  }

  // 1. PHÁT HIỆN LỆNH LẤY LY (Cả hai chân cùng HIGH từ ESP8266)
  if (cmd1 && cmd2) {
    delay(150); // Bộ lọc chống nhiễu: Đợi 150ms xem tín hiệu có ổn định không
    if (digitalRead(in1) && digitalRead(in2)) { // Đo lại lần nữa để chắc chắn là lệnh nhả ly thật sự
      // Đảm bảo cả hai bơm đều TẮT khi đang nhả ly
      digitalWrite(out1, LOW);
      digitalWrite(out2, LOW);
      
      // Cập nhật LCD báo nhả ly
      lcd.setCursor(0, 1);
      lcd.print("DANG NHA LY...  ");
      Serial.println("[Hành động] Đang thực hiện nhả ly...");
      
      // Kích hoạt Servo nhả ly
      cupServo.write(SERVO_RELEASE_ANGLE); // Mở chốt nhả ly
      delay(1500);                         // Đợi 1.5 giây cho ly rơi xuống khay
      cupServo.write(SERVO_LOCK_ANGLE);    // Khóa chốt lại
      delay(500);                          // Đợi ổn định chốt
      
      lcd.setCursor(0, 1);
      lcd.print("DA NHA LY!      ");
      Serial.println("[Hành động] Đã nhả ly xong.");
      isDispensing = false;
    }
  }
  // 2. PHÁT HIỆN LỆNH RÓT NƯỚC (Chỉ một trong hai chân HIGH)
  else if (isCommandingPump) {
    if (pumpSafetyTripped) {
      // Ép tắt bơm nếu đã kích hoạt chốt bảo vệ
      digitalWrite(out1, LOW);
      digitalWrite(out2, LOW);
    } else {
      isDispensing = true;
      // Điều khiển đóng ngắt Relay bơm theo tín hiệu thời gian thực từ ESP (Đồng bộ Active HIGH cho cả hai)
      digitalWrite(out1, cmd1); 
      digitalWrite(out2, cmd2);
    }
  }
  // 3. KHÔNG CÓ LỆNH HOẶC LỆNH DỪNG (Cả hai chân LOW)
  else {
    // Tắt cả hai bơm
    digitalWrite(out1, LOW);
    digitalWrite(out2, LOW);
    
    if (isDispensing) {
      isDispensing = false;
      Serial.println("[Hành động] Đã rót xong, khôi phục trạng thái sẵn sàng.");
    }
  }

  // 4. HIỂN THỊ TRẠNG THÁI LÊN LCD (Chỉ in khi thay đổi trạng thái để không bị lác màn hình)
  if (!pumpSafetyTripped) {
    int currentState = 0; // Trạng thái sẵn sàng
    if (cmd1 && cmd2) {
      currentState = 1; // Đang nhả ly
    } else if (isDispensing) {
      if (cmd1) currentState = 2;      // Đang rót Coca-Cola
      else if (cmd2) currentState = 3; // Đang rót Pepsi
    }

    if (currentState != lastState) {
      lcd.setCursor(0, 1);
      if (currentState == 1) {
        // Đã in chữ "DA NHA LY!" ở trên nên không cần in đè ở đây
      } else if (currentState == 2) {
        lcd.print("ROT COCA-COLA...");
      } else if (currentState == 3) {
        lcd.print("ROT PEPSI...    ");
      } else {
        lcd.print("DANG SAN SANG...");
      }
      lastState = currentState;
    }
  }
}
