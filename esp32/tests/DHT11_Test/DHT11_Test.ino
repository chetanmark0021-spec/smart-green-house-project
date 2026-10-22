/* DHT11 individual sensor test - ESP32-S3
   Wiring: DHT11 VCC -> 3.3V, GND -> GND, DATA -> GPIO 27
   Install: DHT sensor library by Adafruit
*/
#include <DHT.h>

constexpr uint8_t DHT_PIN = 27;
constexpr uint8_t DHT_TYPE = DHT11;
DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  Serial.println("DHT11 test started");
}

void loop() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT11 read failed - check wiring and sensor power");
  } else {
    Serial.printf("Temperature: %.1f C | Humidity: %.1f %%\n", temperature, humidity);
  }
  delay(2000); // DHT11 should not be sampled faster than about once per second
}
