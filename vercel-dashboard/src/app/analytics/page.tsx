
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useGreenhouseMode } from "../components/GreenhouseModeProvider";

type Telemetry = {
  id?: number;
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  created_at: string;
  device_id: string;
};

const DEVICE_ID = "greenhouse-esp32-s3-01";

function average(values: (number | null)[]) {
  const valid = values.filter(
    (value): value is number =>
      value !== null && Number.isFinite(value)
  );

  if (!valid.length) return "--";

  return (
    valid.reduce((sum, value) => sum + value, 0) /
    valid.length
  ).toFixed(1);
}

export default function AnalyticsPage() {
  const { simulationMode } = useGreenhouseMode();

  const [records, setRecords] = useState<Telemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (simulationMode) {
      setRecords([]);
      setError("");
      setLoading(false);
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from("greenhouse_telemetry")
        .select(
          "id,temperature_c,humidity_percent,soil_moisture_percent,light_percent,created_at:recorded_at,device_id"
        )
        .eq("device_id", DEVICE_ID)
        .order("recorded_at", { ascending: false })
        .limit(100);

      if (queryError) throw queryError;

      setRecords((data || []) as Telemetry[]);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [simulationMode]);

  useEffect(() => {
    void loadAnalytics();

    if (simulationMode) return;

    const interval = window.setInterval(() => {
      void loadAnalytics();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadAnalytics, simulationMode]);

  const latest = records[0];

  const stats = [
    {
      title: "Average Temperature",
      value: average(records.map((r) => r.temperature_c)),
      unit: "°C",
      icon: "🌡️",
      color: "#f59e0b",
    },
    {
      title: "Average Humidity",
      value: average(records.map((r) => r.humidity_percent)),
      unit: "%",
      icon: "💧",
      color: "#38bdf8",
    },
    {
      title: "Average Soil Moisture",
      value: average(records.map((r) => r.soil_moisture_percent)),
      unit: "%",
      icon: "🌱",
      color: "#34d399",
    },
    {
      title: "Average Light",
      value: average(records.map((r) => r.light_percent)),
      unit: "%",
      icon: "☀️",
      color: "#facc15",
    },
  ];

  const chartRecords = [...records].slice(0, 12).reverse();

  const chartItems = [
    {
      title: "Temperature History",
      field: "temperature_c" as const,
      unit: "°C",
      color: "#f59e0b",
      maximum: 50,
    },
    {
      title: "Humidity History",
      field: "humidity_percent" as const,
      unit: "%",
      color: "#38bdf8",
      maximum: 100,
    },
    {
      title: "Soil Moisture History",
      field: "soil_moisture_percent" as const,
      unit: "%",
      color: "#34d399",
      maximum: 100,
    },
  ];

  const cardStyle = {
    background: "var(--analytics-card, #14283c)",
    border: "1px solid var(--analytics-border, #294158)",
    borderRadius: "16px",
    padding: "22px",
    minWidth: 0,
  } as const;

  const muted = {
    color: "var(--analytics-muted, #9bb0c4)",
  } as const;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "30px",
        background: "var(--analytics-bg, #071321)",
        color: "var(--analytics-text, #f4f7fb)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div>
          <p style={{ ...muted, margin: 0 }}>
            GREENMIND / ANALYTICS
          </p>
          <h1 style={{ fontSize: 30, margin: "8px 0" }}>
            Greenhouse Analytics 📊
          </h1>
          <p style={muted}>
            Monitor sensor performance and greenhouse conditions.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" style={buttonStyle}>
            ← Dashboard
          </Link>

          <button
            onClick={() => {
              setLoading(true);
              void loadAnalytics();
            }}
            style={buttonStyle}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {simulationMode && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          borderColor: "#b7791f",
        }}>
          <strong>Simulation Mode</strong>
          <p style={muted}>
            Analytics are waiting for real ESP32 telemetry.
            Simulated readings are not saved as actual sensor history.
          </p>
        </div>
      )}

      {error && (
        <div style={{
          ...cardStyle,
          marginBottom: 20,
          color: "#fca5a5",
        }}>
          Unable to load analytics: {error}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 16,
          marginBottom: 25,
        }}
      >
        {stats.map((stat) => (
          <article key={stat.title} style={cardStyle}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 27 }}>{stat.icon}</span>
              <span style={{ color: stat.color, fontSize: 13 }}>
                SENSOR
              </span>
            </div>

            <p style={muted}>{stat.title}</p>

            <h2 style={{ fontSize: 30, margin: "8px 0" }}>
              {loading ? "..." : stat.value}
              <small style={{ fontSize: 15, marginLeft: 5 }}>
                {stat.unit}
              </small>
            </h2>
          </article>
        ))}
      </section>

      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 16,
        marginBottom: 25,
      }}>
        <article style={cardStyle}>
          <p style={muted}>Total Records</p>
          <h2 style={{ fontSize: 28 }}>{records.length}</h2>
        </article>

        <article style={cardStyle}>
          <p style={muted}>Latest Temperature</p>
          <h2 style={{ fontSize: 28 }}>
            {latest?.temperature_c ?? "--"}°C
          </h2>
        </article>

        <article style={cardStyle}>
          <p style={muted}>Latest Soil Moisture</p>
          <h2 style={{ fontSize: 28 }}>
            {latest?.soil_moisture_percent ?? "--"}%
          </h2>
        </article>

        <article style={cardStyle}>
          <p style={muted}>Last Updated</p>
          <h3 style={{ fontSize: 17 }}>
            {lastUpdated
              ? lastUpdated.toLocaleTimeString()
              : "--"}
          </h3>
        </article>
      </section>

      <section style={{
        ...cardStyle,
        marginBottom: 25,
      }}>
        <h2>Sensor Trends</h2>
        <p style={muted}>
          Latest 12 recorded sensor readings.
        </p>

        {simulationMode ? (
          <p style={muted}>
            Switch to real ESP32 mode to view stored sensor trends.
          </p>
        ) : loading ? (
          <p style={muted}>Loading sensor history...</p>
        ) : records.length === 0 ? (
          <p style={muted}>No sensor records available yet.</p>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
            gap: 24,
            marginTop: 25,
          }}>
            {chartItems.map((chart) => (
              <div key={chart.title}>
                <h3>{chart.title}</h3>

                <div style={{
                  display: "flex",
                  alignItems: "end",
                  gap: 7,
                  height: 150,
                  paddingTop: 12,
                  borderBottom: "1px solid #456078",
                }}>
                  {chartRecords.map((record, index) => {
                    const value = record[chart.field];
                    const height = value === null
                      ? 0
                      : Math.max(
                          3,
                          Math.min(100, (value / chart.maximum) * 100)
                        );

                    return (
                      <div
                        key={`${record.created_at}-${index}`}
                        title={`${value ?? "--"} ${chart.unit}`}
                        style={{
                          flex: 1,
                          height: `${height}%`,
                          background: chart.color,
                          borderRadius: "5px 5px 0 0",
                          minWidth: 4,
                        }}
                      />
                    );
                  })}
                </div>

                <p style={muted}>
                  Older readings → Latest readings
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2>Recent Sensor Records</h2>

        {loading ? (
          <p style={muted}>Loading records...</p>
        ) : records.length === 0 ? (
          <p style={muted}>No records available.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              minWidth: 650,
            }}>
              <thead>
                <tr>
                  {[
                    "Date & Time",
                    "Temperature",
                    "Humidity",
                    "Soil Moisture",
                    "Light",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: 13,
                        borderBottom: "1px solid #456078",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {records.slice(0, 20).map((record, index) => (
                  <tr key={record.id ?? record.created_at ?? index}>
                    <td style={tableCellStyle}>
                      {new Date(record.created_at).toLocaleString("en-IN")}
                    </td>
                    <td style={tableCellStyle}>
                      {record.temperature_c ?? "--"}°C
                    </td>
                    <td style={tableCellStyle}>
                      {record.humidity_percent ?? "--"}%
                    </td>
                    <td style={tableCellStyle}>
                      {record.soil_moisture_percent ?? "--"}%
                    </td>
                    <td style={tableCellStyle}>
                      {record.light_percent ?? "--"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const buttonStyle = {
  padding: "11px 16px",
  background: "#1d4058",
  color: "#ffffff",
  border: "1px solid #42617a",
  borderRadius: 9,
  textDecoration: "none",
  cursor: "pointer",
} as const;

const tableCellStyle = {
  padding: 13,
  borderBottom: "1px solid #294158",
} as const;
