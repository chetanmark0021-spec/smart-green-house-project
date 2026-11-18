
"use client";

import { useEffect, useState } from "react";

const languageOptions = [
  { label: "🇬🇧 English", code: "en" },
  { label: "🇮🇳 ಕನ್ನಡ (Kannada)", code: "kn" },
  { label: "🇮🇳 हिन्दी (Hindi)", code: "hi" },
  { label: "🇮🇳 தமிழ் (Tamil)", code: "ta" },
  { label: "🇮🇳 తెలుగు (Telugu)", code: "te" },
  { label: "🇮🇳 മലയാളം (Malayalam)", code: "ml" },
];

const speechLocales: Record<string, string> = {
  en: "en-IN",
  kn: "kn-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
  ml: "ml-IN",
};

export default function GlobalAccessibilityTools() {
  const [theme, setTheme] = useState("light");
  const [language, setLanguage] = useState("en");
  const [appliedLanguage, setAppliedLanguage] = useState("en");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem("greenmind-theme") || "light";
    const savedLanguage =
      localStorage.getItem("greenmind-language") || "en";

    setTheme(savedTheme);
    setLanguage(savedLanguage);
    setAppliedLanguage(savedLanguage);

    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.lang = savedLanguage;
  }, []);

  function changeTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("greenmind-theme", nextTheme);
  }

  function translateWebsite() {
    setAppliedLanguage(language);

    document.documentElement.lang = language;
    localStorage.setItem("greenmind-language", language);

    window.dispatchEvent(
      new CustomEvent("greenmind:translate", {
        detail: { language },
      })
    );

    stopReading();
    setNotice(
      language === "en"
        ? "English selected."
        : "Language selected. Website translation is being applied."
    );
  }

  function stopReading() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(false);
    setPaused(false);
  }

  function readText(text: string) {
    if (!voiceEnabled) {
      setNotice("Turn Voice Assistant ON first.");
      return;
    }

    if (!("speechSynthesis" in window)) {
      setNotice("Voice reading is not supported in this browser.");
      return;
    }

    if (!text.trim()) {
      setNotice("No readable content was found.");
      return;
    }

    stopReading();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocales[appliedLanguage] || "en-IN";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setSpeaking(true);
      setPaused(false);
      setNotice("Voice reading started.");
    };

    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      setNotice("Voice reading completed.");
    };

    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
      setNotice("Voice reading could not be completed.");
    };

    window.speechSynthesis.speak(utterance);
  }

  function readSelectedText() {
    const selected = window.getSelection()?.toString() || "";

    if (!selected.trim()) {
      setNotice("Select some text on the page first.");
      return;
    }

    readText(selected);
  }

  function readDiseaseAndSolution() {
    const target = document.querySelector(
      '[data-voice="disease-solution"]'
    );

    if (!target) {
      setNotice(
        "Disease results are not available yet. Run a plant analysis first."
      );
      return;
    }

    readText(target.textContent || "");
  }

  function readEntirePage() {
    const main = document.querySelector("main");
    const content = main?.innerText || "";

    readText(content);
  }

  function pauseReading() {
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
      setNotice("Reading paused.");
    }
  }

  function resumeReading() {
    if (window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      setNotice("Reading resumed.");
    }
  }

  function toggleVoice() {
    const next = !voiceEnabled;

    setVoiceEnabled(next);

    if (!next) {
      stopReading();
      setNotice("Voice Assistant is OFF.");
    } else {
      setNotice("Voice Assistant is ON.");
    }
  }

  return (
    <header className="gm-accessibility-toolbar">
      <div className="gm-toolbar-brand">
        🌱 <strong>GreenMind</strong>
        <span>Accessibility</span>
      </div>

      <div className="gm-toolbar-controls">
        <button
          type="button"
          className="gm-access-button"
          onClick={changeTheme}
        >
          {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>

        <div className="gm-language-group">
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Choose website language"
            className="gm-language-select"
          >
            {languageOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="gm-translate-button"
            onClick={translateWebsite}
          >
            🌐 Translate Website
          </button>
        </div>

        <button
          type="button"
          className={`gm-access-button ${voiceEnabled ? "gm-voice-on" : ""}`}
          onClick={toggleVoice}
          aria-pressed={voiceEnabled}
        >
          {voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}
        </button>
      </div>

      {voiceEnabled && (
        <div className="gm-voice-toolbar">
          <button type="button" onClick={readSelectedText}>
            🖱 Read Selected Text
          </button>

          <button type="button" onClick={readDiseaseAndSolution}>
            🌿 Read Disease & Solution
          </button>

          <button type="button" onClick={readEntirePage}>
            📖 Read Entire Page
          </button>

          <button
            type="button"
            onClick={pauseReading}
            disabled={!speaking || paused}
          >
            ⏸ Pause
          </button>

          <button
            type="button"
            onClick={resumeReading}
            disabled={!paused}
          >
            ▶ Resume
          </button>

          <button type="button" onClick={stopReading}>
            ■ Stop
          </button>
        </div>
      )}

      {notice && (
        <p className="gm-accessibility-notice" role="status">
          {notice}
        </p>
      )}
    </header>
  );
}
