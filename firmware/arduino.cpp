// FILE: arduino.cpp
// Chạy trên Arduino Uno
// PHIÊN BẢN V7: Continuous Level + Hysteresis (Chống giật)
//
// NGUYÊN TẮC:
// - ESP giữ chân LOW = bơm chạy, ESP giữ chân HIGH = bơm tắt
// - Arduino có cơ chế "dính trạng thái" (Hysteresis):
//   + BẬT BƠM: Chỉ cần đọc LOW 3 lần liên tiếp (~15ms) → BẬT ngay
//   + TẮT BƠM: Phải đọc HIGH ít nhất 15 lần liên tiếp (~75ms) → mới TẮT
//   + Điều này đảm bảo bơm chạy mượt, không bị giật do nhiễu ngắn hạn
//
// KẾT NỐI DÂY:
// - Chân 10 (in1) ← D1 ESP (Coca)   - Chân 3 (out1) → IN1 Relay
// - Chân 6 (in2) ← D2 ESP (Pepsi)   - Chân 5 (out2) → IN2 Relay
// - Chân 9 → Servo                  - GND chung ESP + Uno

#include <Wire.h> 
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo cupServo;

const int servoPin = 9;
const int in1 = 10;  // Coca trigger từ ESP
const int in2 = 6;  // Pepsi trigger từ ESP
const int out1 = 3; // Relay Coca (Chuyển sang chân Pin 3 lành lặn vì Pin 4 đã bị cháy)
const int out2 = 5; // Relay Pepsi

const int SERVO_LOCK_ANGLE = 0;
const int SERVO_RELEASE_ANGLE = 90;

// ===== CƠ CHẾ HYSTERESIS (CHỐNG GIẬT) =====
// Đếm số lần liên tiếp đọc được trạng thái mới
// Phải vượt ngưỡng mới chuyển trạng thái
int highCount1 = 0; // Số lần liên tiếp in1 đọc HIGH
int highCount2 = 0; // Số lần liên tiếp in2 đọc HIGH
int lowCount1 = 0;  // Số lần liên tiếp in1 đọc LOW
int lowCount2 = 0;  // Số lần liên tiếp in2 đọc LOW

const int TURN_ON_THRESHOLD = 3;    // 3 lần LOW liên tiếp (~15ms) → BẬT
const int TURN_OFF_THRESHOLD = 15;  // 15 lần HIGH liên tiếp (~75ms) → TẮT (Giảm độ trễ ngắt bơm xuống 75ms)
const int DROP_CUP_THRESHOLD = 240; // 240 lần cả 2 LOW liên tiếp (~1.2s) → NHẢ LY (Đo chuẩn hơn để tránh nhiễu khởi động)

// Trạng thái logic đã được lọc (sau hysteresis)
bool pin1Active = false; // true = ESP đang kéo LOW chân 1
bool pin2Active = false; // true = ESP đang kéo LOW chân 2

// Trạng thái máy
int lastState = -1;
bool cupDropDone = false;
int bothLowCount = 0; // Đếm số lần cả 2 chân đều LOW liên tiếp

// Chống kích hoạt nhả ly liên tục do nhiễu nguồn hoặc sụt áp
unsigned long lastCupDropTime = 0;
const unsigned long CUP_DROP_COOLDOWN = 15000; // Cooldown 15 giây giữa các lần nhả ly để phù hợp với thời gian giữ servo 10s

// Watchdog bơm
unsigned long pumpStartTime = 0;
bool pumpTimerActive = false;
const unsigned long MAX_PUMP_TIME = 20000;

void setup() {
  Serial.begin(115200);
  
  pinMode(in1, INPUT_PULLUP); 
  pinMode(in2, INPUT_PULLUP);
  
  digitalWrite(out1, LOW); // Mức LOW để TẮT bơm lúc khởi động (Active HIGH)
  digitalWrite(out2, LOW); 
  pinMode(out1, OUTPUT); 
  pinMode(out2, OUTPUT);

  cupServo.attach(servoPin);
  cupServo.write(SERVO_LOCK_ANGLE);
  
  // Khởi động I2C và kích hoạt tính năng CHỐNG TREO CHIP (I2C Timeout) chuẩn công nghiệp
  Wire.begin();
  Wire.setWireTimeout(3000, true); // Chờ tối đa 3ms, tự động reset bus I2C nếu bị nhiễu động cơ!

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("MAY BAN NUOC V7");
  lcd.setCursor(0, 1);
  lcd.print("SAN SANG........");
  
  Serial.println("=== Arduino V7 - Hysteresis Mode ===");
  Serial.println("BatBom: 3x LOW | TatBom: 15x HIGH | NhaLy: 240x ca2LOW");
}

void loop() {
  // ĐỌC TRỰC TIẾP (không debounce phức tạp — hysteresis sẽ lo)
  bool raw1 = (digitalRead(in1) == LOW); // true = đang bị kéo LOW
  bool raw2 = (digitalRead(in2) == LOW);
  
  // ===== CẬP NHẬT BỘ ĐẾM HYSTERESIS CHO CHÂN 1 =====
  if (raw1) {
    lowCount1++;
    highCount1 = 0;
    // Chuyển sang Active nếu đủ ngưỡng BẬT
    if (!pin1Active && lowCount1 >= TURN_ON_THRESHOLD) {
      pin1Active = true;
      Serial.println("[V7] Chan 1 (Coca): ACTIVE");
    }
  } else {
    highCount1++;
    lowCount1 = 0;
    // Chuyển sang Idle nếu đủ ngưỡng TẮT (khó hơn nhiều so với bật)
    if (pin1Active && highCount1 >= TURN_OFF_THRESHOLD) {
      pin1Active = false;
      Serial.println("[V7] Chan 1 (Coca): IDLE");
    }
  }
  
  // ===== CẬP NHẬT BỘ ĐẾM HYSTERESIS CHO CHÂN 2 =====
  if (raw2) {
    lowCount2++;
    highCount2 = 0;
    if (!pin2Active && lowCount2 >= TURN_ON_THRESHOLD) {
      pin2Active = true;
      Serial.println("[V7] Chan 2 (Pepsi): ACTIVE");
    }
  } else {
    highCount2++;
    lowCount2 = 0;
    if (pin2Active && highCount2 >= TURN_OFF_THRESHOLD) {
      pin2Active = false;
      Serial.println("[V7] Chan 2 (Pepsi): IDLE");
    }
  }
  
  // ===== ĐẾM CẢ HAI CHÂN LOW LIÊN TỤC (Phát hiện lệnh nhả ly) =====
  if (raw1 && raw2) {
    bothLowCount++;
  } else {
    bothLowCount = 0;
  }
  
  // ===== ĐIỀU KHIỂN RELAY DỰA TRÊN TRẠNG THÁI ĐÃ LỌC =====
  
  // NHẬN DIỆN LỆNH NHẢ LY: Cả 2 chân LOW liên tục >= 1.2s
  if (bothLowCount >= DROP_CUP_THRESHOLD && pin1Active && pin2Active) {
    if (!cupDropDone) {
      if (millis() - lastCupDropTime >= CUP_DROP_COOLDOWN) {
        lastCupDropTime = millis();
        
        digitalWrite(out1, LOW); // Giữ tắt bơm trong lúc nhả ly
        digitalWrite(out2, LOW);
        
        Serial.println("[V7] >>> LENH NHA LY <<<");
        cupServo.write(SERVO_RELEASE_ANGLE);
        
        // Đếm ngược 10 giây trên LCD và giữ servo mở
        for (int i = 10; i > 0; i--) {
          lcd.setCursor(0, 1);
          lcd.print("NHA LY: ");
          lcd.print(i);
          lcd.print("s con lai ");
          Serial.print("[V7] Dang nha ly... ");
          Serial.print(i);
          Serial.println("s");
          delay(1000);
        }
        
        cupServo.write(SERVO_LOCK_ANGLE);
        delay(500);
        
        lcd.setCursor(0, 1);
        lcd.print("DA NHA LY OK!   ");
        Serial.println("[V7] Da nha ly xong.");
        
        cupDropDone = true;
        lastState = 1;
      } else {
        // Bỏ qua kích hoạt nếu chưa qua thời gian giãn cách
        Serial.println("[V7] Canh bao: Lenh nha ly bi chan do trong thoi gian cooldown!");
        cupDropDone = true; // Chan kich hoat lai trong phien hien tai
      }
    }
  }
  // BƠM COCA: Chỉ chân 1 active, chân 2 không active
  else if (pin1Active && !pin2Active) {
    cupDropDone = false;
    digitalWrite(out1, HIGH); // Kích HIGH = BẬT bơm Coca (Active HIGH)
    digitalWrite(out2, LOW);  // Kích LOW = TẮT bơm Pepsi
    
    if (!pumpTimerActive) {
      pumpTimerActive = true;
      pumpStartTime = millis();
      Serial.println("[V7] >>> BAT BOM COCA <<<");
    }
    if (lastState != 2) {
      lcd.setCursor(0, 1);
      lcd.print("ROT COCA-COLA...");
      lastState = 2;
    }
  }
  // BƠM PEPSI: Chỉ chân 2 active, chân 1 không active
  else if (!pin1Active && pin2Active) {
    cupDropDone = false;
    digitalWrite(out1, LOW);  // Kích LOW = TẮT bơm Coca
    digitalWrite(out2, HIGH); // Kích HIGH = BẬT bơm Pepsi (Active HIGH)
    
    if (!pumpTimerActive) {
      pumpTimerActive = true;
      pumpStartTime = millis();
      Serial.println("[V7] >>> BAT BOM PEPSI <<<");
    }
    if (lastState != 3) {
      lcd.setCursor(0, 1);
      lcd.print("ROT PEPSI...    ");
      lastState = 3;
    }
  }
  // KHÔNG CÓ GÌ ACTIVE: Tắt hết
  else if (!pin1Active && !pin2Active) {
    cupDropDone = false;
    digitalWrite(out1, LOW); // Kích LOW = TẮT bơm Coca
    digitalWrite(out2, LOW); // Kích LOW = TẮT bơm Pepsi
    
    if (pumpTimerActive) {
      pumpTimerActive = false;
      Serial.println("[V7] >>> TAT BOM <<<");
    }
    if (lastState != 0) {
      lcd.setCursor(0, 1);
      lcd.print("SAN SANG........");
      lastState = 0;
    }
  }
  
  // WATCHDOG: Tắt bơm nếu chạy quá 20 giây
  if (pumpTimerActive && (millis() - pumpStartTime > MAX_PUMP_TIME)) {
    digitalWrite(out1, LOW); // Ngắt khẩn cấp bằng mức LOW
    digitalWrite(out2, LOW);
    pumpTimerActive = false;
    pin1Active = false;
    pin2Active = false;
    Serial.println("[V7] !!! CANH BAO: Bom qua 20s - NGAT !!!");
    lcd.setCursor(0, 1);
    lcd.print("LOI: QUA 20S!!! ");
    lastState = -1;
  }
  
  delay(5); // Vòng lặp ~5ms → 200 lần/giây
}
