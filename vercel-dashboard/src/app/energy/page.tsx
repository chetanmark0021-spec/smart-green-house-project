
"use client";

import { useGreenhouseMode } from "../components/GreenhouseModeProvider";
import "./energy.css";

type EnergyReading = {
  device_id: string | null;
  voltage_v: number | null;
  current_a: number | null;
  power_w: number | null;
  energy_wh: number | null;
  created_at: string;
};

type ExtendedTelemetry = {
  device_id?: string | null;
  voltage_v?: number | null;
  current_a?: number | null;
  power_w?: number | null;
  energy_wh?: number | null;
  created_at: string;
  pump_on?: boolean;
  fan_on?: boolean;
  grow_light_on?: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString();
}

function formatNumber(
  value: number | null | undefined,
  unit: string
) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} ${unit}`
    : "--";
}

function getSimulatedEnergy(item: ExtendedTelemetry): EnergyReading {
  const voltage = 12;

  // Illustrative electrical loads for the demonstration.
  const current =
    0.15 +
    (item.pump_on ? 0.8 : 0) +
    (item.fan_on ? 0.35 : 0) +
    (item.grow_light_on ? 0.45 : 0);

  const power = voltage * current;

  return {
    device_id: "SIMULATOR",
    voltage_v: voltage,
    current_a: Number(current.toFixed(2)),
    power_w: Number(power.toFixed(2)),
    energy_wh: Number((power * 1.5).toFixed(2)),
    created_at: item.created_at,
  };
}

export default function EnergyPage() {
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

  const simulatedReading = extendedTelemetry
    ? getSimulatedEnergy(extendedTelemetry)
    : null;

  const realReading: EnergyReading | null = extendedTelemetry
    ? {
        device_id: extendedTelemetry.device_id ?? null,
        voltage_v: extendedTelemetry.voltage_v ?? null,
        current_a: extendedTelemetry.current_a ?? null,
        power_w: extendedTelemetry.power_w ?? null,
        energy_wh: extendedTelemetry.energy_wh ?? null,
        created_at: extendedTelemetry.created_at,
      }
    : null;

  const reading = simulationMode
    ? simulatedReading
    : realReading;

  const history: EnergyReading[] = (recentTelemetry ?? []).map((item) => {
    const extended = item as typeof item & ExtendedTelemetry;

    if (simulationMode) {
      return getSimulatedEnergy(extended);
    }

    return {
      device_id: extended.device_id ?? null,
      voltage_v: extended.voltage_v ?? null,
      current_a: extended.current_a ?? null,
      power_w: extended.power_w ?? null,
      energy_wh: extended.energy_wh ?? null,
      created_at: extended.created_at,
    };
  });

  const status = simulationMode
    ? "SIMULATION"
    : deviceOnline
      ? "LIVE"
      : telemetry
        ? "STALE"
        : "WAITING";

  const handleRefresh = async () => {
    await refreshTelemetry();
  };

  return (
    <main className="energy-page">
      <div className="energy-container">
        <header className="energy-header">
          <div>
            <p className="energy-brand">
              GREENMIND SMART AGRICULTURE
            </p>

            <h1>Smart Energy Monitoring</h1>

            <p>
              Monitor greenhouse electricity usage and energy readings.
            </p>
          </div>

          <button
            className="energy-refresh"
            onClick={handleRefresh}
            disabled={loading || changing}
          >
            {loading ? "Loading..." : "↻ Refresh Data"}
          </button>
        </header>

        {error && !simulationMode && (
          <div className="energy-error" role="alert">
            {error}
          </div>
        )}

        <section className="energy-connection">
          <div className="energy-connection-heading">
            <h2>ESP32 Energy Sensor Connection</h2>

            <span
              className={`energy-status energy-${status.toLowerCase()}`}
            >
              {status}
            </span>
          </div>

          <p>
            {loading
              ? "Loading energy information..."
              : simulationMode
                ? "Simulation Mode is active. Demonstration energy readings are generated locally."
                : deviceOnline
                  ? "ESP32 telemetry is connected. Energy values appear when the corresponding fields are available."
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
        </section>

        <section className="energy-section">
          <h2>Energy Overview</h2>

          <p>
            {simulationMode
              ? "Illustrative energy readings for demonstration"
              : "Latest available ESP32 energy sensor readings"}
          </p>

          <div className="energy-grid">
            <article className="energy-card">
              <span>⚡</span>
              <p>Voltage</p>
              <h3>{formatNumber(reading?.voltage_v, "V")}</h3>
              <small>Electrical voltage</small>
            </article>

            <article className="energy-card">
              <span>🔌</span>
              <p>Current</p>
              <h3>{formatNumber(reading?.current_a, "A")}</h3>
              <small>Electrical current</small>
            </article>

            <article className="energy-card">
              <span>💡</span>
              <p>Power</p>
              <h3>{formatNumber(reading?.power_w, "W")}</h3>
              <small>Instantaneous power</small>
            </article>

            <article className="energy-card">
              <span>📊</span>
              <p>Energy Consumption</p>
              <h3>{formatNumber(reading?.energy_wh, "Wh")}</h3>
              <small>
                {simulationMode
                  ? "Illustrative demo value"
                  : "Recorded energy usage"}
              </small>
            </article>
          </div>
        </section>

        <section className="energy-section">
          <h2>Energy Usage Analysis</h2>

          <div className="energy-analysis">
            <h3>Latest Recorded Power</h3>

            <strong className="energy-large">
              {formatNumber(reading?.power_w, "W")}
            </strong>

            <p>
              {simulationMode
                ? "This is an illustrative power value generated from the simulated greenhouse equipment states."
                : "This value represents the latest power reading received from the energy telemetry database."}
            </p>

            <h3>Total Recorded Energy</h3>

            <strong className="energy-large">
              {formatNumber(reading?.energy_wh, "Wh")}
            </strong>

            <p>
              {simulationMode
                ? "This is a demonstration value, not actual accumulated electricity consumption."
                : "This is the cumulative energy value reported by the sensor. It is not calculated from missing readings."}
            </p>
          </div>
        </section>

        <section className="energy-section">
          <h2>Energy Monitoring Status</h2>

          <div className="energy-status-grid">
            <div>
              <span>📡</span>
              <p>ESP32 Controller</p>
              <strong>
                {simulationMode
                  ? "Demo Mode"
                  : deviceOnline
                    ? "Connected"
                    : telemetry
                      ? "Not confirmed"
                      : "Waiting"}
              </strong>
            </div>

            <div>
              <span>🕒</span>
              <p>Last Sensor Reading</p>
              <strong>
                {reading ? formatDate(reading.created_at) : "--"}
              </strong>
            </div>

            <div>
              <span>🔋</span>
              <p>Device ID</p>
              <strong>
                {reading?.device_id || "Not available"}
              </strong>
            </div>
          </div>
        </section>

        <section className="energy-section">
          <h2>Recent Energy History</h2>

          <p>Latest {history.length} telemetry readings</p>

          <div className="energy-table-wrapper">
            <table className="energy-table">
              <thead>
                <tr>
                  <th>Date and Time</th>
                  <th>Voltage</th>
                  <th>Current</th>
                  <th>Power</th>
                  <th>Energy</th>
                </tr>
              </thead>

              <tbody>
                {history.length > 0 ? (
                  history.map((item, index) => (
                    <tr key={`${item.created_at}-${index}`}>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{formatNumber(item.voltage_v, "V")}</td>
                      <td>{formatNumber(item.current_a, "A")}</td>
                      <td>{formatNumber(item.power_w, "W")}</td>
                      <td>{formatNumber(item.energy_wh, "Wh")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="energy-empty">
                      {simulationMode
                        ? "Waiting for simulated telemetry history."
                        : "No energy history is available yet. Connect the ESP32 energy sensor and send real readings."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="energy-footer">
          GREENMIND SMART AGRICULTURE · ENERGY MANAGEMENT

          <p>
            {simulationMode
              ? "Simulation Mode: illustrative demonstration energy values are displayed."
              : "Real Mode: energy values depend on the fields received from the ESP32 telemetry database."}
          </p>
        </footer>
      </div>
    </main>
  );
}
