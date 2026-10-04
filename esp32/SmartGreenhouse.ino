/*
  Smart Greenhouse - ESP32-S3 firmware
  Libraries (Arduino Library Manager): DHT sensor library, ArduinoJson

  Change WiFi credentials, SERVER_URL, pins and soil calibration before upload.
  For a local laptop dashboard, SERVER_URL must use the laptop's LAN IPv4 address,
  not 127.0.0.1. Give the laptop a stable DHCP reservation if possible.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ---------- Network ----------
const char* WIFI_SSID = "YOUR_FIXED_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_FIXED_WIFI_PASSWORD";
// Local example: http://192.168.1.4:5000
// Cloud example: https://YOUR_PROJECT_REF.supabase.co/functions/v1/greenhouse-ingest
const char* SERVER_URL = "https://wclsupskijbczcwocmze.supabase.co/functions/v1/greenhouse-ingest";
// Leave empty while testing. Later set the same value as DEVICE_INGEST_KEY in
// Supabase Edge Function Secrets; never expose it in the Vercel frontend.
const char* DEVICE_INGEST_KEY = "";
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
  http.begin(String(SERVER_URL) + "?action=config&deviceId=" + DEVICE_ID);
  if (strlen(DEVICE_INGEST_KEY) > 0) http.addHeader("X-Device-Key", DEVICE_INGEST_KEY);
  int status = http.GET();
  if (status == HTTP_CODE_OK) {
    StaticJsonDocument<768> doc;
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
      float cloudTemperatureOn = doc["temperatureOn"] | config.temperatureOn;
      float cloudTemperatureOff = doc["temperatureOff"] | config.temperatureOff;
      // Ignore a malformed remote range and retain the last safe range.
      if (validFanBand(cloudTemperatureOff, cloudTemperatureOn)) {
        config.temperatureOn = cloudTemperatureOn;
        config.temperatureOff = cloudTemperatureOff;
      }
      config.soilMoistureOn = doc["soilMoistureOn"] | config.soilMoistureOn;
      config.irrigationBurstSeconds = doc["irrigationBurstSeconds"] | config.irrigationBurstSeconds;
      config.irrigationSoakSeconds = doc["irrigationSoakSeconds"] | config.irrigationSoakSeconds;
      config.lightStartHour = doc["lightStartHour"] | config.lightStartHour;
      config.lightEndHour = doc["lightEndHour"] | config.lightEndHour;
      JsonObject modes = doc["modes"];
      config.pumpAuto = String((const char*)modes["pump"]) != "manual";
      config.fanAuto = String((const char*)modes["fan"]) != "manual";
      config.growLightAuto = String((const char*)modes["growLight"]) != "manual";
      JsonObject manual = doc["manual"];
      config.manualPump = manual["pump"] | false;
      config.manualFan = manual["fan"] | false;
      config.manualGrowLight = manual["growLight"] | false;
    }
  }
  http.end();
}

void sendTelemetry(float temperature, float humidity, float soil, float light, float battery) {
  if (WiFi.status() != WL_CONNECTED || isnan(temperature) || isnan(humidity)) return;
  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soilMoisture"] = soil;
  doc["light"] = light;
  doc["pump"] = pumpOn;
  doc["fan"] = fanOn;
  doc["growLight"] = growLightOn;
  doc["wifiRssi"] = WiFi.RSSI();
  doc["batteryVoltage"] = battery;
  String body; serializeJson(doc, body);
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_INGEST_KEY) > 0) http.addHeader("X-Device-Key", DEVICE_INGEST_KEY);
  int status = http.POST(body);
  Serial.printf("Telemetry status: %d\n", status);
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
