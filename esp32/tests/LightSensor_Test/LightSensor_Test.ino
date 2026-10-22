/* Optional analogue light-sensor test - ESP32-S3
   Use only after adding an LDR module / analogue light sensor.
   Wiring: VCC -> 3.3V, GND -> GND, AO -> GPIO 35.
*/
constexpr uint8_t LIGHT_PIN = 35;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  Serial.println("Optional light-sensor test started");
}

void loop() {
  int raw = analogRead(LIGHT_PIN);
  int level = constrain(map(raw, 4095, 0, 0, 100), 0, 100);
  Serial.printf("Light raw ADC: %d | Relative light level: %d %%\n", raw, level);
  delay(1000);
}
