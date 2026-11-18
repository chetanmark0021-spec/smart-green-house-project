
"use client";

import { useGreenhouseMode } from "../components/GreenhouseModeProvider";
import "./irrigation.css";

type Telemetry = {
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  battery_voltage: number | null;
  pump_on?: boolean;
  created_at: string | null;
};

function formatValue(
  value: number | null | undefined,
  suffix = "",
  decimals = 1
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  return `${value.toFixed(decimals)}${suffix}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString();
}

function getMoistureAdvice(
  value: number | null | undefined,
  simulationMode: boolean
) {
  if (value === null || value === undefined) {
    return {
      title: "Waiting for soil moisture data",
      message: "No soil moisture reading is currently available.",
      type: "neutral",
    };
  }

  if (value < 30) {
    return {
      title: "Soil moisture is low",
      message:
        "The soil may need watering. Check the plant and confirm the reading before watering.",
      type: "warning",
    };
  }

  if (value < 45) {
    return {
      title: "Soil moisture is below the preferred range",
      message:
        "Monitor the soil condition. Consider watering if the crop requires it.",
      type: "caution",
    };
  }

  if (value <= 70) {
    return {
      title: "Soil moisture is in a suitable range",
      message: "Continue monitoring the soil moisture level.",
      type: "good",
    };
  }

  return {
    title: "Soil moisture is high",
    message:
      "Avoid additional watering until the soil moisture level decreases. Check drainage if needed.",
    type: "caution",
  };
}

export default function IrrigationPage() {
  const {
    simulationMode,
    loading,
    error,
    telemetry,
    recentTelemetry,
    deviceOnline,
    refreshTelemetry,
  } = useGreenhouseMode();

  const data = telemetry as Telemetry | null;
  const history = recentTelemetry as Telemetry[];

  const moisture = data?.soil_moisture_percent ?? null;

  const moistureWidth =
    moisture !== null
      ? Math.max(0, Math.min(100, moisture))
      : 0;

  const advice = getMoistureAdvice(
    moisture,
    simulationMode
  );

  const refreshData = async () => {
    await refreshTelemetry();
  };

  const isLive = !simulationMode && deviceOnline;
  const isSimulated = simulationMode;

  return (
    <main className="irrigation-page">
      <div className="irrigation-container">

        {/* HEADER */}
        <header className="irrigation-header">
          <div>
            <p className="irrigation-eyebrow">
              GREENMIND SMART AGRICULTURE
            </p>

            <h1>Smart Irrigation Management</h1>

            <p className="irrigation-subtitle">
              Monitor greenhouse soil moisture and receive
              intelligent irrigation guidance.
            </p>
          </div>

          <button
            className="irrigation-refresh"
            onClick={refreshData}
            disabled={loading}
          >
            <span>⟳</span>
            {loading ? "Loading..." : "Refresh Data"}
          </button>
        </header>

        {/* MODE STATUS */}
        <section className="irrigation-connection">
          <div className="connection-heading">
            <div className="connection-title">
              <span
                className={`connection-dot ${
                  isSimulated || isLive
                    ? "dot-live"
                    : "dot-offline"
                }`}
              />

              <div>
                <h2>
                  {simulationMode
                    ? "Simulation Sensor Connection"
                    : "ESP32 Sensor Connection"}
                </h2>

                <p>
                  {simulationMode
                    ? "Generated greenhouse readings are active"
                    : isLive
                    ? "Live sensor readings received"
                    : "Waiting for ESP32 connection"}
                </p>
              </div>
            </div>

            <span
              className={`connection-badge ${
                isSimulated || isLive
                  ? "badge-live"
                  : "badge-offline"
              }`}
            >
              {loading
                ? "LOADING"
                : simulationMode
                ? "SIMULATION"
                : isLive
                ? "LIVE"
                : "OFFLINE"}
            </span>
          </div>

          <p className="connection-message">
            {error ||
              (simulationMode
                ? "This page is using simulated greenhouse sensor readings."
                : isLive
                ? "ESP32 telemetry is being received from Supabase."
                : "No recent ESP32 sensor readings are available.")}
          </p>

          <div className="connection-footer">
            <span>
              Operating mode:{" "}
              {simulationMode
                ? "Simulation"
                : "Real ESP32"}
            </span>

            <span>
              Data source:{" "}
              {simulationMode
                ? "Local simulator"
                : "Greenhouse telemetry"}
            </span>
          </div>
        </section>

        {/* SENSOR MONITORING */}
        <section className="irrigation-section">
          <div className="section-heading">
            <div>
              <h2>Sensor Monitoring</h2>
              <p>Latest greenhouse readings</p>
            </div>
          </div>

          <div className="irrigation-metric-grid">
            <article className="irrigation-metric-card">
              <div className="metric-icon moisture-icon">💧</div>
              <p className="metric-label">Soil Moisture</p>
              <h3>
                {formatValue(
                  data?.soil_moisture_percent,
                  "%",
                  1
                )}
              </h3>
              <p className="metric-description">
                Soil water level
              </p>
            </article>

            <article className="irrigation-metric-card">
              <div className="metric-icon temperature-icon">🌡️</div>
              <p className="metric-label">Temperature</p>
              <h3>
                {formatValue(data?.temperature_c, "°C")}
              </h3>
              <p className="metric-description">
                Greenhouse temperature
              </p>
            </article>

            <article className="irrigation-metric-card">
              <div className="metric-icon humidity-icon">☁️</div>
              <p className="metric-label">Air Humidity</p>
              <h3>
                {formatValue(
                  data?.humidity_percent,
                  "%"
                )}
              </h3>
              <p className="metric-description">
                Relative air humidity
              </p>
            </article>

            <article className="irrigation-metric-card">
              <div className="metric-icon light-icon">☀️</div>
              <p className="metric-label">Light Intensity</p>
              <h3>
                {formatValue(data?.light_percent, "%")}
              </h3>
              <p className="metric-description">
                Recorded light level
              </p>
            </article>
          </div>
        </section>

        {/* SOIL MOISTURE ANALYSIS */}
        <section className="irrigation-section">
          <div className="section-heading">
            <div>
              <h2>Soil Moisture Analysis</h2>
              <p>Current soil moisture percentage</p>
            </div>
          </div>

          <article className="moisture-panel">
            <div className="moisture-panel-top">
              <div>
                <p className="metric-label">
                  Current Soil Moisture
                </p>
                <h3>
                  {formatValue(moisture, "%", 1)}
                </h3>
              </div>

              <span className="moisture-symbol">💧</span>
            </div>

            <div
              className="moisture-progress-track"
              role="progressbar"
              aria-label="Soil moisture"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={moisture ?? 0}
            >
              <div
                className="moisture-progress-fill"
                style={{ width: `${moistureWidth}%` }}
              />
            </div>

            <div className="moisture-scale">
              <span>0% — Dry</span>
              <span>100% — High</span>
            </div>

            <p className="moisture-note">
              {simulationMode
                ? "Demonstration value generated by the GreenMind simulator."
                : "Value received from the latest ESP32 sensor reading."}
            </p>
          </article>
        </section>

        {/* IRRIGATION ADVISORY */}
        <section className="irrigation-section">
          <div className="section-heading">
            <div>
              <h2>Smart Irrigation Advisory</h2>
              <p>
                Guidance based on current soil moisture
              </p>
            </div>
          </div>

          <article
            className={`advisory-card advisory-${advice.type}`}
          >
            <div className="advisory-icon">
              {advice.type === "warning"
                ? "⚠️"
                : advice.type === "good"
                ? "✓"
                : advice.type === "caution"
                ? "!"
                : "💧"}
            </div>

            <div>
              <h3>{advice.title}</h3>
              <p>{advice.message}</p>
            </div>
          </article>

          {!simulationMode && !isLive && (
            <p className="advisory-warning">
              ESP32 readings are unavailable or outdated.
              Check the device before making irrigation decisions.
            </p>
          )}

          {simulationMode && (
            <p className="advisory-warning">
              Simulation advisory only. No real water pump is activated.
            </p>
          )}
        </section>

        {/* SYSTEM STATUS */}
        <section className="irrigation-section">
          <div className="section-heading">
            <div>
              <h2>Irrigation System Status</h2>
              <p>Controller and sensor information</p>
            </div>
          </div>

          <div className="system-status-grid">
            <article className="system-status-card">
              <span className="status-card-icon">📡</span>
              <div>
                <p>
                  {simulationMode
                    ? "Simulator"
                    : "ESP32 Controller"}
                </p>
                <strong>
                  {simulationMode
                    ? "Running"
                    : isLive
                    ? "Connected"
                    : "Not connected"}
                </strong>
              </div>
            </article>

            <article className="system-status-card">
              <span className="status-card-icon">🚿</span>
              <div>
                <p>Water Pump</p>
                <strong>
                  {simulationMode
                    ? data?.pump_on
                      ? "Simulated ON"
                      : "Simulated OFF"
                    : "Control not configured"}
                </strong>
              </div>
            </article>

            <article className="system-status-card">
              <span className="status-card-icon">🔋</span>
              <div>
                <p>Battery Voltage</p>
                <strong>
                  {formatValue(
                    data?.battery_voltage,
                    " V",
                    2
                  )}
                </strong>
              </div>
            </article>

            <article className="system-status-card">
              <span className="status-card-icon">🕒</span>
              <div>
                <p>Last Sensor Reading</p>
                <strong className="reading-time">
                  {formatTime(data?.created_at)}
                </strong>
              </div>
            </article>
          </div>
        </section>

        {/* HISTORY */}
        <section className="irrigation-section">
          <div className="section-heading">
            <div>
              <h2>Recent Sensor History</h2>
              <p>
                Latest {history.length}{" "}
                {simulationMode
                  ? "simulated readings"
                  : "ESP32 readings"}
              </p>
            </div>
          </div>

          <div className="history-table-wrapper">
            <table className="irrigation-history-table">
              <thead>
                <tr>
                  <th>Date and Time</th>
                  <th>Soil Moisture</th>
                  <th>Temperature</th>
                  <th>Humidity</th>
                  <th>Light</th>
                </tr>
              </thead>

              <tbody>
                {history.length > 0 ? (
                  history.map((item, index) => (
                    <tr
                      key={`${item.created_at ?? "reading"}-${index}`}
                    >
                      <td>{formatTime(item.created_at)}</td>
                      <td>
                        {formatValue(
                          item.soil_moisture_percent,
                          "%"
                        )}
                      </td>
                      <td>
                        {formatValue(item.temperature_c, "°C")}
                      </td>
                      <td>
                        {formatValue(
                          item.humidity_percent,
                          "%"
                        )}
                      </td>
                      <td>
                        {formatValue(item.light_percent, "%")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="history-empty">
                      {loading
                        ? "Loading sensor history..."
                        : "No sensor history is available yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="irrigation-footer">
          <p>
            GREENMIND SMART AGRICULTURE · SMART IRRIGATION
          </p>
          <p>
            {simulationMode
              ? "Simulation data · Demonstration mode"
              : "Real ESP32 sensor telemetry"}
          </p>
        </footer>
      </div>
    </main>
  );
}
