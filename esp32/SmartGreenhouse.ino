/*
  Smart Greenhouse - ESP32-S3 firmware
  Libraries (Arduino Library Manager): DHT sensor library, ArduinoJson

  Change Wi-Fi credentials, Supabase settings, pins and soil calibration before
  upload. This final sketch sends directly to Supabase over HTTPS.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

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

// ---------- Wiring: change to match your actual ESP32-S3 board ----------
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t DHT_TYPE = DHT11;
constexpr uint8_t SOIL_PIN = 36;      // capacitive soil sensor AO, powered at 3.3 V
constexpr uint8_t LIGHT_PIN = 2;      // optional LDR divider or BH1750 adapter analogue output
constexpr bool HAS_LIGHT_SENSOR = false; // invoice has no light sensor; set true after adding one
constexpr uint8_t BATTERY_PIN = 3;    // optional voltage-divider output; set HAS_BATTERY_SENSOR only after fitting it
constexpr bool HAS_BATTERY_SENSOR = false;
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

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastTelemetryAt = 0;
unsigned long lastConfigAt = 0;

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

void setPump(bool on) { pumpOn = on; setRelay(PUMP_RELAY_PIN, on); }
void setFan(bool on) { fanOn = on; setRelay(FAN_RELAY_PIN, on); }
void setGrowLight(bool on) { growLightOn = on; setRelay(GROW_LIGHT_RELAY_PIN, on); }

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
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " unavailable");
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
  // Requires a correctly designed divider that keeps GPIO voltage <= 3.3 V.
  // Calibrate the multiplier with a multimeter after fitting the divider.
  if (!HAS_BATTERY_SENSOR) return 0.0;
  return analogRead(BATTERY_PIN) * (3.3 / 4095.0) * 2.0;
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
  HTTPClient http;
  const String configUrl = String(SUPABASE_URL) +
    "/rest/v1/greenhouse_devices?device_id=eq." + DEVICE_ID +
    "&select=temperature_on,temperature_off,soil_moisture_on,irrigation_burst_seconds,irrigation_soak_seconds,fan_mode,pump_mode,grow_light_mode,manual_fan,manual_pump,manual_grow_light";
  http.begin(configUrl);
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
    Serial.printf("Configuration status: %d\n", status);
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
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/greenhouse_telemetry");
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
  dht.begin();
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
    applyAutomation(temperature, soil, light);
    Serial.printf("T: %.1f C | soil: %.0f %% | fan: %s (ON >= %.1f C, OFF <= %.1f C)\n",
                  temperature, soil, fanOn ? "ON" : "OFF",
                  config.temperatureOn, config.temperatureOff);
    sendTelemetry(temperature, humidity, soil, light, battery);
  }
}
