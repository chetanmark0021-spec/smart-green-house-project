"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./growth-tracker.css";

// ==========================================
// TYPES
// ==========================================

type Plant = {
  id: string | number;
  plant_name: string;
  plant_type: string;
  planting_date: string | null;
  created_at: string;
};

type GrowthLog = {
  id: string | number;
  plant_id: string | number;
  measured_on: string;
  height_cm: number | null;
  leaf_count: number | null;
  growth_stage: string | null;
  health_score: number | null;
};

type CareLog = {
  id: string | number;
  plant_id: string | number;
  care_type: string;
  amount: number | null;
  unit: string | null;
  performed_at: string;
};

type TrackerData = {
  plants: Plant[];
  growthLogs: GrowthLog[];
  careLogs: CareLog[];
};

type IrrigationTelemetry = {
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  battery_voltage: number | null;
  created_at: string | null;
};

type IrrigationResponse = {
  success: boolean;
  mode: "waiting" | "stale" | "live";
  isSimulated: boolean;
  isStale: boolean;
  message: string;
  ageSeconds?: number | null;
  telemetry: IrrigationTelemetry | null;
  history?: IrrigationTelemetry[];
};

type TrendPoint = {
  date: string;
  height: number | null;
  health: number | null;
};

type PlantPrediction = {
  plant: Plant;
  latestHeight: number | null;
  predictedHeight: number | null;
  dailyGrowth: number | null;
  predictionDate: string | null;
  health: number | null;
  healthChange: number | null;
  measurements: number;
  message: string;
  status: "positive" | "warning" | "insufficient";
};

type IrrigationPrediction = {
  status:
    | "waiting"
    | "insufficient"
    | "stable"
    | "drying"
    | "attention";
  title: string;
  message: string;
  moistureTrend: number | null;
  estimatedHoursToThreshold: number | null;
  readingsUsed: number;
};

type IrrigationAlertHistoryItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  level: "critical" | "warning";
  sensorValue: string;
  createdAt: string;
  status: "active" | "resolved";
  resolvedAt: string | null;
  acknowledgedAt?: string | null;
  // Source separates physical ESP32 events from local simulator events.
  source?: "real" | "simulated" | "legacy";
  occurrences?: number;
  lastSeenAt?: string | null;
};

type SavedSensorReading = IrrigationTelemetry & {
  id: string;
  source: "real" | "simulated";
  savedAt: string;
};

// ==========================================
// DATE FORMATTER
// ==========================================

function formatDate(date: string) {
  if (!date) return "Not recorded";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: string) {
  if (!date) return "Unknown";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==========================================
// GROWTH TREND CHART
// ==========================================

function TrendChart({
  title,
  subtitle,
  points,
  field,
  suffix,
}: {
  title: string;
  subtitle: string;
  points: TrendPoint[];
  field: "height" | "health";
  suffix: string;
}) {
  const values = points
    .map((point) => point[field])
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return (
      <article className="analytics-card">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        <div className="analytics-empty">
          No measurements available yet.
        </div>
      </article>
    );
  }

  const width = 600;
  const height = 220;
  const padding = 35;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const chartPoints = points
    .map((point, index) => {
      const value = point[field];

      if (value === null) return null;

      const x =
        padding +
        (index / Math.max(points.length - 1, 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((value - minValue) / range) *
          (height - padding * 2);

      return {
        x,
        y,
        value,
        date: point.date,
      };
    })
    .filter(
      (point): point is NonNullable<typeof point> =>
        point !== null
    );

  const line = chartPoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <article className="analytics-card">
      <h3>{title}</h3>
      <p>{subtitle}</p>

      <div className="analytics-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title} trend chart`}
          className="analytics-line-chart"
        >
          {[0, 1, 2, 3].map((item) => {
            const y =
              padding +
              (item / 3) * (height - padding * 2);

            return (
              <line
                key={item}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="currentColor"
                opacity="0.12"
                strokeDasharray="4 5"
              />
            );
          })}

          {chartPoints.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {chartPoints.map((point, index) => (
            <circle
              key={`${point.date}-${index}`}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#22c55e"
            >
              <title>
                {point.date}: {point.value}
                {suffix}
              </title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="analytics-chart-labels">
        <span>{chartPoints[0]?.date}</span>
        <strong>
          Latest: {chartPoints[chartPoints.length - 1]?.value}
          {suffix}
        </strong>
        <span>
          {chartPoints[chartPoints.length - 1]?.date}
        </span>
      </div>
    </article>
  );
}

// ==========================================
// STEP 9.6.2: SOIL MOISTURE TREND CHART
// ==========================================

function IrrigationTrendChart({
  history,
}: {
  history: IrrigationTelemetry[];
}) {
  const readings = history
    .filter(
      (item) =>
        item.created_at !== null &&
        item.soil_moisture_percent !== null &&
        Number.isFinite(Number(item.soil_moisture_percent))
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(a.created_at!).getTime() -
        new Date(b.created_at!).getTime()
    );

  if (readings.length === 0) {
    return (
      <article className="analytics-card">
        <h3>Soil Moisture Trend</h3>
        <p>Changes in soil moisture over time.</p>
        <div className="analytics-empty">
          Waiting for sensor readings.
        </div>
      </article>
    );
  }

  const width = 600;
  const height = 240;
  const padding = 40;

  const values = readings.map((item) =>
    Number(item.soil_moisture_percent)
  );

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const points = values.map((value, index) => {
    const x =
      padding +
      (index / Math.max(values.length - 1, 1)) *
        (width - padding * 2);

    const y =
      height -
      padding -
      ((value - minValue) / range) *
        (height - padding * 2);

    return { x, y, value };
  });

  const line = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const latest = values[values.length - 1];

  return (
    <article className="analytics-card">
      <h3>Soil Moisture Trend</h3>

      <p>
        Changes in soil moisture using recent sensor readings.
      </p>

      <div className="growth-details">
        <div>
          <span>Latest moisture</span>
          <strong>{latest.toFixed(1)}%</strong>
        </div>

        <div>
          <span>Minimum</span>
          <strong>{minValue.toFixed(1)}%</strong>
        </div>

        <div>
          <span>Maximum</span>
          <strong>{maxValue.toFixed(1)}%</strong>
        </div>
      </div>

      <div className="analytics-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Soil moisture trend chart"
          className="analytics-line-chart"
        >
          {[0, 1, 2, 3].map((item) => {
            const y =
              padding +
              (item / 3) * (height - padding * 2);

            return (
              <line
                key={item}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="currentColor"
                opacity="0.12"
                strokeDasharray="4 5"
              />
            );
          })}

          {points.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#22c55e"
            >
              <title>{point.value.toFixed(1)}%</title>
            </circle>
          ))}
        </svg>
      </div>

      <p>
        <strong>Readings analysed:</strong> {readings.length}
      </p>

      <p>
        <strong>Advisory threshold:</strong> 30%
      </p>
    </article>
  );
}// ==========================================
// STEP 9.6.3: IRRIGATION ALERT SYSTEM
// ==========================================

function IrrigationAlerts({
  telemetry,
  isStale,
  isSimulated,
  thresholds,
}: {
  telemetry: IrrigationTelemetry | null;
  isStale: boolean;
  isSimulated: boolean;
  thresholds: AlertThresholds;
}) {
  const moisture = telemetry?.soil_moisture_percent;
  const temperature = telemetry?.temperature_c;

  const alerts: {
    title: string;
    message: string;
    level: "critical" | "warning" | "info" | "success";
  }[] = [];

  if (!telemetry || isStale) {
    alerts.push({
      title: "Sensor data unavailable",
      message:
        "GreenMind has no fresh sensor readings. Check the ESP32 connection and data transmission.",
      level: "info",
    });
  } else {
    if (moisture !== null && moisture !== undefined) {
      const value = Number(moisture);

      if (Number.isFinite(value)) {
        if (value <= thresholds.criticalMoisture) {
          alerts.push({
            title: "Critical soil moisture",
            message:
              `Soil moisture is ${value.toFixed(1)}%. Inspect the soil and plant immediately. Watering may be required.`,
            level: "critical",
          });
        } else if (value <= thresholds.lowMoisture) {
          alerts.push({
            title: "Low soil moisture",
            message:
              `Soil moisture is ${value.toFixed(1)}%. Check the soil and consider watering if the plant needs it.`,
            level: "warning",
          });
        }
      }
    }

    if (
      temperature !== null &&
      temperature !== undefined &&
      Number.isFinite(Number(temperature)) &&
      Number(temperature) >= thresholds.highTemperature
    ) {
      alerts.push({
        title: "High greenhouse temperature",
        message:
          `Temperature is ${Number(temperature).toFixed(1)}°C. Check ventilation and plant condition.`,
        level: "warning",
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      title: "Greenhouse conditions look normal",
      message:
        "No irrigation or temperature alerts were detected from the available readings.",
      level: "success",
    });
  }

  const alertStyles = {
    critical: {
      background: "#451a1a",
      border: "#ef4444",
      color: "#fecaca",
      label: "CRITICAL",
    },
    warning: {
      background: "#422006",
      border: "#f59e0b",
      color: "#fde68a",
      label: "WARNING",
    },
    info: {
      background: "#172554",
      border: "#3b82f6",
      color: "#bfdbfe",
      label: "INFO",
    },
    success: {
      background: "#052e16",
      border: "#22c55e",
      color: "#bbf7d0",
      label: "NORMAL",
    },
  };

  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div>
          <h3>Irrigation Alerts</h3>
          <p>
            Automatic warnings based on greenhouse sensor readings.
          </p>
        </div>

        <span className="growth-public-label">
          {alerts.filter((alert) => alert.level === "critical" || alert.level === "warning").length} ACTIONABLE {alerts.filter((alert) => alert.level === "critical" || alert.level === "warning").length === 1 ? "ALERT" : "ALERTS"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
          marginTop: "16px",
        }}
      >
        {alerts.map((alert, index) => {
          const style = alertStyles[alert.level];

          return (
            <div
              key={`${alert.title}-${index}`}
              role="status"
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: `1px solid ${style.border}`,
                background: style.background,
                color: style.color,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "6px",
                }}
              >
                <strong>{alert.title}</strong>

                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                  }}
                >
                  {style.label}
                </span>
              </div>

              <p style={{ margin: 0 }}>
                {alert.message}
              </p>
            </div>
          );
        })}
      </div>

      {isSimulated && (
        <p style={{ marginTop: "14px", fontSize: "13px" }}>
          Demo mode: these alerts use simulated readings and
          do not represent actual greenhouse conditions.
        </p>
      )}

      <p style={{ marginTop: "10px", fontSize: "13px" }}>
        Alerts are advisory only. They do not automatically
        activate the pump, fan or grow light.
      </p>
    </article>
  );
}

// ==========================================
// STEP 9.2: PLANT GROWTH PREDICTION
// Statistical estimate using historical height.
// Not a trained machine-learning model.
// ==========================================

function predictPlantGrowth(
  plant: Plant,
  logs: GrowthLog[]
): PlantPrediction {
  const sorted = logs
    .filter(
      (log) =>
        log.height_cm !== null &&
        Number.isFinite(Number(log.height_cm)) &&
        Boolean(log.measured_on)
    )
    .sort((a, b) =>
      a.measured_on.localeCompare(b.measured_on)
    );

  const healthLogs = logs
    .filter(
      (log) =>
        log.health_score !== null &&
        Number.isFinite(Number(log.health_score))
    )
    .sort((a, b) =>
      a.measured_on.localeCompare(b.measured_on)
    );

  const latestHeightLog = sorted[sorted.length - 1];

  const latestHeight = latestHeightLog
    ? Number(latestHeightLog.height_cm)
    : null;

  const latestHealthLog =
    healthLogs[healthLogs.length - 1];

  const previousHealthLog =
    healthLogs.length >= 2
      ? healthLogs[healthLogs.length - 2]
      : null;

  const health =
    latestHealthLog?.health_score != null
      ? Number(latestHealthLog.health_score)
      : null;

  const healthChange =
    latestHealthLog && previousHealthLog
      ? Number(latestHealthLog.health_score) -
        Number(previousHealthLog.health_score)
      : null;

  const insufficient = (
    message: string
  ): PlantPrediction => ({
    plant,
    latestHeight,
    predictedHeight: null,
    dailyGrowth: null,
    predictionDate: null,
    health,
    healthChange,
    measurements: sorted.length,
    message,
    status: "insufficient",
  });

  if (sorted.length < 2) {
    return insufficient(
      "Record at least two height measurements on different dates to estimate growth."
    );
  }

  const firstTime = new Date(
    `${sorted[0].measured_on}T00:00:00Z`
  ).getTime();

  const latestTime = new Date(
    `${latestHeightLog.measured_on}T00:00:00Z`
  ).getTime();

  const totalDays =
    (latestTime - firstTime) / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    return insufficient(
      "Measurements must have different valid dates."
    );
  }

  const points = sorted.map((log) => ({
    x:
      (new Date(
        `${log.measured_on}T00:00:00Z`
      ).getTime() - firstTime) /
      (1000 * 60 * 60 * 24),
    y: Number(log.height_cm),
  }));

  const meanX =
    points.reduce((sum, point) => sum + point.x, 0) /
    points.length;

  const meanY =
    points.reduce((sum, point) => sum + point.y, 0) /
    points.length;

  const numerator = points.reduce(
    (sum, point) =>
      sum + (point.x - meanX) * (point.y - meanY),
    0
  );

  const denominator = points.reduce(
    (sum, point) =>
      sum + Math.pow(point.x - meanX, 2),
    0
  );

  if (denominator === 0) {
    return insufficient(
      "There is not enough date variation to estimate growth."
    );
  }

  const dailyGrowth = numerator / denominator;

  const predictedHeight =
    meanY + dailyGrowth * (totalDays + 7 - meanX);

  const predictionDate = new Date(
    latestTime + 7 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  if (!Number.isFinite(predictedHeight)) {
    return insufficient(
      "Unable to calculate a reliable growth estimate."
    );
  }

  let status: PlantPrediction["status"] = "positive";

  let message =
    "The recorded measurements show a positive height trend.";

  if (dailyGrowth < 0) {
    status = "warning";
    message =
      "Recorded height measurements show a declining trend. Check measurement accuracy and plant condition.";
  } else if (dailyGrowth === 0) {
    status = "warning";
    message =
      "No height increase is visible in the recorded measurements.";
  }

  if (health !== null && health < 40) {
    status = "warning";
    message =
      "Low recorded health score. Inspect the plant and review its care.";
  } else if (
    healthChange !== null &&
    healthChange <= -10
  ) {
    status = "warning";
    message =
      "Plant health has dropped by 10 or more points since the previous recorded measurement.";
  }

  return {
    plant,
    latestHeight,
    predictedHeight: Math.max(0, predictedHeight),
    dailyGrowth,
    predictionDate,
    health,
    healthChange,
    measurements: sorted.length,
    message,
    status,
  };
}

// ==========================================
// STEP 9.4.5: PREDICTIVE IRRIGATION ANALYSIS
// ==========================================

function analyzeIrrigation(
  history: IrrigationTelemetry[],
  isStale: boolean
): IrrigationPrediction {
  const emptyResult: IrrigationPrediction = {
    status: "waiting",
    title: "Waiting for sensor readings",
    message:
      "Predictive irrigation will become available after fresh ESP32 sensor readings arrive.",
    moistureTrend: null,
    estimatedHoursToThreshold: null,
    readingsUsed: 0,
  };

  if (isStale || !history || history.length === 0) {
    return emptyResult;
  }

  const readings = history
    .filter((item) => {
      if (item.created_at === null || item.soil_moisture_percent === null) return false;
      const moisture = Number(item.soil_moisture_percent);
      const timestamp = new Date(item.created_at).getTime();
      return Number.isFinite(moisture) && moisture >= 0 && moisture <= 100 && Number.isFinite(timestamp);
    })
    .map((item) => ({
      moisture: Number(item.soil_moisture_percent),
      time: new Date(item.created_at as string).getTime(),
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-10);
  if (readings.length === 0) {
    return emptyResult;
  }

  const latest = readings[readings.length - 1];

  if (latest.moisture <= 30) {
    return {
      status: "attention",
      title: "Soil moisture is at or below 30%",
      message:
        "Inspect the soil and plant. Watering may be needed. This advisory is based on the latest sensor reading, not a prediction.",
      moistureTrend: null,
      estimatedHoursToThreshold: null,
      readingsUsed: readings.length,
    };
  }

  const first = readings[0];
  const observationMinutes = (latest.time - first.time) / (1000 * 60);

  if (readings.length < 5 || observationMinutes < 10) {
    return {
      status: "insufficient",
      title: "Collecting reliable sensor data",
      message: "At least 5 valid readings spanning 10 minutes are required before estimating a moisture trend.",
      moistureTrend: null,
      estimatedHoursToThreshold: null,
      readingsUsed: readings.length,
    };
  }

  const points = readings.map((reading) => ({
    x: (reading.time - first.time) / (1000 * 60 * 60),
    y: reading.moisture,
  }));
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + Math.pow(point.x - meanX, 2), 0);

  if (denominator === 0) {
    return {
      status: "insufficient", title: "Not enough time variation",
      message: "GreenMind needs readings collected at different times to calculate a moisture trend.",
      moistureTrend: null, estimatedHoursToThreshold: null, readingsUsed: readings.length,
    };
  }

  const slope = numerator / denominator;
  const changes = readings.slice(1).map((reading, index) => reading.moisture - readings[index].moisture);
  const downwardChanges = changes.filter((change) => change < -0.05).length;
  const upwardChanges = changes.filter((change) => change > 0.05).length;
  const directionalShare = Math.max(downwardChanges, upwardChanges) / Math.max(1, changes.length);

  // Reject spikes and inconsistent short-lived changes rather than presenting a misleading ETA.
  if (!Number.isFinite(slope) || Math.abs(slope) > 5 || directionalShare < 0.7) {
    return {
      status: "insufficient",
      title: "Moisture trend is not yet reliable",
      message: "Recent readings fluctuate too much or change too quickly for a dependable estimate. Continue collecting readings and inspect the soil directly.",
      moistureTrend: null,
      estimatedHoursToThreshold: null,
      readingsUsed: readings.length,
    };
  }

  if (slope < -0.05) {
    const hoursToThreshold = (latest.moisture - 30) / Math.abs(slope);
    return {
      status: "drying",
      title: "Soil moisture is gradually decreasing",
      message: `The latest consistent readings suggest moisture is decreasing by approximately ${Math.abs(slope).toFixed(2)} percentage points per hour. The 30% advisory threshold may be reached in approximately ${hoursToThreshold.toFixed(1)} hours if this trend continues. This is an estimate, not a guarantee.`,
      moistureTrend: slope,
      estimatedHoursToThreshold: Number.isFinite(hoursToThreshold) ? hoursToThreshold : null,
      readingsUsed: readings.length,
    };
  }

  if (slope > 0.05) {
    return {
      status: "stable", title: "Soil moisture is increasing",
      message: "Recent consistent readings show increasing soil moisture. Continue monitoring and inspect the plant before watering.",
      moistureTrend: slope, estimatedHoursToThreshold: null, readingsUsed: readings.length,
    };
  }

  return {
    status: "stable", title: "Soil moisture is relatively stable",
    message: "Recent readings do not show a significant moisture change. Continue monitoring the greenhouse.",
    moistureTrend: slope, estimatedHoursToThreshold: null, readingsUsed: readings.length,
  };}
// ==========================================
// STEP 9.6.11: SENSOR HEALTH DIAGNOSTICS & SIMULATOR CLOCK FIX
// Validates received values and timestamps.
// It does not claim hardware calibration.
// ==========================================

function SensorDataQuality({
  response,
  isSimulated,
}: {
  response: IrrigationResponse | null;
  isSimulated: boolean;
}) {
  const readings = response?.history ?? (response?.telemetry ? [response.telemetry] : []);
  const latest = response?.telemetry ?? null;
  const issues: string[] = [];
  const validTimestamp = latest?.created_at
    ? new Date(latest.created_at).getTime()
    : NaN;
  const ageSeconds = Number.isFinite(validTimestamp)
    ? Math.round((Date.now() - validTimestamp) / 1000)
    : null;

  // No reading is an availability state, not a failed value validation.
  if (latest) {
    const checks: [string, number | null, number, number][] = [
      ["Soil moisture", latest.soil_moisture_percent, 0, 100],
      ["Temperature", latest.temperature_c, -10, 60],
      ["Humidity", latest.humidity_percent, 0, 100],
    ];
    for (const [label, raw, min, max] of checks) {
      if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
        issues.push(`${label} value is missing or not numeric.`);
      } else if (Number(raw) < min || Number(raw) > max) {
        issues.push(`${label} value is outside the expected validation range.`);
      }
    }
    if (!Number.isFinite(validTimestamp)) {
      issues.push("Reading timestamp is missing or invalid.");
    } else if (ageSeconds !== null && ageSeconds < -60) {
      issues.push("Reading timestamp is unexpectedly in the future.");
    }
    if (response?.isStale && !isSimulated) {
      issues.push("The latest real sensor reading is marked as stale.");
    }
    if (!isSimulated && ageSeconds !== null && ageSeconds > 300 && !response?.isStale) {
      issues.push("The latest real sensor reading is more than five minutes old.");
    }
  }

  const timestamps = readings
    .map((item) => item.created_at ? new Date(item.created_at).getTime() : NaN)
    .filter((value) => Number.isFinite(value));
  const uniqueTimestamps = new Set(timestamps);
  if (timestamps.length !== uniqueTimestamps.size) {
    issues.push("Duplicate timestamps were found in the recent reading history.");
  }
  if (timestamps.some((value, index) => index > 0 && value < timestamps[index - 1])) {
    issues.push("Reading timestamps are not in chronological order.");
  }

  const intervals = timestamps.slice(1).map((value, index) => (value - timestamps[index]) / 1000)
    .filter((value) => value > 0);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length
    ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    : null;
  const largestGap = intervals.length ? Math.max(...intervals) : null;
  const irregularGap = medianInterval !== null && largestGap !== null && largestGap > medianInterval * 3;
  if (irregularGap) {
    issues.push("Reading intervals contain a gap more than three times the typical interval.");
  }

  const waitingForData = !latest;
  const qualityLabel = waitingForData
    ? "WAITING FOR DATA"
    : issues.length === 0
      ? "BASIC CHECKS PASSED"
      : "CHECK REQUIRED";
  const qualityClass = !waitingForData && issues.length === 0
    ? "growth-health-badge"
    : "growth-pending-badge";
  const freshness = ageSeconds === null
    ? "No reading yet"
    : ageSeconds < -60
      ? "Invalid future time"
      : ageSeconds <= 120
        ? "Fresh"
        : ageSeconds <= 300
          ? "Aging"
          : "Outdated";
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "No reading yet";
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    return `${(seconds / 60).toFixed(1)} min`;
  };

  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div>
          <h3>Sensor Reliability &amp; Data Quality</h3>
          <p>Checks value ranges, timestamps, reading freshness and transmission gaps.</p>
        </div>
        <span className={qualityClass}>{qualityLabel}</span>
      </div>
      <div className="growth-details">
        <div><span>Readings available</span><strong>{readings.length}</strong></div>
        <div><span>Latest reading</span><strong>{latest?.created_at && Number.isFinite(validTimestamp) ? new Date(validTimestamp).toLocaleString() : "Unavailable"}</strong></div>
        <div><span>Data source</span><strong>{isSimulated ? "Simulator" : "ESP32 / API"}</strong></div>
        <div><span>Validation issues</span><strong>{issues.length}</strong></div>
        <div><span>Data freshness</span><strong>{isSimulated ? "Demo reading" : freshness}</strong></div>
        <div><span>Reading age</span><strong>{isSimulated ? "Simulated" : formatDuration(ageSeconds)}</strong></div>
        <div><span>Typical reading interval</span><strong>{formatDuration(medianInterval)}</strong></div>
        <div><span>Largest history gap</span><strong>{formatDuration(largestGap)}</strong></div>
      </div>
      {waitingForData ? (
        <div className="analytics-empty">
          <strong>No sensor readings received yet</strong>
          <p>This is a data-availability state, not a failed sensor-value validation. Connect the ESP32, confirm it is publishing to the expected Supabase table, and refresh sensors.</p>
        </div>
      ) : issues.length === 0 ? (
        <p>Latest available values and recent timestamps passed these basic checks. This does not verify sensor calibration or physical accuracy.</p>
      ) : (
        <ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
      )}
      <p><strong>Diagnostic note:</strong> Freshness thresholds apply to real ESP32/API readings. Simulator timestamps are generated locally and should not be used to assess hardware uptime.</p>
      <p><strong>Calibration note:</strong> These checks detect data-format, timing and plausibility problems only. Compare the sensor with a trusted reference instrument to verify calibration.</p>
    </article>
  );
}

// ==========================================
// STEP 9.5: LOCAL SENSOR SIMULATOR
// Demo data stays in browser memory.
// It is never saved to Supabase.
// ==========================================

function createDemoIrrigation(): IrrigationResponse {
  const now = Date.now();

  const moistureValues = [
    44.0,
    43.2,
    42.4,
    41.5,
    40.6,
    39.7,
    38.8,
  ];

  const history: IrrigationTelemetry[] = moistureValues.map(
    (moisture, index) => ({
      temperature_c: 28 + index * 0.2,
      humidity_percent: 65 - index * 0.3,
      soil_moisture_percent: moisture,
      light_percent: 70,
      battery_voltage: null,
      created_at: new Date(
        now - (6 - index) * 2 * 60 * 1000
      ).toISOString(),
    })
  );

  const latest = history[history.length - 1];

  return {
    success: true,
    mode: "live",
    isSimulated: true,
    isStale: false,
    message:
      "Demo sensor data is active. These are simulated readings, not real ESP32 data.",
    ageSeconds: 0,
    telemetry: latest,
    history,
  };
}

// ==========================================
// ADD ONE SIMULATED SENSOR READING
// Simulator timestamps follow the real browser clock.
// This prevents demo readings from drifting into the future.
// ==========================================

function advanceDemoIrrigation(
  current: IrrigationResponse
): IrrigationResponse {
  const previous = current.telemetry;

  if (!previous) return current;

  const previousMoisture =
    Number(previous.soil_moisture_percent ?? 38.8);

  const previousTime = previous.created_at
    ? new Date(previous.created_at).getTime()
    : Date.now();

  // Use the actual browser time for each new demo observation.
  // The +1 ms guard keeps timestamps strictly increasing if two updates
  // happen within the same millisecond or the system clock briefly stalls.
  const nextTimestamp = Math.max(Date.now(), previousTime + 1);

  const nextReading: IrrigationTelemetry = {
    temperature_c:
      Number(previous.temperature_c ?? 29.2) + 0.1,
    humidity_percent:
      Number(previous.humidity_percent ?? 63.2) - 0.1,
    soil_moisture_percent: Math.max(
      5,
      previousMoisture - 0.8
    ),
    light_percent: previous.light_percent,
    battery_voltage: null,
    created_at: new Date(nextTimestamp).toISOString(),
  };

  const history = [
    ...(current.history ?? []),
    nextReading,
  ].slice(-150);

  return {
    ...current,
    message:
      "Demo sensor data is active. These are simulated readings, not real ESP32 data.",
    telemetry: nextReading,
    history,
  };
}

// ==========================================
// STEP 9.6.5: ALERT HISTORY WITH FILTERS,
// SEARCH, CLEAR AND CSV EXPORT
// ==========================================

function IrrigationAlertHistory({
  history,
  onClear,
  onAcknowledge,
  onResolve,
}: {
  history: IrrigationAlertHistoryItem[];
  onClear: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "critical" | "warning"
  >("all");

  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "resolved"
  >("all");

  const [sourceFilter, setSourceFilter] = useState<
    "all" | "real" | "simulated" | "legacy"
  >("all");

  const [searchTerm, setSearchTerm] = useState("");

  const activeCount = history.filter(
    (item) => item.status === "active"
  ).length;

  const resolvedCount = history.length - activeCount;

  const sortedHistory = [...history].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );

  const search = searchTerm.trim().toLowerCase();

  const filteredHistory = sortedHistory.filter((item) => {
    const matchesSeverity =
      severityFilter === "all" ||
      item.level === severityFilter;

    const matchesStatus =
      statusFilter === "all" ||
      item.status === statusFilter;

    const itemSource = item.source ?? "legacy";
    const matchesSource =
      sourceFilter === "all" || itemSource === sourceFilter;

    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search) ||
      item.message.toLowerCase().includes(search) ||
      item.sensorValue.toLowerCase().includes(search) ||
      item.type.toLowerCase().includes(search);

    return matchesSeverity && matchesStatus && matchesSource && matchesSearch;
  });

  const levelStyles = {
    critical: {
      background: "#451a1a",
      border: "#ef4444",
      color: "#fecaca",
      label: "CRITICAL",
    },
    warning: {
      background: "#422006",
      border: "#f59e0b",
      color: "#fde68a",
      label: "WARNING",
    },
  };

  // EXPORT ALERT HISTORY TO CSV

  const exportToCSV = () => {
    if (filteredHistory.length === 0) {
      window.alert("There are no alert records to export.");
      return;
    }

    const headers = [
      "Alert Type",
      "Source",
      "Title",
      "Severity",
      "Sensor Value",
      "Message",
      "Status",
      "Recorded At",
      "Acknowledged At",
      "Resolved At",
    ];

    const escapeCSV = (value: string) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const rows = filteredHistory.map((item) => [
      item.type,
      item.source === "simulated" ? "Simulated" : item.source === "real" ? "Real ESP32" : "Legacy / Unknown",
      item.title,
      item.level,
      item.sensorValue,
      item.message,
      item.status,
      formatDateTime(item.createdAt),
      item.acknowledgedAt
        ? formatDateTime(item.acknowledgedAt)
        : "Not acknowledged",
      item.resolvedAt
        ? formatDateTime(item.resolvedAt)
        : "Not resolved",
    ]);

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) =>
        row.map((value) => escapeCSV(value)).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `greenmind-irrigation-alerts-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // CLEAR ALERT HISTORY

  const clearHistory = () => {
    if (history.length === 0) return;

    const confirmed = window.confirm(
      "Are you sure you want to clear all saved irrigation alert history from this browser? This action cannot be undone."
    );

    if (!confirmed) return;

    onClear();
    setSearchTerm("");
    setSeverityFilter("all");
    setStatusFilter("all");
    setSourceFilter("all");
  };

  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div>
          <h3>Irrigation Alert History</h3>
          <p>
            Search, filter and export previous greenhouse alerts.
          </p>
        </div>

        <span className="growth-public-label">
          {history.length} RECORDS
        </span>
      </div>

      {/* ALERT SUMMARY */}

      <div className="growth-stats">
        <article className="growth-stat-card">
          <span>Total Alerts</span>
          <strong>{history.length}</strong>
          <small>Recorded alert events</small>
        </article>

        <article className="growth-stat-card">
          <span>Unresolved Alerts</span>
          <strong>{activeCount}</strong>
          <small>Awaiting resolution</small>
        </article>

        <article className="growth-stat-card">
          <span>Resolved Alerts</span>
          <strong>{resolvedCount}</strong>
          <small>Previously cleared</small>
        </article>
      </div>

      {/* SEARCH AND FILTERS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginTop: "20px",
        }}
      >
        <div>
          <label
            htmlFor="alert-search"
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Search alerts
          </label>

          <input
            id="alert-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search title, message or value..."
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #64748b",
              background: "transparent",
              color: "inherit",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="alert-severity-filter"
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Filter by severity
          </label>

          <select
            id="alert-severity-filter"
            value={severityFilter}
            onChange={(event) =>
              setSeverityFilter(
                event.target.value as "all" | "critical" | "warning"
              )
            }
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #64748b",
              background: "transparent",
              color: "inherit",
            }}
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="alert-status-filter"
            style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Filter by status
          </label>

          <select
            id="alert-status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "active" | "resolved"
              )
            }
            style={{
              width: "100%",
              minHeight: "42px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #64748b",
              background: "transparent",
              color: "inherit",
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="alert-source-filter"
            style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 700 }}
          >
            Filter by source
          </label>
          <select
            id="alert-source-filter"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as "all" | "real" | "simulated" | "legacy")}
            style={{ width: "100%", minHeight: "42px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #64748b", background: "transparent", color: "inherit" }}
          >
            <option value="all">All sources</option>
            <option value="real">Real ESP32</option>
            <option value="simulated">Simulator</option>
            <option value="legacy">Legacy / Unknown</option>
          </select>
        </div>
      </div>

      {/* ACTION BUTTONS */}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "16px",
        }}
      >
        <button
          type="button"
          className="growth-refresh"
          onClick={exportToCSV}
          disabled={filteredHistory.length === 0}
        >
          ↓ Export CSV ({filteredHistory.length})
        </button>

        <button
          type="button"
          className="growth-refresh"
          onClick={clearHistory}
          disabled={history.length === 0}
        >
          Clear Alert History
        </button>
      </div>

      {/* ALERT RECORDS */}

      {history.length === 0 ? (
        <div className="analytics-empty">
          <strong>No alert history yet</strong>
          <p>
            GreenMind will record an alert when soil moisture or
            greenhouse temperature crosses an alert threshold.
          </p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="analytics-empty">
          <strong>No matching alerts found</strong>
          <p>Try changing the filters or search term.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <p style={{ fontSize: "13px", margin: 0 }}>
            Showing <strong>{filteredHistory.length}</strong> of{" "}
            <strong>{history.length}</strong> alert records.
          </p>

          {filteredHistory.map((item) => {
            const style = levelStyles[item.level];

            return (
              <div
                key={item.id}
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  border: `1px solid ${style.border}`,
                  background: style.background,
                  color: style.color,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <strong>{item.title}</strong>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800 }}>{style.label}</span>
                    <span style={{ fontSize: "10px", fontWeight: 800, padding: "4px 8px", borderRadius: "20px", background: item.source === "real" ? "#164e63" : item.source === "simulated" ? "#713f12" : "#334155", color: "#fff" }}>
                      {item.source === "real" ? "REAL ESP32" : item.source === "simulated" ? "SIMULATED DEMO" : "LEGACY / UNKNOWN SOURCE"}
                    </span>
                  </div>
                </div>

                <p style={{ margin: "8px 0" }}>{item.message}</p>

                <p style={{ margin: "4px 0", fontSize: "13px" }}>
                  <strong>Sensor value:</strong> {item.sensorValue}
                </p>

                <p style={{ margin: "4px 0", fontSize: "13px" }}>
                  <strong>Recorded:</strong>{" "}
                  {formatDateTime(item.createdAt)}
                </p>

                {item.resolvedAt && (
                  <p style={{ margin: "4px 0", fontSize: "13px" }}>
                    <strong>Resolved:</strong>{" "}
                    {formatDateTime(item.resolvedAt)}
                  </p>
                )}

                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "5px 10px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 800,
                      background:
                        item.status === "active" ? "#7f1d1d" : "#14532d",
                      color: "#ffffff",
                    }}
                  >
                    {item.status === "active" ? "ACTIVE" : "RESOLVED"}
                  </span>
                  {item.acknowledgedAt && (
                    <span style={{ fontSize: "11px", fontWeight: 800, padding: "5px 10px", borderRadius: "20px", background: "#1e3a8a", color: "#dbeafe" }}>
                      ACKNOWLEDGED
                    </span>
                  )}
                </div>

                {item.acknowledgedAt && (
                  <p style={{ margin: "8px 0 0", fontSize: "12px" }}>
                    <strong>Acknowledged:</strong> {formatDateTime(item.acknowledgedAt)}
                  </p>
                )}

                {item.status === "active" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                    {!item.acknowledgedAt && (
                      <button type="button" className="growth-refresh" onClick={() => onAcknowledge(item.id)}>
                        ✓ Acknowledge
                      </button>
                    )}
                    <button type="button" className="growth-refresh" onClick={() => onResolve(item.id)}>
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ marginTop: "14px", fontSize: "13px" }}>
        Alert history is stored in this browser only. Clearing browser
        storage or changing devices can remove or hide these records.
        Real ESP32 events and simulator demo events are labelled and can be filtered separately. Older records created before source tracking are labelled Legacy / Unknown. Simulator alerts are not actual hardware events. Clearing history does not stop the alert system; a current active condition may be recorded again when the next valid reading arrives.
      </p>
    </article>
  );
}


// ==========================================
// STEP 9.6.6: ADVANCED ALERT ANALYTICS,
// REPORTS AND OPTIONAL BROWSER NOTIFICATIONS
// ==========================================

function IrrigationAlertAnalytics({
  history,
}: {
  history: IrrigationAlertHistoryItem[];
}) {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  // Notify only after the user explicitly grants browser permission.
  // Store the last notified ID so refreshes do not repeat notifications.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    const newestActive = [...history]
      .filter((item) => item.status === "active")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!newestActive) return;

    try {
      const storageKey = "greenmind-last-notified-alert-id";
      if (localStorage.getItem(storageKey) === newestActive.id) return;
      new Notification(`GreenMind: ${newestActive.title}`, {
        body: `${newestActive.message} Sensor value: ${newestActive.sensorValue}`,
        tag: `greenmind-${newestActive.id}`,
      });
      localStorage.setItem(storageKey, newestActive.id);
    } catch (error) {
      console.error("Unable to show GreenMind browser notification:", error);
    }
  }, [history, notificationPermission]);

  const requestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (error) {
      console.error("Notification permission request failed:", error);
    }
  };

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = startToday - 6 * 24 * 60 * 60 * 1000;
  const validHistory = history.filter((item) => Number.isFinite(new Date(item.createdAt).getTime()));
  const todayAlerts = validHistory.filter((item) => new Date(item.createdAt).getTime() >= startToday);
  const weekAlerts = validHistory.filter((item) => new Date(item.createdAt).getTime() >= startWeek);
  const criticalCount = validHistory.filter((item) => item.level === "critical").length;
  const warningCount = validHistory.filter((item) => item.level === "warning").length;
  const activeCount = validHistory.filter((item) => item.status === "active").length;
  const realEventCount = validHistory.filter((item) => item.source === "real").length;
  const simulatedEventCount = validHistory.filter((item) => item.source === "simulated").length;
  const legacyEventCount = validHistory.filter((item) => !item.source || item.source === "legacy").length;
  const maxDaily = Math.max(1, ...Array.from({ length: 7 }, (_, index) => {
    const dayStart = startToday - (6 - index) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return validHistory.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return time >= dayStart && time < dayEnd;
    }).length;
  }));
  const dailyBars = Array.from({ length: 7 }, (_, index) => {
    const dayStart = startToday - (6 - index) * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const count = validHistory.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return time >= dayStart && time < dayEnd;
    }).length;
    return { label: new Date(dayStart).toLocaleDateString("en-IN", { weekday: "short" }), count };
  });

  const cardStyle = {
    padding: "14px", border: "1px solid var(--border, #64748b)",
    borderRadius: "12px", minWidth: 0,
  };

  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div>
          <h3>Advanced Irrigation Alert Analytics</h3>
          <p>Event counts are based on saved alert history. Unresolved records are not proof that the same condition is still present; live sensor status is shown separately above.</p>
        </div>
        <span className="growth-public-label">{weekAlerts.length} LAST 7 DAYS</span>
      </div>

      <div className="growth-stats">
        <article className="growth-stat-card"><span>Events Today</span><strong>{todayAlerts.length}</strong><small>Recorded since midnight</small></article>
        <article className="growth-stat-card"><span>Events This Week</span><strong>{weekAlerts.length}</strong><small>Last seven calendar days</small></article>
        <article className="growth-stat-card"><span>Unresolved Records</span><strong>{activeCount}</strong><small>Awaiting resolution</small></article>
        <article className="growth-stat-card"><span>Resolved Records</span><strong>{validHistory.length - activeCount}</strong><small>Marked resolved</small></article>
      </div>

      <div style={{ ...cardStyle, marginTop: "16px" }}>
        <strong>Alert source breakdown</strong>
        <div className="growth-details" style={{ marginTop: "10px" }}>
          <div><span>Real ESP32 events</span><strong>{realEventCount}</strong></div>
          <div><span>Simulator demo events</span><strong>{simulatedEventCount}</strong></div>
          <div><span>Legacy / unknown source</span><strong>{legacyEventCount}</strong></div>
        </div>
        <p style={{ fontSize: "12px", opacity: 0.75, marginBottom: 0 }}>Source totals include active and resolved events. Older records are not reclassified as real or simulated because their origin cannot be verified.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" }}>
        <div style={cardStyle}>
          <strong>Alert severity distribution</strong>
          <p style={{ margin: "8px 0 4px", fontSize: "13px" }}>Critical: {criticalCount} ({validHistory.length ? Math.round(criticalCount / validHistory.length * 100) : 0}%)</p>
          <div style={{ height: "10px", background: "#334155", borderRadius: "20px", overflow: "hidden" }}><div style={{ width: `${validHistory.length ? criticalCount / validHistory.length * 100 : 0}%`, height: "100%", background: "#ef4444" }} /></div>
          <p style={{ margin: "12px 0 4px", fontSize: "13px" }}>Warning: {warningCount} ({validHistory.length ? Math.round(warningCount / validHistory.length * 100) : 0}%)</p>
          <div style={{ height: "10px", background: "#334155", borderRadius: "20px", overflow: "hidden" }}><div style={{ width: `${validHistory.length ? warningCount / validHistory.length * 100 : 0}%`, height: "100%", background: "#f59e0b" }} /></div>
          <p style={{ fontSize: "12px", opacity: 0.75, marginBottom: 0 }}>Severity totals include both unresolved and resolved records. Unresolved: {activeCount}; resolved: {validHistory.length - activeCount}.</p>
        </div>

        <div style={cardStyle}>
          <strong>Daily alert frequency</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", alignItems: "end", gap: "8px", height: "125px", marginTop: "14px" }}>
            {dailyBars.map((day) => (
              <div key={day.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "end", height: "100%", gap: "5px" }}>
                <small>{day.count}</small>
                <div title={`${day.count} alerts`} style={{ width: "100%", maxWidth: "24px", height: `${Math.max(4, day.count / maxDaily * 78)}px`, background: "#16a34a", borderRadius: "5px 5px 0 0" }} />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: "14px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <strong>Browser alert notifications</strong>
          <p style={{ margin: "5px 0 0", fontSize: "13px" }}>
            {notificationPermission === "granted" ? "Enabled. New active alerts can appear as browser notifications." : notificationPermission === "denied" ? "Blocked by browser settings. Change site notification permissions in your browser." : notificationPermission === "unsupported" ? "This browser does not support notifications." : "Optional. Allow notifications to receive alerts while this dashboard is open."}
          </p>
        </div>
        <button type="button" className="growth-refresh" onClick={requestNotifications} disabled={notificationPermission === "granted" || notificationPermission === "denied" || notificationPermission === "unsupported"}>
          {notificationPermission === "granted" ? "Notifications Enabled" : "Enable Notifications"}
        </button>
      </div>

      <p style={{ marginTop: "12px", fontSize: "12px", opacity: 0.75 }}>
        Reports are calculated from alert records stored in this browser; they are not a server-side report. Browser notifications require permission and this dashboard to be open. No pump, fan or light is controlled by these alerts.
      </p>
    </article>
  );
}


// ==========================================
// STEP 9.6.13–9.6.20: SOURCE-AWARE ALERTS, HISTORY, SETTINGS AND REPORTING
// Real ESP32 and simulator events are tracked separately; readings are browser-local.
// ==========================================
// STEP 9.6.15: SENSOR READING HISTORY
// Browser-local history; real and simulated data stay separate.
// ==========================================
function SensorReadingHistory({ readings }: { readings: SavedSensorReading[] }) {
  const [sourceFilter, setSourceFilter] = useState<"all" | "real" | "simulated">("all");
  const [limit, setLimit] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filtered = readings.filter((item) => {
    const sourceMatches = sourceFilter === "all" || item.source === sourceFilter;
    const time = new Date(item.created_at ?? "");
    const fromMatches = !fromDate || (Number.isFinite(time.getTime()) && time >= new Date(`${fromDate}T00:00:00`));
    const toMatches = !toDate || (Number.isFinite(time.getTime()) && time <= new Date(`${toDate}T23:59:59.999`));
    const term = searchTerm.trim().toLowerCase();
    const textMatches = !term || [item.source, item.created_at, item.soil_moisture_percent, item.temperature_c, item.humidity_percent, item.light_percent, item.battery_voltage].some((value) => String(value ?? "").toLowerCase().includes(term));
    return sourceMatches && fromMatches && toMatches && textMatches;
  }).slice().reverse();
  const exportCsv = () => {
    const columns = ["timestamp", "source", "soil_moisture_percent", "temperature_c", "humidity_percent", "light_percent", "battery_voltage"];
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((item) => [item.created_at, item.source, item.soil_moisture_percent, item.temperature_c, item.humidity_percent, item.light_percent, item.battery_voltage]);
    const csv = [columns, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "greenmind-sensor-reading-history.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div><h3>Sensor Reading History</h3><p>Recent readings saved in this browser. Simulator values are labelled separately from ESP32 readings.</p></div>
        <div className="growth-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select aria-label="Filter sensor history by source" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as typeof sourceFilter); setLimit(25); }}>
            <option value="all">All sources</option><option value="real">Real ESP32</option><option value="simulated">Simulator</option>
          </select>
          <input aria-label="Search sensor history" placeholder="Search readings" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setLimit(25); }} />
          <input aria-label="Sensor history from date" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setLimit(25); }} />
          <input aria-label="Sensor history to date" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setLimit(25); }} />
          <button className="growth-refresh" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV ({filtered.length})</button>
        </div>
      </div>
      <p style={{ fontSize: 12, opacity: .75 }}>Stored locally on this device (maximum 500 readings). This is not a cloud or database archive.</p>
      {filtered.length === 0 ? <div className="growth-empty compact">No sensor readings have been saved yet.</div> : <>
        <div style={{ overflowX: "auto" }}><table className="growth-table"><thead><tr><th>Time</th><th>Source</th><th>Soil moisture</th><th>Temperature</th><th>Humidity</th><th>Light</th><th>Battery</th></tr></thead>
          <tbody>{filtered.slice(0, limit).map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at ?? "")}</td><td>{item.source === "simulated" ? "Simulator" : "Real ESP32"}</td><td>{item.soil_moisture_percent == null ? "—" : `${Number(item.soil_moisture_percent).toFixed(1)}%`}</td><td>{item.temperature_c == null ? "—" : `${Number(item.temperature_c).toFixed(1)}°C`}</td><td>{item.humidity_percent == null ? "—" : `${Number(item.humidity_percent).toFixed(1)}%`}</td><td>{item.light_percent == null ? "—" : `${Number(item.light_percent).toFixed(1)}%`}</td><td>{item.battery_voltage == null ? "—" : `${Number(item.battery_voltage).toFixed(2)} V`}</td></tr>)}</tbody>
        </table></div>
        {filtered.length > limit && <button className="growth-refresh" onClick={() => setLimit((value) => value + 25)}>Show 25 more</button>}
      </>}
    </article>
  );
}

// ==========================================
// STEP 9.6.18: CONFIGURABLE ADVISORY THRESHOLDS
// These settings change alert labels only; they never operate hardware.
// ==========================================
type AlertThresholds = { criticalMoisture: number; lowMoisture: number; highTemperature: number };
const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = { criticalMoisture: 20, lowMoisture: 30, highTemperature: 35 };

function AlertThresholdSettings({ value, onChange }: { value: AlertThresholds; onChange: (next: AlertThresholds) => void }) {
  const update = (key: keyof AlertThresholds, raw: string) => {
    const number = Number(raw);
    if (!Number.isFinite(number)) return;
    onChange({ ...value, [key]: Math.max(0, Math.min(key === "highTemperature" ? 60 : 100, number)) });
  };
  return (
    <article className="analytics-card">
      <h3>Alert Threshold Settings</h3>
      <p>Adjust the advisory values used to create alerts. Choose values suitable for your crop and growing conditions; these are not universal agronomic limits.</p>
      <div className="growth-stats">
        <label className="growth-stat-card">Critical soil moisture (%)<input type="number" min="0" max="100" step="1" value={value.criticalMoisture} onChange={(e) => update("criticalMoisture", e.target.value)} /></label>
        <label className="growth-stat-card">Low soil moisture (%)<input type="number" min="0" max="100" step="1" value={value.lowMoisture} onChange={(e) => update("lowMoisture", e.target.value)} /></label>
        <label className="growth-stat-card">High temperature (°C)<input type="number" min="0" max="60" step="0.5" value={value.highTemperature} onChange={(e) => update("highTemperature", e.target.value)} /></label>
      </div>
      {value.criticalMoisture >= value.lowMoisture && <p role="alert" style={{ color: "#f59e0b" }}>Set critical moisture lower than low moisture so the alert levels do not overlap.</p>}
      <button type="button" className="growth-refresh" onClick={() => onChange(DEFAULT_ALERT_THRESHOLDS)}>Reset default values</button>
      <p style={{ fontSize: 12, opacity: .75 }}>Saved in this browser only. This dashboard provides recommendations and does not control a pump, fan or light.</p>
    </article>
  );
}

// ==========================================
// STEP 9.6.19: WEEKLY OPERATIONS SUMMARY
// ==========================================
function WeeklyOperationsSummary({ alerts, readings }: { alerts: IrrigationAlertHistoryItem[]; readings: SavedSensorReading[] }) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekAlerts = alerts.filter((item) => { const t = new Date(item.createdAt).getTime(); return Number.isFinite(t) && t >= since; });
  const weekReadings = readings.filter((item) => { const t = new Date(item.created_at ?? "").getTime(); return Number.isFinite(t) && t >= since; });
  const realReadings = weekReadings.filter((item) => item.source === "real").length;
  const simulatedReadings = weekReadings.filter((item) => item.source === "simulated").length;
  const active = weekAlerts.filter((item) => item.status === "active").length;
  const critical = weekAlerts.filter((item) => item.level === "critical").length;
  const exportSummary = () => {
    const lines = [
      ["Metric", "Last 7 days"],
      ["Alert records", weekAlerts.length], ["Critical alerts", critical], ["Active alert records", active],
      ["Saved sensor readings", weekReadings.length], ["Real ESP32 readings", realReadings], ["Simulator readings", simulatedReadings],
    ];
    const csv = lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `greenmind-weekly-summary-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <article className="analytics-card"><div className="growth-section-heading"><div><h3>Weekly Greenhouse Summary</h3><p>Browser-local records from the last seven days; this is a summary, not a verified agronomy assessment.</p></div><button className="growth-refresh" type="button" onClick={exportSummary}>Export Summary CSV</button></div>
    <div className="growth-stats">
      <article className="growth-stat-card"><span>Alert records</span><strong>{weekAlerts.length}</strong><small>Last seven days</small></article>
      <article className="growth-stat-card"><span>Critical records</span><strong>{critical}</strong><small>All sources</small></article>
      <article className="growth-stat-card"><span>Sensor readings</span><strong>{weekReadings.length}</strong><small>Saved locally</small></article>
      <article className="growth-stat-card"><span>Unresolved records</span><strong>{active}</strong><small>Not yet marked resolved</small></article>
    </div>
    <p style={{ fontSize: 12, opacity: .75 }}>Reading sources: {realReadings} real ESP32 · {simulatedReadings} simulator. These counts are kept separate.</p>
  </article>;
}

// ==========================================
// STEP 9.6.20: DASHBOARD DATA RELIABILITY SUMMARY
// ==========================================
function DashboardReliabilitySummary({ alerts, readings, response }: { alerts: IrrigationAlertHistoryItem[]; readings: SavedSensorReading[]; response: IrrigationResponse | null }) {
  const invalidAlertDates = alerts.filter((item) => !Number.isFinite(new Date(item.createdAt).getTime())).length;
  const invalidReadingDates = readings.filter((item) => !item.created_at || !Number.isFinite(new Date(item.created_at).getTime())).length;
  const activeReal = alerts.filter((item) => item.status === "active" && item.source === "real").length;
  const activeDemo = alerts.filter((item) => item.status === "active" && item.source === "simulated").length;
  const telemetryState = !response?.telemetry ? "No current telemetry" : response.isStale ? "Telemetry is stale" : response.isSimulated ? "Simulator telemetry" : "ESP32 telemetry";
  return <article className="analytics-card"><h3>Dashboard Reliability Checks</h3><p>Basic checks on records stored by this browser. A passing check does not certify sensor calibration or physical device accuracy.</p>
    <div className="growth-details"><div><span>Current data state</span><strong>{telemetryState}</strong></div><div><span>Invalid alert timestamps</span><strong>{invalidAlertDates}</strong></div><div><span>Invalid reading timestamps</span><strong>{invalidReadingDates}</strong></div><div><span>Active real-source alerts</span><strong>{activeReal}</strong></div><div><span>Active simulator alerts</span><strong>{activeDemo}</strong></div><div><span>Saved reading limit</span><strong>{readings.length}/500</strong></div></div>
    <p style={{ fontSize: 12, opacity: .75, marginBottom: 0 }}>Real and simulated alert records are counted separately. Old records with unknown origin remain labelled Legacy / Unknown. Browser storage can be cleared by the browser or user.</p>
  </article>;
}


// ==========================================
// STEPS 9.6.21–9.6.35: GREENHOUSE DATA MANAGEMENT TOOLKIT
// Backup/restore, validation, deduplication, summaries and safe cleanup.
// All operations are browser-local; no data is uploaded by this component.
// ==========================================
type GreenMindBackup = {
  app: "GREENMIND";
  schemaVersion: 1;
  exportedAt: string;
  alerts: IrrigationAlertHistoryItem[];
  readings: SavedSensorReading[];
  thresholds: AlertThresholds;
};

function GreenhouseDataManagement({
  alerts,
  readings,
  thresholds,
  onAlertsChange,
  onReadingsChange,
  onThresholdsChange,
}: {
  alerts: IrrigationAlertHistoryItem[];
  readings: SavedSensorReading[];
  thresholds: AlertThresholds;
  onAlertsChange: (items: IrrigationAlertHistoryItem[]) => void;
  onReadingsChange: (items: SavedSensorReading[]) => void;
  onThresholdsChange: (value: AlertThresholds) => void;
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const realCount = readings.filter((item) => item.source === "real").length;
  const simulatedCount = readings.filter((item) => item.source === "simulated").length;
  const unresolvedCount = alerts.filter((item) => item.status === "active").length;
  const validReadings = readings.filter((item) => item.created_at && Number.isFinite(new Date(item.created_at).getTime()));
  const latestReading = validReadings.slice().sort((a, b) => new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime())[0];

  // STEP 9.6.21: Export a complete browser-local backup.
  const exportBackup = () => {
    const backup: GreenMindBackup = {
      app: "GREENMIND", schemaVersion: 1, exportedAt: new Date().toISOString(),
      alerts, readings, thresholds,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `greenmind-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Backup exported. Store the JSON file somewhere safe.");
  };

  // STEPS 9.6.22–9.6.24: Import, validate and merge a backup without replacing newer records.
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setNotice("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Backup file is larger than 10 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("The selected file is not a valid GreenMind backup.");
      const candidate = parsed as Partial<GreenMindBackup>;
      if (candidate.app !== "GREENMIND" || candidate.schemaVersion !== 1 || !Array.isArray(candidate.alerts) || !Array.isArray(candidate.readings)) {
        throw new Error("Backup format is not supported. Choose a GreenMind schema version 1 JSON backup.");
      }
      const importedAlerts = candidate.alerts.filter((item): item is IrrigationAlertHistoryItem => !!item && typeof item.id === "string" && typeof item.title === "string" && (item.status === "active" || item.status === "resolved") && (item.level === "critical" || item.level === "warning"));
      const importedReadings = candidate.readings.filter((item): item is SavedSensorReading => !!item && typeof item.id === "string" && (item.source === "real" || item.source === "simulated") && (item.created_at === null || typeof item.created_at === "string"));
      if (importedAlerts.length !== candidate.alerts.length || importedReadings.length !== candidate.readings.length) {
        throw new Error("Backup validation failed: one or more records have an unsupported shape. Nothing was imported.");
      }
      const alertMap = new Map<string, IrrigationAlertHistoryItem>();
      [...alerts, ...importedAlerts].forEach((item) => alertMap.set(item.id, item));
      const readingMap = new Map<string, SavedSensorReading>();
      [...readings, ...importedReadings].forEach((item) => readingMap.set(item.id, item));
      onAlertsChange(Array.from(alertMap.values()).slice(-100));
      onReadingsChange(Array.from(readingMap.values()).slice(-500));
      if (candidate.thresholds && Number.isFinite(candidate.thresholds.criticalMoisture) && Number.isFinite(candidate.thresholds.lowMoisture) && Number.isFinite(candidate.thresholds.highTemperature)) {
        onThresholdsChange({
          criticalMoisture: Math.max(0, Math.min(100, candidate.thresholds.criticalMoisture)),
          lowMoisture: Math.max(0, Math.min(100, candidate.thresholds.lowMoisture)),
          highTemperature: Math.max(0, Math.min(60, candidate.thresholds.highTemperature)),
        });
      }
      setNotice(`Backup imported: ${importedAlerts.length} alert records and ${importedReadings.length} sensor readings checked and merged. Latest 100 alerts and 500 readings are retained.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to import backup.");
    } finally {
      setBusy(false); event.target.value = "";
    }
  };

  // STEP 9.6.25: Show record coverage and source counts.
  const sourceIntegrity = readings.length === realCount + simulatedCount;
  // STEP 9.6.26: Display oldest/newest valid sensor history range.
  const timestamps = validReadings.map((item) => new Date(item.created_at ?? "").getTime()).sort((a, b) => a - b);
  const historyRange = timestamps.length ? `${formatDate(new Date(timestamps[0]).toISOString())} – ${formatDate(new Date(timestamps[timestamps.length - 1]).toISOString())}` : "No valid dates";
  // STEP 9.6.27: Provide a compact latest-reading snapshot.
  const latestSnapshot = latestReading ? `${latestReading.source === "real" ? "Real ESP32" : "Simulator"} · ${formatDateTime(latestReading.created_at ?? "")}` : "No saved reading";

  // STEP 9.6.28: Clear sensor history only after explicit confirmation.
  const clearReadings = () => {
    if (!readings.length || !window.confirm("Delete all sensor reading history saved in this browser? This cannot be undone unless you have a backup.")) return;
    onReadingsChange([]); setNotice("Sensor reading history cleared from this browser.");
  };
  // STEP 9.6.29: Remove resolved alerts while preserving active alerts.
  const clearResolvedAlerts = () => {
    const resolved = alerts.filter((item) => item.status === "resolved").length;
    if (!resolved || !window.confirm(`Delete ${resolved} resolved alert records? Active alerts will be kept.`)) return;
    onAlertsChange(alerts.filter((item) => item.status === "active"));
    setNotice(`${resolved} resolved alert records removed. Active alerts were preserved.`);
  };
  // STEP 9.6.30: Reset advisory thresholds to defaults.
  const resetThresholds = () => {
    if (!window.confirm("Reset advisory thresholds to the GreenMind default values?")) return;
    onThresholdsChange(DEFAULT_ALERT_THRESHOLDS); setNotice("Advisory thresholds reset to defaults.");
  };

  // STEP 9.6.31: Flag unknown-source legacy alerts for transparent accounting.
  const legacyAlerts = alerts.filter((item) => !item.source || item.source === "legacy").length;
  // STEP 9.6.32: Export a compact sensor snapshot as CSV.
  const exportSnapshotCsv = () => {
    if (!latestReading) { setNotice("There is no valid sensor reading to export."); return; }
    const fields = ["timestamp", "source", "soil_moisture_percent", "temperature_c", "humidity_percent", "light_percent", "battery_voltage"];
    const values = [latestReading.created_at, latestReading.source, latestReading.soil_moisture_percent, latestReading.temperature_c, latestReading.humidity_percent, latestReading.light_percent, latestReading.battery_voltage];
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const blob = new Blob([[fields, values].map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "greenmind-latest-sensor-snapshot.csv"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Latest sensor snapshot exported as CSV.");
  };
  // STEP 9.6.33: Explain local storage boundaries to the operator.
  const localStorageNote = "Backups and history are stored/exported by this browser. They are not automatically synced to Supabase or another device.";
  // STEP 9.6.34: Generate a simple operator report.
  const exportOperatorReport = () => {
    const report = [
      "GREENMIND GREENHOUSE OPERATOR REPORT", `Generated: ${new Date().toISOString()}`,
      `Alerts: ${alerts.length} total; ${unresolvedCount} active; ${legacyAlerts} legacy/unknown`,
      `Sensor readings: ${readings.length} total; ${realCount} real ESP32; ${simulatedCount} simulator`,
      `Valid timestamp records: ${validReadings.length}`, `History range: ${historyRange}`,
      `Latest reading: ${latestSnapshot}`, `Thresholds: critical moisture ${thresholds.criticalMoisture}%; low moisture ${thresholds.lowMoisture}%; high temperature ${thresholds.highTemperature} C`,
      "Note: Sensor readings and alerts are records, not proof of calibration or physical equipment operation.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `greenmind-operator-report-${new Date().toISOString().slice(0,10)}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Operator report exported.");
  };
  // STEP 9.6.35: Surface import/export status and finish with a clear integrity note.

  return (
    <article className="analytics-card">
      <div className="growth-section-heading">
        <div><h3>Greenhouse Data Backup &amp; Maintenance</h3><p>Export, restore and maintain records stored in this browser.</p></div>
        <span className="growth-badge">Local data tools</span>
      </div>
      <div className="growth-stats">
        <article className="growth-stat-card"><span>Alert records</span><strong>{alerts.length}</strong><small>{unresolvedCount} active</small></article>
        <article className="growth-stat-card"><span>Sensor records</span><strong>{readings.length}</strong><small>{realCount} real · {simulatedCount} simulated</small></article>
        <article className="growth-stat-card"><span>Legacy alerts</span><strong>{legacyAlerts}</strong><small>Origin not known</small></article>
        <article className="growth-stat-card"><span>Valid reading dates</span><strong>{validReadings.length}</strong><small>{historyRange}</small></article>
      </div>
      <div className="growth-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" className="growth-refresh" onClick={exportBackup}>Export Full Backup (JSON)</button>
        <label className="growth-refresh" style={{ display: "inline-flex", alignItems: "center", cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Checking backup…" : "Import Backup (JSON)"}
          <input type="file" accept="application/json,.json" disabled={busy} onChange={importBackup} style={{ display: "none" }} />
        </label>
        <button type="button" className="growth-refresh" onClick={exportOperatorReport}>Export Operator Report</button>
        <button type="button" className="growth-refresh" onClick={exportSnapshotCsv} disabled={!latestReading}>Export Latest Sensor CSV</button>
        <button type="button" className="growth-refresh" onClick={clearResolvedAlerts} disabled={!alerts.some((item) => item.status === "resolved")}>Remove Resolved Alerts</button>
        <button type="button" className="growth-refresh" onClick={clearReadings} disabled={!readings.length}>Clear Sensor History</button>
        <button type="button" className="growth-refresh" onClick={resetThresholds}>Reset Advisory Thresholds</button>
      </div>
      <div className="growth-details" style={{ marginTop: 14 }}>
        <div><span>Latest saved reading</span><strong>{latestSnapshot}</strong></div>
        <div><span>Source accounting</span><strong>{sourceIntegrity ? "Consistent" : "Review required"}</strong></div>
        <div><span>Data storage</span><strong>Browser-local</strong></div>
      </div>
      {notice && <p role="status" style={{ marginTop: 12 }}>{notice}</p>}
      <p style={{ fontSize: 12, opacity: .75, marginBottom: 0 }}>{localStorageNote} Keep a backup before clearing browser data. Imported records are validated and merged by record ID; import does not connect to or write to the physical ESP32.</p>
    </article>
  );
}


// ==========================================
// STEPS 9.6.36–9.7.0: PLANT PORTFOLIO & CARE OPERATIONS
// These tools operate on plant/growth/care records already loaded by the page.
// Reminders are browser-local checklist items, not automated irrigation actions.
// ==========================================
type GreenhouseTask = { id: string; title: string; dueDate: string; done: boolean; category: string };

function PlantOperationsCenter({ data }: { data: TrackerData }) {
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [tasks, setTasks] = useState<GreenhouseTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(new Date().toISOString().slice(0, 10));
  const [taskCategory, setTaskCategory] = useState("Inspection");
  const [notice, setNotice] = useState("");

  // STEP 9.6.36: Restore operator checklist from this browser only.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("greenmind-operator-tasks-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setTasks(parsed.filter((x) => x && typeof x.id === "string" && typeof x.title === "string" && typeof x.dueDate === "string" && typeof x.done === "boolean"));
      }
    } catch { setNotice("Saved checklist could not be read. You can create a new checklist below."); }
    setTasksLoaded(true);
  }, []);

  // STEP 9.6.37: Persist checklist changes locally after initial load.
  useEffect(() => {
    if (tasksLoaded) {
      try { localStorage.setItem("greenmind-operator-tasks-v1", JSON.stringify(tasks.slice(-200))); }
      catch { setNotice("Browser storage is full; checklist changes may not persist."); }
    }
  }, [tasks, tasksLoaded]);

  const latestByPlant = useMemo(() => {
    const map = new Map<string, GrowthLog>();
    data.growthLogs.forEach((log) => {
      const key = String(log.plant_id);
      const current = map.get(key);
      if (!current || new Date(log.measured_on).getTime() > new Date(current.measured_on).getTime()) map.set(key, log);
    });
    return map;
  }, [data.growthLogs]);

  const plantRows = useMemo(() => data.plants.map((plant) => {
    const latest = latestByPlant.get(String(plant.id));
    const health = latest?.health_score ?? null;
    const status = health == null ? "Unrated" : health >= 80 ? "Healthy" : health >= 60 ? "Monitor" : "Needs attention";
    return { plant, latest, health, status };
  }), [data.plants, latestByPlant]);

  // STEP 9.6.38: Search plant portfolio by name, type, or growth stage.
  // STEP 9.6.39: Filter portfolio by latest recorded health category.
  const filteredPlants = plantRows.filter(({ plant, latest, status }) => {
    const haystack = `${plant.plant_name} ${plant.plant_type} ${latest?.growth_stage ?? ""}`.toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesHealth = healthFilter === "all" || (healthFilter === "unrated" ? status === "Unrated" : status === healthFilter);
    return matchesQuery && matchesHealth;
  });

  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const downloadCsv = (filename: string, rows: unknown[][]) => {
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // STEP 9.6.40: Export filtered plant portfolio with latest growth information.
  const exportPlants = () => {
    const rows: unknown[][] = [["plant_id", "plant_name", "plant_type", "planting_date", "latest_measurement", "height_cm", "leaf_count", "growth_stage", "health_score", "health_status"]];
    filteredPlants.forEach(({ plant, latest, health, status }) => rows.push([plant.id, plant.plant_name, plant.plant_type, plant.planting_date, latest?.measured_on, latest?.height_cm, latest?.leaf_count, latest?.growth_stage, health, status]));
    downloadCsv("greenmind-plant-portfolio.csv", rows); setNotice(`${filteredPlants.length} plant records exported.`);
  };

  // STEP 9.6.41: Export growth measurements as a separate, analysis-ready CSV.
  const exportGrowth = () => {
    const rows: unknown[][] = [["plant_id", "plant_name", "measured_on", "height_cm", "leaf_count", "growth_stage", "health_score"]];
    data.growthLogs.forEach((log) => rows.push([log.plant_id, data.plants.find((p) => String(p.id) === String(log.plant_id))?.plant_name, log.measured_on, log.height_cm, log.leaf_count, log.growth_stage, log.health_score]));
    downloadCsv("greenmind-growth-measurements.csv", rows); setNotice(`${data.growthLogs.length} growth measurements exported.`);
  };

  // STEP 9.6.42: Export plant care history for audit and planning.
  const exportCare = () => {
    const rows: unknown[][] = [["plant_id", "plant_name", "care_type", "amount", "unit", "performed_at"]];
    data.careLogs.forEach((log) => rows.push([log.plant_id, data.plants.find((p) => String(p.id) === String(log.plant_id))?.plant_name, log.care_type, log.amount, log.unit, log.performed_at]));
    downloadCsv("greenmind-plant-care-history.csv", rows); setNotice(`${data.careLogs.length} care records exported.`);
  };

  // STEP 9.6.43: Detect duplicate plant/date growth entries for operator review.
  const growthKeys = data.growthLogs.map((log) => `${log.plant_id}|${String(log.measured_on).slice(0, 10)}`);
  const duplicateGrowthCount = growthKeys.length - new Set(growthKeys).size;
  // STEP 9.6.44: Check missing or invalid plant and measurement fields.
  const incompletePlants = data.plants.filter((p) => !p.plant_name.trim() || !p.plant_type.trim()).length;
  const invalidGrowth = data.growthLogs.filter((g) => !g.measured_on || (g.height_cm != null && (!Number.isFinite(g.height_cm) || g.height_cm < 0)) || (g.leaf_count != null && (!Number.isFinite(g.leaf_count) || g.leaf_count < 0)) || (g.health_score != null && (g.health_score < 0 || g.health_score > 100))).length;
  // STEP 9.6.45: Summarize care activity by recorded care type.
  const careTypeCounts = data.careLogs.reduce<Record<string, number>>((acc, item) => { const key = item.care_type || "Unspecified"; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  // STEP 9.6.46: Add a manual operator task with a due date.
  const addTask = () => {
    const title = taskTitle.trim();
    if (!title) { setNotice("Enter a task description before adding it."); return; }
    setTasks((current) => [...current, { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, dueDate: taskDate, done: false, category: taskCategory }].slice(-200));
    setTaskTitle(""); setNotice("Operator task added to this browser's checklist.");
  };
  // STEP 9.6.47: Toggle completion without changing plant or sensor records.
  const toggleTask = (id: string) => setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  // STEP 9.6.48: Prioritize overdue and upcoming open tasks.
  const today = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter((task) => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueTasks = openTasks.filter((task) => task.dueDate < today).length;
  // STEP 9.6.49: Export operator checklist and care coverage as text.
  const exportTaskReport = () => {
    const lines = ["GREENMIND OPERATOR CHECKLIST", `Generated: ${new Date().toISOString()}`, ...tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.dueDate} | ${t.category} | ${t.title}`), "", `Plants: ${data.plants.length}`, `Growth records: ${data.growthLogs.length}`, `Care records: ${data.careLogs.length}`, `Duplicate plant/date growth records: ${duplicateGrowthCount}`, `Invalid growth records: ${invalidGrowth}`];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "greenmind-operator-checklist.txt"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Operator checklist report exported.");
  };
  // STEP 9.7.0: Consolidated plant-operations readiness summary.
  const completedTasks = tasks.filter((task) => task.done).length;

  return <article className="analytics-card">
    <div className="growth-section-heading"><div><h3>Plant Portfolio &amp; Care Operations</h3><p>Search plant records, review data quality, export history and manage a local operator checklist.</p></div><span className="growth-badge">Steps 9.6.36–9.7.0</span></div>
    <div className="growth-stats">
      <article className="growth-stat-card"><span>Plants</span><strong>{data.plants.length}</strong><small>Registered</small></article>
      <article className="growth-stat-card"><span>Growth records</span><strong>{data.growthLogs.length}</strong><small>{duplicateGrowthCount} duplicate plant/date pairs</small></article>
      <article className="growth-stat-card"><span>Care activities</span><strong>{data.careLogs.length}</strong><small>{Object.keys(careTypeCounts).length} care categories</small></article>
      <article className="growth-stat-card"><span>Open tasks</span><strong>{openTasks.length}</strong><small>{overdueTasks} overdue</small></article>
    </div>
    <div className="growth-details" style={{ marginTop: 12 }}>
      <div><span>Incomplete plant profiles</span><strong>{incompletePlants}</strong></div>
      <div><span>Invalid growth records</span><strong>{invalidGrowth}</strong></div>
      <div><span>Checklist completion</span><strong>{completedTasks}/{tasks.length}</strong></div>
      <div><span>Care categories</span><strong>{Object.entries(careTypeCounts).map(([k,v]) => `${k}: ${v}`).join(" · ") || "No care records"}</strong></div>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
      <input aria-label="Search plants" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plant, type or stage" style={{ flex: "1 1 220px", minWidth: 180, padding: 10, borderRadius: 8, border: "1px solid #9ca3af" }} />
      <select aria-label="Filter plants by health" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
        <option value="all">All health states</option><option value="Healthy">Healthy</option><option value="Monitor">Monitor</option><option value="Needs attention">Needs attention</option><option value="unrated">Unrated</option>
      </select>
      <button type="button" className="growth-refresh" onClick={exportPlants}>Export Plants CSV</button>
      <button type="button" className="growth-refresh" onClick={exportGrowth}>Export Growth CSV</button>
      <button type="button" className="growth-refresh" onClick={exportCare}>Export Care CSV</button>
    </div>
    {filteredPlants.length ? <div className="growth-table-wrap"><table className="growth-table"><thead><tr><th>Plant</th><th>Type</th><th>Latest height</th><th>Stage</th><th>Health</th><th>Status</th></tr></thead><tbody>{filteredPlants.map(({ plant, latest, health, status }) => <tr key={plant.id}><td>{plant.plant_name}</td><td>{plant.plant_type}</td><td>{latest?.height_cm != null ? `${latest.height_cm} cm` : "—"}</td><td>{latest?.growth_stage ?? "—"}</td><td>{health != null ? `${health}%` : "—"}</td><td>{status}</td></tr>)}</tbody></table></div> : <div className="growth-empty compact">No plants match the selected search and health filter.</div>}
    <div style={{ borderTop: "1px solid rgba(128,128,128,.25)", marginTop: 18, paddingTop: 16 }}>
      <h4 style={{ margin: "0 0 8px" }}>Operator Care Checklist</h4>
      <p style={{ fontSize: 12, opacity: .75 }}>Manual reminders only. These tasks do not automatically water plants or control greenhouse equipment.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input aria-label="Task description" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Inspect tomato leaves" style={{ flex: "1 1 220px", minWidth: 180, padding: 10, borderRadius: 8, border: "1px solid #9ca3af" }} />
        <input aria-label="Task due date" type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} style={{ padding: 10, borderRadius: 8 }} />
        <select aria-label="Task category" value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)} style={{ padding: 10, borderRadius: 8 }}><option>Inspection</option><option>Watering</option><option>Fertilizing</option><option>Pruning</option><option>Cleaning</option><option>Other</option></select>
        <button type="button" className="growth-refresh" onClick={addTask}>Add Task</button>
        <button type="button" className="growth-refresh" onClick={exportTaskReport}>Export Task Report</button>
      </div>
      {tasks.length ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{tasks.slice().sort((a,b) => Number(a.done)-Number(b.done) || a.dueDate.localeCompare(b.dueDate)).map((task) => <label key={task.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, border: "1px solid rgba(128,128,128,.25)", borderRadius: 8 }}><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} /><span style={{ flex: 1, textDecoration: task.done ? "line-through" : "none", opacity: task.done ? .65 : 1 }}><strong>{task.title}</strong><small style={{ display: "block", opacity: .7 }}>{task.category} · Due {task.dueDate}{!task.done && task.dueDate < today ? " · OVERDUE" : ""}</small></span></label>)}</div> : <div className="growth-empty compact">No operator tasks added yet.</div>}
    </div>
    {notice && <p role="status" style={{ marginTop: 12 }}>{notice}</p>}
    <p style={{ fontSize: 12, opacity: .7, marginBottom: 0 }}>Portfolio and export information comes from the plant, growth and care records loaded by this dashboard. Operator checklist items are saved only in this browser.</p>
  </article>;
}

// ==========================================
// STEPS 9.7.1–10.0.0: PLANT OBSERVATION JOURNAL AND RELEASE MILESTONE
// Notes are stored locally in this browser. They do not modify Supabase records.
// ==========================================
type PlantObservation = {
  id: string;
  plantId: string;
  observedOn: string;
  category: string;
  severity: "info" | "watch" | "urgent";
  note: string;
  createdAt: string;
  status?: "open" | "in-progress" | "resolved";
  followUpDate?: string;
  resolvedAt?: string;
  updatedAt?: string;
};

function PlantObservationJournal({ plants }: { plants: Plant[] }) {
  const [observations, setObservations] = useState<PlantObservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [plantId, setPlantId] = useState("");
  const [observedOn, setObservedOn] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("General observation");
  const [severity, setSeverity] = useState<PlantObservation["severity"]>("info");
  const [note, setNote] = useState("");
  const [filterPlant, setFilterPlant] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [followUpDate, setFollowUpDate] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  // STEPS 9.7.15–9.7.20: journal editing and date-based review.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueFilter, setDueFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editCategory, setEditCategory] = useState("General observation");
  const [editSeverity, setEditSeverity] = useState<PlantObservation["severity"]>("info");
  const [editFollowUpDate, setEditFollowUpDate] = useState("");
  const [importing, setImporting] = useState(false);

  // STEP 9.7.1: Load and validate the browser-local observation journal.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("greenmind-plant-observations-v1");
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((item): item is PlantObservation =>
            item && typeof item.id === "string" && typeof item.plantId === "string" &&
            typeof item.observedOn === "string" && typeof item.category === "string" &&
            ["info", "watch", "urgent"].includes(item.severity) && typeof item.note === "string" &&
            typeof item.createdAt === "string"
          ).map((item) => ({
            ...item,
            // STEP 9.7.8: Migrate older journal entries without changing their notes.
            status:
  item.status === "open" ||
  item.status === "in-progress" ||
  item.status === "resolved"
    ? item.status
    : "open",
            followUpDate: typeof item.followUpDate === "string" ? item.followUpDate : "",
            resolvedAt: typeof item.resolvedAt === "string" ? item.resolvedAt : undefined,
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
          }));
          setObservations(valid.slice(-500));
        }
      }
    } catch {
      setNotice("Saved observations could not be read. New observations can still be added.");
    }
    setLoaded(true);
  }, []);

  // STEP 9.7.2: Persist validated journal changes locally after initial load.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("greenmind-plant-observations-v1", JSON.stringify(observations.slice(-500)));
    } catch {
      setNotice("Browser storage is full. Export your observations and remove older entries if needed.");
    }
  }, [observations, loaded]);

  // STEP 9.7.3: Add dated, categorized plant observations with a severity label.
  const addObservation = () => {
    const cleanNote = note.trim();
    if (!plants.length) { setNotice("Register a plant before adding an observation."); return; }
    if (!plantId) { setNotice("Select the plant for this observation."); return; }
    if (!observedOn || Number.isNaN(new Date(observedOn).getTime())) { setNotice("Choose a valid observation date."); return; }
    if (cleanNote.length < 3) { setNotice("Enter an observation of at least 3 characters."); return; }
    const entry: PlantObservation = {
      id: `observation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plantId, observedOn, category, severity, note: cleanNote, createdAt: new Date().toISOString(),
      // STEP 9.7.9: New observations begin as open follow-up items.
      status: "open", followUpDate,
    };
    setObservations((current) => [...current, entry].slice(-500));
    setNote("");
    setNotice("Plant observation saved in this browser.");
  };

  const todayKey = new Date().toISOString().slice(0, 10);
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + 7);
  const soonKey = soonDate.toISOString().slice(0, 10);

  // STEP 9.7.4: Search and filter the journal without changing stored records.
  const visible = observations.filter((item) => {
    const plant = plants.find((p) => String(p.id) === item.plantId);
    const matchesPlant = filterPlant === "all" || item.plantId === filterPlant;
    const matchesSeverity = filterSeverity === "all" || item.severity === filterSeverity;
    // STEP 9.7.10: Filter by follow-up workflow state.
    const matchesStatus = filterStatus === "all" || (item.status ?? "open") === filterStatus;
    const text = `${plant?.plant_name ?? "Unknown plant"} ${item.category} ${item.note}`.toLowerCase();
    const matchesDateFrom = !dateFrom || item.observedOn >= dateFrom;
    const matchesDateTo = !dateTo || item.observedOn <= dateTo;
    const dueDate = item.followUpDate ?? "";
    const isResolved = item.status === "resolved";
    const matchesDue = dueFilter === "all"
      || (dueFilter === "overdue" && !!dueDate && dueDate < todayKey && !isResolved)
      || (dueFilter === "due-soon" && !!dueDate && dueDate >= todayKey && dueDate <= soonKey && !isResolved)
      || (dueFilter === "no-date" && !dueDate && !isResolved);
    return matchesPlant && matchesSeverity && matchesStatus && matchesDateFrom && matchesDateTo && matchesDue && text.includes(search.toLowerCase());
  }).sort((a, b) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt));

  // STEP 9.7.5: Export the currently filtered observation journal as CSV.
  const exportJournal = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows: unknown[][] = [["plant_id", "plant_name", "observed_on", "category", "severity", "status", "follow_up_date", "observation", "created_at", "resolved_at", "updated_at"]];
    visible.forEach((item) => rows.push([item.plantId, plants.find((p) => String(p.id) === item.plantId)?.plant_name ?? "Unknown plant", item.observedOn, item.category, item.severity, item.status ?? "open", item.followUpDate ?? "", item.note, item.createdAt, item.resolvedAt ?? "", item.updatedAt ?? ""]));
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "greenmind-plant-observations.csv"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${visible.length} observation(s) exported.`);
  };

  // STEP 9.7.6: Delete an individual note only after explicit confirmation.
  const deleteObservation = (id: string) => {
    if (!window.confirm("Delete this plant observation from this browser?")) return;
    setObservations((current) => current.filter((item) => item.id !== id));
    setNotice("Observation deleted from this browser.");
  };

  // STEP 9.7.7: Summarize observation severity for quick operator review.
  const urgentCount = observations.filter((item) => item.severity === "urgent").length;
  const watchCount = observations.filter((item) => item.severity === "watch").length;
  // STEP 9.7.11: Track open and in-progress follow-ups independently of severity.
  const openCount = observations.filter((item) => (item.status ?? "open") === "open").length;
  const inProgressCount = observations.filter((item) => item.status === "in-progress").length;
  const resolvedCount = observations.filter((item) => item.status === "resolved").length;
  // STEP 9.7.12: Flag overdue and due-soon follow-ups, excluding resolved items.
  const overdueFollowUps = observations.filter((item) => item.followUpDate && item.followUpDate < todayKey && item.status !== "resolved").length;
  const dueSoonCount = observations.filter((item) => item.followUpDate && item.followUpDate >= todayKey && item.followUpDate <= soonKey && item.status !== "resolved").length;

  // STEP 9.7.13 and 9.7.16: Keep a timestamp when an item is resolved.
  const updateObservationStatus = (id: string, status: NonNullable<PlantObservation["status"]>) => {
    const now = new Date().toISOString();
    setObservations((current) => current.map((item) => item.id === id
      ? { ...item, status, resolvedAt: status === "resolved" ? (item.resolvedAt ?? now) : undefined, updatedAt: now }
      : item));
    setNotice(status === "resolved" ? "Follow-up marked resolved." : "Observation follow-up status updated.");
  };

  // STEP 9.7.15: Open an existing observation in the edit form.
  const beginEditObservation = (item: PlantObservation) => {
    setEditingId(item.id);
    setEditNote(item.note);
    setEditCategory(item.category);
    setEditSeverity(item.severity);
    setEditFollowUpDate(item.followUpDate ?? "");
  };

  // STEP 9.7.17: Validate and save edited observation details.
  const saveObservationEdit = () => {
    const clean = editNote.trim();
    if (!editingId || clean.length < 3) { setNotice("Enter at least 3 characters before saving."); return; }
    const now = new Date().toISOString();
    setObservations((current) => current.map((item) => item.id === editingId
      ? { ...item, note: clean, category: editCategory, severity: editSeverity, followUpDate: editFollowUpDate, updatedAt: now }
      : item));
    setEditingId(null);
    setNotice("Observation updated in this browser.");
  };

  // STEP 9.8.0: Export a portable JSON backup of the local journal.
  const exportJournalBackup = () => {
    const payload = { app: "GREENMIND", formatVersion: 1, exportedAt: new Date().toISOString(), observations };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "greenmind-observation-backup.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${observations.length} observation(s) included in JSON backup.`);
  };

  // STEP 9.8.1: Import only validated journal records and merge by unique ID.
  const importJournalBackup = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Backup must be smaller than 2 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "observations" in parsed && Array.isArray((parsed as { observations: unknown }).observations) ? (parsed as { observations: unknown[] }).observations : null);
      if (!list) throw new Error("This file is not a GreenMind observation backup.");
      const valid = list.filter((item): item is PlantObservation => !!item && typeof item === "object"
        && typeof (item as PlantObservation).id === "string" && typeof (item as PlantObservation).plantId === "string"
        && typeof (item as PlantObservation).observedOn === "string" && typeof (item as PlantObservation).category === "string"
        && ["info", "watch", "urgent"].includes((item as PlantObservation).severity)
        && typeof (item as PlantObservation).note === "string" && typeof (item as PlantObservation).createdAt === "string");
      if (!valid.length && list.length) throw new Error("No valid observation records were found in the backup.");
      setObservations((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        valid.forEach((item) => merged.set(item.id, { ...item, status: ["open", "in-progress", "resolved"].includes(item.status ?? "open") ? item.status ?? "open" : "open", followUpDate: item.followUpDate ?? "" }));
        return Array.from(merged.values()).slice(-500);
      });
      setNotice(`${valid.length} valid observation(s) imported. Existing matching IDs were updated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to import this backup.");
    } finally { setImporting(false); }
  };

  // STEP 9.8.2: Per-plant observation totals for quick history review.
  const plantObservationCounts = plants.map((plant) => ({ ...plant, count: observations.filter((item) => item.plantId === String(plant.id)).length })).filter((plant) => plant.count > 0).sort((a, b) => b.count - a.count);

  return (
    <section className="growth-section analytics-section">
      <div className="growth-section-heading">
        <div><h2>Plant Observation Journal</h2><p>Record visual checks, pest signs and plant-care observations with a date and priority.</p></div>
        <span className="growth-badge">Steps 9.7.1–10.0.0</span>
      </div>
      <div className="growth-stats">
        <article className="growth-stat-card"><span>Total observations</span><strong>{observations.length}</strong><small>Saved in this browser</small></article>
        <article className="growth-stat-card"><span>Urgent</span><strong>{urgentCount}</strong><small>Operator review needed</small></article>
        <article className="growth-stat-card"><span>Watch</span><strong>{watchCount}</strong><small>Keep under observation</small></article>
        <article className="growth-stat-card"><span>Open follow-ups</span><strong>{openCount}</strong><small>{overdueFollowUps} overdue</small></article>
        <article className="growth-stat-card"><span>In progress / resolved</span><strong>{inProgressCount} / {resolvedCount}</strong><small>Follow-up workflow</small></article>
        <article className="growth-stat-card"><span>Due in 7 days</span><strong>{dueSoonCount}</strong><small>Upcoming follow-ups</small></article>
      </div>
      <div className="growth-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
        <label>Plant<select value={plantId} onChange={(e) => setPlantId(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}><option value="">Select plant</option>{plants.map((plant) => <option key={plant.id} value={String(plant.id)}>{plant.plant_name}</option>)}</select></label>
        <label>Observation date<input type="date" value={observedOn} onChange={(e) => setObservedOn(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
        <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}><option>General observation</option><option>Leaf condition</option><option>Pest or disease sign</option><option>Flowering or fruiting</option><option>Soil condition</option><option>Stem or root condition</option><option>Other</option></select></label>
        <label>Priority<select value={severity} onChange={(e) => setSeverity(e.target.value as PlantObservation["severity"])} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}><option value="info">Information</option><option value="watch">Watch</option><option value="urgent">Urgent</option></select></label>
        {/* STEP 9.7.14: Optional follow-up date for an observation. */}
        <label>Follow-up date (optional)<input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}>Observation notes<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Describe what you observed. Example: lower leaves show yellow patches." style={{ display: "block", width: "100%", padding: 10, marginTop: 5, borderRadius: 8 }} /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}><button type="button" className="growth-refresh" onClick={addObservation} disabled={!plants.length}>Save Observation</button><button type="button" className="growth-refresh" onClick={exportJournal}>Export Filtered CSV</button><button type="button" className="growth-refresh" onClick={exportJournalBackup}>Download JSON Backup</button><label className="growth-refresh" style={{ cursor: "pointer" }}>{importing ? "Importing…" : "Import JSON Backup"}<input type="file" accept="application/json,.json" disabled={importing} onChange={(e) => { void importJournalBackup(e.target.files?.[0]); e.currentTarget.value = ""; }} style={{ display: "none" }} /></label></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 10px" }}>
        <input aria-label="Search observations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes or categories" style={{ flex: "1 1 220px", padding: 10, borderRadius: 8, border: "1px solid #9ca3af" }} />
        <select aria-label="Filter observations by plant" value={filterPlant} onChange={(e) => setFilterPlant(e.target.value)} style={{ padding: 10, borderRadius: 8 }}><option value="all">All plants</option>{plants.map((plant) => <option key={plant.id} value={String(plant.id)}>{plant.plant_name}</option>)}</select>
        <select aria-label="Filter observations by priority" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} style={{ padding: 10, borderRadius: 8 }}><option value="all">All priorities</option><option value="info">Information</option><option value="watch">Watch</option><option value="urgent">Urgent</option></select>
        <select aria-label="Filter observations by follow-up status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: 10, borderRadius: 8 }}><option value="all">All follow-up states</option><option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option></select>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>From <input aria-label="Observation date from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: 8 }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>To <input aria-label="Observation date to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} style={{ padding: 8 }} /></label>
        <select aria-label="Filter follow-ups by due date" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} style={{ padding: 10, borderRadius: 8 }}><option value="all">All due dates</option><option value="overdue">Overdue</option><option value="due-soon">Due in 7 days</option><option value="no-date">No due date</option></select>
      </div>
      {editingId && <article className="analytics-card" style={{ padding: 14, marginBottom: 12 }}><h3>Edit observation</h3><label>Notes<textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} maxLength={1000} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label><div className="growth-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 10 }}><label>Category<select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ display: "block", width: "100%", padding: 9 }}><option>General observation</option><option>Leaf condition</option><option>Pest or disease sign</option><option>Flowering or fruiting</option><option>Soil condition</option><option>Stem or root condition</option><option>Other</option></select></label><label>Priority<select value={editSeverity} onChange={(e) =>
  setEditSeverity(e.target.value as "info" | "watch" | "urgent")
} style={{ display: "block", width: "100%", padding: 9 }}><option value="info">Information</option><option value="watch">Watch</option><option value="urgent">Urgent</option></select></label><label>Follow-up date<input type="date" value={editFollowUpDate} onChange={(e) => setEditFollowUpDate(e.target.value)} style={{ display: "block", width: "100%", padding: 9 }} /></label></div><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button type="button" className="growth-refresh" onClick={saveObservationEdit}>Save changes</button><button type="button" className="growth-refresh" onClick={() => setEditingId(null)}>Cancel</button></div></article>}
      {visible.length ? <div style={{ display: "grid", gap: 10 }}>{visible.map((item) => <article key={item.id} className="analytics-card" style={{ padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><strong>{plants.find((p) => String(p.id) === item.plantId)?.plant_name ?? "Unknown plant"}</strong><small style={{ display: "block", opacity: .7 }}>{formatDate(item.observedOn)} · {item.category} · {item.severity.toUpperCase()}</small><small style={{ display: "block", opacity: .75 }}>Follow-up: {(item.status ?? "open").replace("-", " ").toUpperCase()}{item.followUpDate ? ` · Due ${formatDate(item.followUpDate)}` : " · No due date"}{item.followUpDate && item.followUpDate < todayKey && item.status !== "resolved" ? " · OVERDUE" : ""}</small>{item.resolvedAt && <small style={{ display: "block", opacity: .7 }}>Resolved: {formatDate(item.resolvedAt)}</small>}{item.updatedAt && <small style={{ display: "block", opacity: .7 }}>Last edited: {formatDate(item.updatedAt)}</small>}</div><div style={{ display: "flex", gap: 6 }}><button type="button" className="growth-refresh" onClick={() => beginEditObservation(item)}>Edit</button><button type="button" className="growth-refresh" onClick={() => deleteObservation(item.id)}>Delete</button></div></div><p style={{ margin: "10px 0" , whiteSpace: "pre-wrap" }}>{item.note}</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><label style={{ fontSize: 12 }}>Follow-up status <select aria-label={`Follow-up status for ${item.id}`} value={item.status ?? "open"} onChange={(e) => updateObservationStatus(item.id, e.target.value as NonNullable<PlantObservation["status"]>)} style={{ marginLeft: 6, padding: 7, borderRadius: 6 }}><option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option></select></label></div></article>)}</div> : <div className="growth-empty compact">No observations match the selected filters.</div>}
      {plantObservationCounts.length > 0 && <article className="analytics-card" style={{ padding: 14, marginTop: 14 }}><h3>Observation coverage by plant</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>{plantObservationCounts.map((plant) => <div key={plant.id} style={{ padding: 10, borderRadius: 8, background: "rgba(100,116,139,.08)" }}><strong>{plant.plant_name}</strong><small style={{ display: "block", opacity: .7 }}>{plant.count} observation(s)</small></div>)}</div></article>}
      {notice && <p role="status" aria-live="polite">{notice}</p>}
      <p style={{ fontSize: 12, opacity: .7, marginBottom: 0 }}>Observations and follow-up statuses are browser-local notes. JSON backup files can be moved between browsers manually. They are not diagnoses, do not change plant health scores, and are not written to Supabase.</p>
      <p style={{ fontSize: 11, opacity: .65, marginTop: 8 }}>GREENMIND CROP GROWTH TRACKER · VERSION 10.0.0 · Observation journal release</p>
    </section>
  );
}

// ==========================================
// RELEASE NOTES — STEPS 9.7.15 TO 10.0.0
// 9.7.15 Edit existing observations
// 9.7.16 Record follow-up resolution timestamps
// 9.7.17 Validate edits before saving
// 9.7.18 Filter journal by observation date range
// 9.7.19 Filter overdue, due-soon and undated follow-ups
// 9.7.20 Show upcoming follow-up count
// 9.8.0 Export a portable JSON journal backup
// 9.8.1 Validate and merge imported JSON backups by ID
// 9.8.2 Show per-plant observation coverage
// 9.8.3 Include resolution and edit timestamps in CSV exports
// 9.8.4 Preserve browser-local storage and legacy entries
// 9.9.0 Improve journal edit and import feedback
// 9.9.1 Add accessible labels and live status feedback
// 9.9.2 Add backup file-size guard and invalid-file handling
// 9.9.3 Add a journal release summary
// 10.0.0 Mark the observation-journal milestone as version 10.0.0
// ==========================================
// GROWTH TRACKER PAGE
// ==========================================

export default function GrowthTrackerPage() {
  const [data, setData] = useState<TrackerData>({
    plants: [],
    growthLogs: [],
    careLogs: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [irrigation, setIrrigation] =
    useState<IrrigationResponse | null>(null);

  const [irrigationError, setIrrigationError] =
    useState("");

  const [irrigationLoading, setIrrigationLoading] =
    useState(true);

  const [simulatorStatus, setSimulatorStatus] =
    useState<"stopped" | "running" | "paused">("stopped");

  const [demoIrrigation, setDemoIrrigation] =
    useState<IrrigationResponse | null>(null);

  // STEP 9.6.4: ALERT HISTORY STATE

  const [alertHistory, setAlertHistory] =
    useState<IrrigationAlertHistoryItem[]>([]);

  const [alertHistoryLoaded, setAlertHistoryLoaded] =
    useState(false);

  // STEP 9.6.15: local sensor history state
  const [sensorReadingHistory, setSensorReadingHistory] =
    useState<SavedSensorReading[]>([]);
  const [sensorHistoryLoaded, setSensorHistoryLoaded] = useState(false);

  // STEP 9.6.18: configurable, browser-local advisory thresholds.
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>(DEFAULT_ALERT_THRESHOLDS);
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("greenmind-alert-thresholds");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Number.isFinite(parsed.criticalMoisture) && Number.isFinite(parsed.lowMoisture) && Number.isFinite(parsed.highTemperature)) {
          setAlertThresholds({
            criticalMoisture: Math.max(0, Math.min(100, parsed.criticalMoisture)),
            lowMoisture: Math.max(0, Math.min(100, parsed.lowMoisture)),
            highTemperature: Math.max(0, Math.min(60, parsed.highTemperature)),
          });
        }
      }
    } catch (storageError) { console.error("Unable to load alert threshold settings:", storageError); }
    finally { setThresholdsLoaded(true); }
  }, []);
  useEffect(() => {
    if (!thresholdsLoaded) return;
    try { localStorage.setItem("greenmind-alert-thresholds", JSON.stringify(alertThresholds)); }
    catch (storageError) { console.error("Unable to save alert threshold settings:", storageError); }
  }, [alertThresholds, thresholdsLoaded]);

  const simulatorEnabled =
    simulatorStatus !== "stopped";

  const displayIrrigation = useMemo(() => {
    return simulatorEnabled ? demoIrrigation : irrigation;
  }, [simulatorEnabled, demoIrrigation, irrigation]);

  // ========================================
  // LOAD SAVED ALERT HISTORY
  // ========================================

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        "greenmind-irrigation-alert-history"
      );

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item) => item && typeof item === "object" && typeof item.id === "string")
            .map((item) => ({
              ...item,
              source: item.source === "real" || item.source === "simulated" || item.source === "legacy"
                ? item.source
                : "legacy" as const,
            }));
          setAlertHistory(normalized);
        }
      }
    } catch (error) {
      console.error(
        "Unable to load irrigation alert history:",
        error
      );
    } finally {
      setAlertHistoryLoaded(true);
    }
  }, []);

  // ========================================
  // SAVE ALERT HISTORY
  // ========================================

  useEffect(() => {
    if (!alertHistoryLoaded) return;

    try {
      localStorage.setItem(
        "greenmind-irrigation-alert-history",
        JSON.stringify(alertHistory)
      );
    } catch (error) {
      console.error(
        "Unable to save irrigation alert history:",
        error
      );
    }
  }, [alertHistory, alertHistoryLoaded]);

  // Load and save browser-local sensor reading history.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("greenmind-sensor-reading-history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSensorReadingHistory(parsed.slice(-500));
      }
    } catch (error) {
      console.error("Unable to load sensor reading history:", error);
    } finally {
      setSensorHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!sensorHistoryLoaded) return;
    try {
      localStorage.setItem("greenmind-sensor-reading-history", JSON.stringify(sensorReadingHistory.slice(-500)));
    } catch (error) {
      console.error("Unable to save sensor reading history:", error);
    }
  }, [sensorReadingHistory, sensorHistoryLoaded]);

  // Save each unique valid timestamp once, keeping real and simulated streams distinct.
  useEffect(() => {
    const telemetry = displayIrrigation?.telemetry;
    if (!telemetry?.created_at) return;
    const timestamp = new Date(telemetry.created_at).getTime();
    if (!Number.isFinite(timestamp)) return;
    const source: "real" | "simulated" = simulatorEnabled ? "simulated" : "real";
    setSensorReadingHistory((previous) => {
      const id = `${source}:${telemetry.created_at}`;
      if (previous.some((item) => item.id === id)) return previous;
      return [...previous, { ...telemetry, id, source, savedAt: new Date().toISOString() }].slice(-500);
    });
  }, [displayIrrigation, simulatorEnabled]);

  // ========================================
  // STEP 9.6.14–9.6.15: SOURCE-SCOPED ALERT DEDUPLICATION AND RECOVERY
  // Repeated processing of the same telemetry timestamp does not increment occurrences.
  // A condition disappearing from a valid reading resolves only that source's active record.
  // UPDATE ALERT HISTORY FROM READINGS
  // ========================================

  useEffect(() => {
    if (!alertHistoryLoaded) return;

    const telemetry = displayIrrigation?.telemetry;

    if (
      !telemetry ||
      displayIrrigation?.isStale ||
      !telemetry.created_at
    ) {
      return;
    }

    const currentAlerts: {
      type: string;
      title: string;
      message: string;
      level: "critical" | "warning";
      sensorValue: string;
    }[] = [];

    const moisture = telemetry.soil_moisture_percent;
    const temperature = telemetry.temperature_c;

    if (moisture !== null && moisture !== undefined) {
      const value = Number(moisture);

      if (Number.isFinite(value)) {
        if (value <= alertThresholds.criticalMoisture) {
          currentAlerts.push({
            type: "critical-moisture",
            title: "Critical soil moisture",
            message:
              "Soil moisture is critically low. Inspect the soil and plant immediately. Watering may be required.",
            level: "critical",
            sensorValue: `${value.toFixed(1)}%`,
          });
        } else if (value <= alertThresholds.lowMoisture) {
          currentAlerts.push({
            type: "low-moisture",
            title: "Low soil moisture",
            message:
              "Soil moisture is below the recommended advisory threshold. Check the soil and plant condition.",
            level: "warning",
            sensorValue: `${value.toFixed(1)}%`,
          });
        }
      }
    }

    if (
      temperature !== null &&
      temperature !== undefined &&
      Number.isFinite(Number(temperature)) &&
      Number(temperature) >= alertThresholds.highTemperature
    ) {
      currentAlerts.push({
        type: "high-temperature",
        title: "High greenhouse temperature",
        message:
          "Greenhouse temperature is high. Check ventilation and plant condition.",
        level: "warning",
        sensorValue: `${Number(temperature).toFixed(1)}°C`,
      });
    }

    const now = new Date().toISOString();
    const eventSource: "real" | "simulated" = simulatorEnabled
      ? "simulated"
      : "real";

    setAlertHistory((previousHistory) => {
      let updatedHistory = [...previousHistory];

      const activeTypes = new Set(
        currentAlerts.map((alert) => alert.type)
      );

      // Resolve alerts that are no longer active.

      updatedHistory = updatedHistory.map((item) => {
        if (
          item.status === "active" &&
          (item.source ?? "legacy") === eventSource &&
          !activeTypes.has(item.type)
        ) {
          return {
            ...item,
            status: "resolved",
            resolvedAt: now,
          };
        }

        return item;
      });

      // Add new alerts or update existing active alerts.

      currentAlerts.forEach((alert) => {
        const existingIndex = updatedHistory.findIndex(
          (item) =>
            item.type === alert.type &&
            item.status === "active" &&
            (item.source ?? "legacy") === eventSource
        );

        if (existingIndex >= 0) {
          updatedHistory[existingIndex] = {
            ...updatedHistory[existingIndex],
            title: alert.title,
            message: alert.message,
            level: alert.level,
            sensorValue: alert.sensorValue,
            source: eventSource,
            occurrences: (updatedHistory[existingIndex].occurrences ?? 1) +
              (updatedHistory[existingIndex].lastSeenAt === telemetry.created_at ? 0 : 1),
            lastSeenAt: telemetry.created_at,
          };
        } else {
          updatedHistory.push({
            id: `${alert.type}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            type: alert.type,
            title: alert.title,
            message: alert.message,
            level: alert.level,
            sensorValue: alert.sensorValue,
            createdAt: now,
            status: "active",
            resolvedAt: null,
            source: eventSource,
            occurrences: 1,
            lastSeenAt: telemetry.created_at,
          });
        }
      });

      // Keep the latest 100 alert records.

      return updatedHistory.slice(-100);
    });
  }, [displayIrrigation, alertHistoryLoaded, alertThresholds]);  // ========================================
  // SIMULATOR AUTOMATIC READING
  // ========================================

  useEffect(() => {
    if (simulatorStatus !== "running") return;

    const interval = window.setInterval(() => {
      setDemoIrrigation((current) => {
        if (!current) return current;

        return advanceDemoIrrigation(current);
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, [simulatorStatus]);

  // ========================================
  // SIMULATOR CONTROLS
  // ========================================

  const startSimulator = () => {
    setDemoIrrigation(createDemoIrrigation());
    setSimulatorStatus("running");
  };

  const pauseSimulator = () => {
    setSimulatorStatus("paused");
  };

  const resumeSimulator = () => {
    setSimulatorStatus("running");
  };

  const resetSimulator = () => {
    setSimulatorStatus("stopped");
    setDemoIrrigation(null);
  };

  // ========================================
  // LOAD IRRIGATION DATA
  // ========================================

  const loadIrrigation = useCallback(async () => {
    try {
      setIrrigationError("");

      const response = await fetch("/api/irrigation", {
        cache: "no-store",
      });

      const result =
        (await response.json()) as IrrigationResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          "Unable to load irrigation sensor data."
        );
      }

      setIrrigation(result);
    } catch (err) {
      setIrrigationError(
        err instanceof Error
          ? err.message
          : "Unable to load irrigation sensor data."
      );
    } finally {
      setIrrigationLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIrrigation();

    const interval = window.setInterval(
      loadIrrigation,
      15000
    );

    return () => window.clearInterval(interval);
  }, [loadIrrigation]);

  // ========================================
  // LOAD GROWTH TRACKER DATA
  // ========================================

  const loadTracker = useCallback(async () => {
    try {
      setError("");

      const response = await fetch("/api/growth", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load growth tracker.");
      }

      const result = await response.json();

      setData({
        plants: result.plants || [],
        growthLogs: result.growthLogs || [],
        careLogs: result.careLogs || [],
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTracker();
  }, [loadTracker]);

  // ========================================
  // AVERAGE PLANT HEALTH
  // ========================================

  const averageHealth = useMemo(() => {
    const scores = data.growthLogs
      .map((log) => log.health_score)
      .filter(
        (score): score is number =>
          score !== null &&
          Number.isFinite(Number(score))
      );

    if (!scores.length) return 0;

    return Math.round(
      scores.reduce(
        (total, score) => total + Number(score),
        0
      ) / scores.length
    );
  }, [data.growthLogs]);

  // ========================================
  // LATEST GROWTH RECORD PER PLANT
  // ========================================

  const latestGrowth = useMemo(() => {
    const latest = new Map<string, GrowthLog>();

    const sorted = [...data.growthLogs].sort(
      (a, b) =>
        new Date(b.measured_on).getTime() -
        new Date(a.measured_on).getTime()
    );

    for (const log of sorted) {
      const key = String(log.plant_id);

      if (!latest.has(key)) {
        latest.set(key, log);
      }
    }

    return latest;
  }, [data.growthLogs]);

  // ========================================
  // GROWTH STAGE DISTRIBUTION
  // ========================================

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};

    latestGrowth.forEach((log) => {
      const stage = log.growth_stage || "Not recorded";

      counts[stage] = (counts[stage] || 0) + 1;
    });

    return Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    );
  }, [latestGrowth]);

  // ========================================
  // CARE ACTIVITY DISTRIBUTION
  // ========================================

  const careDistribution = useMemo(() => {
    const counts: Record<string, number> = {};

    data.careLogs.forEach((log) => {
      counts[log.care_type] =
        (counts[log.care_type] || 0) + 1;
    });

    return Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    );
  }, [data.careLogs]);

  // ========================================
  // HEIGHT AND HEALTH TREND DATA
  // ========================================

  const trendData = useMemo(() => {
    const grouped: Record<
      string,
      { heights: number[]; health: number[] }
    > = {};

    data.growthLogs.forEach((log) => {
      if (!grouped[log.measured_on]) {
        grouped[log.measured_on] = {
          heights: [],
          health: [],
        };
      }

      if (log.height_cm !== null) {
        grouped[log.measured_on].heights.push(
          Number(log.height_cm)
        );
      }

      if (log.health_score !== null) {
        grouped[log.measured_on].health.push(
          Number(log.health_score)
        );
      }
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date: formatDate(date),

        height: values.heights.length
          ? Number(
              (
                values.heights.reduce((a, b) => a + b, 0) /
                values.heights.length
              ).toFixed(1)
            )
          : null,

        health: values.health.length
          ? Math.round(
              values.health.reduce((a, b) => a + b, 0) /
                values.health.length
            )
          : null,
      }));
  }, [data.growthLogs]);

  // ========================================
  // STEP 9.2: PLANT GROWTH PREDICTIONS
  // ========================================

  const predictions = useMemo(() => {
    return data.plants.map((plant) => {
      const plantLogs = data.growthLogs.filter(
        (log) =>
          String(log.plant_id) === String(plant.id)
      );

      return predictPlantGrowth(plant, plantLogs);
    });
  }, [data.plants, data.growthLogs]);

  // ========================================
  // STEP 9.4.5: IRRIGATION PREDICTION
  // ========================================

  const irrigationPrediction = useMemo(() => {
    return analyzeIrrigation(
      displayIrrigation?.history ?? [],
      displayIrrigation?.isStale ?? true
    );
  }, [displayIrrigation]);

  // ========================================
  // DASHBOARD COUNTS
  // ========================================

  const totalStages = stageDistribution.reduce(
    (sum, item) => sum + item[1],
    0
  );

  const totalCare = careDistribution.reduce(
    (sum, item) => sum + item[1],
    0
  );

  const warningCount = predictions.filter(
    (item) => item.status === "warning"
  ).length;

  const predictionCount = predictions.filter(
    (item) => item.predictedHeight !== null
  ).length;

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <main className="growth-page">
        <div className="growth-loading">
          Loading GreenMind Growth Tracker...
        </div>
      </main>
    );
  }

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <main className="growth-page">
      <div className="growth-container">

        {/* DASHBOARD HEADER */}

        <header className="growth-header">
          <div>
            <span className="growth-eyebrow">
              GREENMIND SMART AGRICULTURE
            </span>

            <h1>Crop Growth Tracker</h1>

            <p>
              Monitor plant development, health and care history
              in one place.
            </p>
          </div>

          <button
            className="growth-refresh"
            onClick={loadTracker}
          >
            ↻ Refresh Data
          </button>
        </header>

        {error && (
          <div className="growth-error" role="alert">
            {error}
          </div>
        )}

        {/* MAIN STATISTICS */}

        <section className="growth-stats">
          <article className="growth-stat-card">
            <span>Total Plants</span>
            <strong>{data.plants.length}</strong>
            <small>Registered plants</small>
          </article>

          <article className="growth-stat-card">
            <span>Average Health</span>
            <strong>{averageHealth}%</strong>
            <small>Recorded health scores</small>
          </article>

          <article className="growth-stat-card">
            <span>Growth Records</span>
            <strong>{data.growthLogs.length}</strong>
            <small>Measurements recorded</small>
          </article>

          <article className="growth-stat-card">
            <span>Care Activities</span>
            <strong>{data.careLogs.length}</strong>
            <small>Recorded care activities</small>
          </article>
        </section>

        {/* ==================================
            SMART IRRIGATION
        ================================== */}

        <section className="growth-section analytics-section">
          <div className="growth-section-heading">
            <div>
              <h2>Smart Irrigation Advisory</h2>
              <p>
                Watering guidance based on the latest greenhouse
                sensor readings.
              </p>
            </div>

            <span className="growth-public-label">
              SENSOR MONITORING
            </span>
          </div>

          {/* SENSOR STATUS */}

          <article className="analytics-card">
            <div className="growth-section-heading">
              <div>
                <h3>Greenhouse Sensor Status</h3>

                <p>
                  {simulatorStatus === "running"
                    ? "Demo readings are being generated locally. No real sensor is connected."
                    : simulatorStatus === "paused"
                      ? "Demo readings are paused. No real sensor is connected."
                      : irrigationLoading
                        ? "Checking for the latest sensor reading..."
                        : irrigationError
                          ? "Sensor data could not be loaded."
                          : displayIrrigation?.message ??
                            "Waiting for greenhouse sensor data."}
                </p>
              </div>

              <span
                className={
                  simulatorEnabled
                    ? "growth-pending-badge"
                    : displayIrrigation?.mode === "live" &&
                        !displayIrrigation.isStale
                      ? "growth-health-badge"
                      : "growth-pending-badge"
                }
              >
                {simulatorStatus === "running"
                  ? "Simulated data"
                  : simulatorStatus === "paused"
                    ? "Simulator paused"
                    : irrigationLoading
                      ? "Checking"
                      : irrigationError
                        ? "Unavailable"
                        : displayIrrigation?.mode === "live" &&
                            !displayIrrigation.isStale
                          ? "Live sensor data"
                          : displayIrrigation?.mode === "stale"
                            ? "Data is stale"
                            : "Waiting for data"}
              </span>
            </div>

            {irrigationError && !simulatorEnabled && (
              <div className="growth-error" role="alert">
                {irrigationError}
              </div>
            )}

            {displayIrrigation?.telemetry ? (
              <>
                <div className="growth-stats">
                  <article className="growth-stat-card">
                    <span>Soil Moisture</span>
                    <strong>
                      {displayIrrigation.telemetry
                        .soil_moisture_percent != null
                        ? `${Number(
                            displayIrrigation.telemetry
                              .soil_moisture_percent
                          ).toFixed(1)}%`
                        : "—"}
                    </strong>
                    <small>
                      {simulatorEnabled
                        ? "Simulated soil reading"
                        : "Measured by soil sensor"}
                    </small>
                  </article>

                  <article className="growth-stat-card">
                    <span>Temperature</span>
                    <strong>
                      {displayIrrigation.telemetry.temperature_c != null
                        ? `${Number(
                            displayIrrigation.telemetry.temperature_c
                          ).toFixed(1)}°C`
                        : "—"}
                    </strong>
                    <small>Greenhouse air temperature</small>
                  </article>

                  <article className="growth-stat-card">
                    <span>Humidity</span>
                    <strong>
                      {displayIrrigation.telemetry.humidity_percent != null
                        ? `${Number(
                            displayIrrigation.telemetry.humidity_percent
                          ).toFixed(1)}%`
                        : "—"}
                    </strong>
                    <small>Relative air humidity</small>
                  </article>

                  <article className="growth-stat-card">
                    <span>Last Reading</span>
                    <strong>
                      {displayIrrigation.telemetry.created_at
                        ? formatDate(
                            displayIrrigation.telemetry.created_at
                          )
                        : "Unknown"}
                    </strong>
                    <small>
                      {simulatorEnabled
                        ? "Demo observation"
                        : displayIrrigation.ageSeconds != null
                          ? `${displayIrrigation.ageSeconds} seconds ago`
                          : "Reading time unavailable"}
                    </small>
                  </article>
                </div>

                {/* WATERING ADVISORY */}

                <div className="analytics-empty">
                  <strong>Watering advisory</strong>

                  {!displayIrrigation.isStale &&
                  displayIrrigation.telemetry
                    .soil_moisture_percent != null ? (
                    Number(
                      displayIrrigation.telemetry
                        .soil_moisture_percent
                    ) <= 30 ? (
                      <p>
                        Soil moisture is at or below 30%.
                        Check the soil and plant condition;
                        watering may be needed.
                      </p>
                    ) : (
                      <p>
                        Soil moisture is above the 30%
                        advisory threshold. Continue monitoring
                        and check the plant before watering.
                      </p>
                    )
                  ) : (
                    <p>
                      A current soil-moisture reading is
                      required before GreenMind can provide
                      a watering advisory.
                    </p>
                  )}

                  {displayIrrigation.telemetry.temperature_c != null &&
                    Number(
                      displayIrrigation.telemetry.temperature_c
                    ) >= 35 && (
                      <p>
                        Temperature is 35°C or higher.
                        Check greenhouse ventilation and
                        plant condition.
                      </p>
                    )}
                </div>
              </>
            ) : (
              <div className="analytics-empty">
                <strong>
                  {irrigationLoading
                    ? "Connecting to sensor data"
                    : "Waiting for the first ESP32 reading"}
                </strong>

                <p>
                  {displayIrrigation?.message ??
                    "GreenMind has not received a greenhouse sensor reading yet."}
                </p>

                <p>
                  When your ESP32 is connected and successfully
                  sends data to Supabase, the latest soil moisture,
                  temperature and humidity will appear here.
                </p>
              </div>
            )}

            {/* SIMULATOR CONTROLS */}

            <div className="growth-section-heading">
              <p>
                {simulatorStatus === "running"
                  ? "DEMO MODE — SIMULATOR RUNNING"
                  : simulatorStatus === "paused"
                    ? "DEMO MODE — SIMULATOR PAUSED"
                    : "REAL SENSOR MODE — NO SIMULATED READINGS"}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {simulatorStatus === "stopped" && (
                  <button
                    className="growth-refresh"
                    onClick={startSimulator}
                  >
                    ▶ Start Simulator
                  </button>
                )}

                {simulatorStatus === "running" && (
                  <button
                    className="growth-refresh"
                    onClick={pauseSimulator}
                  >
                    ⏸ Pause Simulator
                  </button>
                )}

                {simulatorStatus === "paused" && (
                  <button
                    className="growth-refresh"
                    onClick={resumeSimulator}
                  >
                    ▶ Resume Simulator
                  </button>
                )}

                {simulatorEnabled && (
                  <button
                    className="growth-refresh"
                    onClick={resetSimulator}
                  >
                    ↺ Reset Simulator
                  </button>
                )}

                <button
                  className="growth-refresh"
                  onClick={loadIrrigation}
                  disabled={irrigationLoading || simulatorEnabled}
                >
                  ↻ Refresh Sensors
                </button>
              </div>
            </div>
          </article>

          {/* STEP 9.6.10: SENSOR HEALTH DIAGNOSTICS */}
          <SensorDataQuality
            response={displayIrrigation}
            isSimulated={simulatorEnabled}
          />

          {/* STEP 9.6.15–9.6.17: SENSOR HISTORY, FILTERS AND CSV EXPORT */}
          <SensorReadingHistory readings={sensorReadingHistory} />

          {/* STEP 9.6.18: CONFIGURABLE ADVISORY ALERT THRESHOLDS */}
          <AlertThresholdSettings value={alertThresholds} onChange={setAlertThresholds} />

          {/* STEP 9.6.19: WEEKLY GREENHOUSE SUMMARY */}
          <WeeklyOperationsSummary alerts={alertHistory} readings={sensorReadingHistory} />

          {/* STEP 9.6.20: RELIABILITY AND DATA-INTEGRITY SUMMARY */}
          <DashboardReliabilitySummary alerts={alertHistory} readings={sensorReadingHistory} response={displayIrrigation} />

          {/* STEPS 9.6.36–9.7.0: PLANT PORTFOLIO, CARE EXPORTS AND OPERATOR CHECKLIST */}
          <PlantOperationsCenter data={data} />

          {/* STEPS 9.7.1–9.7.7: BROWSER-LOCAL PLANT OBSERVATION JOURNAL */}
          <PlantObservationJournal plants={data.plants} />

          {/* STEPS 9.6.21–9.6.35: BACKUP, RESTORE, MAINTENANCE AND OPERATOR REPORTING */}
          <GreenhouseDataManagement
            alerts={alertHistory}
            readings={sensorReadingHistory}
            thresholds={alertThresholds}
            onAlertsChange={setAlertHistory}
            onReadingsChange={setSensorReadingHistory}
            onThresholdsChange={setAlertThresholds}
          />

          {/* STEP 9.6.3: IRRIGATION ALERTS */}

          <IrrigationAlerts
            telemetry={displayIrrigation?.telemetry ?? null}
            isStale={displayIrrigation?.isStale ?? true}
            isSimulated={displayIrrigation?.isSimulated ?? false}
            thresholds={alertThresholds}
          />

          {/* STEP 9.6.5: IRRIGATION ALERT HISTORY */}

          {!simulatorEnabled && (!displayIrrigation?.telemetry || displayIrrigation.isStale) && (
            <div className="analytics-card" role="status">
              <strong>Live sensor condition is currently unknown</strong>
              <p style={{ marginBottom: 0 }}>
                No fresh ESP32 reading is available. Previous alert records are retained for reporting, but GreenMind cannot confirm whether an earlier soil-moisture or temperature condition is still present. A new valid sensor reading is needed to update live alert conditions.
              </p>
            </div>
          )}

          <IrrigationAlertHistory
            history={alertHistory}
            onClear={() => setAlertHistory([])}
            onAcknowledge={(id) => {
              const acknowledgedAt = new Date().toISOString();
              setAlertHistory((previous) => previous.map((item) =>
                item.id === id && item.status === "active" && !item.acknowledgedAt
                  ? { ...item, acknowledgedAt }
                  : item
              ));
            }}
            onResolve={(id) => {
              const resolvedAt = new Date().toISOString();
              setAlertHistory((previous) => previous.map((item) =>
                item.id === id && item.status === "active"
                  ? { ...item, status: "resolved" as const, resolvedAt }
                  : item
              ));
            }}
          />

          {/* STEP 9.6.7: INDIVIDUAL ALERT ACKNOWLEDGEMENT AND RESOLUTION */}

          {/* STEP 9.6.6: ADVANCED ALERT ANALYTICS */}

          <IrrigationAlertAnalytics history={alertHistory} />

          {/* PREDICTIVE IRRIGATION */}

          <article className="analytics-card">
            <div className="growth-section-heading">
              <div>
                <h3>Predictive Irrigation Analysis</h3>
                <p>
                  Moisture trend analysis using recent{" "}
                  {simulatorEnabled
                    ? "simulated"
                    : "ESP32"}{" "}
                  sensor readings.
                </p>
              </div>

              <span
                className={
                  irrigationPrediction.status === "stable"
                    ? "growth-health-badge"
                    : "growth-pending-badge"
                }
              >
                {irrigationPrediction.status === "attention"
                  ? "Check watering"
                  : irrigationPrediction.status === "drying"
                    ? "Drying trend"
                    : irrigationPrediction.status === "stable"
                      ? "Stable trend"
                      : "Collecting data"}
              </span>
            </div>

            <div className="analytics-empty">
              <strong>{irrigationPrediction.title}</strong>
              <p>{irrigationPrediction.message}</p>
            </div>

            <div className="growth-details">
              <div>
                <span>Readings analysed</span>
                <strong>
                  {irrigationPrediction.readingsUsed}
                </strong>
              </div>

              <div>
                <span>Moisture trend</span>
                <strong>
                  {irrigationPrediction.moistureTrend === null
                    ? "Not available"
                    : `${
                        irrigationPrediction.moistureTrend > 0
                          ? "+"
                          : ""
                      }${irrigationPrediction.moistureTrend.toFixed(
                        2
                      )}% / hour`}
                </strong>
              </div>

              <div>
                <span>Estimated time to 30%</span>
                <strong>
                  {irrigationPrediction
                    .estimatedHoursToThreshold === null
                    ? "Not available"
                    : irrigationPrediction
                          .estimatedHoursToThreshold === 0
                      ? "Threshold reached"
                      : `${irrigationPrediction.estimatedHoursToThreshold.toFixed(
                          1
                        )} hours`}
                </strong>
              </div>
            </div>

            <p>
              <strong>Model information:</strong> This is an
              experimental rule-based trend estimate using
              up to the 10 most recent valid sensor readings. Estimates are shown only when the trend is sufficiently consistent and within a conservative rate range. It is not a trained
              machine-learning model and should not be treated
              as an exact watering schedule. It does not
              operate the pump.
            </p>

            {simulatorEnabled && (
              <p>
                <strong>Demo notice:</strong> The current analysis
                uses generated test values. It does not represent
                actual greenhouse conditions.
              </p>
            )}
          </article>

          {/* STEP 9.6.2: SOIL MOISTURE TREND */}

          <IrrigationTrendChart
            history={displayIrrigation?.history ?? []}
          />

          {/* HOW IRRIGATION WORKS */}

          <article className="analytics-card">
            <h3>How the advisory works</h3>

            <p>
              GreenMind checks the latest soil-moisture reading.
              At or below 30%, it advises you to inspect the soil
              because watering may be needed. At higher readings,
              it recommends continued monitoring.
            </p>

            <p>
              <strong>Important:</strong> This is an advisory,
              not an automatic pump command. Plant type, soil,
              weather and growing conditions affect watering
              needs. Always inspect the plant before watering.
              The website does not remotely switch on the pump.
            </p>
          </article>
        </section>

        {/* ==================================
            PLANT GROWTH PREDICTION
        ================================== */}

        <section className="growth-section analytics-section">
          <div className="growth-section-heading">
            <div>
              <h2>AI Plant Growth Prediction</h2>
              <p>
                Seven-day growth estimates based on historical
                plant-height measurements.
              </p>
            </div>

            <span className="growth-public-label">
              GROWTH ESTIMATES
            </span>
          </div>

          <div className="growth-stats">
            <article className="growth-stat-card">
              <span>Plants Analysed</span>
              <strong>{predictionCount}</strong>
              <small>Enough data for an estimate</small>
            </article>

            <article className="growth-stat-card">
              <span>Health Warnings</span>
              <strong>{warningCount}</strong>
              <small>Plants requiring attention</small>
            </article>
          </div>

          <div className="analytics-grid">
            {predictions.length === 0 ? (
              <article className="analytics-card">
                <h3>No plants available</h3>
                <p>
                  Register a plant to begin growth analysis.
                </p>
              </article>
            ) : (
              predictions.map((prediction) => (
                <article
                  className="analytics-card"
                  key={prediction.plant.id}
                >
                  <div className="growth-section-heading">
                    <div>
                      <h3>
                        {prediction.plant.plant_name}
                      </h3>
                      <p>{prediction.plant.plant_type}</p>
                    </div>

                    <span
                      className={
                        prediction.status === "positive"
                          ? "growth-health-badge"
                          : "growth-pending-badge"
                      }
                    >
                      {prediction.status === "warning"
                        ? "Attention"
                        : prediction.status === "positive"
                          ? "Positive trend"
                          : "More data needed"}
                    </span>
                  </div>

                  <div className="growth-details">
                    <div>
                      <span>Latest height</span>
                      <strong>
                        {prediction.latestHeight !== null
                          ? `${prediction.latestHeight} cm`
                          : "Not recorded"}
                      </strong>
                    </div>

                    <div>
                      <span>Estimated height in 7 days</span>
                      <strong>
                        {prediction.predictedHeight !== null
                          ? `${prediction.predictedHeight.toFixed(
                              1
                            )} cm`
                          : "Not available"}
                      </strong>
                    </div>

                    <div>
                      <span>Estimated daily growth</span>
                      <strong>
                        {prediction.dailyGrowth !== null
                          ? `${prediction.dailyGrowth.toFixed(
                              2
                            )} cm/day`
                          : "Not available"}
                      </strong>
                    </div>

                    <div>
                      <span>Latest health score</span>
                      <strong>
                        {prediction.health !== null
                          ? `${prediction.health}%`
                          : "Not recorded"}
                      </strong>
                    </div>

                    <div>
                      <span>Measurements used</span>
                      <strong>
                        {prediction.measurements}
                      </strong>
                    </div>

                    <div>
                      <span>Prediction date</span>
                      <strong>
                        {prediction.predictionDate
                          ? formatDate(
                              prediction.predictionDate
                            )
                          : "Not available"}
                      </strong>
                    </div>
                  </div>

                  <div className="analytics-empty">
                    <strong>Growth analysis</strong>
                    <p>{prediction.message}</p>

                    {prediction.healthChange !== null && (
                      <p>
                        Health change since previous record:{" "}
                        {prediction.healthChange > 0 ? "+" : ""}
                        {prediction.healthChange} points.
                      </p>
                    )}
                  </div>

                  {prediction.status === "warning" && (
                    <div className="growth-error" role="status">
                      Check the plant, review its recent care
                      activities and record a fresh measurement.
                    </div>
                  )}
                </article>
              ))
            )}
          </div>

          <article className="analytics-card">
            <h3>How the prediction works</h3>

            <p>
              GreenMind analyses the plant&apos;s recorded height
              measurements and calculates a linear growth trend.
              It uses that trend to estimate height seven days
              after the latest measurement.
            </p>

            <p>
              <strong>Important:</strong> This is an experimental
              statistical estimate, not a guaranteed result or a
              trained AI model. Actual growth depends on plant
              variety, weather, soil, water, nutrients and other
              conditions. More measurements can improve the
              usefulness of the estimate.
            </p>
          </article>
        </section>

        {/* ==================================
            GROWTH ANALYTICS DASHBOARD
        ================================== */}

        <section className="growth-section analytics-section">
          <div className="growth-section-heading">
            <div>
              <h2>Growth Analytics Dashboard</h2>
              <p>
                Visual insights from your greenhouse records.
              </p>
            </div>

            <span className="growth-public-label">
              LIVE DATA
            </span>
          </div>

          <div className="analytics-grid">
            <TrendChart
              title="Plant Height Trend"
              subtitle="Average recorded height over time"
              points={trendData}
              field="height"
              suffix=" cm"
            />

            <TrendChart
              title="Plant Health Trend"
              subtitle="Average recorded health score over time"
              points={trendData}
              field="health"
              suffix="%"
            />
          </div>

          <div className="analytics-grid">

            {/* GROWTH STAGE DISTRIBUTION */}

            <article className="analytics-card">
              <h3>Growth Stage Distribution</h3>

              <p>
                Latest recorded stage for each measured plant.
              </p>

              {stageDistribution.length === 0 ? (
                <div className="analytics-empty">
                  No growth-stage records available.
                </div>
              ) : (
                <div className="analytics-bars">
                  {stageDistribution.map(([stage, count]) => {
                    const percentage = totalStages
                      ? (count / totalStages) * 100
                      : 0;

                    return (
                      <div
                        className="analytics-bar-item"
                        key={stage}
                      >
                        <div className="analytics-bar-label">
                          <span>{stage}</span>
                          <strong>{count} plants</strong>
                        </div>

                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar-fill"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            {/* CARE ACTIVITY DISTRIBUTION */}

            <article className="analytics-card">
              <h3>Care Activity Breakdown</h3>

              <p>
                Distribution of recorded plant-care activities.
              </p>

              {careDistribution.length === 0 ? (
                <div className="analytics-empty">
                  No care activity records available.
                </div>
              ) : (
                <div className="analytics-bars">
                  {careDistribution.map(([type, count]) => {
                    const percentage = totalCare
                      ? (count / totalCare) * 100
                      : 0;

                    return (
                      <div
                        className="analytics-bar-item"
                        key={type}
                      >
                        <div className="analytics-bar-label">
                          <span>{type}</span>
                          <strong>{count} activities</strong>
                        </div>

                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar-fill care-fill"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </section>

        {/* ==================================
            REGISTERED PLANTS
        ================================== */}

        <section className="growth-section">
          <div className="growth-section-heading">
            <div>
              <h2>Registered Plants</h2>
              <p>
                Latest available measurements for each plant.
              </p>
            </div>

            <span className="growth-public-label">
              PUBLIC VIEW
            </span>
          </div>

          {data.plants.length === 0 ? (
            <div className="growth-empty">
              <div className="growth-empty-icon">🌱</div>

              <h3>No plants registered yet</h3>

              <p>
                Plant information will appear here after an
                authorized manager registers plants.
              </p>
            </div>
          ) : (
            <div className="growth-plant-grid">
              {data.plants.map((plant) => {
                const latest = latestGrowth.get(
                  String(plant.id)
                );

                const health = latest?.health_score;

                return (
                  <article
                    className="growth-plant-card"
                    key={plant.id}
                  >
                    <div className="growth-plant-top">
                      <div className="growth-plant-icon">
                        🌿
                      </div>

                      {health !== null &&
                      health !== undefined ? (
                        <span className="growth-health-badge">
                          {health}% health
                        </span>
                      ) : (
                        <span className="growth-pending-badge">
                          Awaiting measurement
                        </span>
                      )}
                    </div>

                    <h3>{plant.plant_name}</h3>
                    <p>{plant.plant_type}</p>

                    <div className="growth-details">
                      <div>
                        <span>Height</span>
                        <strong>
                          {latest?.height_cm != null
                            ? `${latest.height_cm} cm`
                            : "Not recorded"}
                        </strong>
                      </div>

                      <div>
                        <span>Leaves</span>
                        <strong>
                          {latest?.leaf_count ?? "Not recorded"}
                        </strong>
                      </div>

                      <div>
                        <span>Growth stage</span>
                        <strong>
                          {latest?.growth_stage ?? "Not recorded"}
                        </strong>
                      </div>

                      <div>
                        <span>Planted on</span>
                        <strong>
                          {plant.planting_date
                            ? formatDate(plant.planting_date)
                            : "Not recorded"}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ==================================
            GROWTH HISTORY
        ================================== */}

        <section className="growth-section">
          <div className="growth-section-heading">
            <div>
              <h2>Growth History</h2>
              <p>Recent plant measurements.</p>
            </div>
          </div>

          {data.growthLogs.length === 0 ? (
            <div className="growth-empty compact">
              No growth measurements are available yet.
            </div>
          ) : (
            <div className="growth-table-wrap">
              <table className="growth-table">
                <thead>
                  <tr>
                    <th>Plant</th>
                    <th>Date</th>
                    <th>Height</th>
                    <th>Leaves</th>
                    <th>Stage</th>
                    <th>Health</th>
                  </tr>
                </thead>

                <tbody>
                  {data.growthLogs.map((log) => {
                    const plant = data.plants.find(
                      (item) =>
                        String(item.id) === String(log.plant_id)
                    );

                    return (
                      <tr key={log.id}>
                        <td>
                          {plant?.plant_name ?? "Plant"}
                        </td>

                        <td>{formatDate(log.measured_on)}</td>

                        <td>
                          {log.height_cm != null
                            ? `${log.height_cm} cm`
                            : "—"}
                        </td>

                        <td>{log.leaf_count ?? "—"}</td>

                        <td>{log.growth_stage ?? "—"}</td>

                        <td>
                          {log.health_score != null
                            ? `${log.health_score}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ==================================
            PLANT CARE HISTORY
        ================================== */}

        <section className="growth-section">
          <div className="growth-section-heading">
            <div>
              <h2>Plant Care History</h2>
              <p>
                Watering, fertilizer and other care activities.
              </p>
            </div>
          </div>

          {data.careLogs.length === 0 ? (
            <div className="growth-empty compact">
              No plant-care activities are available yet.
            </div>
          ) : (
            <div className="growth-care-list">
              {data.careLogs.map((log) => {
                const plant = data.plants.find(
                  (item) =>
                    String(item.id) === String(log.plant_id)
                );

                return (
                  <article
                    className="growth-care-item"
                    key={log.id}
                  >
                    <div className="growth-care-icon">
                      💧
                    </div>

                    <div>
                      <strong>{log.care_type}</strong>

                      <p>
                        {plant?.plant_name ?? "Plant"}
                        {log.amount != null
                          ? ` · ${log.amount} ${log.unit ?? ""}`
                          : ""}
                      </p>
                    </div>

                    <time>
                      {formatDate(log.performed_at)}
                    </time>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* FOOTER */}

        <footer className="growth-footer">
          GreenMind Smart Greenhouse · Crop Growth Monitoring
        </footer>

      </div>
    </main>
  );
}