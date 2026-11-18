
"use client";

import { useState } from "react";
import "./chatbot.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type GreenhouseStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "WAITING"
  | "ERROR"
  | "SIMULATED";

type GreenhouseReading = {
  temperature_c: number | null;
  humidity_percent: number | null;
  soil_moisture_percent: number | null;
  light_percent: number | null;
  battery_voltage: number | null;
};

type GreenhouseData = {
  status: GreenhouseStatus;
  ageSeconds: number | null;
  message: string;
  reading: GreenhouseReading | null;
};

const WELCOME =
  "Hello! 👋 Welcome to GreenMind. I'm your AI assistant powered by local AI. Ask me about agriculture, plants, greenhouse management, electronics, IoT, education or everyday topics.";

const SUGGESTIONS = [
  "What is smart agriculture?",
  "Explain ESP32",
  "Why do plant leaves turn yellow?",
  "How can I improve greenhouse irrigation?",
];

function getStatusLabel(status?: GreenhouseStatus) {
  switch (status) {
    case "LIVE":
      return "LIVE SENSOR DATA";
    case "DELAYED":
      return "DELAYED DATA";
    case "STALE":
      return "STALE DATA";
    case "SIMULATED":
      return "SIMULATED DEMO";
    case "WAITING":
      return "WAITING FOR DATA";
    case "ERROR":
      return "CONNECTION ERROR";
    default:
      return "NOT CONNECTED";
  }
}

function getStatusColor(status?: GreenhouseStatus) {
  switch (status) {
    case "LIVE":
      return "#16a34a";
    case "SIMULATED":
      return "#d97706";
    case "DELAYED":
      return "#ca8a04";
    case "STALE":
    case "ERROR":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

export default function AIFarmerChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [greenhouse, setGreenhouse] = useState<GreenhouseData | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME },
  ]);

  async function sendMessage(text?: string) {
    const question = (text ?? input).trim();

    if (!question || loading) return;

    const userMessage: Message = {
      role: "user",
      content: question,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages
            .filter(
              (message, index) =>
                !(index === 0 && message.content === WELCOME)
            )
            .slice(-6),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to get an AI response.");
      }

      if (data.greenhouse) {
        setGreenhouse(data.greenhouse);
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer,
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't connect to the local AI model.\n\n" +
            errorMessage +
            "\n\nPlease check that Ollama is running on your computer.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([{ role: "assistant", content: WELCOME }]);
    setInput("");
    setGreenhouse(null);
  }

  return (
    <>
      {isOpen && (
        <div className="gm-chat-window">
          <div className="gm-chat-header">
            <div className="gm-chat-brand">
              <div className="gm-chat-logo">🌱</div>
              <div>
                <strong>GreenMind</strong>
                <span>AI Farmer Assistant · Local AI</span>
              </div>
            </div>

            <div className="gm-chat-actions">
              <button
                type="button"
                onClick={clearChat}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                ↻
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chatbot"
                aria-label="Close chatbot"
              >
                ×
              </button>
            </div>
          </div>

          {greenhouse && (
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--gm-border, #e5e7eb)",
                background: "var(--gm-card, #f8fafc)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <strong style={{ fontSize: "12px" }}>
                  GREENHOUSE STATUS
                </strong>

                <span
                  style={{
                    color: getStatusColor(greenhouse.status),
                    fontWeight: 700,
                    fontSize: "10px",
                  }}
                >
                  ● {getStatusLabel(greenhouse.status)}
                </span>
              </div>

              {greenhouse.reading ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "7px",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    Temperature:{" "}
                    <strong>
                      {greenhouse.reading.temperature_c ?? "N/A"} °C
                    </strong>
                  </div>

                  <div>
                    Humidity:{" "}
                    <strong>
                      {greenhouse.reading.humidity_percent ?? "N/A"}%
                    </strong>
                  </div>

                  <div>
                    Soil moisture:{" "}
                    <strong>
                      {greenhouse.reading.soil_moisture_percent ?? "N/A"}%
                    </strong>
                  </div>

                  <div>
                    Light:{" "}
                    <strong>
                      {greenhouse.reading.light_percent ?? "N/A"}%
                    </strong>
                  </div>

                  <div>
                    Battery:{" "}
                    <strong>
                      {greenhouse.reading.battery_voltage ?? "N/A"} V
                    </strong>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "11px", margin: 0 }}>
                  {greenhouse.message}
                </p>
              )}

              {greenhouse.status === "SIMULATED" && (
                <p
                  style={{
                    fontSize: "10px",
                    color: "#b45309",
                    margin: "8px 0 0",
                  }}
                >
                  Demo values only — no real sensor is connected.
                </p>
              )}

              {greenhouse.status === "LIVE" && (
                <p style={{ fontSize: "10px", margin: "8px 0 0" }}>
                  Last reading age: {greenhouse.ageSeconds ?? 0} seconds
                </p>
              )}
            </div>
          )}

          <div className="gm-chat-messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`gm-message ${
                  message.role === "user" ? "gm-user" : "gm-assistant"
                }`}
              >
                {message.content}
              </div>
            ))}

            {loading && (
              <div className="gm-message gm-assistant">
                🌱 GreenMind AI is thinking...
              </div>
            )}
          </div>

          {messages.length === 1 && (
            <div className="gm-chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="gm-chat-input-area"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask GreenMind something..."
              aria-label="Type your question"
              disabled={loading}
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>

          <div className="gm-chat-footer">
            Powered by Qwen AI · Ollama Local Mode
          </div>
        </div>
      )}

      <button
        type="button"
        className="gm-chat-float"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close GreenMind chat" : "Open GreenMind chat"}
      >
        {isOpen ? "×" : "🌱"}
      </button>
    </>
  );
}
