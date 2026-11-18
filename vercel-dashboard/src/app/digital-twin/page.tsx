
"use client";

import { useGreenhouseMode } from "../components/GreenhouseModeProvider";
import "./digital-twin.css";

function displayValue(
  value: number | null | undefined,
  suffix = ""
) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}${suffix}`
    : "--";
}

function deviceClass(value: string) {
  return value === "ON"
    ? "twin-device-on"
    : value === "OFF"
      ? "twin-device-off"
      : "twin-device-unknown";
}

export default function DigitalTwinPage() {
  const {
    simulationMode,
    loading,
    changing,
    error,
    telemetry,
    recentTelemetry,
    deviceOnline,
    refreshTelemetry,
  } = useGreenhouseMode();

  const status = simulationMode
    ? "SIMULATION"
    : deviceOnline
      ? "LIVE"
      : telemetry
        ? "STALE"
        : "WAITING";

  const pump = telemetry?.pump_on ? "ON" : "OFF";
  const fan = telemetry?.fan_on ? "ON" : "OFF";
  const growLight = telemetry?.grow_light_on ? "ON" : "OFF";

  const lastChecked = telemetry?.created_at
    ? new Date(telemetry.created_at).toLocaleString()
    : "No readings received";

  const handleRefresh = async () => {
    await refreshTelemetry();
  };

  return (
    <main className="digital-twin-page">
      <header className="twin-header">
        <div>
          <p className="twin-brand">GREENMIND SMART AGRICULTURE</p>
          <h1>Greenhouse Digital Twin</h1>
          <p className="twin-subtitle">
            A digital view of your greenhouse environment and connected devices.
          </p>
        </div>

        <button
          className="twin-refresh"
          onClick={handleRefresh}
          disabled={loading || changing}
        >
          ↻ {loading ? "Refreshing..." : "Refresh Data"}
        </button>
      </header>

      <section className={`twin-connection twin-status-${status.toLowerCase()}`}>
        <div>
          <span className="twin-section-label">
            {simulationMode ? "SIMULATION MODE" : "ESP32 CONTROLLER"}
          </span>

          <h2>{status}</h2>

          <p>
            {loading
              ? "Loading greenhouse information..."
              : simulationMode
                ? "Generated demonstration readings are being displayed. No physical sensor is required."
                : deviceOnline
                  ? "ESP32 telemetry is connected and current readings are available."
                  : telemetry
                    ? "The latest ESP32 reading is not recent. Check the device connection."
                    : "Waiting for ESP32 sensor readings."}
          </p>

          <small>Last sensor reading: {lastChecked}</small>
        </div>

        <div className="twin-connection-icon">📡</div>
      </section>

      {error && !simulationMode && (
        <div className="twin-error" role="alert">
          {error}
        </div>
      )}

      <section className="twin-section">
        <div className="twin-section-heading">
          <div>
            <span className="twin-section-label">GREENHOUSE MODEL</span>
            <h2>Virtual Greenhouse Layout</h2>
          </div>

          <span className="twin-model-tag">
            Digital representation
          </span>
        </div>

        <div className="twin-house">
          <div className="twin-roof">
            <span>GREENHOUSE</span>
          </div>

          <div className="twin-house-content">
            <div className="twin-zone">
              <span className="twin-zone-icon">🌱</span>
              <strong>Plant Zone A</strong>
              <small>Growing area</small>
              <span className="twin-zone-value">
                Soil: {displayValue(telemetry?.soil_moisture_percent, "%")}
              </span>
            </div>

            <div className="twin-zone">
              <span className="twin-zone-icon">🌿</span>
              <strong>Plant Zone B</strong>
              <small>Growing area</small>
              <span className="twin-zone-value">
                Environment: {telemetry ? "Updated" : "Waiting"}
              </span>
            </div>

            <div className="twin-zone twin-equipment">
              <span className="twin-zone-icon">💧</span>
              <strong>Irrigation Unit</strong>
              <small>Pump state</small>
              <span className="twin-zone-value">{pump}</span>
            </div>

            <div className="twin-zone twin-equipment">
              <span className="twin-zone-icon">🌀</span>
              <strong>Ventilation</strong>
              <small>Fan state</small>
              <span className="twin-zone-value">{fan}</span>
            </div>
          </div>

          <div className="twin-house-footer">
            <span>
              ☀️ Light: {displayValue(telemetry?.light_percent, "%")}
            </span>
            <span>
              🌡️ Temperature: {displayValue(telemetry?.temperature_c, "°C")}
            </span>
            <span>
              💨 Humidity: {displayValue(telemetry?.humidity_percent, "%")}
            </span>
          </div>
        </div>

        <p className="twin-note">
          This is a conceptual greenhouse layout. Plant zones are visual
          placeholders and do not represent measured plant counts or physical
          zone locations.
        </p>
      </section>

      <section className="twin-section">
        <span className="twin-section-label">SENSOR MONITORING</span>
        <h2>Greenhouse Environment</h2>

        <div className="twin-metric-grid">
          <article className="twin-metric">
            <span>🌡️ Temperature</span>
            <strong>{displayValue(telemetry?.temperature_c, "°C")}</strong>
            <small>Air temperature</small>
          </article>

          <article className="twin-metric">
            <span>💧 Humidity</span>
            <strong>{displayValue(telemetry?.humidity_percent, "%")}</strong>
            <small>Relative humidity</small>
          </article>

          <article className="twin-metric">
            <span>🌱 Soil Moisture</span>
            <strong>{displayValue(telemetry?.soil_moisture_percent, "%")}</strong>
            <small>Soil moisture reading</small>
          </article>

          <article className="twin-metric">
            <span>☀️ Light</span>
            <strong>{displayValue(telemetry?.light_percent, "%")}</strong>
            <small>Light sensor reading</small>
          </article>
        </div>
      </section>

      <section className="twin-section">
        <span className="twin-section-label">CONNECTED EQUIPMENT</span>
        <h2>Device Status</h2>

        <div className="twin-device-grid">
          <article className="twin-device">
            <span>💧 Irrigation Pump</span>
            <strong className={deviceClass(pump)}>{pump}</strong>
          </article>

          <article className="twin-device">
            <span>🌀 Ventilation Fan</span>
            <strong className={deviceClass(fan)}>{fan}</strong>
          </article>

          <article className="twin-device">
            <span>💡 Grow Light</span>
            <strong className={deviceClass(growLight)}>{growLight}</strong>
          </article>
        </div>

        <p className="twin-note">
          Device states are read from telemetry. These indicators do not
          operate equipment. In Simulation Mode, they represent demonstration
          states only.
        </p>
      </section>

      <section className="twin-section twin-system-info">
        <h2>Controller Information</h2>

        <div>
          <span>ESP32 Device ID</span>
          <strong>
            {simulationMode
              ? "SIMULATOR"
              : telemetry?.device_id || "Not available"}
          </strong>
        </div>

        <div>
          <span>Battery Voltage</span>
          <strong>
            {displayValue(telemetry?.battery_voltage, " V")}
          </strong>
        </div>

        <div>
          <span>Wi-Fi Signal</span>
          <strong>{displayValue(telemetry?.wifi_rssi, " dBm")}</strong>
        </div>

        <div>
          <span>Last Sensor Reading</span>
          <strong>{lastChecked}</strong>
        </div>
      </section>

      <section className="twin-section">
        <span className="twin-section-label">RECENT TELEMETRY</span>
        <h2>Recent Greenhouse Readings</h2>

        <div className="twin-device-grid">
          {(recentTelemetry ?? []).slice(0, 3).map((item, index) => (
            <article className="twin-device" key={`${item.created_at}-${index}`}>
              <span>{new Date(item.created_at).toLocaleString()}</span>
              <strong>
                {displayValue(item.temperature_c, "°C")} ·{" "}
                {displayValue(item.soil_moisture_percent, "%")}
              </strong>
              <small>
                Humidity: {displayValue(item.humidity_percent, "%")}
              </small>
            </article>
          ))}
          {!recentTelemetry?.length && (
            <p className="twin-note">No recent telemetry history available.</p>
          )}
        </div>
      </section>

      <footer className="twin-footer">
        GREENMIND SMART AGRICULTURE · DIGITAL TWIN
        <p>
          {simulationMode
            ? "Simulation Mode: displayed values are generated demonstration readings."
            : "Real Mode: displayed values come from the shared ESP32 telemetry provider. Missing sensor fields appear as unavailable."}
        </p>
      </footer>
    </main>
  );
}
