
"use client";

import BrowserNotifications from "../components/BrowserNotifications";
import "../components/browser-notifications.css";
import { useMemo, useState } from "react";
import { useGreenhouseMode } from "../components/GreenhouseModeProvider";
import "./notifications.css";
import EmailAlertMonitor from "../components/EmailAlertMonitor";

type Alert = {
  id: string;
  title: string;
  message: string;
  level: "critical" | "warning" | "info" | "success";
  time: string;
};

type TestScenario =
  | "normal"
  | "critical-soil"
  | "low-soil"
  | "high-temperature"
  | "high-humidity"
  | "offline";

export default function NotificationsPage() {
  const {
    simulationMode,
    loading,
    changing,
    error,
    telemetry,
    deviceOnline,
    refreshTelemetry,
  } = useGreenhouseMode();

  const [filter, setFilter] = useState("all");
  const [readAlerts, setReadAlerts] = useState<string[]>([]);
  const [testScenario, setTestScenario] =
    useState<TestScenario>("normal");

  // REAL SENSOR ALERTS
  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];

    const time = telemetry?.created_at
      ? new Date(telemetry.created_at).toLocaleString()
      : "Waiting";

    if (!telemetry) {
      result.push({
        id: "waiting-for-data",
        title: "Waiting for sensor data",
        message: simulationMode
          ? "Waiting for generated greenhouse readings."
          : "No greenhouse telemetry has been received yet. Connect the ESP32 and check its data transmission.",
        level: "info",
        time: "Waiting",
      });

      return result;
    }

    if (!simulationMode && !deviceOnline) {
      result.push({
        id: `offline-${telemetry.created_at}`,
        title: "ESP32 device offline",
        message:
          "No fresh telemetry has arrived within the configured online window. Check the ESP32, Wi-Fi and Supabase connection.",
        level: "critical",
        time,
      });
    }

    const soil = telemetry.soil_moisture_percent;
    const temperature = telemetry.temperature_c;
    const humidity = telemetry.humidity_percent;

    const readingsCanAlert = simulationMode || deviceOnline;

    if (
      readingsCanAlert &&
      soil !== null &&
      Number.isFinite(Number(soil))
    ) {
      const value = Number(soil);

      if (value <= 20) {
        result.push({
          id: `soil-critical-${telemetry.created_at}`,
          title: "Critical soil moisture",
          message: `Soil moisture is ${value.toFixed(1)}%. Inspect the soil and plant immediately. Watering may be required.`,
          level: "critical",
          time,
        });
      } else if (value <= 30) {
        result.push({
          id: `soil-warning-${telemetry.created_at}`,
          title: "Low soil moisture",
          message: `Soil moisture is ${value.toFixed(1)}%. Check the soil and consider watering if needed.`,
          level: "warning",
          time,
        });
      }
    }

    if (
      readingsCanAlert &&
      temperature !== null &&
      Number.isFinite(Number(temperature)) &&
      Number(temperature) >= 35
    ) {
      result.push({
        id: `temperature-${telemetry.created_at}`,
        title: "High greenhouse temperature",
        message: `Temperature is ${Number(temperature).toFixed(1)}°C. Check ventilation and plant condition.`,
        level: "warning",
        time,
      });
    }

    if (
      readingsCanAlert &&
      humidity !== null &&
      Number.isFinite(Number(humidity)) &&
      Number(humidity) > 80
    ) {
      result.push({
        id: `humidity-${telemetry.created_at}`,
        title: "High greenhouse humidity",
        message: `Humidity is ${Number(humidity).toFixed(1)}%. Check ventilation and monitor plant leaves for moisture-related problems.`,
        level: "warning",
        time,
      });
    }

    if (result.length === 0) {
      result.push({
        id: `normal-${telemetry.created_at}`,
        title: "No active sensor alerts",
        message:
          "No configured temperature or soil-moisture warning thresholds have been crossed in the latest reading.",
        level: "success",
        time,
      });
    }

    return result;
  }, [telemetry, deviceOnline, simulationMode]);

  // TEST ALERTS
  const testAlert = useMemo<Alert | null>(() => {
    if (testScenario === "normal") return null;

    const time = new Date().toLocaleString();

    const testAlerts: Record<
      Exclude<TestScenario, "normal">,
      Alert
    > = {
      "critical-soil": {
        id: "test-critical-soil",
        title: "TEST: Critical soil moisture",
        message:
          "Test reading: Soil moisture is 15%. Inspect the soil and watering requirements.",
        level: "critical",
        time,
      },

      "low-soil": {
        id: "test-low-soil",
        title: "TEST: Low soil moisture",
        message:
          "Test reading: Soil moisture is 25%. Check whether watering is required.",
        level: "warning",
        time,
      },

      "high-temperature": {
        id: "test-high-temperature",
        title: "TEST: High greenhouse temperature",
        message:
          "Test reading: Greenhouse temperature is 38°C. Check ventilation.",
        level: "warning",
        time,
      },

      "high-humidity": {
        id: "test-high-humidity",
        title: "TEST: High greenhouse humidity",
        message:
          "Test reading: Greenhouse humidity is 88%. Check ventilation.",
        level: "warning",
        time,
      },

      offline: {
        id: "test-esp32-offline",
        title: "TEST: ESP32 device offline",
        message:
          "Test condition: The greenhouse ESP32 device is offline.",
        level: "critical",
        time,
      },
    };

    return testAlerts[testScenario];
  }, [testScenario]);

  // DISPLAY REAL OR TEST ALERTS
  const displayedAlerts = testAlert
    ? [testAlert]
    : alerts;

  const visibleAlerts = displayedAlerts.filter((alert) => {
    if (filter === "all") return true;
    return alert.level === filter;
  });

  const criticalCount = displayedAlerts.filter(
    (item) => item.level === "critical"
  ).length;

  const warningCount = displayedAlerts.filter(
    (item) => item.level === "warning"
  ).length;

  const unreadCount = displayedAlerts.filter(
    (item) => !readAlerts.includes(item.id)
  ).length;

  function markAllRead() {
    setReadAlerts((previous) => [
      ...new Set([
        ...previous,
        ...displayedAlerts.map((item) => item.id),
      ]),
    ]);
  }

  function markRead(id: string) {
    setReadAlerts((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    );
  }

  function changeTestScenario(scenario: TestScenario) {
    setTestScenario(scenario);
    setFilter("all");
  }

  return (
    <main className="notification-page">

      {/* PAGE HEADER */}
      <header className="notification-header">
        <div>
          <span className="notification-brand">
            GREENMIND SMART AGRICULTURE
          </span>

          <h1>Notification Center</h1>

          <p>
            Monitor greenhouse warnings, device status and sensor alerts.
          </p>
        </div>

        <button
          className="notification-refresh"
          onClick={() => void refreshTelemetry()}
          disabled={loading || changing}
        >
          ↻ {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* BROWSER AND EMAIL MONITORING */}
      <BrowserNotifications testScenario={testScenario} />

      <EmailAlertMonitor />

      {/* NOTIFICATION TESTING */}
      <section className="notification-panel">
        <div className="notification-panel-heading">
          <div>
            <span className="notification-eyebrow">
              DEMONSTRATION TOOLS
            </span>

            <h2>Notification Testing Mode</h2>

            <p>
              Test greenhouse alerts without changing actual sensor readings.
            </p>
          </div>
        </div>

        <div className="notification-filters">
          <button
            className={testScenario === "normal" ? "active" : ""}
            onClick={() => changeTestScenario("normal")}
          >
            Normal Mode
          </button>

          <button
            className={testScenario === "critical-soil" ? "active" : ""}
            onClick={() => changeTestScenario("critical-soil")}
          >
            Critical Soil
          </button>

          <button
            className={testScenario === "low-soil" ? "active" : ""}
            onClick={() => changeTestScenario("low-soil")}
          >
            Low Soil
          </button>

          <button
            className={testScenario === "high-temperature" ? "active" : ""}
            onClick={() => changeTestScenario("high-temperature")}
          >
            High Temperature
          </button>

          <button
            className={testScenario === "high-humidity" ? "active" : ""}
            onClick={() => changeTestScenario("high-humidity")}
          >
            High Humidity
          </button>

          <button
            className={testScenario === "offline" ? "active" : ""}
            onClick={() => changeTestScenario("offline")}
          >
            ESP32 Offline
          </button>
        </div>

        <p className="notification-test-note">
          {testScenario === "normal"
            ? "Normal monitoring is active. Showing actual shared telemetry alerts."
            : "TEST MODE: This is a demonstration alert. Real sensor readings are unchanged. Test emails are not sent."}
        </p>
      </section>

      {/* DATA STATUS */}
      <section className="notification-status">
        <div>
          <span className="notification-eyebrow">
            DATA MODE
          </span>

          <strong
            className={
              simulationMode
                ? "status-online"
                : deviceOnline
                  ? "status-online"
                  : "status-offline"
            }
          >
            ●{" "}
            {simulationMode
              ? "SIMULATION MODE"
              : deviceOnline
                ? "ESP32 ONLINE"
                : "ESP32 OFFLINE / WAITING"}
          </strong>
        </div>

        <div>
          <span className="notification-eyebrow">
            LAST SENSOR UPDATE
          </span>

          <strong>
            {telemetry?.created_at
              ? new Date(telemetry.created_at).toLocaleString()
              : "No readings received"}
          </strong>
        </div>
      </section>

      {/* ERROR */}
      {error && !simulationMode && (
        <div className="notification-error" role="alert">
          <strong>Unable to load alerts</strong>
          <p>{error}</p>
        </div>
      )}

      {/* STATISTICS */}
      <section className="notification-stats">
        <article>
          <span>Total notifications</span>
          <strong>{displayedAlerts.length}</strong>
        </article>

        <article>
          <span>Critical alerts</span>
          <strong className="critical-number">
            {criticalCount}
          </strong>
        </article>

        <article>
          <span>Warnings</span>
          <strong className="warning-number">
            {warningCount}
          </strong>
        </article>

        <article>
          <span>Unread</span>
          <strong>{unreadCount}</strong>
        </article>
      </section>

      {/* RECENT NOTIFICATIONS */}
      <section className="notification-panel">
        <div className="notification-panel-heading">
          <div>
            <span className="notification-eyebrow">
              GREENHOUSE MONITORING
            </span>

            <h2>Recent Notifications</h2>

            <p>
              Alerts are calculated from the latest shared greenhouse telemetry.
            </p>
          </div>

          <button
            className="notification-read-button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            ✓ Mark all as read
          </button>
        </div>

        {/* FILTERS */}
        <div className="notification-filters">
          {["all", "critical", "warning", "info", "success"].map(
            (item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={filter === item ? "active" : ""}
              >
                {item === "all"
                  ? "All"
                  : item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            )
          )}
        </div>

        {/* ALERT LIST */}
        {loading ? (
          <div className="notification-empty">
            Loading greenhouse notifications...
          </div>
        ) : visibleAlerts.length === 0 ? (
          <div className="notification-empty">
            No notifications in this category.
          </div>
        ) : (
          <div className="notification-list">
            {visibleAlerts.map((alert) => {
              const isRead = readAlerts.includes(alert.id);

              return (
                <article
                  key={alert.id}
                  className={`notification-item ${alert.level} ${
                    isRead ? "is-read" : ""
                  }`}
                >
                  <div className="notification-icon">
                    {alert.level === "critical"
                      ? "🚨"
                      : alert.level === "warning"
                        ? "⚠️"
                        : alert.level === "success"
                          ? "✓"
                          : "ℹ️"}
                  </div>

                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h3>{alert.title}</h3>

                      <span className={`alert-label ${alert.level}`}>
                        {alert.level.toUpperCase()}
                      </span>
                    </div>

                    <p>{alert.message}</p>

                    <time>{alert.time}</time>
                  </div>

                  <button
                    className="notification-mark-button"
                    onClick={() => markRead(alert.id)}
                    disabled={isRead}
                  >
                    {isRead ? "Read" : "Mark read"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* INFORMATION */}
      <section className="notification-note">
        <strong>Notification information</strong>

        <p>
          Alerts are calculated from the shared telemetry provider.
          Read status is kept in page memory and resets when the page is
          refreshed. Browser notifications and email monitoring are
          provided by their respective components.
        </p>

        <p>
          Testing Mode displays demonstration alerts only. It does not
          modify ESP32 readings or Supabase records and does not send
          test emails.
        </p>

        <p>
          Battery voltage is displayed below when available, but a
          low-battery alert requires a verified battery threshold.
        </p>

        <div className="notification-battery">
          <span>Latest battery voltage</span>

          <strong>
            {telemetry?.battery_voltage != null
              ? `${Number(telemetry.battery_voltage).toFixed(2)} V`
              : "--"}
          </strong>
        </div>
      </section>
    </main>
  );
}
