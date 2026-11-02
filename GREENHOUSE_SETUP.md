# Smart Greenhouse setup

## What the dashboard does

- Receives DHT11 temperature and humidity plus capacitive soil-moisture readings from the ESP32 38-pin DevKit.
- Shows live KPI cards and the latest 60 readings in a browser graph.
- Keeps pump, fan, and grow-light control on the ESP32 so automation survives a dashboard or Wi-Fi outage.
- Sends the ESP32's real relay states back to the dashboard.
- Uses local ESP32 thresholds for every actuator decision. Supabase and the dashboard are telemetry-only.
- Uses the laptop webcam or an uploaded image for CropGuard leaf disease classification.

## Start the local server

```powershell
cd "C:\Users\Chetan\Documents\Smart green house\LeafDiseaseDetector"
.\.venv\Scripts\python app.py
```

Open `http://127.0.0.1:5000` on the laptop. Find the laptop's Wi-Fi IPv4 address with `ipconfig`; enter that address in `SERVER_URL` in `esp32/SmartGreenhouse.ino`. The ESP32 cannot use `127.0.0.1`, because that would point back to itself.

## ESP32 38-pin DevKit wiring

| Part | ESP32 pin in firmware | Notes |
|---|---:|---|
| DHT11 data | GPIO 27 | Use 3.3 V and a shared ground. |
| Capacitive soil sensor AO | GPIO 36 | Input-only ADC1 pin. Power the analogue sensor from 3.3 V, never 5 V. |
| Pump relay IN | GPIO 16 | Relay module must share ground with the ESP32. |
| Fan relay IN | GPIO 17 | Drive the 12 V fan from its separate supply through the relay. |
| Grow-light relay IN | GPIO 18 | Same relay precautions as the fan. |
| Optional light-sensor output | GPIO 35 | Input-only ADC1 pin. The invoice does not include a light sensor. Add an LDR module before enabling brightness automation. |
| Optional battery-divider output | GPIO 34 | Input-only ADC1 pin. Add a safe resistor divider before enabling battery telemetry. |
| I2C LCD SDA | GPIO 21 | 16×2 I2C LCD data line. |
| I2C LCD SCL | GPIO 22 | 16×2 I2C LCD clock line. |

Do not power the pump or fan from an ESP32 pin. Use the relay contacts and their separate power supply. Add a flyback diode when using a bare DC pump instead of a relay module.

The confirmed 5 V relay board is active-HIGH: GPIO HIGH turns a channel on. Its VCC comes from the 5 V LM2596 output, its GND is shared with ESP32 GND, and its 12 V load wiring goes only through the relay contact terminals.

## First firmware upload

1. Install the Arduino libraries **DHT sensor library**, **ArduinoJson**, and **LiquidCrystal I2C**.
2. Select **ESP32 Dev Module** in Arduino IDE. Edit `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, and the GPIO values if your wiring differs.
3. In Serial Monitor, read the soil sensor's raw value when dry and when in wet soil. Replace `SOIL_DRY_RAW` and `SOIL_WET_RAW` with those values.
4. Upload `esp32/SmartGreenhouse.ino` using the ESP32 Dev Module board selection.
5. Allow inbound TCP port 5000 in Windows Firewall on your private Wi-Fi network if the ESP32 cannot reach the dashboard.

## Test every part before the combined upload

Upload these sketches one at a time from the `esp32/tests/` folder, using Serial Monitor at `115200`:

1. `DHT11_Test/DHT11_Test.ino` checks temperature and humidity values.
2. `SoilMoisture_Calibration/SoilMoisture_Calibration.ino` prints raw ADC readings. Record the value in dry air and in fully wet soil, then update `SOIL_DRY_RAW` and `SOIL_WET_RAW` in the main sketch.
3. `Relay_Actuator_Test/Relay_Actuator_Test.ino` switches the pump, fan, and grow-light relay channels sequentially. Test relay clicks first with high-power loads disconnected.
4. `LightSensor_Test/LightSensor_Test.ino` is for a future LDR/analogue light module.
5. `BatteryVoltage_Test/BatteryVoltage_Test.ino` is for a future resistor-divider circuit. Never connect the battery directly to an ESP32 GPIO.

## Email alerts

Set these environment variables before starting the server:

```powershell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_TLS = "true"
$env:SMTP_USER = "your-email@example.com"
$env:SMTP_PASSWORD = "an-app-password"
$env:ALERT_TO_EMAIL = "recipient@example.com"
.\.venv\Scripts\python app.py
```

The specification controls are preconfigured with fan hysteresis: the fan turns on at 30 C or above and turns off at 29 C or below. Between 29 C and 30 C it keeps its previous state. Irrigation runs a 10-second burst below 30% then pauses 30 seconds for absorption. The server alerts after temperature exceeds 38 C for five minutes, soil remains below 20% while the pump is on, battery voltage is below 3.3 V (only after fitting a divider), or a disease is classified above 85% confidence. For public deployment, do not expose this local server directly to the internet. Use HTTPS plus Supabase or MQTT with device authentication.
