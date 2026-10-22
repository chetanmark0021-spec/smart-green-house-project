# ESP32 LCD and battery-voltage wiring

## 16×2 I2C LCD

Install **LiquidCrystal I2C** from Arduino IDE → Library Manager, then connect:

- LCD VCC → 5 V (or 3.3 V if your LCD/backpack supports it)
- LCD GND → ESP32 GND
- LCD SDA → GPIO 21
- LCD SCL → GPIO 22

The firmware assumes I2C address `0x27`. If the backlight turns on but no text appears, scan for the address; common alternatives are `0x3F`. Update `LCD_I2C_ADDRESS` in `esp32/SmartGreenhouse.ino` if needed.

The LCD rotates every three seconds through temperature/humidity, soil/light, battery/Wi-Fi, and actuator status. Fan, pump, and grow-light changes temporarily replace the rotating view with an ON/OFF alert.

## 2S 18650 battery-pack measurement

Measure the protected battery-pack output **before** both the LM2596 buck and XL6009 boost converters. This is the dashboard's battery-state reading. For a 2S Li-ion pack it will normally be about 8.4 V fully charged, 7.4 V nominal, and near 6.0 V at the lower limit.

**Never connect battery positive directly to an ESP32 GPIO.** Use this divider:

```text
2S pack P+ ---- 47 kΩ -----+---- GPIO 34 (BATTERY_PIN)
                           |
                         22 kΩ
                           |
2S pack P- / ESP32 GND ----+---- ESP32 GND
```

Add a **100 nF ceramic capacitor** between GPIO 34 and GND, near the ESP32. The grounds of the battery/supply, relay supply, and ESP32 must be common.

This 47 kΩ / 22 kΩ divider scales 8.4 V to about 2.68 V, which is safely inside the ESP32's 3.3 V ADC limit. It is intended for the 2S battery-pack output, not the 12 V boosted rail.

1. Build the divider with power disconnected.
2. Upload `esp32/tests/BatteryVoltage_Test/BatteryVoltage_Test.ino`.
3. Compare its voltage to a multimeter.
4. Adjust `CALIBRATION` in the test sketch and `BATTERY_CALIBRATION` in the final firmware until they agree.
5. Set `HAS_BATTERY_SENSOR` to `true` in the final sketch and upload it.

## Optional second reading: boosted 12 V rail

The battery-pack measurement is the important reading for battery health. A second, separate ADC divider after the XL6009 is optional and is useful only to detect boost-converter failure or voltage sag while the pump/fan runs. Do not connect the 12 V rail to GPIO 34 with the 2S divider above.

## Power and charging safety

The diagram shows a TP4056 feeding two series cells. A TP4056 is a **single-cell** Li-ion charger with a fixed 4.2 V charge voltage, so it must not charge a 2S series pack. Use a 2S BMS plus a proper 8.4 V CC/CV 2S Li-ion charger, or use two cells in parallel (1S2P) with the TP4056 instead. The 5 V relay board's VCC must come from the 5 V buck converter; only its relay contacts should switch the 12 V boosted supply to the pump/fan/light.
