
"use client";

import { useEffect, useRef, useState } from "react";
import "./camera.css";

const API_URL =
  process.env.NEXT_PUBLIC_DISEASE_API_URL || "";

export default function CameraMonitoringPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState<unknown>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [cameraMessage, setCameraMessage] = useState(
    "Camera is not connected."
  );

  // Start the device camera
  async function startCamera() {
    setCameraLoading(true);
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Use HTTPS or localhost in a supported browser."
        );
      }

      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraMessage("Camera connected successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to access camera.";

      setError(message);
      setCameraMessage("Camera connection failed.");
      setCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }

  // Stop camera tracks
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }

  // Capture an image from the live camera
  async function captureImage() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0) {
      setError("Camera is not ready. Start the camera and try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setError("Unable to capture the camera image.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Image capture failed. Please try again.");
          return;
        }

        const file = new File(
          [blob],
          `greenhouse-capture-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );

        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }

        setCapturedImage(file);
        setPreviewUrl(URL.createObjectURL(file));
        setAnalysis(null);
        setError("");
      },
      "image/jpeg",
      0.92
    );
  }

  // Upload an image from the device
  function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please select a JPG, PNG or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be 10 MB or less.");
      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCapturedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAnalysis(null);
    setError("");
    setCameraMessage("Image uploaded from your device.");
  }

  // Send captured image to the existing AI disease detection API
  async function analyzeImage() {
    if (!capturedImage) {
      setError("Capture or upload a plant image first.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setAnalysis(null);

    try {
      if (!API_URL) {
        throw new Error("The Render disease API URL is not configured in Vercel.");
      }
      const formData = new FormData();
      formData.append("image", capturedImage);

      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error(
          `AI API returned an empty response. HTTP ${response.status}.`
        );
      }

      let result: unknown;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `AI API returned invalid JSON. HTTP ${response.status}.`
        );
      }

      if (!response.ok) {
        throw new Error(
          `Disease analysis failed. HTTP ${response.status}.`
        );
      }

      setAnalysis(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to analyze the plant image."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  // Remove the selected image
  function clearImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCapturedImage(null);
    setPreviewUrl("");
    setAnalysis(null);
    setError("");
  }

  // Clean up camera and object URL when leaving the page
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // Cleanup on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="camera-page">
      <header className="camera-header">
        <div>
          <p className="camera-brand">
            GREENMIND SMART AGRICULTURE
          </p>
          <h1>Greenhouse Camera Monitoring</h1>
          <p className="camera-subtitle">
            Capture plant images and analyze their health using AI.
          </p>
        </div>

        <span
          className={`camera-status ${
            cameraActive ? "camera-status-active" : ""
          }`}
        >
          {cameraActive ? "CAMERA CONNECTED" : "CAMERA OFFLINE"}
        </span>
      </header>

      {error && (
        <div className="camera-error" role="alert">
          {error}
        </div>
      )}

      <section className="camera-card">
        <div className="camera-card-heading">
          <div>
            <span className="camera-label">LIVE MONITORING</span>
            <h2>Greenhouse Camera</h2>
          </div>
          <span className="camera-live-indicator">
            {cameraActive ? "● LIVE" : "● OFFLINE"}
          </span>
        </div>

        <div className="camera-view">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cameraActive ? "camera-video" : "camera-video-hidden"}
          />

          {!cameraActive && (
            <div className="camera-placeholder">
              <span>📷</span>
              <strong>Camera preview unavailable</strong>
              <small>Start your camera to view the greenhouse.</small>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="camera-hidden-canvas" />

        <p className="camera-message">{cameraMessage}</p>

        <div className="camera-actions">
          {!cameraActive ? (
            <button
              className="camera-primary-button"
              onClick={startCamera}
              disabled={cameraLoading}
            >
              {cameraLoading ? "Connecting..." : "▶ Start Camera"}
            </button>
          ) : (
            <>
              <button
                className="camera-primary-button"
                onClick={captureImage}
              >
                📸 Capture Image
              </button>

              <button
                className="camera-secondary-button"
                onClick={stopCamera}
              >
                Stop Camera
              </button>
            </>
          )}
        </div>
      </section>

      <section className="camera-card">
        <div className="camera-card-heading">
          <div>
            <span className="camera-label">IMAGE MANAGEMENT</span>
            <h2>Captured Plant Image</h2>
          </div>
        </div>

        {previewUrl ? (
          <div className="captured-image-area">
            <img
              src={previewUrl}
              alt="Captured greenhouse plant"
              className="captured-image"
            />

            <div className="captured-image-details">
              <strong>{capturedImage?.name}</strong>
              <span>
                {capturedImage
                  ? `${(capturedImage.size / 1024).toFixed(1)} KB`
                  : ""}
              </span>
            </div>

            <div className="camera-actions">
              <button
                className="camera-primary-button"
                onClick={analyzeImage}
                disabled={analyzing}
              >
                {analyzing ? "Analyzing..." : "🔬 Analyze Plant Health"}
              </button>

              <button
                className="camera-secondary-button"
                onClick={clearImage}
                disabled={analyzing}
              >
                Remove Image
              </button>
            </div>
          </div>
        ) : (
          <div className="camera-upload-area">
            <span>🌿</span>
            <strong>No plant image selected</strong>
            <p>Capture an image or upload one from your device.</p>

            <label className="camera-upload-button">
              Upload Plant Image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                hidden
              />
            </label>
          </div>
        )}
      </section>

      <section className="camera-card">
        <div className="camera-card-heading">
          <div>
            <span className="camera-label">MACHINE LEARNING</span>
            <h2>AI Plant Disease Analysis</h2>
          </div>
          <span className="camera-ai-icon">🤖</span>
        </div>

        {analysis !== null ? (
          <div className="camera-analysis">
            <div className="camera-analysis-success">
              <span>✓</span>
              <strong>Analysis response received</strong>
            </div>

            <pre>{JSON.stringify(analysis, null, 2)}</pre>

            <p>
              AI output is a preliminary assessment. Confirm important
              disease findings through further inspection.
            </p>
          </div>
        ) : (
          <div className="camera-empty-analysis">
            <span>🔬</span>
            <strong>Analysis not available yet</strong>
            <p>
              Capture or upload a plant image, then select Analyze Plant
              Health.
            </p>
          </div>
        )}
      </section>

      <footer className="camera-footer">
        GREENMIND SMART AGRICULTURE · CAMERA MONITORING
        <p>
          Camera access requires your permission. Images are sent to the
          configured AI disease detection API only when you select Analyze.
          This page does not save images to Supabase.
        </p>
      </footer>
    </main>
  );
}
