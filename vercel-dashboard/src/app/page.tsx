
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useGreenhouseMode } from "./components/GreenhouseModeProvider";

type Telemetry = {
  id?: number;
  device_id: string;
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  battery_voltage: number | null;
  pump_on: boolean;
  fan_on: boolean;
  grow_light_on: boolean;
  wifi_rssi: number | null;
  created_at: string;
};

const navigation = [
  { label: "Overview", href: "/", icon: "▦" },
  { label: "Plant Health", href: "/plant-health", icon: "🌱" },
  { label: "Disease Detection", href: "/disease-detection", icon: "🔬" },
  { label: "Irrigation", href: "/irrigation", icon: "💧" },
  { label: "Smart Water Management", href: "/water-management", icon: "🚰" },
  { label: "Energy Monitoring", href: "/energy", icon: "⚡" },
  { label: "Greenhouse Digital Twin", href: "/digital-twin", icon: "🏡" },
  { label: "Camera Monitoring", href: "/camera", icon: "📷" },
  { label: "Notification Center", href: "/notifications", icon: "🔔" },
  { label: "AI Predictive Analytics", href: "/predictive-analytics", icon: "🔮" },
  { label: "Analytics", href: "/analytics", icon: "📊" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

const DEVICE_ID =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";
const ONLINE_TIMEOUT_MS = 30000;

/* SIMULATION DATA GENERATOR
   These values are generated locally.
   They are not actual ESP32 sensor readings.
*/
function createSimulatedTelemetry(): Telemetry {
  const temperature = 24 + Math.random() * 7;
  const humidity = 50 + Math.random() * 20;
  const soil = 35 + Math.random() * 40;
  const light = 40 + Math.random() * 50;

  return {
    device_id: "greenhouse-simulator-01",
    temperature_c: Number(temperature.toFixed(1)),
    humidity_percent: Number(humidity.toFixed(1)),
    soil_moisture_percent: Number(soil.toFixed(1)),
    light_percent: Number(light.toFixed(1)),
    battery_voltage: 7.2,
    pump_on: soil < 35,
    fan_on: temperature > 30,
    grow_light_on: light < 45,
    wifi_rssi: -45,
    created_at: new Date().toISOString(),
  };
}

export default function Dashboard() {
  const pathname = usePathname();

  const {
    simulationMode,
    loading: modeLoading,
    error: modeError,
  } = useGreenhouseMode();

  const [data, setData] = useState<Telemetry | null>(null);
  const [recentData, setRecentData] = useState<Telemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [controlBusy, setControlBusy] = useState(false);
  const [controlMessage, setControlMessage] = useState("");

  async function sendEquipmentCommand(action: "resume-auto" | "test", equipment?: string, on?: boolean) {
    setControlBusy(true);
    setControlMessage("");
    try {
      const response = await fetch("/api/equipment-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, equipment, on }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send the test command.");
      setControlMessage(result.message);
    } catch (cause) {
      setControlMessage(cause instanceof Error ? cause.message : "Could not send the test command.");
    } finally {
      setControlBusy(false);
    }
  }

  /* LOAD DATA ACCORDING TO MASTER MODE */
  const loadTelemetry = useCallback(async () => {
    if (simulationMode) {
      const simulated = createSimulatedTelemetry();

      setData(simulated);

      setRecentData((previous) =>
        [simulated, ...previous].slice(0, 30)
      );

      setError("");
      setLastChecked(new Date());
      setLoading(false);
      return;
    }

    try {
      const { data: rows, error: queryError } = await supabase
        .from("greenhouse_telemetry")
        .select(
          "id, device_id, temperature_c, humidity_percent, soil_moisture_percent, light_percent, battery_voltage, pump_on, fan_on, grow_light_on, wifi_rssi, created_at:recorded_at"
        )
        .eq("device_id", DEVICE_ID)
        .order("recorded_at", { ascending: false })
        .limit(30);

      if (queryError) throw queryError;

      const records = (rows || []) as Telemetry[];

      setRecentData(records);
      setData(records[0] ?? null);
      setError("");
      setLastChecked(new Date());
    } catch (err) {
      console.error("Telemetry loading error:", err);

      setData(null);
      setRecentData([]);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load sensor data."
      );
    } finally {
      setLoading(false);
    }
  }, [simulationMode]);

  /* REFRESH AND SUBSCRIBE BASED ON OPERATING MODE */
  useEffect(() => {
    if (modeLoading) return;

    let active = true;

    setLoading(true);
    setData(null);
    setRecentData([]);
    setError("");

    void loadTelemetry();

    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Real ESP32 subscription is enabled only in hardware mode.
    if (!simulationMode) {
      channel = supabase
        .channel("greenmind-live-telemetry")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "greenhouse_telemetry",
          },
          (payload) => {
            if (!active) return;

            const rawIncoming = payload.new as Telemetry & {
              recorded_at?: string;
            };
            const incoming: Telemetry = {
              ...rawIncoming,
              created_at: rawIncoming.recorded_at || rawIncoming.created_at,
            };

            if (incoming.device_id !== DEVICE_ID) return;

            setData(incoming);

            setRecentData((previous) =>
              [incoming, ...previous]
                .filter(
                  (item, index, array) =>
                    array.findIndex(
                      (record) =>
                        record.created_at === item.created_at
                    ) === index
                )
                .slice(0, 30)
            );

            setError("");
            setLastChecked(new Date());
          }
        )
        .subscribe();
    }

    const refreshInterval = window.setInterval(() => {
      if (active) {
        void loadTelemetry();
      }
    }, simulationMode ? 3000 : 5000);

    const clockInterval = window.setInterval(() => {
      if (active) {
        setNow(Date.now());
      }
    }, 1000);

    return () => {
      active = false;

      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [loadTelemetry, simulationMode, modeLoading]);

  /* DEVICE STATUS */
  const deviceOnline = useMemo(() => {
    if (simulationMode) return true;

    if (!data?.created_at) return false;

    const age = now - new Date(data.created_at).getTime();

    return age >= 0 && age <= ONLINE_TIMEOUT_MS;
  }, [data, now, simulationMode]);

  const commandMessage = simulationMode
    ? "Simulation only. Hardware is not being controlled."
    : "Use the protected test buttons to briefly check each relay. Local ESP32 automation remains available with Resume local automation.";

  const temperature = data?.temperature_c ?? null;
  const humidity = data?.humidity_percent ?? null;
  const soil = data?.soil_moisture_percent ?? null;
  const light = data?.light_percent ?? null;

  /* SENSOR CARDS */
  const sensorCards = [
    {
      title: "Temperature",
      value: temperature,
      unit: "°C",
      icon: "🌡️",
      color: "orange",
      status:
        temperature === null
          ? "No data"
          : temperature >= 35
          ? "High temperature"
          : temperature < 15
          ? "Low temperature"
          : "Normal",
    },
    {
      title: "Humidity",
      value: humidity,
      unit: "%",
      icon: "💧",
      color: "blue",
      status:
        humidity === null
          ? "No data"
          : humidity > 80
          ? "High humidity"
          : humidity < 30
          ? "Low humidity"
          : "Normal",
    },
    {
      title: "Soil Moisture",
      value: soil,
      unit: "%",
      icon: "🌱",
      color: "green",
      status:
        soil === null
          ? "No data"
          : soil < 30
          ? "Needs water"
          : soil > 80
          ? "Very wet"
          : "Good",
    },
    {
      title: "Light Intensity",
      value: light,
      unit: "%",
      icon: "☀️",
      color: "yellow",
      status:
        light === null
          ? "No data"
          : "Normal",
    },
  ];

  const latestReadings = recentData.slice(0, 7).reverse();

  const chartMaximum = Math.max(
    100,
    ...latestReadings.map(
      (item) => item.soil_moisture_percent ?? 0
    )
  );

  /* ENVIRONMENTAL HEALTH INDICATOR */
  const healthInputs = [
    temperature === null
      ? null
      : temperature >= 20 && temperature <= 32
      ? 100
      : 60,

    humidity === null
      ? null
      : humidity >= 40 && humidity <= 80
      ? 100
      : 60,

    soil === null
      ? null
      : soil >= 30 && soil <= 80
      ? 100
      : 50,
  ].filter((value): value is number => value !== null);

  const estimatedScore =
    healthInputs.length > 0
      ? Math.round(
          healthInputs.reduce((sum, value) => sum + value, 0) /
            healthInputs.length
        )
      : null;

  const healthLabel =
    estimatedScore === null
      ? "Insufficient data"
      : estimatedScore >= 90
      ? "Healthy"
      : estimatedScore >= 70
      ? "Good"
      : estimatedScore >= 40
      ? "Needs attention"
      : "Critical";

  function formatTimestamp(timestamp?: string) {
    if (!timestamp) return "No readings received";

    return new Date(timestamp).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  }

  /* WAIT FOR MASTER MODE SETTING */
  if (modeLoading) {
    return (
      <div className="gm-dashboard">
        <main className="gm-dashboard-main">
          <p>Connecting to GreenMind operating mode...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="gm-dashboard">
      <aside className="gm-side">
        <Link href="/" className="gm-side-brand">
          <span className="gm-brand-icon">🌿</span>
          <span>
            <strong>GreenMind</strong>
            <small>SMART GREENHOUSE</small>
          </span>
        </Link>

        <p className="gm-side-label">MENU</p>

        <nav className="gm-side-nav">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href
                  ? "gm-side-link active"
                  : "gm-side-link"
              }
              aria-current={
                pathname === item.href ? "page" : undefined
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="gm-side-bottom">
          <div className="gm-side-leaf">🌱</div>
          <strong>GreenMind AI</strong>
          <p>Growing smarter, greener and healthier.</p>
        </div>
      </aside>

      <main className="gm-dashboard-main">
        {/* HEADER */}
        <header className="gm-dashboard-header">
          <div>
            <p className="gm-breadcrumb">Greenhouse / Overview</p>
            <h1>Greenhouse Overview</h1>
            <p className="gm-subtitle">
              {simulationMode
                ? "Explore your greenhouse using simulated sensor readings."
                : "Monitor real sensor readings from your ESP32-S3 hardware."}
            </p>
          </div>

          <div className="gm-header-actions">
            <span className="gm-demo-status">
              <i />
              {simulationMode
                ? "SIMULATION ACTIVE"
                : deviceOnline
                ? "ESP32 LIVE"
                : "DEVICE OFFLINE"}
            </span>

            <button
              className="gm-theme-button"
              onClick={() => {
                const current =
                  document.documentElement.dataset.theme;

                const next =
                  current === "dark" ? "light" : "dark";

                document.documentElement.dataset.theme = next;

                localStorage.setItem("greenmind-theme", next);

                window.dispatchEvent(
                  new CustomEvent("greenmind-theme-change", {
                    detail: next,
                  })
                );
              }}
            >
              ☀️ Theme
            </button>
          </div>
        </header>

        {/* OPERATING MODE BANNER */}
        <section className="gm-welcome">
          <div>
            <span className="gm-welcome-eyebrow">
              SMART AGRICULTURE SYSTEM
            </span>

            <h2>Welcome to your Greenhouse 🌱</h2>

            <p>
              {simulationMode
                ? "Simulation mode is active. Sensor readings are generated locally for demonstration."
                : "Real hardware mode is selected. Sensor readings are received from your ESP32-S3."}
            </p>
          </div>

          <span className="gm-welcome-decoration">🌿</span>
        </section>

        {/* SENSOR HEADING */}
        <div className="gm-sensor-heading">
          <h2>Live Greenhouse Sensors</h2>

          <span>
            {simulationMode
              ? "● Simulation sensors active"
              : loading
              ? "Connecting..."
              : deviceOnline
              ? "● ESP32 connected"
              : "● Waiting for ESP32 data"}
          </span>
        </div>

        {modeError && (
          <div className="gm-error">
            Greenhouse mode warning: {modeError}
          </div>
        )}

        {error && (
          <div className="gm-error">
            Unable to load sensor data: {error}
          </div>
        )}

        {/* SENSOR CARDS */}
        <section className="gm-sensor-grid">
          {sensorCards.map((sensor) => (
            <article
              className="gm-sensor-card"
              key={sensor.title}
            >
              <div className="gm-sensor-top">
                <span className={`gm-sensor-icon ${sensor.color}`}>
                  {sensor.icon}
                </span>

                <span className="gm-card-menu">•••</span>
              </div>

              <p>{sensor.title}</p>

              <h2>
                {sensor.value === null
                  ? "--"
                  : Number(sensor.value).toFixed(1)}

                {sensor.value !== null && (
                  <small>{sensor.unit}</small>
                )}
              </h2>

              <span className="gm-sensor-status">
                ● {sensor.status}
              </span>
            </article>
          ))}
        </section>

        <p className="gm-last-update">
          {loading
            ? "Connecting..."
            : data
            ? `${simulationMode ? "Last simulated update" : "Last sensor update"}: ${formatTimestamp(data.created_at)}`
            : simulationMode
            ? "Starting simulator..."
            : "Waiting for ESP32 sensor data..."}
        </p>

        {/* HEALTH AND SOIL MOISTURE */}
        <section className="gm-overview-grid">
          <article className="gm-panel gm-health-panel">
            <div className="gm-panel-heading">
              <div>
                <h2>Environmental Health Indicator</h2>
                <p>Estimated from available sensor readings</p>
              </div>

              <span>🌿</span>
            </div>

            <div className="gm-health-content">
              <div className="gm-health-ring">
                <div>
                  <strong>
                    {estimatedScore === null
                      ? "--"
                      : `${estimatedScore}%`}
                  </strong>

                  <span>{healthLabel}</span>
                </div>
              </div>

              <div>
                <h3>
                  {estimatedScore === null
                    ? "Waiting for sensor readings"
                    : healthLabel}
                </h3>

                <p>
                  This is an environmental indicator, not an actual
                  plant disease or leaf-health diagnosis.
                </p>

                <Link
                  href="/plant-health"
                  className="gm-small-link"
                >
                  View full plant health →
                </Link>
              </div>
            </div>

            <div className="gm-health-footer">
              <span>Available sensor readings</span>
              <strong>{healthInputs.length} / 3</strong>
            </div>
          </article>

          <article className="gm-panel gm-activity-panel">
            <div className="gm-panel-heading">
              <div>
                <h2>Recent Soil Moisture</h2>
                <p>
                  {simulationMode
                    ? "Latest simulated readings"
                    : "Latest saved ESP32 readings"}
                </p>
              </div>

              <span>🌱</span>
            </div>

            {latestReadings.length > 0 ? (
              <div className="gm-chart">
                {latestReadings.map((item, index) => {
                  const value =
                    item.soil_moisture_percent ?? 0;

                  const height = Math.max(
                    2,
                    (value / chartMaximum) * 100
                  );

                  return (
                    <div
                      className="gm-chart-column"
                      key={`${item.created_at}-${index}`}
                    >
                      <div className="gm-chart-track">
                        <div
                          style={{ height: `${height}%` }}
                        />
                      </div>

                      <span>
                        {new Date(
                          item.created_at
                        ).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No historical readings available yet.</p>
            )}
          </article>
        </section>

        {/* MANUAL DEVICE CONTROL */}
        <section className="gm-device-section">
          <div className="gm-section-heading">
            <div>
              <h2>Equipment Status and Control</h2>
              <p>Test each relay manually, then return the device to local automatic control.</p>
            </div>
            <span className="gm-manual-label">
              {simulationMode ? "SIMULATION MODE" : deviceOnline ? "ESP32 ONLINE" : "ESP32 OFFLINE"}
            </span>
          </div>

          {simulationMode ? (
            <div className="gm-error">
              {commandMessage}
            </div>
          ) : (
            <>
              <p className="gm-last-update">{commandMessage}</p>
              <div className="gm-panel" style={{ marginBottom: 18 }}>
                <div className="gm-panel-heading">
                  <div>
                    <h3>Local automation</h3>
                    <p>Use this after relay testing to restore the ESP32’s local sensor-based behavior.</p>
                  </div>
                  <strong>ESP32 CONTROL</strong>
                </div>
                <button
                  type="button"
                  className="gm-theme-button"
                  disabled={controlBusy || !deviceOnline}
                  onClick={() => void sendEquipmentCommand("resume-auto")}
                >
                  🤖 RESUME LOCAL AUTOMATION
                </button>
              </div>

              <div className="gm-device-grid">
                {([
                  { name: "Water Pump", description: "Irrigation relay", icon: "🚿", key: "pump_on" as const, equipment: "pump", actual: data?.pump_on },
                  { name: "Cooling Fan", description: "Fan relay", icon: "🌀", key: "fan_on" as const, equipment: "fan", actual: data?.fan_on },
                  { name: "Grow Light", description: "Light relay", icon: "💡", key: "grow_light_on" as const, equipment: "grow_light", actual: data?.grow_light_on },
                ]).map((device) => (
                  <article className="gm-device-card" key={device.key}>
                    <span className="gm-device-icon">{device.icon}</span>
                    <div className="gm-device-info">
                      <strong>{device.name}</strong>
                      <small>{device.description}</small>
                      <span>ESP32 reported: {!deviceOnline || device.actual === undefined ? "UNKNOWN" : device.actual ? "ON" : "OFF"}</span>
                      <span>Manual relay test</span>
                    </div>
                    <div className="gm-device-grid">
                      <button type="button" className="gm-theme-button" disabled={controlBusy || !deviceOnline} onClick={() => void sendEquipmentCommand("test", device.equipment, true)}>Test ON</button>
                      <button type="button" className="gm-theme-button" disabled={controlBusy || !deviceOnline} onClick={() => void sendEquipmentCommand("test", device.equipment, false)}>Test OFF</button>
                    </div>
                  </article>
                ))}
              </div>

              {controlMessage && <div className="gm-last-update" role="status">{controlMessage}</div>}

              {!deviceOnline && <div className="gm-error">ESP32 is offline. Controls are disabled until fresh telemetry is received.</div>}
              <p className="gm-last-update">Relay tests require the updated ESP32 firmware and an active Supabase configuration poll. Test the pump only with its water path ready. Relay state shown here updates when the ESP32 sends its next telemetry reading.</p>
            </>
          )}
        </section>

        {/* CONNECTIVITY AND ALERTS */}
        <section className="gm-overview-grid">
          <article className="gm-panel">
            <h2>Device Connectivity</h2>

            <p>
              {simulationMode ? "Simulator" : "ESP32-S3"}:{" "}
              <strong>
                {simulationMode
                  ? "Running"
                  : deviceOnline
                  ? "Connected"
                  : "Offline"}
              </strong>
            </p>

            <p>
              Wi-Fi signal:{" "}
              {deviceOnline && data?.wifi_rssi != null
                ? `${data.wifi_rssi} dBm`
                : "--"}
            </p>

            <p>
              Battery:{" "}
              {deviceOnline &&
              data?.battery_voltage != null &&
              data.battery_voltage > 0
                ? `${data.battery_voltage.toFixed(2)} V`
                : "Sensor not configured"}
            </p>

            <p>
              Last checked:{" "}
              {lastChecked
                ? lastChecked.toLocaleTimeString()
                : "--"}
            </p>

            <button
              className="gm-theme-button"
              onClick={() => void loadTelemetry()}
              disabled={loading}
            >
              ↻ Refresh readings
            </button>
          </article>

          <article className="gm-panel">
            <h2>Greenhouse Alerts</h2>

            {temperature !== null && temperature >= 35 && (
              <p>⚠️ High temperature detected.</p>
            )}

            {soil !== null && soil < 30 && (
              <p>
                💧 Soil moisture is low. Irrigation may be needed.
              </p>
            )}

            {humidity !== null && humidity > 80 && (
              <p>⚠️ Humidity is high. Check ventilation.</p>
            )}

            {!simulationMode && !deviceOnline && (
              <p>
                📡 ESP32 data is not arriving. Check the device.
              </p>
            )}

            {deviceOnline &&
              (temperature === null || temperature < 35) &&
              (soil === null || soil >= 30) &&
              (humidity === null || humidity <= 80) && (
                <p>
                  ✓ No configured sensor warnings at this time.
                </p>
              )}
          </article>
        </section>

        {/* AI AND HARDWARE */}
        <section className="gm-bottom-grid">
          <article className="gm-ai-card">
            <span className="gm-ai-icon">🤖</span>

            <div>
              <span className="gm-welcome-eyebrow">
                AI FARMER ASSISTANT
              </span>

              <h2>Your smart farming assistant</h2>

              <p>
                Ask questions about watering, plant health and
                greenhouse management.
              </p>
            </div>
          </article>

          <article className="gm-hardware-card">
            <h3>Hardware Connection</h3>

            <p>
              <span className="gm-hardware-dot" />
              {simulationMode ? "Simulator" : "ESP32-S3"}
            </p>

            <small>
              {simulationMode
                ? "Local simulated sensor data is running."
                : deviceOnline
                ? "Receiving sensor telemetry from Supabase."
                : "Waiting for new ESP32 telemetry."}
            </small>
          </article>
        </section>

        {/* FOOTER */}
        <footer className="gm-footer">
          <strong>🌱 GREENMIND SMART GREENHOUSE</strong>

          <p>
            {simulationMode
              ? "Simulation mode · AI plant health · Smart agriculture"
              : "Real-time monitoring · AI plant health · Sustainable agriculture"}
          </p>
        </footer>
      </main>
    </div>
  );
}
