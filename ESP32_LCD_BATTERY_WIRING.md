# ESP32 LCD and battery-voltage wiring

## 16×2 I2C LCD

Install **LiquidCrystal I2C** from Arduino IDE → Library Manager, then connect:

- LCD VCC → 5 V (or 3.3 V if your LCD/backpack supports it)
- LCD GND → ESP32 GND
- LCD SDA → GPIO 8
- LCD SCL → GPIO 9

The firmware assumes I2C address `0x27`. If the backlight turns on but no text appears, scan for the address; common alternatives are `0x3F`. Update `LCD_I2C_ADDRESS` in `esp32/SmartGreenhouse.ino` if needed.

The LCD rotates every three seconds through temperature/humidity, soil/light, battery/Wi-Fi, and actuator status. Fan, pump, and grow-light changes temporarily replace the rotating view with an ON/OFF alert.

## 12 V battery or supply voltage measurement

**Never connect battery positive directly to an ESP32 GPIO.** Use this divider:

```text
Battery + ---- 100 kΩ ----+---- GPIO 3 (BATTERY_PIN)
                           |
                         27 kΩ
                           |
Battery - / ESP32 GND -----+---- ESP32 GND
```

Add a **100 nF ceramic capacitor** between GPIO 3 and GND, near the ESP32. The grounds of the battery/supply, relay supply, and ESP32 must be common.

This 100 kΩ / 27 kΩ divider scales a maximum 15 V input down to about 3.19 V, which protects the 3.3 V ESP32 ADC. It is suitable for a nominal 12 V supply or battery.

1. Build the divider with power disconnected.
2. Upload `esp32/tests/BatteryVoltage_Test/BatteryVoltage_Test.ino`.
3. Compare its voltage to a multimeter.
4. Adjust `CALIBRATION` in the test sketch and `BATTERY_CALIBRATION` in the final firmware until they agree.
5. Set `HAS_BATTERY_SENSOR` to `true` in the final sketch and upload it.

For a single 3.7 V Li-ion cell, use 100 kΩ from battery positive to GPIO 3 and 100 kΩ from GPIO 3 to GND instead, then set `BATTERY_R_BOTTOM_OHMS` to `100000.0`.
