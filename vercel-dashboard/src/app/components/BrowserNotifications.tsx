
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGreenhouseMode } from "./GreenhouseModeProvider";

type TestScenario =
  | "normal"
  | "critical-soil"
  | "low-soil"
  | "high-temperature"
  | "high-humidity"
  | "offline";

type Props = {
  testScenario?: TestScenario;
};

type AlertItem = {
  key: string;
  title: string;
  message: string;
};

export default function BrowserNotifications({
  testScenario = "normal",
}: Props) {
  const {
    telemetry,
    simulationMode,
    deviceOnline,
  } = useGreenhouseMode();

  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  const previousAlerts = useRef<string>("");

  // DETECT REAL AND TEST ALERTS
  const alerts = useMemo<AlertItem[]>(() => {
    if (testScenario !== "normal") {
      const testAlerts: Record<
        Exclude<TestScenario, "normal">,
        AlertItem
      > = {
        "critical-soil": {
          key: "test-critical-soil",
          title: "TEST: Critical Soil Moisture",
          message: "Test reading: Soil moisture is 15%.",
        },

        "low-soil": {
          key: "test-low-soil",
          title: "TEST: Low Soil Moisture",
          message: "Test reading: Soil moisture is 25%.",
        },

        "high-temperature": {
          key: "test-high-temperature",
          title: "TEST: High Temperature",
          message: "Test reading: Greenhouse temperature is 38°C.",
        },

        "high-humidity": {
          key: "test-high-humidity",
          title: "TEST: High Humidity",
          message: "Test reading: Greenhouse humidity is 88%.",
        },

        offline: {
          key: "test-esp32-offline",
          title: "TEST: ESP32 Offline",
          message: "Test condition: The ESP32 device is offline.",
        },
      };

      return [testAlerts[testScenario]];
    }

    const result: AlertItem[] = [];

    if (!telemetry) return result;

    if (!simulationMode && !deviceOnline) {
      result.push({
        key: "esp32-offline",
        title: "ESP32 Device Offline",
        message:
          "No fresh greenhouse sensor data has arrived. Check the ESP32 and Wi-Fi connection.",
      });

      return result;
    }

    const soil = telemetry.soil_moisture_percent;
    const temperature = telemetry.temperature_c;
    const humidity = telemetry.humidity_percent;

    if (soil !== null && Number.isFinite(Number(soil))) {
      const value = Number(soil);

      if (value <= 20) {
        result.push({
          key: "critical-soil",
          title: "Critical Soil Moisture",
          message: `Soil moisture is ${value.toFixed(1)}%. Check the soil immediately.`,
        });
      } else if (value <= 30) {
        result.push({
          key: "low-soil",
          title: "Low Soil Moisture",
          message: `Soil moisture is ${value.toFixed(1)}%. Check watering requirements.`,
        });
      }
    }

    if (
      temperature !== null &&
      Number.isFinite(Number(temperature)) &&
      Number(temperature) >= 35
    ) {
      result.push({
        key: "high-temperature",
        title: "High Greenhouse Temperature",
        message: `Temperature is ${Number(temperature).toFixed(1)}°C. Check ventilation.`,
      });
    }

    if (
      humidity !== null &&
      Number.isFinite(Number(humidity)) &&
      Number(humidity) > 80
    ) {
      result.push({
        key: "high-humidity",
        title: "High Greenhouse Humidity",
        message: `Humidity is ${Number(humidity).toFixed(1)}%. Monitor ventilation.`,
      });
    }

    return result;
  }, [
    telemetry,
    simulationMode,
    deviceOnline,
    testScenario,
  ]);

  // CHECK BROWSER NOTIFICATION SUPPORT
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
  }, []);

  // REQUEST PERMISSION
  async function enableNotifications() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (error) {
      console.error("Notification permission error:", error);
      setPermission("default");
    }
  }

  // SEND NEW ALERTS ONLY
  useEffect(() => {
    if (permission !== "granted") return;

    const currentKeys = alerts
      .map((alert) => alert.key)
      .sort()
      .join("|");

    // Initialize without notifying for existing conditions.
    if (previousAlerts.current === "") {
      previousAlerts.current = currentKeys;
      return;
    }

    const previousKeys = previousAlerts.current
      ? previousAlerts.current.split("|")
      : [];

    const newAlerts = alerts.filter(
      (alert) => !previousKeys.includes(alert.key)
    );

    previousAlerts.current = currentKeys;

    newAlerts.forEach((alert) => {
      try {
        const notification = new Notification(
          `GreenMind: ${alert.title}`,
          {
            body: alert.message,
            tag: `greenmind-${alert.key}`,
            icon: "/favicon.ico",
          }
        );

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (error) {
        console.error("Browser notification error:", error);
      }
    });
  }, [alerts, permission]);

  return (
    <section className="gm-browser-notification">
      <div className="gm-browser-notification-info">
        <span className="gm-browser-notification-icon">
          🔔
        </span>

        <div>
          <strong>Browser Notifications</strong>

          <p>
            Receive alerts when greenhouse sensor conditions need attention.
          </p>

          <small>
            {permission === "granted"
              ? "Notifications enabled"
              : permission === "denied"
                ? "Notifications blocked in browser settings"
                : permission === "unsupported"
                  ? "Browser notifications are not supported"
                  : "Permission is required to receive notifications"}
          </small>
        </div>
      </div>

      {permission !== "granted" &&
        permission !== "unsupported" && (
          <button
            type="button"
            onClick={enableNotifications}
            className="gm-notification-enable"
          >
            Enable Notifications
          </button>
        )}

      {permission === "granted" && (
        <span className="gm-notification-enabled">
          ✓ Enabled
        </span>
      )}
    </section>
  );
}
