/* Battery-voltage test - ESP32-S3
   Wiring for a 2S 18650 Li-ion pack (6.0–8.4 V):
   pack P+ -> 47 kΩ -> GPIO 3 -> 22 kΩ -> pack P- / ESP32 GND
   Add a 100 nF capacitor from GPIO 3 to GND. Never connect battery + directly
   to an ESP32 GPIO. This divider is for the battery-pack output, not 12 V.
*/
constexpr uint8_t BATTERY_PIN = 3;
constexpr float R_TOP_OHMS = 47000.0;
constexpr float R_BOTTOM_OHMS = 22000.0;
constexpr float CALIBRATION = 1.000;
constexpr uint8_t SAMPLE_COUNT = 16;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  Serial.println("Battery divider test started");
}

void loop() {
  uint32_t millivoltSum = 0;
  for (uint8_t i = 0; i < SAMPLE_COUNT; ++i) {
    millivoltSum += analogReadMilliVolts(BATTERY_PIN);
    delay(2);
  }
  const float pinVoltage = (millivoltSum / (float)SAMPLE_COUNT) / 1000.0;
  const float batteryVoltage = pinVoltage * ((R_TOP_OHMS + R_BOTTOM_OHMS) / R_BOTTOM_OHMS) * CALIBRATION;
  Serial.printf("ADC pin: %.3f V | Estimated battery: %.2f V\n", pinVoltage, batteryVoltage);
  delay(1000);
}
