// CODE TÌM ĐỊA CHỈ I2C CỦA MÀN HÌNH LCD
// Nạp code này vào Arduino Uno, sau đó mở Serial Monitor (Baudrate 9600)
#include <Wire.h>

void setup() {
  Wire.begin();
  Serial.begin(9600);
  while (!Serial); 
  Serial.println("\nI2C Scanner");
}

void loop() {
  byte error, address;
  int nDevices;

  Serial.println("Dang quet mang I2C...");

  nDevices = 0;
  for(address = 1; address < 127; address++ ) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("Tim thay thiet bi I2C tai dia chi 0x");
      if (address < 16) 
        Serial.print("0");
      Serial.println(address, HEX);
      nDevices++;
    }
    else if (error == 4) {
      Serial.print("Loi khong xac dinh tai dia chi 0x");
      if (address < 16) 
        Serial.print("0");
      Serial.println(address, HEX);
    }    
  }
  
  if (nDevices == 0)
    Serial.println("Khong tim thay thiet bi I2C nao. Vui long kiem tra lai day SDA, SCL.\n");
  else
    Serial.println("Quet hoan tat.\n");

  delay(5000); 
}
