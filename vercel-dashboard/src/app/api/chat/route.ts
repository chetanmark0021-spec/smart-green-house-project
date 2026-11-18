
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.8-flash";
const DEVICE_ID =
  process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GreenhouseReading = {
  device_id: string;
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  battery_voltage: number | null;
  created_at: string;
};

type GreenhouseStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "WAITING"
  | "ERROR"
  | "SIMULATED";

type GreenhouseContext = {
  status: GreenhouseStatus;
  ageSeconds: number | null;
  reading: GreenhouseReading | null;
  message: string;
};

// --------------------------------------------------
// DEMO MODE
// --------------------------------------------------

function isDemoModeEnabled(): boolean {
  return process.env.GREENHOUSE_DEMO_MODE === "true";
}

function getDemoGreenhouseData(): GreenhouseContext {
  const reading: GreenhouseReading = {
    device_id: "greenhouse-demo",
    temperature_c: 26.5,
    humidity_percent: 68,
    soil_moisture_percent: 42,
    light_percent: 65,
    battery_voltage: 3.9,
    created_at: new Date().toISOString(),
  };

  return {
    status: "SIMULATED",
    ageSeconds: 0,
    reading,
    message:
      "Demo Mode is enabled. These are simulated readings, not real sensor data.",
  };
}

// --------------------------------------------------
// GET LATEST GREENHOUSE DATA FROM SUPABASE
// --------------------------------------------------

async function getGreenhouseData(): Promise<GreenhouseContext> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      status: "ERROR",
      ageSeconds: null,
      reading: null,
      message:
        "Supabase server configuration is missing. Check .env.local.",
    };
  }

  try {
    const endpoint = new URL(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/greenhouse_telemetry`
    );

    endpoint.searchParams.set(
      "select",
      [
        "device_id",
        "temperature_c",
        "humidity_percent",
        "soil_moisture_percent",
        "light_percent",
        "battery_voltage",
        "created_at:recorded_at",
      ].join(",")
    );

    endpoint.searchParams.set("device_id", `eq.${DEVICE_ID}`);
    endpoint.searchParams.set("order", "recorded_at.desc");
    endpoint.searchParams.set("limit", "1");

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Supabase HTTP status:", response.status);
      console.error("Supabase error details:", errorText);

      return {
        status: "ERROR",
        ageSeconds: null,
        reading: null,
        message: `Supabase HTTP ${response.status}: ${errorText.slice(
          0,
          500
        )}`,
      };
    }

    const rows = (await response.json()) as GreenhouseReading[];
    const reading = rows[0] ?? null;

    // No real records: use Demo Mode only if enabled.
    if (!reading) {
      if (isDemoModeEnabled()) {
        return getDemoGreenhouseData();
      }

      return {
        status: "WAITING",
        ageSeconds: null,
        reading: null,
        message: `No greenhouse readings found for device ${DEVICE_ID}.`,
      };
    }

    const timestamp = new Date(reading.created_at).getTime();

    if (!Number.isFinite(timestamp)) {
      return {
        status: "ERROR",
        ageSeconds: null,
        reading: null,
        message: "The latest greenhouse reading has an invalid timestamp.",
      };
    }

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 1000)
    );

    let status: GreenhouseStatus;

    if (ageSeconds <= 30) {
      status = "LIVE";
    } else if (ageSeconds <= 120) {
      status = "DELAYED";
    } else {
      status = "STALE";
    }

    // Real Supabase data always takes priority over simulated data.
    return {
      status,
      ageSeconds,
      reading,
      message: `Latest real greenhouse reading is ${ageSeconds} seconds old.`,
    };
  } catch (error) {
    console.error("Greenhouse data connection error:", error);

    return {
      status: "ERROR",
      ageSeconds: null,
      reading: null,
      message:
        error instanceof Error
          ? error.message
          : "Could not connect to the greenhouse database.",
    };
  }
}

// --------------------------------------------------
// PREPARE GREENHOUSE DATA FOR QWEN AI
// --------------------------------------------------

function createGreenhousePrompt(context: GreenhouseContext): string {
  if (!context.reading) {
    return `
GREENMIND GREENHOUSE DATA

Status: ${context.status}
Information: ${context.message}

IMPORTANT:
- No verified sensor values are available.
- Never invent temperature, humidity, soil moisture, light or battery values.
- If asked about current greenhouse readings, explain that actual readings are unavailable.
- If the status is ERROR, explain that the database connection failed.
- If the status is WAITING, explain that no matching device readings were found.
- Continue answering general agriculture and electronics questions normally.
`;
  }

  const r = context.reading;

  const isSimulated = context.status === "SIMULATED";

  return `
GREENMIND GREENHOUSE DATA

Connection status: ${context.status}
Data source: ${isSimulated ? "SIMULATED DEMO DATA" : "REAL SUPABASE TELEMETRY"}
Reading age: ${context.ageSeconds} seconds
Device ID: ${r.device_id}
Reading timestamp: ${r.created_at}

${isSimulated ? "IMPORTANT: THESE VALUES ARE SIMULATED FOR DEMONSTRATION ONLY. THEY ARE NOT REAL SENSOR READINGS." : "ACTUAL RECORDED SENSOR VALUES:"}

Temperature: ${r.temperature_c ?? "Not available"} °C
Humidity: ${r.humidity_percent ?? "Not available"} %
Soil moisture: ${r.soil_moisture_percent ?? "Not available"} %
Light: ${r.light_percent ?? "Not available"} %
Battery voltage: ${r.battery_voltage ?? "Not available"} V

IMPORTANT RULES:
- Use the supplied values when answering greenhouse questions.
- If status is SIMULATED, clearly say these are demo values and not actual sensor readings.
- Never describe simulated readings as real or live.
- If status is LIVE, DELAYED or STALE, identify the reading freshness accurately.
- Never invent missing values.
- Do not claim to have switched a pump, fan or light.
- Give practical irrigation and greenhouse advice.
- Soil moisture alone does not guarantee that watering is necessary.
`;
}

// --------------------------------------------------
// CHAT API
// --------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "Invalid chat messages." },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = body.messages
      .filter(
        (message: any) =>
          message &&
          ["user", "assistant"].includes(message.role) &&
          typeof message.content === "string"
      )
      .slice(-6)
      .map((message: ChatMessage) => ({
        role: message.role,
        content: message.content.trim().slice(0, 1200),
      }))
      .filter((message: ChatMessage) => message.content.length > 0);

    if (
      messages.length === 0 ||
      !messages.some((message) => message.role === "user")
    ) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    // Get real Supabase data first.
    const greenhouse = await getGreenhouseData();

    const systemMessage = {
      role: "system",
      content: `
You are GreenMind AI, a helpful assistant for the GreenMind Smart Agriculture project.

YOUR RESPONSIBILITIES:
- Explain smart agriculture and greenhouse management.
- Help with ESP32, IoT sensors, electronics and automation.
- Explain plant health, irrigation, temperature and humidity.
- Give practical agricultural guidance.
- Answer education and everyday questions too.

RESPONSE GUIDELINES:
- Use simple English.
- Give clear, structured answers.
- Understand follow-up questions using conversation history.
- Use the supplied greenhouse information for current greenhouse questions.
- Never invent sensor readings or device states.
- Clearly explain when data is waiting, stale, delayed, simulated or unavailable.
- Never claim to have controlled hardware.
- For plant diseases, explain that AI suggestions are preliminary and not a confirmed diagnosis.
- If you do not know something, say so.

GREENHOUSE DATABASE INFORMATION:

${createGreenhousePrompt(greenhouse)}
`,
    };

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chatbot AI is not configured. Add GEMINI_API_KEY to the Vercel project environment to enable it." },
        { status: 503 }
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemMessage.content }] },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
        }),
        signal: AbortSignal.timeout(60000),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Gemini response error:", errorText);

      return NextResponse.json(
        {
          error:
            "Gemini could not generate a response. Check the GEMINI_API_KEY configuration.",
        },
        { status: 502 }
      );
    }

    const result = await response.json();
    const answer = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return NextResponse.json(
        { error: "The AI model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      answer,
      model: MODEL,
      provider: "Google Gemini",
      greenhouse: {
        status: greenhouse.status,
        ageSeconds: greenhouse.ageSeconds,
        message: greenhouse.message,
        reading: greenhouse.reading,
      },
    });
  } catch (error) {
    console.error("GreenMind chatbot API error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed")
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot connect to Ollama. Make sure Ollama is running on your computer.",
        },
        { status: 503 }
      );
    }

    if (message.toLowerCase().includes("timeout")) {
      return NextResponse.json(
        {
          error:
            "The AI response took too long. Please try a shorter question.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Unable to process your message." },
      { status: 500 }
    );
  }
}
