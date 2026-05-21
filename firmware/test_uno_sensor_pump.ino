// FILE: test_uno_sensor_pump.ino
// File test độc lập chạy trên Arduino Uno
// Giúp kiểm tra trực tiếp cảm biến VL53L0X và điều khiển bơm tự động ngắt bằng Serial Monitor.

#include <Wire.h>
#include <Adafruit_VL53L0X.h>

// Khởi tạo đối tượng cảm biến VL53L0X
Adafruit_VL53L0X sensor = Adafruit_VL53L0X();

// Định nghĩa chân cắm Relay điều khiển bơm trên Arduino Uno (Active HIGH)
const int pumpCocaPin = 4;  // Trùng chân out1 trong sơ đồ hệ thống chính thức
const int pumpPepsiPin = 5; // Trùng chân out2 trong sơ đồ hệ thống chính thức

// Biến lưu khoảng cách
float emptyDistance = 26.0;     // Khoảng cách từ cảm biến tới khay trống thực tế (cm)
float cupBaseDistance = 26.0;   // Khoảng cách từ cảm biến tới đáy ly rỗng khi đặt vào (cm)
const float TARGET_WATER_HEIGHT = 4.0; // Chiều cao mực nước cần rót để tự ngắt (cm)
const float SAFE_MIN_DISTANCE = 4.5;   // Khoảng cách an toàn tối thiểu tới cảm biến để chống tràn khẩn cấp (cm)

bool isDispensing = false;      // Cờ báo hiệu đang rót nước
int activePumpPin = -1;         // Chân bơm hiện đang hoạt động

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==================================================");
  Serial.println("=== CHƯƠNG TRÌNH KIỂM TRA ĐỘC LẬP ARDUINO UNO ===");
  Serial.println("===       TEST CẢM BIẾN VL53L0X & BƠM NƯỚC     ===");
  Serial.println("==================================================");

  // 1. Cấu hình chân Relay điều khiển bơm nước (Đảm bảo ban đầu tắt hoàn toàn)
  digitalWrite(pumpCocaPin, LOW);
  digitalWrite(pumpPepsiPin, LOW);
  pinMode(pumpCocaPin, OUTPUT);
  pinMode(pumpPepsiPin, OUTPUT);

  // 2. Khởi tạo kết nối I2C trên Arduino Uno (Mặc định SDA là A4, SCL là A5)
  // Kết nối dây:
  // - Chân VCC (VL53L0X) -> Chân 5V (hoặc 3.3V) trên Arduino Uno
  // - Chân GND (VL53L0X) -> Chân GND trên Arduino Uno
  // - Chân SDA (VL53L0X) -> Chân A4 trên Arduino Uno
  // - Chân SCL (VL53L0X) -> Chân A5 trên Arduino Uno
  Wire.begin();

  if (!sensor.begin(0x29, false, &Wire)) {
    Serial.println("LỖI KHẨN CẤP: Không tìm thấy cảm biến VL53L0X!");
    Serial.println("Vui lòng kiểm tra lại dây nối I2C (SDA -> A4, SCL -> A5).");
    while (1); // Dừng chương trình nếu lỗi phần cứng
  }
  
  Serial.println("OK: Đã kết nối cảm biến VL53L0X thành công!");

  // 3. Tự động cân chuẩn khay trống lúc khởi động
  Serial.println("Đang tự động đo khoảng cách khay trống, vui lòng KHÔNG để ly ở khay...");
  float sum = 0;
  int validSamples = 0;
  for (int i = 0; i < 10; i++) {
    VL53L0X_RangingMeasurementData_t measure;
    sensor.rangingTest(&measure, false);
    if (measure.RangeStatus != 4) { // Đo hợp lệ
      sum += (measure.RangeMilliMeter / 10.0);
      validSamples++;
    }
    delay(100);
  }

  if (validSamples > 0) {
    emptyDistance = sum / validSamples;
    Serial.print("CÂN CHUẨN XONG! Khoảng cách khay trống thực tế: ");
    Serial.print(emptyDistance);
    Serial.println(" cm");
  } else {
    Serial.println("CẢNH BÁO: Không đo được, sử dụng giá trị mặc định 15.0 cm");
  }

  inHuongDan();
}

void loop() {
  // 1. Đọc lệnh từ Serial Monitor
  if (Serial.available() > 0) {
    char key = Serial.read();
    
    // Bỏ qua các ký tự xuống dòng
    if (key == '\n' || key == '\r') return;

    if (key == 'S' || key == 's') {
      // Đo hiệu chuẩn đáy ly khi đặt ly vào
      calibDayLy();
    } 
    else if (key == '1') {
      // Rót Coca-Cola
      if (!isDispensing) {
        batDauRot(pumpCocaPin, "COCA-COLA");
      } else {
        Serial.println("Cảnh báo: Đang trong quá trình rót nước, vui lòng tắt trước (phím 0)!");
      }
    } 
    else if (key == '2') {
      // Rót Pepsi
      if (!isDispensing) {
        batDauRot(pumpPepsiPin, "PEPSI");
      } else {
        Serial.println("Cảnh báo: Đang trong quá trình rót nước, vui lòng tắt trước (phím 0)!");
      }
    } 
    else if (key == '0') {
      // Dừng bơm khẩn cấp
      tatBomKhanCap("DỪNG CHỦ ĐỘNG TỪ BÀN PHÍM");
    }
  }

  // 2. Nếu đang rót nước, tiến hành đo và kiểm soát mực nước
  if (isDispensing) {
    VL53L0X_RangingMeasurementData_t measure;
    sensor.rangingTest(&measure, false);

    if (measure.RangeStatus != 4) { // Đo hợp lệ
      float dCurrent = measure.RangeMilliMeter / 10.0; // Đổi sang cm
      float hWater = cupBaseDistance - dCurrent;       // Chiều cao nước dâng lên trong ly
      if (hWater < 0) hWater = 0;                      // Tránh giá trị âm do nhiễu sai số

      // Tính phần trăm tiến trình
      float progress = (hWater / TARGET_WATER_HEIGHT) * 100.0;
      if (progress > 100.0) progress = 100.0;

      // In dữ liệu ra Serial Monitor
      Serial.print("Mực nước: ");
      Serial.print(hWater, 1);
      Serial.print(" cm / ");
      Serial.print(TARGET_WATER_HEIGHT, 1);
      Serial.print(" cm | Khoảng cách cảm biến: ");
      Serial.print(dCurrent, 1);
      Serial.print(" cm | Tiến trình: ");
      Serial.print(progress, 0);
      Serial.println("%");

      // KIỂM TRA ĐIỀU KIỆN DỪNG
      // Điều kiện 1: Đạt chiều cao mục tiêu của size nước
      if (hWater >= TARGET_WATER_HEIGHT) {
        tatBomThanhCong();
      }
      // Điều kiện 2: Khoảng cách an toàn tối thiểu bị vi phạm (chống tràn khẩn cấp khi ly quá đầy hoặc sai ly)
      else if (dCurrent <= SAFE_MIN_DISTANCE) {
        tatBomKhanCap("CẢNH BÁO: NƯỚC SẮP TRÀN LY (ĐÃ ĐẠT NGƯỠNG AN TOÀN TRÁNH TRÀN 4.5 cm)!");
      }
    } 
    else {
      Serial.println("CẢNH BÁO: Cảm biến bị mất dấu (Out of range) hoặc mất kết nối vật lý!");
    }
    
    delay(150); // Đo sau mỗi 150ms để theo dõi mượt mà và không quá tải Serial
  }
}

// Hàm in hướng dẫn sử dụng
void inHuongDan() {
  Serial.println("\n--------------------------------------------------");
  Serial.println("HƯỚNG DẪN ĐIỀU KHIỂN QUA SERIAL MONITOR:");
  Serial.println("  Phím [S] hoặc [s]: Đo hiệu chuẩn đáy ly rỗng (Khi đặt ly vào)");
  Serial.println("  Phím [1]         : Bật bơm COCA-COLA & tự động đo ngắt");
  Serial.println("  Phím [2]         : Bật bơm PEPSI & tự động đo ngắt");
  Serial.println("  Phím [0]         : Tắt bơm khẩn cấp");
  Serial.println("--------------------------------------------------\n");
}

// Hàm hiệu chuẩn đáy ly
void calibDayLy() {
  Serial.println("Đang đo đáy ly rỗng...");
  float sum = 0;
  int validSamples = 0;
  for (int i = 0; i < 5; i++) {
    VL53L0X_RangingMeasurementData_t measure;
    sensor.rangingTest(&measure, false);
    if (measure.RangeStatus != 4) {
      sum += (measure.RangeMilliMeter / 10.0);
      validSamples++;
    }
    delay(50);
  }

  if (validSamples > 0) {
    cupBaseDistance = sum / validSamples;
    Serial.print("► ĐÃ XÁC ĐỊNH ĐÁY LY! Khoảng cách tới đáy ly: ");
    Serial.print(cupBaseDistance);
    Serial.println(" cm");
    
    // Kiểm tra xem ly có thực sự được đặt vào khay hay chưa
    float delta = emptyDistance - cupBaseDistance;
    if (delta >= 0.8) {
      Serial.println("  ==> Đã phát hiện LY NƯỚC đặt đúng vị trí khay hứng! Sẵn sàng rót nước (phím 1 hoặc 2).");
    } else {
      Serial.println("  ==> CẢNH BÁO: Khoảng cách thay đổi quá ít (< 0.8cm), có thể chưa đặt ly hoặc ly quá mỏng!");
    }
  } else {
    Serial.println("Lỗi đo đáy ly, vui lòng kiểm tra lại vị trí ly.");
  }
}

// Hàm bắt đầu rót nước
void batDauRot(int pumpPin, String drinkName) {
  // Lấy mẫu đáy ly tự động trước khi bơm để chắc chắn có mốc đáy ly chuẩn xác
  calibDayLy();
  
  Serial.print("\n=== BẮT ĐẦU CHU TRÌNH RÓT ");
  Serial.print(drinkName);
  Serial.println(" ===");
  Serial.print("Mục tiêu mực nước dâng lên: ");
  Serial.print(TARGET_WATER_HEIGHT);
  Serial.println(" cm");

  // Bật bơm vật lý
  activePumpPin = pumpPin;
  digitalWrite(activePumpPin, HIGH);
  isDispensing = true;
}

// Hàm tắt bơm khi đạt mực nước thành công
void tatBomThanhCong() {
  if (activePumpPin != -1) {
    digitalWrite(activePumpPin, LOW);
  }
  isDispensing = false;
  activePumpPin = -1;
  Serial.println("\n✓✓✓ RÓT NƯỚC THÀNH CÔNG! ĐÃ ĐẠT ĐÚNG MỰC NƯỚC MỤC TIÊU ✓✓✓");
  Serial.println("Bơm đã tự động ngắt an toàn.");
  inHuongDan();
}

// Hàm tắt bơm khẩn cấp
void tatBomKhanCap(String lyDo) {
  digitalWrite(pumpCocaPin, LOW);
  digitalWrite(pumpPepsiPin, LOW);
  isDispensing = false;
  activePumpPin = -1;
  Serial.println("\n!!! TẮT BƠM KHẨN CẤP !!!");
  Serial.print("Lý do: ");
  Serial.println(lyDo);
  Serial.println("Đã ngắt nguồn toàn bộ bơm.");
  inHuongDan();
}
