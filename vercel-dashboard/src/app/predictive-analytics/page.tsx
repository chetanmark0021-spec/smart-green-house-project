
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./predictive-analytics.css";

type Analytics = {
  current?: {
    temperature: number | null;
    humidity: number | null;
    soilMoisture: number | null;
    light: number | null;
    timestamp: string;
  };
  averages: {
    temperature: number | null;
    humidity: number | null;
    soilMoisture: number | null;
    light: number | null;
  };
  trends: {
    temperature: string;
    humidity: string;
    soilMoisture: string;
    light: string;
  };
  soilMoisturePrediction: {
    available: boolean;
    ratePercentPerHour: number | null;
    warningThreshold: number;
    estimatedHoursUntilWarning: number | null;
    message: string;
    note: string;
  };
  irrigation: {
    recommendation: string;
    estimatedNeed: string;
    automaticWatering?: boolean;
  };
  risk: string;
  recommendations: string[];
  sufficientHistory: boolean;
  history: {
    time: string;
    temperature: number | null;
    humidity: number | null;
    soilMoisture: number | null;
  }[];
};

type ApiResult = {
  success: boolean;
  mode: "waiting" | "stale" | "live" | "error";
  message: string;
  count: number;
  ageSeconds?: number;
  analytics: Analytics | null;
};

type ForecastPoint = {
  hours: number;
  temperature: number | null;
  humidity: number | null;
  soilMoisture: number | null;
};

// --------------------------------------------------
// DEMO DATA
// --------------------------------------------------

function createDemoAnalytics(): Analytics {
  const now = Date.now();

  const soilValues = [58, 56, 54, 52, 50, 48, 46, 44, 42, 40];

  const history = soilValues.map((soil, index) => ({
    time: new Date(
      now - (soilValues.length - 1 - index) * 10 * 60000
    ).toISOString(),
    temperature: Number((25 + index * 0.15).toFixed(2)),
    humidity: Number((70 - index * 0.3).toFixed(1)),
    soilMoisture: soil,
  }));

  return {
    current: {
      temperature: 26.4,
      humidity: 67,
      soilMoisture: 40,
      light: 72,
      timestamp: new Date(now).toISOString(),
    },

    averages: {
      temperature: 26.1,
      humidity: 68,
      soilMoisture: 48.2,
      light: 70,
    },

    trends: {
      temperature: "Slightly increasing",
      humidity: "Stable",
      soilMoisture: "Decreasing",
      light: "Stable",
    },

    soilMoisturePrediction: {
      available: true,
      ratePercentPerHour: -12,
      warningThreshold: 30,
      estimatedHoursUntilWarning: 0.8,
      message:
        "In this simulated example, soil moisture is decreasing. Consider checking the soil and preparing for irrigation.",
      note:
        "This estimate is generated from sample demo values, not actual greenhouse measurements.",
    },

    irrigation: {
      recommendation:
        "Demo advisory: soil moisture is decreasing. Check the soil before watering.",
      estimatedNeed: "Moderate irrigation attention",
      automaticWatering: false,
    },

    risk: "Moderate",

    recommendations: [
      "Check soil moisture before watering.",
      "Monitor greenhouse temperature.",
      "Maintain suitable humidity for the selected crop.",
      "Check that the irrigation system is ready.",
    ],

    sufficientHistory: true,
    history,
  };
}

// --------------------------------------------------
// TREND CALCULATION
// --------------------------------------------------

function calculateTrend(
  history: Analytics["history"],
  key: "temperature" | "humidity" | "soilMoisture"
): number | null {
  const points = history
    .filter((item) => item[key] !== null)
    .map((item) => ({
      x: new Date(item.time).getTime() / 3600000,
      y: item[key] as number,
    }));

  if (points.length < 3) return null;

  const meanX =
    points.reduce((sum, point) => sum + point.x, 0) /
    points.length;

  const meanY =
    points.reduce((sum, point) => sum + point.y, 0) /
    points.length;

  const denominator = points.reduce(
    (sum, point) => sum + Math.pow(point.x - meanX, 2),
    0
  );

  if (denominator === 0) return null;

  const numerator = points.reduce(
    (sum, point) =>
      sum + (point.x - meanX) * (point.y - meanY),
    0
  );

  return numerator / denominator;
}

// --------------------------------------------------
// ENVIRONMENTAL FORECAST
// --------------------------------------------------

function createForecast(
  analytics: Analytics
): ForecastPoint[] {
  const current = analytics.current;

  if (!current) return [];

  const temperatureRate = calculateTrend(
    analytics.history,
    "temperature"
  );

  const humidityRate = calculateTrend(
    analytics.history,
    "humidity"
  );

  const soilRate = calculateTrend(
    analytics.history,
    "soilMoisture"
  );

  const horizons = [1, 3, 6];

  return horizons.map((hours) => ({
    hours,

    temperature:
      current.temperature !== null &&
      temperatureRate !== null
        ? Number(
            Math.max(
              0,
              Math.min(
                60,
                current.temperature + temperatureRate * hours
              )
            ).toFixed(1)
          )
        : null,

    humidity:
      current.humidity !== null &&
      humidityRate !== null
        ? Number(
            Math.max(
              0,
              Math.min(
                100,
                current.humidity + humidityRate * hours
              )
            ).toFixed(1)
          )
        : null,

    soilMoisture:
      current.soilMoisture !== null &&
      soilRate !== null
        ? Number(
            Math.max(
              0,
              Math.min(
                100,
                current.soilMoisture + soilRate * hours
              )
            ).toFixed(1)
          )
        : null,
  }));
}

// --------------------------------------------------
// WATER STRESS ANALYSIS
// --------------------------------------------------

function getWaterStress(analytics: Analytics) {
  const soil = analytics.current?.soilMoisture;
  const temperature = analytics.current?.temperature;
  const humidity = analytics.current?.humidity;

  if (soil === null || soil === undefined) {
    return {
      level: "Unknown",
      message: "Soil moisture data is unavailable.",
    };
  }

  if (
    soil <= 20 ||
    (soil <= 30 &&
      temperature !== null &&
      temperature !== undefined &&
      temperature >= 35)
  ) {
    return {
      level: "Critical",
      message:
        "High water-stress risk. Check the soil and plant condition immediately.",
    };
  }

  if (soil <= 30) {
    return {
      level: "High",
      message:
        "Soil moisture is low. Inspect the plant and consider irrigation.",
    };
  }

  if (
    soil <= 45 ||
    (temperature !== null &&
      temperature !== undefined &&
      temperature > 35) ||
    (humidity !== null &&
      humidity !== undefined &&
      humidity > 85)
  ) {
    return {
      level: "Moderate",
      message:
        "Monitor soil moisture and environmental conditions closely.",
    };
  }

  return {
    level: "Low",
    message:
      "Current conditions indicate a lower water-stress risk according to these rules.",
  };
}

// --------------------------------------------------
// ENVIRONMENTAL SCORE
// --------------------------------------------------

function getEnvironmentalScore(
  analytics: Analytics
): number | null {
  const current = analytics.current;

  if (!current) return null;

  const {
    temperature,
    humidity,
    soilMoisture,
    light,
  } = current;

  if (
    temperature === null ||
    humidity === null ||
    soilMoisture === null
  ) {
    return null;
  }

  let score = 100;

  if (temperature < 18 || temperature > 32) {
    score -= 25;
  } else if (temperature < 20 || temperature > 30) {
    score -= 10;
  }

  if (humidity < 40 || humidity > 85) {
    score -= 20;
  } else if (humidity < 45 || humidity > 80) {
    score -= 10;
  }

  if (soilMoisture < 20) {
    score -= 30;
  } else if (soilMoisture < 30) {
    score -= 20;
  } else if (soilMoisture < 40) {
    score -= 10;
  }

  if (light !== null && light < 20) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

// --------------------------------------------------
// METRIC COMPONENT
// --------------------------------------------------

function Metric({
  title,
  value,
  unit,
  trend,
}: {
  title: string;
  value: number | null;
  unit: string;
  trend?: string;
}) {
  return (
    <article className="predictive-metric">
      <span>{title}</span>

      <strong>
        {value === null ? "--" : `${value}${unit}`}
      </strong>

      <small>
        {trend
          ? `Trend: ${trend}`
          : "Average of available readings"}
      </small>
    </article>
  );
}

// --------------------------------------------------
// SOIL MOISTURE CHART
// --------------------------------------------------

function SoilMoistureChart({
  history,
}: {
  history: Analytics["history"];
}) {
  const readings = history.filter(
    (item) => item.soilMoisture !== null
  );

  if (readings.length === 0) {
    return (
      <div className="predictive-chart-empty">
        No soil-moisture history is available yet.
      </div>
    );
  }

  return (
    <div className="predictive-chart">
      <div className="predictive-chart-scale">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>

      <div
        className="predictive-chart-bars"
        role="img"
        aria-label={`Soil moisture history with ${readings.length} readings`}
      >
        {readings.map((item, index) => {
          const value = Math.max(
            0,
            Math.min(100, item.soilMoisture ?? 0)
          );

          return (
            <div
              className="predictive-chart-column"
              key={`${item.time}-${index}`}
              title={`${new Date(item.time).toLocaleString()}: ${value}%`}
            >
              <span className="predictive-chart-value">
                {value}%
              </span>

              <div className="predictive-chart-track">
                <div
                  className="predictive-chart-bar"
                  style={{ height: `${value}%` }}
                />
              </div>

              <small>
                {new Date(item.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------
// SOIL MOISTURE PREDICTION
// --------------------------------------------------

function SoilMoisturePrediction({
  prediction,
}: {
  prediction: Analytics["soilMoisturePrediction"];
}) {
  const estimatedHours =
    prediction.estimatedHoursUntilWarning;

  return (
    <section className="predictive-section">
      <span className="predictive-eyebrow">
        SOIL MOISTURE FORECAST
      </span>

      <h2>Estimated Time to 30% Threshold</h2>

      <div className="predictive-advisory">
        <span className="predictive-advisory-label">
          ESTIMATED TIME UNTIL WARNING
        </span>

        <strong>
          {estimatedHours !== null
            ? `${estimatedHours.toFixed(1)} hours`
            : "Not available"}
        </strong>

        <p>{prediction.message}</p>

        <div className="predictive-history">
          <article>
            <span>Warning threshold</span>
            <strong>{prediction.warningThreshold}%</strong>
          </article>

          <article>
            <span>Moisture change</span>
            <strong>
              {prediction.ratePercentPerHour !== null
                ? `${prediction.ratePercentPerHour > 0 ? "+" : ""}${prediction.ratePercentPerHour}% / hour`
                : "Not available"}
            </strong>
          </article>

          <article>
            <span>Prediction status</span>
            <strong>
              {prediction.available
                ? "Calculated"
                : "Insufficient data"}
            </strong>
          </article>
        </div>
      </div>

      <p className="predictive-note">
        {prediction.note} This is an experimental, rule-based
        trend estimate, not a trained machine-learning prediction
        or guaranteed watering schedule.
      </p>
    </section>
  );
}

// --------------------------------------------------
// ADVANCED FORECAST COMPONENT
// --------------------------------------------------

function AdvancedForecast({
  forecasts,
}: {
  forecasts: ForecastPoint[];
}) {
  return (
    <section className="predictive-section">
      <span className="predictive-eyebrow">
        ADVANCED ENVIRONMENTAL ANALYSIS
      </span>

      <h2>Environmental Forecast</h2>

      <p className="predictive-description">
        Estimated greenhouse conditions for the next 1, 3 and 6 hours.
      </p>

      {forecasts.length > 0 ? (
        <div className="predictive-history">
          {forecasts.map((item) => (
            <article key={item.hours}>
              <strong>After {item.hours} hour(s)</strong>

              <span>
                Temperature: {item.temperature ?? "--"}°C
              </span>

              <span>
                Humidity: {item.humidity ?? "--"}%
              </span>

              <span>
                Soil moisture: {item.soilMoisture ?? "--"}%
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p>Insufficient data to calculate forecasts.</p>
      )}

      <p className="predictive-note">
        Experimental estimates based on historical linear trends.
        Actual conditions may differ.
      </p>
    </section>
  );
}

// --------------------------------------------------
// WATER STRESS PANEL
// --------------------------------------------------

function WaterStressPanel({
  analytics,
  demo,
}: {
  analytics: Analytics;
  demo: boolean;
}) {
  const stress = getWaterStress(analytics);

  return (
    <section className="predictive-section">
      <span className="predictive-eyebrow">
        PLANT HEALTH MONITORING
      </span>

      <h2>Plant Water-Stress Analysis</h2>

      <div className="predictive-advisory">
        <span className="predictive-advisory-label">
          WATER-STRESS RISK
        </span>

        <strong>{stress.level.toUpperCase()}</strong>

        <p>{stress.message}</p>
      </div>

      <p className="predictive-note">
        {demo
          ? "This water-stress assessment uses simulated demo readings."
          : "This is a rule-based estimate from available greenhouse sensor readings. It does not directly diagnose plant health."}
      </p>
    </section>
  );
}

// --------------------------------------------------
// ENVIRONMENTAL SCORE
// --------------------------------------------------

function EnvironmentalScore({
  analytics,
  demo,
}: {
  analytics: Analytics;
  demo: boolean;
}) {
  const score = getEnvironmentalScore(analytics);

  return (
    <section className="predictive-section">
      <span className="predictive-eyebrow">
        ENVIRONMENTAL MONITORING
      </span>

      <h2>Greenhouse Condition Score</h2>

      <div className="predictive-advisory">
        <span className="predictive-advisory-label">
          ENVIRONMENTAL SCORE
        </span>

        <strong>
          {score === null ? "--" : `${score}/100`}
        </strong>

        <p>
          {score === null
            ? "Insufficient sensor data to calculate the score."
            : score >= 80
              ? "Environmental conditions look favourable according to the current scoring rules."
              : score >= 60
                ? "Some environmental conditions need attention."
                : "Several environmental conditions need attention."}
        </p>
      </div>

      <p className="predictive-note">
        {demo
          ? "Demo score calculated from simulated values."
          : "This is an experimental rule-based score, not a scientifically validated crop-health score."}
      </p>
    </section>
  );
}

// --------------------------------------------------
// MAIN PAGE
// --------------------------------------------------

export default function PredictiveAnalyticsPage() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  const loadAnalytics = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(
        "/api/predictive-analytics",
        { cache: "no-store" }
      );

      const result = (await response.json()) as ApiResult;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to load analytics."
        );
      }

      setData(result);
      setError("");

      // Real live data always takes priority over demo mode.
      if (result.mode === "live") {
        setDemoMode(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load analytics."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();

    const interval = window.setInterval(() => {
      void loadAnalytics();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [loadAnalytics]);

  const demoAnalytics = useMemo(
    () => createDemoAnalytics(),
    [demoMode]
  );

  const canUseDemo =
    data?.mode === "waiting" || data?.mode === "error";

  const showingDemo =
    demoMode &&
    canUseDemo &&
    data?.mode !== "live" &&
    data?.mode !== "stale";

  const analytics = showingDemo
    ? demoAnalytics
    : data?.analytics;

  const readingCount = showingDemo
    ? demoAnalytics.history.length
    : data?.count ?? 0;

  const forecasts = analytics
    ? createForecast(analytics)
    : [];

  // ------------------------------------------------
  // CSV DOWNLOAD
  // ------------------------------------------------

  const downloadHistoryCSV = () => {
    if (!analytics || analytics.history.length === 0) {
      return;
    }

    const rows = [
      [
        "Time",
        "Temperature_C",
        "Humidity_Percent",
        "Soil_Moisture_Percent",
      ],

      ...analytics.history.map((item) => [
        item.time,
        item.temperature ?? "",
        item.humidity ?? "",
        item.soilMoisture ?? "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) =>
            `"${String(value).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;

    link.download = showingDemo
      ? "greenmind-demo-sensor-history.csv"
      : "greenmind-sensor-history.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------
  // PAGE UI
  // ------------------------------------------------

  return (
    <main className="predictive-page">

      {/* HEADER */}

      <header className="predictive-header">
        <div>
          <span className="predictive-brand">
            GREENMIND SMART AGRICULTURE
          </span>

          <h1>AI Predictive Analytics</h1>

          <p>
            Understand greenhouse conditions using sensor history
            and predictive analysis.
          </p>
        </div>

        <button
          className="predictive-refresh"
          onClick={() => void loadAnalytics(true)}
          disabled={loading || refreshing}
        >
          {refreshing
            ? "Refreshing..."
            : loading
              ? "Loading..."
              : "↻ Refresh"}
        </button>
      </header>

      {/* DEMO MODE NOTICE */}

      {showingDemo && (
        <section className="predictive-message warning">
          <span className="predictive-eyebrow">
            DEMONSTRATION MODE
          </span>

          <h2>
            SIMULATED DEMO — NOT REAL SENSOR DATA
          </h2>

          <p>
            These sample values are generated locally for project
            demonstration. They do not come from the ESP32 or
            Supabase and are not saved to your database.
          </p>

          <button
            className="predictive-retry"
            onClick={() => setDemoMode(false)}
          >
            Stop Demo Mode
          </button>
        </section>
      )}

      {/* ERROR */}

      {!showingDemo && error && (
        <section
          className="predictive-message error"
          role="alert"
        >
          <h2>Analytics error</h2>

          <p>{error}</p>

          <button
            className="predictive-retry"
            onClick={() => void loadAnalytics(true)}
            disabled={refreshing}
          >
            Try again
          </button>

          <button
            className="predictive-refresh"
            onClick={() => setDemoMode(true)}
          >
            Start Demo Mode
          </button>
        </section>
      )}

      {/* LOADING */}

      {loading && !data ? (
        <section className="predictive-message">
          <h2>Loading greenhouse analytics...</h2>

          <p>
            Connecting to the sensor history service.
          </p>
        </section>
      ) : !showingDemo && data?.mode === "waiting" ? (

        /* WAITING FOR SENSOR DATA */

        <section className="predictive-message">
          <span className="predictive-eyebrow">
            SENSOR STATUS
          </span>

          <h2>Waiting for sensor data</h2>

          <p>{data.message}</p>

          <p>
            Connect the ESP32 and begin sending readings to
            Supabase to activate real predictive analytics.
          </p>

          <div className="predictive-waiting-note">
            No live sensor measurements are available yet.
          </div>

          <button
            className="predictive-retry"
            onClick={() => setDemoMode(true)}
          >
            Start Demo Mode
          </button>
        </section>

      ) : !showingDemo && data?.mode === "stale" ? (

        /* STALE SENSOR DATA */

        <section className="predictive-message warning">
          <span className="predictive-eyebrow">
            SENSOR STATUS
          </span>

          <h2>Sensor data is stale</h2>

          <p>{data.message}</p>

          <p>
            Last reading age: {data.ageSeconds ?? "--"} seconds.
          </p>

          <p>
            Check the ESP32 connection before relying on these
            readings.
          </p>
        </section>

      ) : analytics ? (

        /* ANALYTICS DASHBOARD */

        <>
          {/* STATUS */}

          {showingDemo ? (
            <section className="predictive-status">
              <div>
                <span>DATA STATUS</span>
                <strong>SIMULATED DEMO</strong>
              </div>

              <div>
                <span>SAMPLE READINGS</span>
                <strong>{readingCount}</strong>
              </div>

              <div>
                <span>ENVIRONMENT RISK</span>
                <strong>
                  {analytics.risk.toUpperCase()}
                </strong>
              </div>
            </section>
          ) : (
            <section className="predictive-status">
              <div>
                <span>DATA STATUS</span>
                <strong className="predictive-live">
                  <i /> LIVE SENSOR DATA
                </strong>
              </div>

              <div>
                <span>READINGS AVAILABLE</span>
                <strong>{readingCount}</strong>
              </div>

              <div>
                <span>ENVIRONMENT RISK</span>
                <strong>
                  {analytics.risk.toUpperCase()}
                </strong>
              </div>
            </section>
          )}

          {/* SENSOR ANALYSIS */}

          <section className="predictive-section">
            <div className="predictive-section-heading">
              <div>
                <span>GREENHOUSE CONDITIONS</span>
                <h2>Sensor Analysis</h2>
              </div>

              <span className="predictive-reading-count">
                {readingCount} readings
              </span>
            </div>

            <div className="predictive-grid">
              <Metric
                title="Average Temperature"
                value={analytics.averages.temperature}
                unit="°C"
                trend={analytics.trends.temperature}
              />

              <Metric
                title="Average Humidity"
                value={analytics.averages.humidity}
                unit="%"
                trend={analytics.trends.humidity}
              />

              <Metric
                title="Average Soil Moisture"
                value={analytics.averages.soilMoisture}
                unit="%"
                trend={analytics.trends.soilMoisture}
              />

              <Metric
                title="Average Light"
                value={analytics.averages.light}
                unit="%"
                trend={analytics.trends.light}
              />
            </div>
          </section>

          {/* SOIL MOISTURE PREDICTION */}

          <SoilMoisturePrediction
            prediction={analytics.soilMoisturePrediction}
          />

          {/* ADVANCED FORECAST */}

          <AdvancedForecast forecasts={forecasts} />

          {/* WATER STRESS */}

          <WaterStressPanel
            analytics={analytics}
            demo={showingDemo}
          />

          {/* ENVIRONMENTAL SCORE */}

          <EnvironmentalScore
            analytics={analytics}
            demo={showingDemo}
          />

          {/* IRRIGATION */}

          <section className="predictive-section">
            <span className="predictive-eyebrow">
              IRRIGATION INTELLIGENCE
            </span>

            <h2>Predictive Irrigation Advisory</h2>

            <div className="predictive-advisory">
              <span className="predictive-advisory-label">
                ESTIMATED IRRIGATION NEED
              </span>

              <strong>
                {analytics.irrigation.estimatedNeed}
              </strong>

              <p>
                {analytics.irrigation.recommendation}
              </p>
            </div>

            <p className="predictive-note">
              This is advisory information only. The system
              does not automatically operate the water pump.
            </p>
          </section>

          {/* RECOMMENDATIONS */}

          <section className="predictive-section">
            <span className="predictive-eyebrow">
              AI-ASSISTED INSIGHTS
            </span>

            <h2>Greenhouse Recommendations</h2>

            {analytics.recommendations.length > 0 ? (
              <div className="predictive-recommendations">
                {analytics.recommendations.map(
                  (item, index) => (
                    <article key={`${index}-${item}`}>
                      <span aria-hidden="true">💡</span>
                      <p>{item}</p>
                    </article>
                  )
                )}
              </div>
            ) : (
              <p>
                No additional recommendations are available.
              </p>
            )}
          </section>

          {/* SOIL MOISTURE HISTORY */}

          <section className="predictive-section">
            <span className="predictive-eyebrow">
              SENSOR HISTORY
            </span>

            <h2>Soil Moisture Trend</h2>

            <p className="predictive-description">
              {showingDemo
                ? "Sample soil-moisture readings for demonstration."
                : "Historical soil-moisture readings from the greenhouse."}
            </p>

            <SoilMoistureChart
              history={analytics.history}
            />
          </section>

          {/* HISTORY RELIABILITY */}

          <section className="predictive-section">
            <span className="predictive-eyebrow">
              TREND RELIABILITY
            </span>

            <h2>Historical Data Analysis</h2>

            {analytics.sufficientHistory ? (
              <p>
                {showingDemo
                  ? "The demo uses sample history to demonstrate the trend display. These results are not real measurements."
                  : "Trend estimates use the available sensor history. They describe observed changes and are not guaranteed future predictions."}
              </p>
            ) : (
              <p>
                Only {readingCount} readings are available.
                At least 10 readings are required by this
                module before displaying reliable trend estimates.
              </p>
            )}

            <div className="predictive-history">
              {analytics.history.length > 0 ? (
                [...analytics.history]
                  .reverse()
                  .map((item, index) => (
                    <article key={`${item.time}-${index}`}>
                      <strong>
                        {new Date(item.time).toLocaleString()}
                      </strong>

                      <span>
                        Temperature: {item.temperature ?? "--"}°C
                      </span>

                      <span>
                        Humidity: {item.humidity ?? "--"}%
                      </span>

                      <span>
                        Soil: {item.soilMoisture ?? "--"}%
                      </span>
                    </article>
                  ))
              ) : (
                <p>
                  No historical readings are available.
                </p>
              )}
            </div>
          </section>

          {/* CSV EXPORT */}

          <section className="predictive-section">
            <span className="predictive-eyebrow">
              DATA EXPORT
            </span>

            <h2>Download Sensor History</h2>

            <p className="predictive-description">
              Export the displayed sensor history to a CSV file.
            </p>

            <button
              className="predictive-refresh"
              onClick={downloadHistoryCSV}
              disabled={analytics.history.length === 0}
            >
              Download CSV
            </button>

            {showingDemo && (
              <p className="predictive-note">
                This export contains simulated demo data,
                not real sensor readings.
              </p>
            )}
          </section>
        </>
      ) : !error ? (

        /* FALLBACK */

        <section className="predictive-message">
          <h2>Analytics are unavailable</h2>

          <p>
            The API did not return any analytics data.
          </p>
        </section>
      ) : null}

      {/* FOOTER */}

      <footer className="predictive-footer">
        {showingDemo
          ? "DEMO MODE: All displayed sensor values and predictions are simulated locally. They are not real sensor readings and are not saved to Supabase."
          : "Analytics are calculated from Supabase sensor history. Trend estimates require sufficient readings. Irrigation advice is advisory only and does not operate the water pump. Live status indicates the API has returned live-mode data."}
      </footer>
    </main>
  );
}
