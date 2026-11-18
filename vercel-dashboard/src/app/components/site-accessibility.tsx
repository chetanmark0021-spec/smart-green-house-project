"use client";

import { useEffect, useState } from "react";
import "./site-accessibility.css";

type Theme = "light" | "dark";

export default function SiteAccessibility() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [speaking, setSpeaking] = useState(false);
  const [selectedTextAvailable, setSelectedTextAvailable] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("greenmind-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    } else {
      document.documentElement.dataset.theme = "dark";
    }

    const updateSelection = () => {
      const selection = window.getSelection()?.toString().trim() || "";
      setSelectedTextAvailable(selection.length > 0);
    };

    document.addEventListener("selectionchange", updateSelection);

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      window.speechSynthesis?.cancel();
    };
  }, []);

  function changeTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("greenmind-theme", nextTheme);
  }

  function stopReading() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(false);
  }

  function readText(text: string) {
    const cleanedText = text.replace(/\s+/g, " ").trim();

    if (!cleanedText) {
      alert("There is no text available to read.");
      return;
    }

    if (!("speechSynthesis" in window)) {
      alert("Your browser does not support text-to-speech.");
      return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(cleanedText);
    speech.lang = "en-IN";
    speech.rate = 0.9;
    speech.pitch = 1;

    speech.onstart = () => setSpeaking(true);
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(speech);
  }

  function readPage() {
    const main = document.querySelector("main");

    if (!main) {
      readText(document.body.innerText);
      return;
    }

    const clone = main.cloneNode(true) as HTMLElement;

    clone
      .querySelectorAll("[data-reader-ignore], button, input, textarea, select")
      .forEach((element) => element.remove());

    readText(clone.innerText);
  }

  function readDiseaseAndSolutions() {
    const results = document.querySelector(".gm-results");

    if (!results) {
      alert("Please analyse a plant image first to get disease information.");
      return;
    }

    const sections = results.querySelectorAll(".gm-result-item, .gm-care");

    const text = Array.from(sections)
      .map((section) => section.textContent || "")
      .join(". ");

    readText(text);
  }

  function readSelectedText() {
    const selected = window.getSelection()?.toString().trim() || "";

    if (!selected) {
      alert("Please select some text on the website first.");
      return;
    }

    readText(selected);
  }

  return (
    <div className="gm-accessibility" data-reader-ignore>
      <button
        type="button"
        className="gm-accessibility-theme"
        onClick={changeTheme}
        title="Change website theme"
      >
        {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
      </button>

      <div className="gm-accessibility-reading">
        <button type="button" onClick={readPage}>
          🔊 Read Page
        </button>

        <button type="button" onClick={readDiseaseAndSolutions}>
          🌿 Read Disease & Solutions
        </button>

        <button
          type="button"
          onClick={readSelectedText}
          disabled={!selectedTextAvailable}
        >
          📝 Read Selected Text
        </button>

        <button
          type="button"
          className="gm-accessibility-stop"
          onClick={stopReading}
          disabled={!speaking}
        >
          ⏹ Stop Reading
        </button>
      </div>
    </div>
  );
}
