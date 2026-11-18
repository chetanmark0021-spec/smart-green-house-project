
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type DiagnosisRecord = {
  id: number;
  disease_name: string;
  crop_name: string | null;
  confidence_percent: number | null;
  image_path: string | null;
  created_at: string;
  health_score: number | null;
  health_label: string | null;
  green_percent: number | null;
  yellow_percent: number | null;
  brown_percent: number | null;
  visible_damage_percent: number | null;
  sampled_pixels: number | null;
};

function getHealthLabel(score: number | null) {
  if (score === null) return "Not measured";
  if (score >= 90) return "Healthy";
  if (score >= 70) return "Good";
  if (score >= 40) return "Needs attention";
  return "Critical";
}

function getHealthColor(score: number | null) {
  if (score === null) return "#94a3b8";
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#65a30d";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function isHealthy(disease: string) {
  return disease.toLowerCase().includes("healthy");
}

function formatDate(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleString();
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) {
    return "Not available";
  }

  return `${Number(value).toFixed(1)}%`;
}

export default function PlantHealthPage() {
  const [records, setRecords] = useState<DiagnosisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadPlantHealth = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("disease_analyses")
        .select(
          "id, disease_name, crop_name, confidence_percent, image_path, created_at, health_score, health_label, green_percent, yellow_percent, brown_percent, visible_damage_percent, sampled_pixels"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);

      if (queryError) throw queryError;

      setRecords((data || []) as DiagnosisRecord[]);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Plant health loading error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load plant health data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlantHealth();
  }, [loadPlantHealth]);

  // Keep only the latest diagnosis for each crop.
  const latestByCrop = records.reduce<DiagnosisRecord[]>(
    (latest, record) => {
      const crop = record.crop_name || "Unknown crop";

      if (
        !latest.some(
          (item) => (item.crop_name || "Unknown crop") === crop
        )
      ) {
        latest.push(record);
      }

      return latest;
    },
    []
  );

  const healthyCount = latestByCrop.filter(
    (item) =>
      item.health_score !== null &&
      item.health_score >= 90
  ).length;

  const attentionCount = latestByCrop.filter(
    (item) =>
      item.health_score !== null &&
      item.health_score < 70
  ).length;

  const measuredPlants = latestByCrop.filter(
    (item) => item.health_score !== null
  );

  const averageHealth =
    measuredPlants.length > 0
      ? Math.round(
          measuredPlants.reduce(
            (total, item) =>
              total + Number(item.health_score),
            0
          ) / measuredPlants.length
        )
      : null;

  const overallConfidence =
    records.length > 0
      ? Math.round(
          records.reduce(
            (total, item) =>
              total + (Number(item.confidence_percent) || 0),
            0
          ) / records.length
        )
      : null;

  return (
    <div className="gm-dashboard">
      {/* SIDEBAR */}
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
          <Link href="/" className="gm-side-link">
            <span>▦</span>Overview
          </Link>

          <Link
            href="/plant-health"
            className="gm-side-link active"
          >
            <span>🌱</span>Plant Health
          </Link>

          <Link
            href="/disease-detection"
            className="gm-side-link"
          >
            <span>🔬</span>Disease Detection
          </Link>

          <Link href="/irrigation" className="gm-side-link">
            <span>💧</span>Irrigation
          </Link>

          <Link
            href="/water-management"
            className="gm-side-link"
          >
            <span>🚰</span>Smart Water Management
          </Link>

          <Link href="/analytics" className="gm-side-link">
            <span>📊</span>Analytics
          </Link>

          <Link href="/settings" className="gm-side-link">
            <span>⚙</span>Settings
          </Link>
        </nav>

        <div className="gm-side-bottom">
          <div className="gm-side-leaf">🌱</div>
          <strong>GreenMind AI</strong>
          <p>Growing smarter, greener and healthier.</p>
        </div>
      </aside>

      {/* MAIN DASHBOARD */}
      <main className="gm-dashboard-main">
        <header className="gm-dashboard-header">
          <div>
            <p className="gm-breadcrumb">
              <Link href="/">Greenhouse</Link> / Plant Health
            </p>

            <h1>🌱 Complete Plant Health</h1>

            <p className="gm-subtitle">
              Monitor plant health using saved visual analysis
              and AI disease diagnosis records.
            </p>
          </div>

          <div>
            <button
              type="button"
              className="gm-small-link"
              onClick={loadPlantHealth}
              disabled={loading}
            >
              {loading ? "Loading..." : "↻ Refresh Data"}
            </button>

            <p className="gm-small">
              Last updated: {lastUpdated || "Not yet updated"}
            </p>
          </div>
        </header>

        {/* SUMMARY CARDS */}
        <section className="gm-summary-grid">
          <article className="gm-summary-card">
            <h2>{latestByCrop.length}</h2>
            <p>Plants Detected</p>
          </article>

          <article className="gm-summary-card">
            <h2>{healthyCount}</h2>
            <p>Healthy Plants (90–100)</p>
          </article>

          <article className="gm-summary-card">
            <h2>{attentionCount}</h2>
            <p>Needs Attention (Below 70)</p>
          </article>

          <article className="gm-summary-card">
            <h2>
              {averageHealth !== null
                ? `${averageHealth}/100`
                : "—"}
            </h2>
            <p>Average Visual Health</p>
          </article>

          <article className="gm-summary-card">
            <h2>
              {overallConfidence !== null
                ? `${overallConfidence}%`
                : "—"}
            </h2>
            <p>Average AI Confidence</p>
          </article>
        </section>

        {/* PLANT HEALTH CARDS */}
        <section className="gm-plant-section">
          <h2>Individual Plant Health</h2>

          {loading && (
            <p>Loading plant diagnosis records...</p>
          )}

          {error && (
            <p role="alert">
              Unable to load data: {error}
            </p>
          )}

          {!loading && !error && latestByCrop.length === 0 && (
            <article className="gm-care-card">
              <h3>🌱 No plant diagnosis records yet</h3>

              <p>
                Capture or upload a leaf image to begin
                monitoring your plant health.
              </p>

              <Link
                href="/disease-detection"
                className="gm-small-link"
              >
                Open Disease Detection →
              </Link>
            </article>
          )}

          <div className="gm-plant-grid">
            {latestByCrop.map((plant) => {
              const score =
                plant.health_score === null
                  ? null
                  : Math.max(
                      0,
                      Math.min(100, Number(plant.health_score))
                    );

              const label = getHealthLabel(score);
              const color = getHealthColor(score);

              return (
                <article
                  className="gm-plant-card"
                  key={plant.id}
                >
                  <h3>
                    🌿 {plant.crop_name || "Unknown crop"}
                  </h3>

                  <p>
                    Disease detected:
                    <strong>
                      {" "}
                      {plant.disease_name.replace(/_/g, " ")}
                    </strong>
                  </p>

                  <p>
                    Plant health:
                    <strong style={{ color }}>
                      {" "}
                      {label}
                    </strong>
                  </p>

                  <p>
                    Visual health score:
                    <strong>
                      {" "}
                      {score !== null
                        ? `${score}/100`
                        : "Not measured"}
                    </strong>
                  </p>

                  <div
                    className="gm-plant-progress"
                    role="progressbar"
                    aria-valuenow={score ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Visual plant health score"
                  >
                    <div
                      style={{
                        width: `${score ?? 0}%`,
                        background: color,
                      }}
                    />
                  </div>

                  <p>
                    AI confidence:
                    <strong>
                      {" "}
                      {formatPercent(plant.confidence_percent)}
                    </strong>
                  </p>

                  <hr />

                  <h4>Leaf Colour Analysis</h4>

                  <p>
                    🟢 Green:
                    <strong>
                      {" "}
                      {formatPercent(plant.green_percent)}
                    </strong>
                  </p>

                  <p>
                    🟡 Yellow:
                    <strong>
                      {" "}
                      {formatPercent(plant.yellow_percent)}
                    </strong>
                  </p>

                  <p>
                    🟤 Brown:
                    <strong>
                      {" "}
                      {formatPercent(plant.brown_percent)}
                    </strong>
                  </p>

                  <p>
                    Possible visible colour damage:
                    <strong>
                      {" "}
                      {formatPercent(
                        plant.visible_damage_percent
                      )}
                    </strong>
                  </p>

                  <p>
                    Last diagnosis:
                    <strong>
                      {" "}
                      {formatDate(plant.created_at)}
                    </strong>
                  </p>

                  <p className="gm-small">
                    This visual score is an experimental
                    colour-based estimate, not a validated
                    plant-health diagnosis. AI confidence is
                    displayed separately.
                  </p>

                  <Link
                    href="/disease-detection"
                    className="gm-small-link"
                  >
                    Run New Analysis →
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        {/* PLANT CARE */}
        <section className="gm-care-card">
          <h2>Plant Care Recommendations</h2>

          {latestByCrop.length === 0 ? (
            <ul>
              <li>💧 Check soil moisture before watering.</li>
              <li>☀️ Provide suitable sunlight.</li>
              <li>🔍 Inspect leaves regularly.</li>
              <li>
                🌱 Maintain suitable temperature and humidity.
              </li>
            </ul>
          ) : (
            <ul>
              {latestByCrop.map((plant) => (
                <li key={plant.id}>
                  <strong>
                    {plant.crop_name || "Unknown crop"}:
                  </strong>{" "}
                  {plant.health_score === null
                    ? "Run a new leaf analysis to calculate a preliminary visual score."
                    : plant.health_score < 40
                    ? "Critical visual score. Inspect the plant carefully and seek expert advice."
                    : plant.health_score < 70
                    ? "Needs attention. Inspect leaves and growing conditions."
                    : plant.health_score < 90
                    ? "Good preliminary score. Continue regular monitoring."
                    : "High preliminary score. Continue normal plant care."}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="gm-demo-note gm-page-note">
          Plant information is loaded from Supabase diagnosis
          records. Visual health estimates are based on leaf
          colour analysis and may be affected by lighting,
          background and camera quality. They are not validated
          disease-severity measurements.
        </p>
      </main>
    </div>
  );
}
