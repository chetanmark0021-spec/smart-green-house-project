
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "../../lib/supabase";

export type GreenhouseTelemetry = {
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

type GreenhouseModeContextType = {
  simulationMode: boolean;
  loading: boolean;
  changing: boolean;
  error: string;
  telemetry: GreenhouseTelemetry | null;
  recentTelemetry: GreenhouseTelemetry[];
  deviceOnline: boolean;
  refreshMode: () => Promise<void>;
  refreshTelemetry: () => Promise<void>;
  changeMode: (nextMode: boolean) => Promise<boolean>;
};

const GreenhouseModeContext =
  createContext<GreenhouseModeContextType | null>(null);

const MODE_STORAGE_KEY = "greenmind-simulation-mode";
const DEVICE_ID =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";
const ONLINE_TIMEOUT_MS = 30000;

function createSimulatedTelemetry(): GreenhouseTelemetry {
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

export function GreenhouseModeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [simulationMode, setSimulationMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");

  const [telemetry, setTelemetry] =
    useState<GreenhouseTelemetry | null>(null);

  const [recentTelemetry, setRecentTelemetry] =
    useState<GreenhouseTelemetry[]>([]);

  const [now, setNow] = useState(Date.now());

  // LOAD MODE FROM BROWSER STORAGE
  const refreshMode = useCallback(async () => {
    try {
      const savedMode = localStorage.getItem(MODE_STORAGE_KEY);

      setSimulationMode(savedMode === "true");

      setError("");
    } catch {
      setSimulationMode(false);
      setError("Could not access browser storage. Using live sensor mode.");
    } finally {
      setLoading(false);
    }
  }, []);

  // INITIAL MODE AND CROSS-TAB UPDATES
  useEffect(() => {
    void refreshMode();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY && event.newValue !== null) {
        setSimulationMode(event.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshMode]);

  // CHANGE MODE WITHOUT PIN OR API
  const changeMode = useCallback(
    async (nextMode: boolean): Promise<boolean> => {
      setChanging(true);
      setError("");

      try {
        localStorage.setItem(
          MODE_STORAGE_KEY,
          String(nextMode)
        );

        setSimulationMode(nextMode);

        if (nextMode) {
          const sample = createSimulatedTelemetry();
          setTelemetry(sample);
          setRecentTelemetry([sample]);
        } else {
          setTelemetry(null);
          setRecentTelemetry([]);
        }

        return true;
      } catch {
        setError("Unable to save greenhouse mode.");
        return false;
      } finally {
        setChanging(false);
      }
    },
    []
  );

  // LOAD SIMULATED OR REAL SENSOR DATA
  const refreshTelemetry = useCallback(async () => {
    if (simulationMode) {
      const sample = createSimulatedTelemetry();

      setTelemetry(sample);

      setRecentTelemetry((previous) =>
        [sample, ...previous].slice(0, 30)
      );

      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from("greenhouse_telemetry")
        .select(
          "id, device_id, temperature_c, humidity_percent, soil_moisture_percent, light_percent, battery_voltage, pump_on, fan_on, grow_light_on, wifi_rssi, created_at:recorded_at"
        )
        .eq("device_id", DEVICE_ID)
        .order("recorded_at", { ascending: false })
        .limit(30);

      if (queryError) throw queryError;

      const records = (data || []) as GreenhouseTelemetry[];

      setRecentTelemetry(records);
      setTelemetry(records[0] ?? null);
      setError("");
    } catch (err) {
      setTelemetry(null);
      setRecentTelemetry([]);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load ESP32 sensor data."
      );
    }
  }, [simulationMode]);

  // REFRESH DATA WHEN MODE CHANGES
  useEffect(() => {
    if (loading) return;

    setTelemetry(null);
    setRecentTelemetry([]);

    void refreshTelemetry();

    const interval = window.setInterval(() => {
      void refreshTelemetry();
      setNow(Date.now());
    }, simulationMode ? 3000 : 5000);

    return () => window.clearInterval(interval);
  }, [loading, simulationMode, refreshTelemetry]);

  const deviceOnline = simulationMode
    ? true
    : Boolean(
        telemetry?.created_at &&
        now - new Date(telemetry.created_at).getTime() >= 0 &&
        now - new Date(telemetry.created_at).getTime() <=
          ONLINE_TIMEOUT_MS
      );

  return (
    <GreenhouseModeContext.Provider
      value={{
        simulationMode,
        loading,
        changing,
        error,
        telemetry,
        recentTelemetry,
        deviceOnline,
        refreshMode,
        refreshTelemetry,
        changeMode,
      }}
    >
      {children}
    </GreenhouseModeContext.Provider>
  );
}

// SHARED GREENHOUSE HOOK
export function useGreenhouseMode() {
  const context = useContext(GreenhouseModeContext);

  if (!context) {
    throw new Error(
      "useGreenhouseMode must be used inside GreenhouseModeProvider."
    );
  }

  return context;
}

// MASTER TOOLBAR SWITCH
export function GreenhouseModeControl() {
  const {
    simulationMode,
    loading,
    changing,
    changeMode,
  } = useGreenhouseMode();

  async function handleToggle() {
    if (loading || changing) return;

    const nextMode = !simulationMode;

    const message = nextMode
      ? "Switch the entire GreenMind website to Simulation Mode?"
      : "Switch the entire GreenMind website to Real ESP32 Mode?";

    if (!window.confirm(message)) return;

    await changeMode(nextMode);
  }

  return (
    <div className="gm-master-mode">
      <strong className="gm-master-mode-label">
        Simulation Mode
      </strong>

      <button
        type="button"
        className={`gm-master-toggle ${
          simulationMode ? "simulation" : "hardware"
        }`}
        onClick={handleToggle}
        disabled={loading || changing}
        aria-label="Toggle Simulation Mode"
        aria-pressed={simulationMode}
      >
        <span className="gm-master-toggle-knob" />
      </button>

      {changing && <small>Switching...</small>}
    </div>
  );
}
