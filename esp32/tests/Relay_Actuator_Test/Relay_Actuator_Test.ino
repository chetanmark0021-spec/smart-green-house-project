/* Individual relay and actuator test - ESP32-S3
   Tests pump, fan and grow-light relay channels one at a time.
   Disconnect high-power loads during initial LED/relay click testing.
   Confirm relay module logic: most boards are active LOW.
*/
constexpr uint8_t PUMP_RELAY_PIN = 16;
constexpr uint8_t FAN_RELAY_PIN = 17;
constexpr uint8_t GROW_LIGHT_RELAY_PIN = 18;
// Confirmed 5 V relay board: GPIO HIGH switches the relay on.
constexpr bool RELAY_ACTIVE_LOW = false;
constexpr unsigned long TEST_ON_MS = 3000;
constexpr unsigned long TEST_OFF_MS = 2000;

void setRelay(uint8_t pin, bool on) {
  // active-low relay: LOW energises, HIGH releases
  digitalWrite(pin, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

void testActuator(const char* name, uint8_t pin) {
  Serial.printf("Testing %s: ON\n", name);
  setRelay(pin, true);
  delay(TEST_ON_MS);
  Serial.printf("Testing %s: OFF\n", name);
  setRelay(pin, false);
  delay(TEST_OFF_MS);
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(GROW_LIGHT_RELAY_PIN, OUTPUT);
  setRelay(PUMP_RELAY_PIN, false);
  setRelay(FAN_RELAY_PIN, false);
  setRelay(GROW_LIGHT_RELAY_PIN, false);
  Serial.println("Relay actuator test started");
}

void loop() {
  testActuator("water pump", PUMP_RELAY_PIN);
  testActuator("cooling fan", FAN_RELAY_PIN);
  testActuator("grow light", GROW_LIGHT_RELAY_PIN);
  Serial.println("Cycle complete. Repeating in 5 seconds.");
  delay(5000);
}
