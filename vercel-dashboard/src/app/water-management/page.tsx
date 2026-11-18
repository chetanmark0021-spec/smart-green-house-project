
"use client";

import { useGreenhouseMode } from "../components/GreenhouseModeProvider";
import "./water-management.css";

type WaterReading = {
  device_id: string | null;
  tank_level_percent: number | null;
  water_volume_liters: number | null;
  created_at: string;
};

type ExtendedTelemetry = {
  device_id?: string | null;
  tank_level_percent?: number | null;
  water_volume_liters?: number | null;
  created_at?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString();
}

function formatAge(value?: string | null) {
  if (!value) return "Not available";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  );

  if (!Number.isFinite(seconds)) return "Not available";
  if (seconds < 60) return `${seconds} seconds ago`;

  return `${Math.floor(seconds / 60)} minutes ago`;
}

export default function WaterManagementPage() {
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

  const extendedTelemetry = telemetry as
    | (typeof telemetry & ExtendedTelemetry)
    | null;

  // Demo tank level is illustrative, not a physical sensor measurement.
  const simulatedLevel = Math.min(
    95,
    Math.max(
      25,
      Math.round(55 + (telemetry?.soil_moisture_percent ?? 50) * 0.3)
    )
  );

  const realLevel = extendedTelemetry?.tank_level_percent;
  const realVolume = extendedTelemetry?.water_volume_liters;

  const level = simulationMode ? simulatedLevel : realLevel ?? null;

  // Demo volume assumes a 100-litre tank. This is only an illustrative value.
  const volume = simulationMode
    ? Math.round(simulatedLevel)
    : realVolume ?? null;

  const validLevel =
    typeof level === "number" &&
    Number.isFinite(level) &&
    level >= 0 &&
    level <= 100;

  const validVolume =
    typeof volume === "number" &&
    Number.isFinite(volume) &&
    volume >= 0;

  const history: WaterReading[] = simulationMode
    ? (recentTelemetry ?? []).map((item) => {
        const itemLevel = Math.min(
          95,
          Math.max(
            25,
            Math.round(55 + (item.soil_moisture_percent ?? 50) * 0.3)
          )
        );

        return {
          device_id: item.device_id ?? "SIMULATOR",
          tank_level_percent: itemLevel,
          water_volume_liters: itemLevel,
          created_at: item.created_at,
        };
      })
    : (recentTelemetry ?? []).map((item) => {
        const extended = item as typeof item & ExtendedTelemetry;

        return {
          device_id: extended.device_id ?? null,
          tank_level_percent: extended.tank_level_percent ?? null,
          water_volume_liters: extended.water_volume_liters ?? null,
          created_at: extended.created_at,
        };
      });

  const waterStatus = !validLevel
    ? "Waiting for water tank data"
    : level <= 20
      ? "Low water level"
      : level <= 50
        ? "Moderate water level"
        : "Water level sufficient";

  const connectionStatus = simulationMode
    ? "SIMULATION"
    : deviceOnline
      ? "LIVE"
      : telemetry
        ? "STALE"
        : "WAITING";

  const lastReading = telemetry?.created_at;

  const handleRefresh = async () => {
    await refreshTelemetry();
  };

  return (
    <main className="water-page">
      <div className="water-container">
        <header className="water-header">
          <div>
            <p className="water-brand">GREENMIND SMART AGRICULTURE</p>
            <h1>Smart Water Management</h1>
            <p>
              Monitor greenhouse water availability and tank readings.
            </p>
          </div>

          <button
            className="water-refresh"
            onClick={handleRefresh}
            disabled={loading || changing}
          >
            {loading ? "Loading..." : "↻ Refresh Data"}
          </button>
        </header>

        <div className="water-connection">
          <div className="water-section-heading">
            <div>
              <h2>Water Tank Sensor Connection</h2>
              <p>
                {simulationMode
                  ? "Generated demonstration readings"
                  : "ESP32 greenhouse telemetry status"}
              </p>
            </div>

            <span
              className={`water-status ${
                simulationMode
                  ? "status-live"
                  : deviceOnline
                    ? "status-live"
                    : telemetry
                      ? "status-stale"
                      : "status-waiting"
              }`}
            >
              {connectionStatus}
            </span>
          </div>

          <p className="water-message">
            {loading
              ? "Loading water tank information..."
              : simulationMode
                ? "Simulation Mode is active. Water tank values are illustrative demo readings."
                : error
                  ? error
                  : deviceOnline
                    ? "ESP32 telemetry is connected. Water tank values appear when the corresponding fields are available."
                    : "Waiting for current ESP32 telemetry. Check the device connection."}
          </p>

          <small>
            Last checked: {new Date().toLocaleTimeString()}
          </small>

          <small>
            Data source:{" "}
            {simulationMode
              ? "Simulated greenhouse telemetry"
              : "Real ESP32 telemetry"}
          </small>
        </div>

        {error && !simulationMode && (
          <div className="water-error" role="alert">
            {error}
          </div>
        )}

        <section className="water-section">
          <h2>Water Tank Overview</h2>
          <p>Latest available water information</p>

          <div className="water-stats">
            <article className="water-card">
              <span>💧</span>
              <p>Tank Level</p>
              <h3>{validLevel ? `${level}%` : "--"}</h3>
              <small>Water level percentage</small>
            </article>

            <article className="water-card">
              <span>🚰</span>
              <p>Available Water</p>
              <h3>{validVolume ? `${volume} L` : "--"}</h3>
              <small>
                {simulationMode
                  ? "Illustrative demo volume"
                  : "Recorded water volume"}
              </small>
            </article>

            <article className="water-card">
              <span>📡</span>
              <p>ESP32 Controller</p>
              <h3>
                {simulationMode
                  ? "Demo Mode"
                  : deviceOnline
                    ? "Connected"
                    : telemetry
                      ? "Not confirmed"
                      : "Waiting"}
              </h3>
              <small>
                {simulationMode
                  ? "No physical sensor required"
                  : "Based on telemetry freshness"}
              </small>
            </article>

            <article className="water-card">
              <span>🕒</span>
              <p>Last Sensor Reading</p>
              <h3 className="water-date">
                {lastReading ? formatDate(lastReading) : "--"}
              </h3>
              <small>
                {lastReading
                  ? formatAge(lastReading)
                  : "No reading received"}
              </small>
            </article>
          </div>
        </section>

        <section className="water-section">
          <h2>Tank Level Analysis</h2>
          <p>
            {simulationMode
              ? "Illustrative water level for demonstration"
              : "Water level from the latest available ESP32 reading"}
          </p>

          <div className="water-analysis">
            <div className="water-analysis-heading">
              <strong>Current Tank Level</strong>
              <strong>{validLevel ? `${level}%` : "--"}</strong>
            </div>

            <div
              className="water-progress"
              role="progressbar"
              aria-label="Water tank level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={validLevel ? level : undefined}
            >
              <div
                className="water-progress-fill"
                style={{
                  width: validLevel ? `${level}%` : "0%",
                }}
              />
            </div>

            <div className="water-scale">
              <span>0% — Empty</span>
              <span>100% — Full</span>
            </div>

            <div className="water-advisory">
              <strong>{waterStatus}</strong>
              <p>
                {!validLevel
                  ? "No valid water tank level is available. Add a tank-level sensor and send its readings to the telemetry database."
                  : level <= 20
                    ? "The recorded tank level is low. Check the water supply before irrigation."
                    : level <= 50
                      ? "The recorded tank level is moderate. Monitor water availability."
                      : "The displayed water level is sufficient based on the available reading."}
              </p>
            </div>
          </div>
        </section>

        <section className="water-section">
          <h2>Water Management Advisory</h2>

          <div className="water-advisory">
            <h3>💧 Water Availability Guidance</h3>
            <p>
              {!validLevel
                ? "Water availability advice is unavailable because a valid tank-level reading has not been received."
                : level <= 20
                  ? "Water is running low. Inspect the tank and refill it before the next irrigation cycle."
                  : level <= 50
                    ? "Water is available at a moderate level. Continue monitoring the tank."
                    : "Water availability is currently sufficient based on the displayed reading."}
            </p>
          </div>

          <p className="water-disclaimer">
            {simulationMode
              ? "Simulation readings are for demonstration only. They do not represent actual tank measurements."
              : "Recommendations are based on available telemetry. They do not operate pumps or control water equipment."}
          </p>
        </section>

        <section className="water-section">
          <h2>Recent Water Tank History</h2>
          <p>Latest {history.length} available telemetry readings</p>

          <div className="water-table-wrapper">
            <table className="water-table">
              <thead>
                <tr>
                  <th>Date and Time</th>
                  <th>Tank Level</th>
                  <th>Water Volume</th>
                  <th>Device ID</th>
                </tr>
              </thead>

              <tbody>
                {history.length ? (
                  history.map((item, index) => (
                    <tr key={`${item.created_at}-${index}`}>
                      <td>{formatDate(item.created_at)}</td>
                      <td>
                        {typeof item.tank_level_percent === "number"
                          ? `${item.tank_level_percent}%`
                          : "--"}
                      </td>
                      <td>
                        {typeof item.water_volume_liters === "number"
                          ? `${item.water_volume_liters} L`
                          : "--"}
                      </td>
                      <td>
                        {item.device_id || "Not provided"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="water-empty">
                      {simulationMode
                        ? "Waiting for simulated telemetry history."
                        : "No water tank history is available yet. Connect the ESP32 and send readings to the database."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="water-footer">
          GREENMIND SMART AGRICULTURE · SMART WATER MANAGEMENT
          <p>
            {simulationMode
              ? "Simulation Mode: illustrative demo values are displayed."
              : "Real Mode: values depend on the fields received from the ESP32 telemetry database."}
          </p>
        </footer>
      </div>
    </main>
  );
}
