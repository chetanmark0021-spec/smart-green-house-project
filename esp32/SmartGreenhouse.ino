/*
  Smart Greenhouse - ESP32-S3 firmware
  Libraries (Arduino Library Manager): DHT sensor library, ArduinoJson

  Change Wi-Fi credentials, Supabase settings, pins and soil calibration before
  upload. This final sketch sends directly to Supabase over HTTPS.
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ---------- Network ----------
const char* WIFI_SSID = "YOUR_FIXED_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_FIXED_WIFI_PASSWORD";
// Supabase direct REST test mode. These are deliberately separate so that the
// project endpoint and the public browser/device key are easy to replace.
// The publishable key is public; never put a Supabase secret/service-role key
// or Wi-Fi password in a public repository.
const char* SUPABASE_URL = "https://wclsupskijbczcwocmze.supabase.co";
const char* SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TQFVK7KytP0H-x_3yylRjQ_8wMcWO3u";
const char* DEVICE_ID = "greenhouse-esp32-s3-01";

// ---------- ESP32 38-pin DevKit wiring ----------
// GPIO 34/35/36 are ADC1 input-only pins: ideal for analogue sensors while Wi-Fi runs.
constexpr uint8_t DHT_PIN = 27;
constexpr uint8_t DHT_TYPE = DHT11;
constexpr uint8_t SOIL_PIN = 36;      // capacitive soil sensor AO, powered at 3.3 V
constexpr uint8_t LIGHT_PIN = 35;     // optional LDR analogue output; GPIO 35 is input-only ADC1
constexpr bool HAS_LIGHT_SENSOR = false; // invoice has no light sensor; set true after adding one
constexpr uint8_t BATTERY_PIN = 34;   // Divider midpoint only; never connect battery + directly to this pin.
constexpr bool HAS_BATTERY_SENSOR = false; // Set true only after wiring the divider below.
// Divider: 2S pack P+ -> R_TOP -> BATTERY_PIN -> R_BOTTOM -> pack P- / ESP32 GND.
// 47 kΩ / 22 kΩ measures a 2S Li-ion pack (6.0–8.4 V) with good ADC range.
constexpr float BATTERY_R_TOP_OHMS = 47000.0;
constexpr float BATTERY_R_BOTTOM_OHMS = 22000.0;
constexpr float BATTERY_CALIBRATION = 1.000; // Tune after comparing with a multimeter.
constexpr uint8_t BATTERY_SAMPLE_COUNT = 16;
constexpr uint8_t LCD_SDA_PIN = 21; // Standard ESP32 DevKit I2C pins.
constexpr uint8_t LCD_SCL_PIN = 22;
constexpr uint8_t LCD_I2C_ADDRESS = 0x27; // Common alternatives: 0x3F.
constexpr uint8_t PUMP_RELAY_PIN = 16;
constexpr uint8_t FAN_RELAY_PIN = 17;
constexpr uint8_t GROW_LIGHT_RELAY_PIN = 18;
constexpr bool RELAY_ACTIVE_LOW = true;

// Measure these with the exact sensor after it is installed.
// Dry air reading usually has a larger value than wet soil on capacitive probes.
constexpr int SOIL_DRY_RAW = 3000;
constexpr int SOIL_WET_RAW = 1300;
constexpr unsigned long TELEMETRY_INTERVAL_MS = 10000;
constexpr unsigned long CONFIG_INTERVAL_MS = 15000;
constexpr unsigned long LCD_PAGE_INTERVAL_MS = 3000;
constexpr unsigned long LCD_ALERT_DURATION_MS = 4000;

DHT dht(DHT_PIN, DHT_TYPE);
LiquidCrystal_I2C lcd(LCD_I2C_ADDRESS, 16, 2);
unsigned long lastTelemetryAt = 0;
unsigned long lastConfigAt = 0;
unsigned long lastLcdPageAt = 0;
unsigned long lcdAlertUntil = 0;
uint8_t lcdPage = 0;
bool lcdReady = false;
char lcdAlertLine1[17] = "";
char lcdAlertLine2[17] = "";
float lastTemperature = NAN;
float lastHumidity = NAN;
float lastSoil = NAN;
float lastLight = NAN;
float lastBattery = NAN;

struct Config {
  // Cooling band: fan starts only when the temperature reaches the upper
  // limit, and remains on until the lower limit is reached. Change these two
  // values together: temperatureOff must always be lower than temperatureOn.
  float temperatureOn = 35.0;   // Fan ON at/above 35 °C
  float temperatureOff = 32.0;  // Fan OFF at/below 32 °C
  float soilMoistureOn = 30.0;
  int irrigationBurstSeconds = 10;
  int irrigationSoakSeconds = 30;
  int lightStartHour = 6;
  int lightEndHour = 18;
  bool pumpAuto = true;
  bool fanAuto = true;
  bool growLightAuto = true;
  bool manualPump = false;
  bool manualFan = false;
  bool manualGrowLight = false;
} config;

bool pumpOn = false;
bool fanOn = false;
bool growLightOn = false;
unsigned long pumpBurstStartedAt = 0;
unsigned long pumpSoakStartedAt = 0;
bool pumpSoaking = false;

bool validFanBand(float offTemperature, float onTemperature) {
  return isfinite(offTemperature) && isfinite(onTemperature) &&
         offTemperature >= 0.0 && onTemperature <= 60.0 &&
         offTemperature < onTemperature;
}

void setRelay(uint8_t pin, bool on) {
  // Most 5 V relay boards are active LOW: LOW energises the relay.
  digitalWrite(pin, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

void setLcdAlert(const char* line1, const char* line2) {
  snprintf(lcdAlertLine1, sizeof(lcdAlertLine1), "%s", line1);
  snprintf(lcdAlertLine2, sizeof(lcdAlertLine2), "%s", line2);
  lcdAlertUntil = millis() + LCD_ALERT_DURATION_MS;
}

void setPump(bool on) {
  bool changed = pumpOn != on; pumpOn = on; setRelay(PUMP_RELAY_PIN, on);
  if (changed && lcdReady) setLcdAlert(on ? "PUMP ON" : "PUMP OFF", on ? "Irrigating" : "Irrigation done");
}
void setFan(bool on) {
  bool changed = fanOn != on; fanOn = on; setRelay(FAN_RELAY_PIN, on);
  if (changed && lcdReady) setLcdAlert(on ? "FAN ON" : "FAN OFF", on ? "Cooling active" : "Cooling stopped");
}
void setGrowLight(bool on) {
  bool changed = growLightOn != on; growLightOn = on; setRelay(GROW_LIGHT_RELAY_PIN, on);
  if (changed && lcdReady) setLcdAlert(on ? "LIGHT ON" : "LIGHT OFF", on ? "Grow light active" : "Grow light off");
}

void lcdLine(uint8_t row, const char* text) {
  char clipped[17];
  snprintf(clipped, sizeof(clipped), "%.16s", text);
  lcd.setCursor(0, row); lcd.print("                ");
  lcd.setCursor(0, row); lcd.print(clipped);
}

void refreshLcd() {
  if (!lcdReady) return;
  const unsigned long now = millis();
  if (lcdAlertUntil > now) {
    lcdLine(0, lcdAlertLine1); lcdLine(1, lcdAlertLine2); return;
  }
  if (now - lastLcdPageAt < LCD_PAGE_INTERVAL_MS) return;
  lastLcdPageAt = now;
  char line1[17], line2[17];
  switch (lcdPage++ % 4) {
    case 0:
      snprintf(line1, sizeof(line1), "Temp:%4.1fC", lastTemperature);
      snprintf(line2, sizeof(line2), "Humidity:%3.0f%%", lastHumidity);
      break;
    case 1:
      snprintf(line1, sizeof(line1), "Soil:%5.0f%%", lastSoil);
      snprintf(line2, sizeof(line2), "Light:%4.0f%%", lastLight);
      break;
    case 2:
      if (HAS_BATTERY_SENSOR) snprintf(line1, sizeof(line1), "Battery:%5.2fV", lastBattery);
      else snprintf(line1, sizeof(line1), "Battery: not fit");
      snprintf(line2, sizeof(line2), "WiFi:%4d dBm", WiFi.RSSI());
      break;
    default:
      snprintf(line1, sizeof(line1), "Fan:%s Pump:%s", fanOn ? "ON" : "OFF", pumpOn ? "ON" : "OFF");
      snprintf(line2, sizeof(line2), "Light:%s %s", growLightOn ? "ON" : "OFF", WiFi.status() == WL_CONNECTED ? "WiFi OK" : "NO WiFi");
      break;
  }
  lcdLine(0, line1); lcdLine(1, line2);
}

void addSupabaseHeaders(HTTPClient& http, bool includeJsonContentType = false) {
  if (includeJsonContentType) http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_PUBLISHABLE_KEY);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  for (int attempt = 0; attempt < 30 && WiFi.status() != WL_CONNECTED; ++attempt) {
    delay(500); Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" connected | IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println(" unavailable");
  }
}

float soilPercent() {
  int raw = analogRead(SOIL_PIN);
  long percent = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  return constrain(percent, 0, 100);
}

float lightPercent() {
  if (!HAS_LIGHT_SENSOR) return 100.0; // prevents false grow-light automation without a sensor
  int raw = analogRead(LIGHT_PIN);
  return constrain(map(raw, 4095, 0, 0, 100), 0, 100);
}

float batteryVoltage() {
  // The divider ensures the ADC pin stays below 3.3 V. Average readings to
  // reduce relay/pump noise, then reconstruct the original battery voltage.
  if (!HAS_BATTERY_SENSOR) return 0.0;
  uint32_t totalMillivolts = 0;
  for (uint8_t sample = 0; sample < BATTERY_SAMPLE_COUNT; ++sample) {
    totalMillivolts += analogReadMilliVolts(BATTERY_PIN);
    delay(2);
  }
  const float pinVoltage = (totalMillivolts / (float)BATTERY_SAMPLE_COUNT) / 1000.0;
  return pinVoltage * ((BATTERY_R_TOP_OHMS + BATTERY_R_BOTTOM_OHMS) / BATTERY_R_BOTTOM_OHMS) * BATTERY_CALIBRATION;
}

void applyAutomation(float temperature, float soil, float light) {
  // Cooling fan hysteresis: never turn a cooling fan on below the configured
  // temperature band. This avoids rapid relay switching near one threshold.
  if (!config.fanAuto) setFan(config.manualFan);
  else if (!isnan(temperature)) {
    if (temperature >= config.temperatureOn) setFan(true);
    else if (temperature <= config.temperatureOff) setFan(false);
  }
  if (!config.pumpAuto) setPump(config.manualPump);
  else {
    unsigned long now = millis();
    if (pumpOn && now - pumpBurstStartedAt >= (unsigned long)config.irrigationBurstSeconds * 1000UL) {
      setPump(false); pumpSoaking = true; pumpSoakStartedAt = now;
    } else if (pumpSoaking && now - pumpSoakStartedAt >= (unsigned long)config.irrigationSoakSeconds * 1000UL) {
      pumpSoaking = false;
    } else if (!pumpOn && !pumpSoaking && soil < config.soilMoistureOn) {
      setPump(true); pumpBurstStartedAt = now;
    }
  }
  if (!config.growLightAuto) setGrowLight(config.manualGrowLight);
  else {
    // Time schedule needs NTP time; light sensor is an optional future alternative.
    setGrowLight(false);
  }
}

void fetchConfig() {
  if (WiFi.status() != WL_CONNECTED) return;
  // Supabase requires HTTPS. setInsecure() is acceptable for this temporary
  // prototype; production firmware should pin Supabase's root CA certificate.
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  HTTPClient http;
  const String configUrl = String(SUPABASE_URL) +
    "/rest/v1/greenhouse_devices?device_id=eq." + DEVICE_ID +
    "&select=temperature_on,temperature_off,soil_moisture_on,irrigation_burst_seconds,irrigation_soak_seconds,fan_mode,pump_mode,grow_light_mode,manual_fan,manual_pump,manual_grow_light";
  http.begin(secureClient, configUrl);
  addSupabaseHeaders(http);
  int status = http.GET();
  if (status == HTTP_CODE_OK) {
    StaticJsonDocument<768> doc;
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok && doc.size() > 0) {
      JsonObject cloud = doc[0];
      float cloudTemperatureOn = cloud["temperature_on"] | config.temperatureOn;
      float cloudTemperatureOff = cloud["temperature_off"] | config.temperatureOff;
      // Ignore a malformed remote range and retain the last safe range.
      if (validFanBand(cloudTemperatureOff, cloudTemperatureOn)) {
        config.temperatureOn = cloudTemperatureOn;
        config.temperatureOff = cloudTemperatureOff;
      }
      config.soilMoistureOn = cloud["soil_moisture_on"] | config.soilMoistureOn;
      config.irrigationBurstSeconds = cloud["irrigation_burst_seconds"] | config.irrigationBurstSeconds;
      config.irrigationSoakSeconds = cloud["irrigation_soak_seconds"] | config.irrigationSoakSeconds;
      config.pumpAuto = String(cloud["pump_mode"] | "auto") != "manual";
      config.fanAuto = String(cloud["fan_mode"] | "auto") != "manual";
      config.growLightAuto = String(cloud["grow_light_mode"] | "auto") != "manual";
      config.manualPump = cloud["manual_pump"] | false;
      config.manualFan = cloud["manual_fan"] | false;
      config.manualGrowLight = cloud["manual_grow_light"] | false;
    }
  } else {
    Serial.printf("Configuration status: %d (%s)\n", status,
                  http.errorToString(status).c_str());
  }
  http.end();
}

void sendTelemetry(float temperature, float humidity, float soil, float light, float battery) {
  if (WiFi.status() != WL_CONNECTED || isnan(temperature) || isnan(humidity)) return;
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["temperature_c"] = temperature;
  doc["humidity_percent"] = humidity;
  doc["soil_moisture_percent"] = soil;
  doc["light_percent"] = light;
  doc["pump_on"] = pumpOn;
  doc["fan_on"] = fanOn;
  doc["grow_light_on"] = growLightOn;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["battery_voltage"] = battery;
  String body; serializeJson(doc, body);
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  HTTPClient http;
  http.begin(secureClient, String(SUPABASE_URL) + "/rest/v1/greenhouse_telemetry");
  addSupabaseHeaders(http, true);
  http.addHeader("Prefer", "return=minimal");
  int status = http.POST(body);
  if (status == HTTP_CODE_CREATED) Serial.println("Telemetry status: 201 (stored)");
  else Serial.printf("Telemetry status: %d | %s\n", status, http.getString().c_str());
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_RELAY_PIN, OUTPUT); pinMode(FAN_RELAY_PIN, OUTPUT); pinMode(GROW_LIGHT_RELAY_PIN, OUTPUT);
  setPump(false); setFan(false); setGrowLight(false);
  analogReadResolution(12);
  if (HAS_BATTERY_SENSOR) analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  dht.begin();
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init(); lcd.backlight(); lcdReady = true;
  lcdLine(0, "Smart Greenhouse"); lcdLine(1, "Starting...");
  connectWiFi();
  fetchConfig();
}

void loop() {
  connectWiFi();
  const unsigned long now = millis();
  if (now - lastConfigAt >= CONFIG_INTERVAL_MS) { lastConfigAt = now; fetchConfig(); }
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    float soil = soilPercent();
    float light = lightPercent();
    float battery = batteryVoltage();
    lastTemperature = temperature;
    lastHumidity = humidity;
    lastSoil = soil;
    lastLight = light;
    lastBattery = battery;
    applyAutomation(temperature, soil, light);
    Serial.printf("T: %.1f C | soil: %.0f %% | fan: %s (ON >= %.1f C, OFF <= %.1f C)\n",
                  temperature, soil, fanOn ? "ON" : "OFF",
                  config.temperatureOn, config.temperatureOff);
    sendTelemetry(temperature, humidity, soil, light, battery);
  }
  refreshLcd();
}
