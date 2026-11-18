
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Theme = "dark" | "light";

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("greenmind-theme");
    const initial: Theme = saved === "light" ? "light" : "dark";

    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    setMounted(true);
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);

    document.documentElement.dataset.theme = next;
    localStorage.setItem("greenmind-theme", next);

    window.dispatchEvent(
      new CustomEvent("greenmind-theme-change", {
        detail: next,
      })
    );
  }

  const pageStyle = {
    minHeight: "100vh",
    padding: 30,
    background: "var(--settings-bg, #071321)",
    color: "var(--settings-text, #f4f7fb)",
  } as const;

  const cardStyle = {
    background: "var(--settings-card, #14283c)",
    border: "1px solid var(--settings-border, #294158)",
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
  } as const;

  const muted = {
    color: "var(--settings-muted, #9bb0c4)",
  } as const;

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 30 }}>
        <p style={muted}>GREENMIND / SETTINGS</p>

        <h1 style={{ fontSize: 30, margin: "8px 0" }}>
          Greenhouse Settings ⚙️
        </h1>

        <p style={muted}>
          Manage your GreenMind dashboard preferences.
        </p>

        <Link href="/" style={linkStyle}>
          ← Back to Dashboard
        </Link>
      </header>

      <section style={cardStyle}>
        <h2>Appearance Settings</h2>
        <p style={muted}>
          Choose the dashboard appearance you prefer.
        </p>

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 15,
          marginTop: 20,
        }}>
          <button
            onClick={() => changeTheme("light")}
            style={{
              ...themeButtonStyle,
              borderColor: theme === "light" ? "#22c55e" : "#456078",
              background: theme === "light" ? "#dff5e8" : "#20384d",
              color: theme === "light" ? "#123d2b" : "#ffffff",
            }}
          >
            ☀️ Light Mode
            {theme === "light" ? " ✓" : ""}
          </button>

          <button
            onClick={() => changeTheme("dark")}
            style={{
              ...themeButtonStyle,
              borderColor: theme === "dark" ? "#22c55e" : "#456078",
              background: theme === "dark" ? "#20384d" : "#dff5e8",
              color: theme === "dark" ? "#ffffff" : "#123d2b",
            }}
          >
            🌙 Dark Mode
            {theme === "dark" ? " ✓" : ""}
          </button>
        </div>

        <p style={muted}>
          {mounted
            ? `Current theme: ${theme === "dark" ? "Dark Mode" : "Light Mode"}`
            : "Loading appearance preference..."}
        </p>
      </section>

      <section style={cardStyle}>
        <h2>Greenhouse Monitoring</h2>

        <div style={settingRowStyle}>
          <div>
            <strong>Sensor monitoring</strong>
            <p style={muted}>
              Dashboard refreshes sensor readings automatically.
            </p>
          </div>
          <span style={statusStyle}>ACTIVE</span>
        </div>

        <div style={settingRowStyle}>
          <div>
            <strong>Gmail alert monitoring</strong>
            <p style={muted}>
              Gmail alert checks are configured for every 2 minutes
              while the monitoring page is open.
            </p>
          </div>
          <span style={statusStyle}>2 MIN</span>
        </div>

        <div style={settingRowStyle}>
          <div>
            <strong>Alert cooldown</strong>
            <p style={muted}>
              Each alert type has a 60-minute cooldown.
            </p>
          </div>
          <span style={statusStyle}>60 MIN</span>
        </div>

        <p style={muted}>
          Background Gmail monitoring requires a server-side scheduled
          check. A browser timer alone cannot run after the website closes.
        </p>

        <Link href="/notifications" style={linkStyle}>
          Open Notification Center →
        </Link>
      </section>

      <section style={cardStyle}>
        <h2>Operating Mode</h2>

        <p style={muted}>
          Change between simulated sensor readings and real ESP32
          telemetry using the master operating-mode control in the
          dashboard toolbar.
        </p>

        <Link href="/" style={linkStyle}>
          Open Dashboard and Operating Mode →
        </Link>
      </section>

      <section style={cardStyle}>
        <h2>Application Information</h2>

        <div style={settingRowStyle}>
          <span>Application</span>
          <strong>GreenMind Smart Agriculture</strong>
        </div>

        <div style={settingRowStyle}>
          <span>Hardware</span>
          <strong>ESP32-S3</strong>
        </div>

        <div style={settingRowStyle}>
          <span>Database</span>
          <strong>Supabase</strong>
        </div>

        <div style={settingRowStyle}>
          <span>AI Features</span>
          <strong>Plant Health & Disease Detection</strong>
        </div>
      </section>

      <section style={cardStyle}>
        <h2>Quick Navigation</h2>

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <Link href="/analytics" style={linkStyle}>
            📊 Analytics
          </Link>

          <Link href="/plant-health" style={linkStyle}>
            🌱 Plant Health
          </Link>

          <Link href="/irrigation" style={linkStyle}>
            💧 Irrigation
          </Link>

          <Link href="/notifications" style={linkStyle}>
            🔔 Notifications
          </Link>
        </div>
      </section>

      <footer style={{ ...muted, textAlign: "center", padding: 20 }}>
        🌿 GREENMIND SMART GREENHOUSE
        <p>Growing smarter, greener and healthier.</p>
      </footer>
    </main>
  );
}

const linkStyle = {
  display: "inline-block",
  padding: "10px 15px",
  background: "#176b4b",
  color: "#ffffff",
  borderRadius: 9,
  textDecoration: "none",
  marginTop: 12,
} as const;

const themeButtonStyle = {
  padding: "14px 20px",
  border: "2px solid",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 600,
} as const;

const settingRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  flexWrap: "wrap" as const,
  padding: "15px 0",
  borderBottom: "1px solid #294158",
};

const statusStyle = {
  color: "#34d399",
  fontWeight: 700,
  fontSize: 13,
} as const;
