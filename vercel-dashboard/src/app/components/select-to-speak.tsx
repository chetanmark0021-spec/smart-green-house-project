
"use client";

import { useEffect, useState } from "react";

const voiceLanguages: Record<string, string> = {
  en: "en-IN",
  kn: "kn-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
};

export default function SelectToSpeak() {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    function handleSelection() {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || !selection || selection.rangeCount === 0) {
        setSelectedText("");
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();

      if (!rect.width && !rect.height) return;

      setSelectedText(text);

      setPosition({
        x: Math.max(
          100,
          Math.min(
            rect.left + rect.width / 2,
            window.innerWidth - 100
          )
        ),
        y: Math.max(10, rect.top - 50),
      });
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) return;

      if (target.closest(".gm-select-speak")) return;

      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setSelectedText("");
    }

    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
      document.removeEventListener("mousedown", handleOutsideClick);

      window.speechSynthesis?.cancel();
    };
  }, []);

  function speakText(text: string) {
    if (!text || !("speechSynthesis" in window)) {
      alert("Voice assistance is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const language = localStorage.getItem("gm-language") || "en";
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = voiceLanguages[language] || "en-IN";
    utterance.rate = 0.85;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  function readDiseaseSolution() {
    const diseaseSection = document.querySelector(
      ".disease-result, [data-disease-result]"
    );

    if (!(diseaseSection instanceof HTMLElement)) {
      alert(
        "No disease result found. Add the data-disease-result attribute to your disease results container."
      );
      return;
    }

    const solution = diseaseSection.innerText.trim();

    if (solution) {
      speakText(solution);
    }
  }

  if (!selectedText) return null;

  return (
    <div
      className="gm-select-speak"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => speakText(selectedText)}
      >
        🔊 {speaking ? "Speaking..." : "Listen"}
      </button>

      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={readDiseaseSolution}
      >
        🌱 Read Disease Solution
      </button>

      {speaking && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            window.speechSynthesis.cancel();
            setSpeaking(false);
          }}
        >
          ⏹ Stop
        </button>
      )}
    </div>
  );
}
