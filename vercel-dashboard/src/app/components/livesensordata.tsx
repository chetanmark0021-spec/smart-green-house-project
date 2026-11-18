
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./site-accessibility.css";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("greenmind-theme");
    const initial: Theme =
      saved === "light" || saved === "dark" ? saved : "dark";

    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("greenmind-theme", next);
  }

  return (
    <button
      type="button"
      className="gm-theme-switch"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
    >
      <span className="gm-theme-option gm-light-option">
        <span>☀</span>
        <span>Light</span>
      </span>

      <span className="gm-theme-option gm-dark-option">
        <span>☾</span>
        <span>Dark</span>
      </span>

      <span className="gm-theme-thumb" />
    </button>
  );
}

export default function SiteAccessibility() {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [speaking, setSpeaking] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const updateSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";

    if (!text || !selection || selection.rangeCount === 0) {
      setSelectedText("");
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!rect.width && !rect.height) {
      setSelectedText("");
      return;
    }

    const popupWidth = 170;
    const left = Math.max(
      10,
      Math.min(
        rect.left + rect.width / 2 - popupWidth / 2,
        window.innerWidth - popupWidth - 10
      )
    );

    const top =
      rect.top > 75
        ? rect.top - 58
        : Math.min(rect.bottom + 12, window.innerHeight - 65);

    setPosition({ top, left });
    setSelectedText(text);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    document.addEventListener("mouseup", updateSelection);
    document.addEventListener("touchend", updateSelection);
    window.addEventListener("resize", updateSelection);
    window.addEventListener("scroll", updateSelection, true);

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("mouseup", updateSelection);
      document.removeEventListener("touchend", updateSelection);
      window.removeEventListener("resize", updateSelection);
      window.removeEventListener("scroll", updateSelection, true);
      window.speechSynthesis?.cancel();
    };
  }, [updateSelection]);

  function readSelectedText() {
    if (!selectedText || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(selectedText);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  function stopReading() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  if (!selectedText) return null;

  return (
    <div
      ref={popupRef}
      className="gm-selection-popup"
      data-reader-ignore
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.stopPropagation()}
      role="toolbar"
      aria-label="Selected text reading controls"
    >
      <button
        type="button"
        onClick={speaking ? stopReading : readSelectedText}
        className="gm-selection-read"
      >
        <span>{speaking ? "⏸" : "🔊"}</span>
        {speaking ? "Reading..." : "Read aloud"}
      </button>

      {speaking && (
        <button
          type="button"
          className="gm-selection-stop"
          onClick={stopReading}
          aria-label="Stop reading"
        >
          ■
        </button>
      )}
    </div>
  );
}
