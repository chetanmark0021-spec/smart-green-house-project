
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import * as ort from "onnxruntime-web";
import {
  getDiseaseCare,
  formatCareText,
} from "./disease-care";
import "./disease-detection.css";

// Public ONNX model files hosted in the free Hugging Face Static Space.
const MODEL_BASE_URL =
  "https://huggingface.co/spaces/sparkfghcgj/greenmind-plant-disease-free/resolve/main";

let browserModelSession: ort.InferenceSession | null = null;
let browserModelConfig: any = null;
let browserProcessorConfig: any = null;
let browserModelPromise: Promise<void> | null = null;

async function loadBrowserPlantModel() {
  if (browserModelSession && browserModelConfig && browserProcessorConfig) return;
  if (browserModelPromise) return browserModelPromise;

  browserModelPromise = (async () => {
    const [configResponse, processorResponse] = await Promise.all([
      fetch(`${MODEL_BASE_URL}/config.json`),
      fetch(`${MODEL_BASE_URL}/preprocessor_config.json`),
    ]);

    if (!configResponse.ok || !processorResponse.ok) {
      throw new Error("Could not download the GreenMind model configuration from Hugging Face.");
    }

    browserModelConfig = await configResponse.json();
    browserProcessorConfig = await processorResponse.json();

    browserModelSession = await ort.InferenceSession.create(
      `${MODEL_BASE_URL}/model.onnx`,
      { executionProviders: ["wasm"] }
    );
  })();

  try {
    await browserModelPromise;
  } catch (error) {
    browserModelPromise = null;
    browserModelSession = null;
    throw error;
  }
}

async function predictPlantDiseaseInBrowser(imageFile: File): Promise<Diagnosis> {
  await loadBrowserPlantModel();

  if (!browserModelSession || !browserModelConfig || !browserProcessorConfig) {
    throw new Error("The GreenMind browser AI model is not ready.");
  }

  const imageUrl = URL.createObjectURL(imageFile);

  try {
    const image = new Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read the selected plant image."));
    });

    const size = browserProcessorConfig.size || {};
   // ONNX model requires exactly 224 × 224 pixels
const width = 224;
const height = 224;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image preprocessing is unavailable in this browser.");
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const planeSize = width * height;
    const tensorData = new Float32Array(3 * planeSize);
    const mean = browserProcessorConfig.image_mean || [0.485, 0.456, 0.406];
    const std = browserProcessorConfig.image_std || [0.229, 0.224, 0.225];
    const scale = browserProcessorConfig.do_rescale === false
      ? 1
      : Number(browserProcessorConfig.rescale_factor || 1 / 255);

    for (let i = 0; i < planeSize; i++) {
      for (let channel = 0; channel < 3; channel++) {
        let value = pixels[i * 4 + channel] * scale;
        if (browserProcessorConfig.do_normalize !== false) {
          value = (value - mean[channel]) / std[channel];
        }
        tensorData[channel * planeSize + i] = value;
      }
    }

    const inputName = browserModelSession.inputNames[0];
    const outputName = browserModelSession.outputNames[0];
    const tensor = new ort.Tensor("float32", tensorData, [1, 3, height, width]);
    const outputs = await browserModelSession.run({ [inputName]: tensor });
    const logits = Array.from(outputs[outputName].data as Float32Array);

    const maxLogit = Math.max(...logits);
    const exponentials = logits.map((value) => Math.exp(value - maxLogit));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    const probabilities = exponentials.map((value) => value / total);
    const labels = browserModelConfig.id2label || {};

    const top_predictions: Prediction[] = probabilities
      .map((confidence, index) => ({
        label: String(labels[String(index)] ?? labels[index] ?? `Class ${index}`),
        confidence: confidence * 100,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    const condition = top_predictions[0]?.label || "Unknown";
    const crop = condition.includes("___")
      ? condition.split("___")[0].replace(/_/g, " ")
      : "Unknown crop";
    const isHealthy = /healthy/i.test(condition);

    return {
      crop,
      condition,
      status: isHealthy ? "Healthy" : "Prediction",
      confidence: top_predictions[0]?.confidence ?? 0,
      message: "Prediction generated locally in your browser using GreenMind MobileNetV2.",
      top_predictions,
      disclaimer: "AI-assisted prediction only. Model confidence is not a confirmed disease probability. Verify uncertain results with an agricultural expert.",
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

type Prediction = {
  label: string;
  confidence: number;
};

type Diagnosis = {
  crop: string;
  condition: string;
  status: string;
  confidence: number;
  message: string;
  top_predictions: Prediction[];
  disclaimer: string;
};

type HistoryItem = {
  id: number;
  disease_name: string;
  crop_name: string | null;
  confidence_percent: number | null;
  image_path: string | null;
  created_at: string;
  imageUrl?: string;
};

type LeafVisualAnalysis = {
  healthScore: number;
  healthLabel: string;
  greenPercent: number;
  yellowPercent: number;
  brownPercent: number;
  visibleDamagePercent: number;
  sampledPixels: number;
};

function getHealthLabel(score: number) {
  if (score >= 90) return "Healthy";
  if (score >= 70) return "Good";
  if (score >= 40) return "Needs attention";
  return "Critical";
}

// Experimental colour-based visual estimate.
// This is not a trained disease-severity model.
async function analyseLeafColours(
  imageFile: File
): Promise<LeafVisualAnalysis> {
  const imageUrl = URL.createObjectURL(imageFile);

  try {
    const image = new Image();
    image.src = imageUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not read the selected image."));
    });

    const canvas = document.createElement("canvas");
    const maxSide = 240;

    const scale = Math.min(
      1,
      maxSide / Math.max(
        image.naturalWidth,
        image.naturalHeight
      )
    );

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(image.naturalHeight * scale)
    );

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error(
        "Image colour analysis is unavailable in this browser."
      );
    }

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

    let green = 0;
    let yellow = 0;
    let brown = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      const saturation =
        max === 0 ? 0 : delta / max;

      if (
        saturation < 0.18 ||
        max < 0.12 ||
        delta === 0
      ) {
        continue;
      }

      let hue = 0;

      if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
      } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
      } else {
        hue = 60 * ((r - g) / delta + 4);
      }

      if (hue < 0) hue += 360;

      if (hue >= 65 && hue <= 170) {
        green++;
      } else if (hue >= 35 && hue < 65) {
        yellow++;
      } else if (
        hue >= 8 &&
        hue < 35 &&
        max < 0.85
      ) {
        brown++;
      }
    }

    const sampledPixels = green + yellow + brown;

    if (sampledPixels < 30) {
      throw new Error(
        "Not enough leaf-like colour pixels were found. Try a closer, clearer image of one leaf."
      );
    }

    const greenPercent =
      (green / sampledPixels) * 100;

    const yellowPercent =
      (yellow / sampledPixels) * 100;

    const brownPercent =
      (brown / sampledPixels) * 100;

    const visibleDamagePercent =
      yellowPercent + brownPercent;

    // Experimental weighted colour estimate.
    const healthScore = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          greenPercent +
            yellowPercent * 0.45 +
            brownPercent * 0.15
        )
      )
    );

    return {
      healthScore,
      healthLabel: getHealthLabel(healthScore),
      greenPercent: Number(greenPercent.toFixed(1)),
      yellowPercent: Number(yellowPercent.toFixed(1)),
      brownPercent: Number(brownPercent.toFixed(1)),
      visibleDamagePercent: Number(
        visibleDamagePercent.toFixed(1)
      ),
      sampledPixels,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function DiseaseDetectionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [diagnosis, setDiagnosis] =
    useState<Diagnosis | null>(null);

  const [visualAnalysis, setVisualAnalysis] =
    useState<LeafVisualAnalysis | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");

  useEffect(() => {
    return () => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function setImagePreview(blob: Blob) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreview(url);
  }

  // LOAD LATEST 3 DIAGNOSIS RECORDS
  const loadDiagnosisHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const { data, error } = await supabase
        .from("disease_analyses")
        .select(
          "id, disease_name, crop_name, confidence_percent, image_path, created_at"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, 2);

      if (error) throw error;

      const records: HistoryItem[] = await Promise.all(
        (data || []).map(async (item) => {
          let imageUrl: string | undefined;

          if (item.image_path) {
            const {
              data: signedImage,
              error: signedError,
            } = await supabase.storage
              .from("disease-images")
              .createSignedUrl(item.image_path, 3600);

            if (!signedError) {
              imageUrl = signedImage?.signedUrl;
            }
          }

          return {
            ...item,
            imageUrl,
          };
        })
      );

      setHistory(records);
    } catch (error) {
      console.error("History loading error:", error);

      setHistory([]);
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Unable to load diagnosis history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // CLEAR SHARED DIAGNOSIS HISTORY.
  // Protect this operation with admin authorization before public deployment.
  async function clearDiagnosisHistory() {
    const confirmed = window.confirm(
      "Permanently delete ALL diagnosis history and saved leaf images? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setHistoryClearing(true);
      setHistoryError("");
      setHistoryMessage("");

      const response = await fetch("/api/disease-history/clear", {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to clear diagnosis history."
        );
      }

      setHistory([]);

      setHistoryMessage(
        `Successfully cleared ${result.deletedRecords ?? 0} diagnosis record(s) and their saved images.`
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Unable to clear diagnosis history."
      );
    } finally {
      setHistoryClearing(false);
    }
  }

  useEffect(() => {
    loadDiagnosisHistory();
  }, [loadDiagnosisHistory]);

  // START CAMERA
  async function startCamera() {
    try {
      setMessage("");

      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage(
          "Camera requires localhost or a secure HTTPS connection."
        );
        return;
      }

      stopCamera();

      const stream =
        await navigator.mediaDevices.getUserMedia({
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

      setCameraOn(true);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      setPreview("");
      setFile(null);
      setDiagnosis(null);
      setVisualAnalysis(null);
      setSaveMessage("");

      setMessage(
        "Camera connected. Position the plant leaf in the frame."
      );
    } catch (error) {
      console.error("Camera error:", error);

      const cameraError = error as DOMException;

      if (cameraError.name === "NotAllowedError") {
        setMessage(
          "Camera permission denied. Allow camera access."
        );
      } else if (cameraError.name === "NotFoundError") {
        setMessage(
          "No webcam found. Connect a webcam and try again."
        );
      } else if (cameraError.name === "NotReadableError") {
        setMessage(
          "Camera is being used by another application."
        );
      } else {
        setMessage(
          "Camera could not start. Check connection and permissions."
        );
      }
    }
  }

  // STOP CAMERA
  function stopCamera() {
    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
  }

  // CAPTURE PLANT IMAGE
  function capturePlant() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0) {
      setMessage(
        "Please wait until the webcam video is ready."
      );
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setMessage("Could not capture the image.");
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("Image capture failed.");
          return;
        }

        const imageFile = new File(
          [blob],
          "greenmind-plant-capture.jpg",
          { type: "image/jpeg" }
        );

        setFile(imageFile);
        setImagePreview(blob);
        setDiagnosis(null);
        setVisualAnalysis(null);
        setSaveMessage("");

        stopCamera();

        setMessage(
          "Plant image captured successfully."
        );
      },
      "image/jpeg",
      0.92
    );
  }

  // UPLOAD IMAGE
  function handleUpload(selectedFile?: File) {
    if (!selectedFile) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        selectedFile.type
      )
    ) {
      setMessage(
        "Please select a JPG, PNG, or WEBP image."
      );
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setMessage("Image size must be below 10 MB.");
      return;
    }

    stopCamera();
    setFile(selectedFile);
    setImagePreview(selectedFile);
    setDiagnosis(null);
    setVisualAnalysis(null);
    setSaveMessage("");

    setMessage(
      "Image uploaded successfully. Ready for AI analysis."
    );
  }

  // SAVE DIAGNOSIS AND VISUAL HEALTH SCORE TO SUPABASE
  async function saveDiagnosisRecord(
    result: Diagnosis,
    imageFile: File,
    visualResult: LeafVisualAnalysis | null
  ) {
    const care = getDiseaseCare(result.condition);

    const safeName = imageFile.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const imagePath =
      `anonymous/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("disease-images")
      .upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        "Image upload failed: " + uploadError.message
      );
    }

    const treatmentText = formatCareText(
      care.treatment
    );

    const { error: insertError } = await supabase
      .from("disease_analyses")
      .insert({
        disease_name: result.condition,
        crop_name: result.crop,
        confidence_percent: result.confidence,
        recommendation: treatmentText,
        symptoms: formatCareText(care.symptoms),
        treatment: treatmentText,
        prevention: formatCareText(care.prevention),
        organic_recommendations: formatCareText(
          care.organic
        ),
        top_predictions: result.top_predictions,
        image_path: imagePath,
        original_filename: imageFile.name,
        model_name: "PlantVillage MobileNetV2",

        // Experimental visual leaf health analysis
        health_score: visualResult?.healthScore ?? null,
        health_label: visualResult?.healthLabel ?? null,
        green_percent: visualResult?.greenPercent ?? null,
        yellow_percent: visualResult?.yellowPercent ?? null,
        brown_percent: visualResult?.brownPercent ?? null,
        visible_damage_percent:
          visualResult?.visibleDamagePercent ?? null,
        sampled_pixels: visualResult?.sampledPixels ?? null,
      });

    if (insertError) {
      await supabase.storage
        .from("disease-images")
        .remove([imagePath]);

      throw new Error(
        "Diagnosis database save failed: " +
          insertError.message
      );
    }

    // REFRESH HISTORY AFTER SAVING A NEW SCAN
    await loadDiagnosisHistory();
  }

  // ANALYSE IMAGE WITH AI
  async function analyseImage() {
    if (!file) {
      setMessage(
        "Please capture or upload a plant image first."
      );
      return;
    }

    setLoading(true);
    setMessage("");
    setSaveMessage("");
    setDiagnosis(null);
    setVisualAnalysis(null);

    try {
      // Run the ONNX model locally in the visitor's browser.
      // No FastAPI server or paid GPU endpoint is required.
      const result = await predictPlantDiseaseInBrowser(file);

      setDiagnosis(result);

      // RUN EXPERIMENTAL COLOUR ANALYSIS
      let visualResult: LeafVisualAnalysis | null = null;

      try {
        visualResult = await analyseLeafColours(file);
        setVisualAnalysis(visualResult);
      } catch (visualError) {
        console.warn(
          "Visual colour analysis unavailable:",
          visualError
        );

        setVisualAnalysis(null);
      }

      setMessage(
        "GreenMind AI analysis completed successfully."
      );

      try {
        await saveDiagnosisRecord(result, file, visualResult);

        setSaveMessage(
          "✓ Diagnosis, image and visual health score saved successfully."
        );
      } catch (saveError) {
        console.error(
          "Diagnosis save error:",
          saveError
        );

        setSaveMessage(
          saveError instanceof Error
            ? saveError.message
            : "Diagnosis worked, but saving failed."
        );
      }
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to the AI server."
      );
    } finally {
      setLoading(false);
    }
  }

  // RESET IMAGE
  function resetImage() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setPreview("");
    setFile(null);
    setDiagnosis(null);
    setVisualAnalysis(null);
    setSaveMessage("");
    setMessage("Ready for a new plant image.");
  }

  const care = diagnosis
    ? getDiseaseCare(diagnosis.condition)
    : null;

  return (
    <main className="gm-page">
      <div className="gm-container">

        {/* PAGE HEADER */}
        <header className="gm-header">
          <div>
            <div className="gm-brand">
              🌱 GREENMIND / PLANT INTELLIGENCE
            </div>

            <h1>Plant Disease Detection</h1>

            <p>
              Discover plant health insights with AI-powered diagnosis.
            </p>
          </div>

          <div className="gm-status">
            <span className="gm-status-dot" />
            AI SYSTEM READY
          </div>
        </header>

        {/* INTRODUCTION */}
        <section className="gm-intro">
          <strong>✦ How GreenMind works</strong>

          <p>
            Capture a clear leaf image or upload a photo.
            GreenMind AI analyses the image and provides
            disease-care recommendations.
          </p>
        </section>

        <div className="gm-steps">
          <span>01 · CAPTURE</span>
          <span>02 · REVIEW</span>
          <span>03 · DIAGNOSIS</span>
        </div>

        {/* IMAGE CAPTURE AND REVIEW */}
        <div className="gm-grid">

          {/* CAMERA SECTION */}
          <section className="gm-card">
            <span className="gm-eyebrow">
              STEP 01 · IMAGE SOURCE
            </span>

            <h2>📷 Capture Plant Image</h2>
            <p>Use your webcam or choose a plant photo.</p>

            <div className="gm-image-frame">
              <div className="gm-scan-corners" />

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  display: cameraOn ? "block" : "none",
                  width: "100%",
                  maxHeight: 340,
                  objectFit: "contain",
                }}
              />

              {!cameraOn && preview && (
                <img
                  src={preview}
                  alt="Selected plant"
                />
              )}

              {!cameraOn && !preview && (
                <div className="gm-empty">
                  <div className="gm-empty-icon">
                    📷
                  </div>

                  <strong>Camera is not active</strong>

                  <p>
                    Your plant image preview will appear here.
                  </p>
                </div>
              )}

              {cameraOn && (
                <span className="gm-live">
                  <span className="gm-live-dot" />
                  LIVE CAMERA
                </span>
              )}
            </div>

            <canvas
              ref={canvasRef}
              style={{ display: "none" }}
            />

            <div className="gm-buttons">
              {!cameraOn ? (
                <button
                  className="gm-primary"
                  onClick={startCamera}
                >
                  Open Camera
                </button>
              ) : (
                <>
                  <button
                    className="gm-primary"
                    onClick={capturePlant}
                  >
                    Capture Image
                  </button>

                  <button
                    className="gm-danger"
                    onClick={stopCamera}
                  >
                    Stop Camera
                  </button>
                </>
              )}

              <button
                className="gm-outline"
                onClick={() =>
                  uploadRef.current?.click()
                }
              >
                ↑ Upload Image
              </button>
            </div>

            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                handleUpload(
                  event.target.files?.[0]
                );

                event.currentTarget.value = "";
              }}
            />

            <p className="gm-small">
              JPG, PNG or WEBP · Maximum 10 MB
            </p>
          </section>

          {/* IMAGE REVIEW SECTION */}
          <section className="gm-card">
            <span className="gm-eyebrow">
              STEP 02 · IMAGE CHECK
            </span>

            <h2>🖼️ Image Review</h2>
            <p>Check your image before analysis.</p>

            <div className="gm-image-frame gm-review">
              {preview ? (
                <>
                  <img
                    src={preview}
                    alt="Plant image ready for analysis"
                  />

                  <strong className="gm-ready">
                    ✓ Image ready for analysis
                  </strong>

                  <p>{file?.name}</p>
                </>
              ) : (
                <div className="gm-empty">
                  <div className="gm-empty-icon">
                    🌿
                  </div>

                  <strong>No image selected</strong>

                  <p>
                    Capture or upload an image to continue.
                  </p>
                </div>
              )}
            </div>

            <div className="gm-buttons">
              <button
                className="gm-primary gm-analyse"
                onClick={analyseImage}
                disabled={!file || loading}
              >
                {loading
                  ? "Analysing plant..."
                  : "✦ Analyse with GreenMind AI →"}
              </button>

              <button
                className="gm-outline"
                onClick={resetImage}
                disabled={!file && !diagnosis}
              >
                Clear Image
              </button>
            </div>

            <p className="gm-small">
              Use a clear, well-lit image of the affected leaf.
            </p>
          </section>
        </div>

        {/* STATUS MESSAGE */}
        {message && (
          <div className="gm-message" role="status">
            {message}
          </div>
        )}

        {/* AI LOADING */}
        {loading && (
          <div className="gm-card gm-loading">
            <div className="gm-ai-loader">
              <span />
              <span />
              <span />
            </div>

            <h3>🌱 GreenMind AI is analysing...</h3>

            <p>
              Examining leaf patterns and disease characteristics.
            </p>
          </div>
        )}

        {/* AI DIAGNOSIS REPORT */}
        {diagnosis && care && (
          <section
            className="gm-card gm-results"
            data-disease-result
          >
            <div className="gm-result-heading">
              <div>
                <button
                  className="gm-primary gm-report-button"
                  onClick={() => window.print()}
                >
                  ↓ Download / Save PDF
                </button>

                <span className="gm-eyebrow">
                  STEP 03 · AI REPORT
                </span>

                <h2>Plant Health Diagnosis</h2>

                <p>
                  Your image has been processed by GreenMind AI.
                </p>
              </div>

              <span className="gm-complete">
                ✓ COMPLETE
              </span>
            </div>

            {/* RESULT SUMMARY */}
            <div className="gm-result-grid">
              <div className="gm-result-item">
                <span>🌿 Detected crop</span>
                <strong>{diagnosis.crop}</strong>
              </div>

              <div className="gm-result-item">
                <span>🔬 Predicted condition</span>

                <strong>
                  {diagnosis.condition.replace(/_/g, " ")}
                </strong>
              </div>

              <div className="gm-result-item">
                <span>◉ Detection status</span>

                <strong>
                  {diagnosis.status.replace(/_/g, " ")}
                </strong>
              </div>

              <div className="gm-result-item">
                <span>✦ Model confidence</span>

                <strong>
                  {Number(diagnosis.confidence).toFixed(2)}%
                </strong>
              </div>
            </div>

            {/* ANALYSED IMAGE */}
            <div className="gm-diagnosis-image">
              <h3>📷 Uploaded leaf image</h3>

              {preview && (
                <img
                  src={preview}
                  alt="Leaf analysed by GreenMind AI"
                />
              )}
            </div>

            {/* PRELIMINARY VISUAL HEALTH ANALYSIS */}
            <div className="gm-care gm-visual-health">
              <h3>🌿 Preliminary Plant Health Estimate</h3>

              {visualAnalysis ? (
                <>
                  <div className="gm-result-grid">
                    <div className="gm-result-item">
                      <span>Plant health estimate</span>

                      <strong>
                        {visualAnalysis.healthScore}/100 ·{" "}
                        {visualAnalysis.healthLabel}
                      </strong>
                    </div>

                    <div className="gm-result-item">
                      <span>
                        Possible visible colour damage
                      </span>

                      <strong>
                        {visualAnalysis.visibleDamagePercent}%
                      </strong>
                    </div>
                  </div>

                  <div
                    className="gm-progress"
                    role="progressbar"
                    aria-valuenow={visualAnalysis.healthScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Preliminary visual plant health estimate"
                  >
                    <div
                      style={{
                        width: `${visualAnalysis.healthScore}%`,
                      }}
                    />
                  </div>

                  <h4>Leaf colour breakdown</h4>

                  <div className="gm-result-grid">
                    <div className="gm-result-item">
                      <span>🟢 Green pixels</span>

                      <strong>
                        {visualAnalysis.greenPercent}%
                      </strong>
                    </div>

                    <div className="gm-result-item">
                      <span>🟡 Yellow pixels</span>

                      <strong>
                        {visualAnalysis.yellowPercent}%
                      </strong>
                    </div>

                    <div className="gm-result-item">
                      <span>🟤 Brown pixels</span>

                      <strong>
                        {visualAnalysis.brownPercent}%
                      </strong>
                    </div>
                  </div>

                  <p className="gm-small">
                    Estimate based on image colour only (
                    {visualAnalysis.sampledPixels.toLocaleString()}
                    {" "}sampled pixels). Background, lighting,
                    shadows, leaf variety and camera quality can
                    affect the result. Yellow or brown colour
                    does not by itself confirm disease or leaf damage.
                  </p>
                </>
              ) : (
                <p className="gm-small">
                  A colour estimate could not be calculated
                  for this image. Try a close-up, well-lit
                  photo showing one leaf against a plain background.
                </p>
              )}

              <p className="gm-small">
                This is an experimental visual indicator,
                not an agronomically validated plant-health
                score. It is separate from AI disease confidence.
              </p>
            </div>

            {/* CONFIDENCE */}
            <h3>AI prediction confidence</h3>

            <div className="gm-progress">
              <div
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, diagnosis.confidence)
                  )}%`,
                }}
              />
            </div>

            <p className="gm-small">
              {Number(diagnosis.confidence).toFixed(2)}%
              {" "}model confidence. This is not a guarantee
              of diagnosis.
            </p>

            {/* TOP PREDICTIONS */}
            <h3>Top AI predictions</h3>

            <div className="gm-predictions">
              {diagnosis.top_predictions?.map(
                (item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                  >
                    <span>
                      {index + 1}.{" "}
                      {item.label.replace(/_/g, " ")}
                    </span>

                    <strong>
                      {Number(item.confidence).toFixed(2)}%
                    </strong>
                  </div>
                )
              )}
            </div>

            {/* SYMPTOMS */}
            <div className="gm-care">
              <h3>🩺 Disease symptoms</h3>

              {care.symptoms.map((item, index) => (
                <p key={index}>• {item}</p>
              ))}
            </div>

            {/* TREATMENT */}
            <div className="gm-care">
              <h3>💊 Treatment methods</h3>

              {care.treatment.map((item, index) => (
                <p key={index}>
                  {index + 1}. {item}
                </p>
              ))}
            </div>

            {/* PREVENTION */}
            <div className="gm-care">
              <h3>🛡️ Prevention methods</h3>

              {care.prevention.map((item, index) => (
                <p key={index}>• {item}</p>
              ))}
            </div>

            {/* ORGANIC RECOMMENDATIONS */}
            <div className="gm-care">
              <h3>🌿 Organic recommendations</h3>

              {care.organic.map((item, index) => (
                <p key={index}>• {item}</p>
              ))}
            </div>

            {/* DISCLAIMER */}
            <div className="gm-disclaimer">
              <strong>Important note</strong>

              <p>
                {diagnosis.disclaimer} These recommendations
                are general guidance. Confirm uncertain diagnoses
                with an agricultural expert before applying
                crop treatments.
              </p>
            </div>

            {saveMessage && (
              <div className="gm-message" role="status">
                {saveMessage}
              </div>
            )}
          </section>
        )}

        {/* PREVIOUS DIAGNOSIS HISTORY */}
        <section className="gm-card gm-history">
          <div className="gm-history-heading">
            <div>
              <span className="gm-eyebrow">
                SAVED REPORTS
              </span>

              <h2>📋 Previous Diagnosis History</h2>

              <p>
                Showing {history.length} of the latest
                3 diagnosis records.
              </p>
            </div>

            <div className="gm-buttons">
              <button
                className="gm-outline"
                onClick={loadDiagnosisHistory}
                disabled={historyLoading}
              >
                ↻ Refresh
              </button>

              <button
                className="gm-danger"
                onClick={clearDiagnosisHistory}
                disabled={historyClearing || historyLoading}
              >
                {historyClearing ? "Clearing..." : "Clear History"}
              </button>
            </div>
          </div>

          {/* CLEAR HISTORY MESSAGE */}
          {historyMessage && (
            <div className="gm-message" role="status">
              {historyMessage}
            </div>
          )}

          {/* HISTORY ERROR */}
          {historyError && (
            <div className="gm-message" role="alert">
              History error: {historyError}
            </div>
          )}

          {/* HISTORY CONTENT */}
          {historyLoading ? (
            <p>Loading diagnosis history...</p>
          ) : history.length === 0 ? (
            <p>No diagnosis history saved yet.</p>
          ) : (
            <div className="gm-history-grid">
              {history.map((item) => (
                <article
                  className="gm-history-item"
                  key={item.id}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={`Leaf image: ${item.disease_name}`}
                    />
                  ) : (
                    <div className="gm-history-placeholder">
                      🌿 Image unavailable
                    </div>
                  )}

                  <h3>
                    {item.disease_name.replace(/_/g, " ")}
                  </h3>

                  <p>
                    Crop: {item.crop_name || "Not recorded"}
                  </p>

                  <p>
                    Confidence:{" "}
                    {item.confidence_percent != null
                      ? `${Number(
                          item.confidence_percent
                        ).toFixed(2)}%`
                      : "--"}
                  </p>

                  <small>
                    {Number.isNaN(Date.parse(item.created_at))
                      ? "Date unavailable"
                      : new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.created_at))}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* FOOTER */}
        <footer className="gm-footer">
          <strong>
            🌱 GREENMIND SMART GREENHOUSE
          </strong>

          <p>
            Smart monitoring · AI plant health · Sustainable agriculture
          </p>
        </footer>
      </div>
    </main>
  );
}
