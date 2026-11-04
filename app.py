from flask import Flask, request, jsonify, render_template, send_file
import numpy as np
import cv2
import onnxruntime as ort
from PIL import Image
import json
import os
import base64
from collections import deque
from datetime import datetime, timezone
from threading import Thread, Lock
import smtplib
from email.message import EmailMessage

# ─── CONFIG ───────────────────────────────────────────────────────────────────
IMG_SIZE             = 224
LEAF_IMG_SIZE        = 64
CONFIDENCE_THRESHOLD = 0.50
GAP_THRESHOLD        = 0.05

app = Flask(__name__)


@app.after_request
def add_cross_origin_headers(response):
    """Allow the Vercel dashboard to submit leaf images to this API."""
    response.headers["Access-Control-Allow-Origin"] = os.getenv("CORS_ORIGIN", "*")
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ─── GREENHOUSE TELEMETRY + CONTROL ──────────────────────────────────────────
# ESP32 posts a JSON snapshot to /api/telemetry every 10 seconds. Data is kept
# in memory for this local dashboard; replace these stores with Supabase later
# when you need permanent multi-device cloud history.
telemetry_lock = Lock()
telemetry_history = deque(maxlen=720)  # two hours at one reading every 10 s
latest_telemetry = None
last_alert_at = {}
control_config = {
    "temperatureOn": 30.0,
    "temperatureOff": 29.0,
    "soilMoistureOn": 30.0,
    "soilMoistureOff": 45.0,
    "irrigationBurstSeconds": 10,
    "irrigationSoakSeconds": 30,
    "lightStartHour": 6,
    "lightEndHour": 18,
    "modes": {"pump": "auto", "fan": "auto", "growLight": "auto"},
    "manual": {"pump": False, "fan": False, "growLight": False},
}
ALERT_COOLDOWN_SECONDS = 20 * 60
condition_started_at = {}

# ─── LOAD THE STRONGER LOCAL CLASSIFIER ──────────────────────────────────────
# CropGuard is a ResNet-50 trained and evaluated with a leaf-grouped split.
# It replaces the repository's two-stage filter, which was rejecting valid leaves.
print("Loading CropGuard disease model...")
cropguard_model = ort.InferenceSession("cropguard.onnx", providers=["CPUExecutionProvider"])
with open("cropguard_classes.json", encoding="utf-8") as class_file:
    cropguard_classes = json.load(class_file)
with open("cropguard_calibration.json", encoding="utf-8") as calibration_file:
    CROP_GUARD_TEMPERATURE = float(json.load(calibration_file)["temperature"])
print("CropGuard model loaded")


def cropguard_preprocess(image):
    """Match CropGuard's published resize-short-side, centre-crop preprocessing."""
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    scale = 256.0 / min(height, width)
    resized = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_CUBIC)
    top = (resized.shape[0] - 224) // 2
    left = (resized.shape[1] - 224) // 2
    crop = resized[top:top + 224, left:left + 224].astype(np.float32) / 255.0
    crop = (crop - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    return np.ascontiguousarray(crop.transpose(2, 0, 1)[None, ...], dtype=np.float32)


def predict_disease(image):
    logits = cropguard_model.run(["logits"], {"input": cropguard_preprocess(image)})[0][0]
    calibrated_logits = logits / CROP_GUARD_TEMPERATURE
    probabilities = np.exp(calibrated_logits - np.max(calibrated_logits))
    probabilities /= probabilities.sum()
    class_id = int(np.argmax(probabilities))
    confidence = float(probabilities[class_id])

    # Unlike the source app, no unreliable leaf-detector gate blocks a valid
    # disease prediction. A low-confidence photo is reported as uncertain.
    if confidence < 0.55:
        return "Uncertain - use a close, well-lit photo of one supported leaf", confidence
    return cropguard_classes[class_id], confidence

# ─── MAIN PIPELINE ────────────────────────────────────────────────────────────
def plant_pipeline(image):
    try:
        return predict_disease(image)

    except Exception as e:
        print(f"Pipeline error: {e}")
        return "Processing error", 0.0


def readable_prediction(prediction):
    """Format PlantVillage-style class names for a farmer-facing result."""
    return prediction.replace("___", " — ").replace("_", " ").replace("  ", " ").strip()


def disease_guidance(prediction, confidence):
    """Return cautious, actionable IPM guidance alongside a model prediction.

    The classifier identifies a visual class; it cannot replace a local plant
    pathology diagnosis. Recommendations therefore prioritise sanitation,
    airflow, irrigation practice and confirmation before any crop chemical.
    """
    label = readable_prediction(prediction)
    lowered = prediction.lower()
    shared_sources = [
        {"label": "UMN: managing plant diseases", "url": "https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-problems/managing-plant-diseases-in-the-home-garden"},
        {"label": "Penn State: ecological disease management", "url": "https://extension.psu.edu/ecological-disease-management"},
    ]
    if "uncertain" in lowered or "processing error" in lowered:
        return {
            "kind": "review", "severity": "Needs a clearer scan", "headline": "Retake the photo before treating the plant.",
            "summary": "The model is not confident enough to provide disease-specific guidance.",
            "actions": ["Photograph one leaf against a plain background in bright indirect light.", "Include both leaf surfaces and avoid motion blur, shadows and overlapping leaves.", "Inspect the plant for pests, stem damage and wet soil before making changes."],
            "avoid": "Do not apply treatment based on a low-confidence image.", "sources": shared_sources,
        }
    if "healthy" in lowered:
        return {
            "kind": "healthy", "severity": "Low concern", "headline": "No disease pattern was identified in this leaf image.",
            "summary": "Continue routine monitoring; a healthy-looking leaf does not rule out problems elsewhere on the plant.",
            "actions": ["Check the plant weekly, including undersides of leaves.", "Water at the soil level and let foliage dry quickly.", "Keep tools and pots clean before moving between plants."],
            "avoid": "Avoid preventive pesticide use unless a local label and diagnosis support it.", "sources": shared_sources,
        }

    severe = any(term in lowered for term in ("late_blight", "yellow_leaf_curl", "mosaic_virus", "haunglongbing"))
    plan = {
        "kind": "disease", "severity": "High priority" if severe else "Monitor closely",
        "headline": f"Possible {label}",
        "summary": "Treat this as a visual screening result. Confirm the crop, symptoms and local disease conditions before using any product.",
        "actions": [
            "Separate the affected plant from healthy plants if practical, and inspect nearby plants.",
            "Remove only clearly affected leaves when foliage is dry; disinfect tools before returning to healthy plants.",
            "Water at the soil level, improve spacing and airflow, and avoid handling wet foliage.",
        ],
        "avoid": "Do not rely on a pesticide alone. Use only a locally approved product labelled for this crop and problem, following its label exactly.",
        "sources": shared_sources,
    }
    if "spider_mite" in lowered:
        plan.update({
            "kind": "pest", "headline": f"Possible pest pressure: {label}",
            "summary": "Check leaf undersides for fine webbing and moving mites; pests can resemble disease damage in a single photo.",
            "actions": ["Isolate the plant and inspect leaf undersides with a hand lens.", "Rinse a small plant gently with water and remove heavily damaged leaves.", "Monitor nearby plants before considering a crop-labelled control."],
        })
    elif any(term in lowered for term in ("mildew", "mold")):
        plan.update({
            "summary": "Mildew and mold commonly spread when foliage stays humid or crowded.",
            "actions": ["Remove affected leaves or shoots when dry and discard them away from healthy plants.", "Increase ventilation and spacing; keep foliage dry by watering near roots.", "Clean tools and remove dead plant debris around the plant."],
        })
    elif "bacterial" in lowered:
        plan.update({
            "summary": "Bacterial leaf symptoms can spread through splash water, wet handling and contaminated tools.",
            "actions": ["Avoid overhead watering and do not handle plants while leaves are wet.", "Remove affected leaves when dry and disinfect tools between plants.", "Inspect nearby plants and avoid saving seed from affected plants."],
        })
    elif any(term in lowered for term in ("virus", "curl", "haunglongbing")):
        plan.update({
            "severity": "High priority", "summary": "Virus-like symptoms need confirmation because treatment options are limited and insect vectors may spread them.",
            "actions": ["Isolate the plant and inspect nearby plants for whiteflies, aphids or other vectors.", "Do not propagate or save seed from symptomatic plants.", "Contact a local agriculture extension service or nursery professional for crop-specific confirmation."],
        })
    return plan


def annotated_image_data_url(image, prediction, confidence):
    """Return an image with the classified leaf clearly marked for the web UI.

    This repository's supplied model is a whole-leaf classifier rather than a
    lesion-segmentation model, so the overlay deliberately marks the analysed
    leaf image (not a made-up diseased-spot location).
    """
    annotated = image.copy()
    height, width = annotated.shape[:2]
    inset = max(8, min(width, height) // 35)
    healthy = "healthy" in prediction.lower()
    color = (80, 220, 80) if healthy else (60, 70, 245)
    cv2.rectangle(annotated, (inset, inset), (width - inset, height - inset), color, max(3, inset // 3))

    label = f"{prediction.replace('___', ' - ').replace('__', ' - ')}  |  {confidence * 100:.1f}%"
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = max(0.45, min(0.9, width / 1000))
    thickness = max(1, int(scale * 2))
    (label_width, label_height), _ = cv2.getTextSize(label, font, scale, thickness)
    banner_height = label_height + 28
    cv2.rectangle(annotated, (0, 0), (width, banner_height), (12, 24, 18), -1)
    cv2.putText(annotated, label, (12, label_height + 12), font, scale, color, thickness, cv2.LINE_AA)

    ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("ascii")


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def normalise_telemetry(payload):
    """Validate the compact ESP32 JSON payload before it reaches the dashboard."""
    required = ("temperature", "humidity", "soilMoisture", "light")
    missing = [key for key in required if key not in payload]
    if missing:
        raise ValueError("Missing telemetry fields: " + ", ".join(missing))
    reading = {
        "timestamp": utc_now(),
        "deviceId": str(payload.get("deviceId", "esp32-s3-greenhouse")),
        "temperature": round(float(payload["temperature"]), 1),
        "humidity": round(float(payload["humidity"]), 1),
        "soilMoisture": round(float(payload["soilMoisture"]), 1),
        "light": round(float(payload["light"]), 1),
        "pump": bool(payload.get("pump", False)),
        "fan": bool(payload.get("fan", False)),
        "growLight": bool(payload.get("growLight", False)),
        "wifiRssi": int(payload.get("wifiRssi", 0)),
        # 0 means no voltage-divider sensor is fitted yet; do not treat it as low battery.
        "batteryVoltage": round(float(payload.get("batteryVoltage", 0)), 2),
    }
    if not (-20 <= reading["temperature"] <= 70 and 0 <= reading["humidity"] <= 100 and
            0 <= reading["soilMoisture"] <= 100 and 0 <= reading["light"] <= 100 and 0 <= reading["batteryVoltage"] <= 20):
        raise ValueError("One or more sensor values are outside a valid range")
    return reading


def alert_reasons(reading):
    reasons = []
    now = datetime.now(timezone.utc).timestamp()
    if reading["temperature"] > 38:
        started = condition_started_at.setdefault("critical-temperature", now)
        if now - started >= 5 * 60:
            reasons.append(f"Temperature has exceeded 38 C for five minutes: {reading['temperature']} C. Fan reported {'ON' if reading['fan'] else 'OFF'}.")
    else:
        condition_started_at.pop("critical-temperature", None)
    if reading["soilMoisture"] < 20 and reading["pump"]:
        reasons.append(f"Soil moisture remains critically low at {reading['soilMoisture']}% despite pump activation. Check the reservoir and irrigation line.")
    if 0 < reading["batteryVoltage"] < 3.3:
        reasons.append(f"Battery voltage is {reading['batteryVoltage']} V. Switch to auxiliary or grid power.")
    return reasons


def send_email_alert_async(reading, reasons):
    """Email only when SMTP settings are configured; never block an ESP32 post."""
    host = os.getenv("SMTP_HOST")
    recipient = os.getenv("ALERT_TO_EMAIL")
    if not host or not recipient:
        return

    def deliver():
        try:
            message = EmailMessage()
            message["Subject"] = "Smart Greenhouse alert"
            message["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "greenhouse@localhost"))
            message["To"] = recipient
            message.set_content("\n".join(reasons) + "\n\nLive reading:\n" + json.dumps(reading, indent=2))
            with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=15) as smtp:
                if os.getenv("SMTP_TLS", "true").lower() == "true":
                    smtp.starttls()
                if os.getenv("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                smtp.send_message(message)
        except Exception as error:
            app.logger.warning("Alert email failed: %s", error)

    Thread(target=deliver, daemon=True).start()


def maybe_send_alert(reading):
    now = datetime.now(timezone.utc).timestamp()
    reasons = alert_reasons(reading)
    if not reasons:
        return
    key = "|".join(reasons)
    if now - last_alert_at.get(key, 0) < ALERT_COOLDOWN_SECONDS:
        return
    last_alert_at[key] = now
    send_email_alert_async(reading, reasons)

# ─── DECODE IMAGE ─────────────────────────────────────────────────────────────
def decode_image(req):
    if "image" in req.files:
        file = req.files["image"]
        img  = Image.open(file.stream).convert("RGB")
        img  = np.array(img)
        img  = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        return img

    raw = req.data
    if len(raw) == 0:
        raise ValueError("Empty request body")

    npimg = np.frombuffer(raw, dtype=np.uint8)
    img   = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode image")

    return img

# ─── WEB PAGE ─────────────────────────────────────────────────────────────────
UPLOAD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PhytoScan — Plant Disease Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:         #080e0b;
    --surface:    #0d1a13;
    --card:       #111f17;
    --border:     #1e3828;
    --accent:     #3dffa0;
    --accent-dim: #1a7d4f;
    --accent-glow:rgba(61,255,160,0.15);
    --warn:       #ffb547;
    --danger:     #ff5e5e;
    --text:       #d4f0e0;
    --muted:      #556b5e;
    --font-head:  'Syne', sans-serif;
    --font-mono:  'DM Mono', monospace;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-head);
    min-height: 100vh;
  }
  .bg-blob {
    position: fixed; border-radius: 50%;
    filter: blur(120px); pointer-events: none;
    z-index: 0; opacity: 0.18;
    animation: drift 18s ease-in-out infinite alternate;
  }
  .bg-blob:nth-child(1) { width:600px; height:600px; background:#0d5c35; top:-200px; left:-200px; }
  .bg-blob:nth-child(2) { width:400px; height:400px; background:#1a4d2e; bottom:-100px; right:-100px; animation-delay:-7s; }
  .bg-blob:nth-child(3) { width:300px; height:300px; background:#062918; top:40%; left:50%; animation-delay:-13s; }
  @keyframes drift {
    from { transform: translate(0,0) scale(1); }
    to   { transform: translate(40px,30px) scale(1.08); }
  }
  .wrapper {
    position: relative; z-index: 1;
    max-width: 1100px; margin: 0 auto;
    padding: 40px 24px 80px;
  }
  header {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 56px;
  }
  .logo { display: flex; align-items: center; gap: 14px; }
  .logo-icon {
    width:46px; height:46px; background:var(--accent);
    border-radius:12px; display:flex; align-items:center;
    justify-content:center; font-size:22px;
    box-shadow: 0 0 24px var(--accent-glow);
  }
  .logo-text { font-size:22px; font-weight:800; color:#fff; }
  .logo-text span { color:var(--accent); }
  .status-pill {
    display:flex; align-items:center; gap:8px;
    background:var(--card); border:1px solid var(--border);
    border-radius:100px; padding:8px 16px;
    font-family:var(--font-mono); font-size:12px; color:var(--muted);
  }
  .status-dot {
    width:8px; height:8px; border-radius:50%;
    background:var(--accent); animation:pulse-dot 2s ease infinite;
  }
  @keyframes pulse-dot {
    0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(61,255,160,0.4); }
    50%      { opacity:0.7; box-shadow:0 0 0 5px rgba(61,255,160,0); }
  }
  .grid {
    display:grid; grid-template-columns:1fr 1fr;
    gap:24px; margin-bottom:24px;
  }
  @media(max-width:700px) { .grid { grid-template-columns:1fr; } }
  .card {
    background:var(--card); border:1px solid var(--border);
    border-radius:20px; padding:28px; position:relative;
    overflow:hidden; transition:border-color 0.3s,box-shadow 0.3s;
  }
  .card:hover {
    border-color:var(--accent-dim);
    box-shadow:0 0 40px rgba(61,255,160,0.06);
  }
  .section-label {
    font-family:var(--font-mono); font-size:11px;
    letter-spacing:2px; text-transform:uppercase;
    color:var(--accent); margin-bottom:10px; opacity:0.8;
  }
  .card-title { font-size:18px; font-weight:700; color:#fff; margin-bottom:6px; }
  .card-subtitle {
    font-family:var(--font-mono); font-size:12px;
    color:var(--muted); margin-bottom:22px;
  }
  .drop-zone {
    border:2px dashed var(--border); border-radius:14px;
    padding:36px 20px; text-align:center; cursor:pointer;
    transition:all 0.3s; background:rgba(0,0,0,0.2); position:relative;
  }
  .drop-zone:hover { border-color:var(--accent); background:var(--accent-glow); }
  .drop-zone input[type=file] {
    position:absolute; inset:0; opacity:0;
    cursor:pointer; width:100%; height:100%;
  }
  .drop-icon { font-size:40px; margin-bottom:12px; display:block; }
  .drop-text { font-size:14px; color:var(--muted); line-height:1.6; }
  .drop-text strong { color:var(--accent); font-weight:600; }
  #preview-wrap {
    display:none; margin-top:16px;
    border-radius:12px; overflow:hidden;
    border:1px solid var(--border);
  }
  #preview-img { width:100%; display:block; max-height:220px; object-fit:cover; }
  .btn {
    display:inline-flex; align-items:center; gap:8px;
    margin-top:18px; padding:13px 28px;
    border:none; border-radius:10px;
    background:var(--accent); color:#050f09;
    font-family:var(--font-head); font-size:14px;
    font-weight:700; cursor:pointer; transition:all 0.2s;
    width:100%; justify-content:center;
  }
  .btn:hover {
    background:#6effbc;
    box-shadow:0 0 28px rgba(61,255,160,0.35);
    transform:translateY(-1px);
  }
  .btn.loading { background:var(--accent-dim); pointer-events:none; }
  .spinner {
    width:16px; height:16px;
    border:2px solid rgba(5,15,9,0.3);
    border-top-color:#050f09; border-radius:50%;
    animation:spin 0.7s linear infinite; display:none;
  }
  .btn.loading .spinner { display:block; }
  .btn.loading .btn-icon { display:none; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .feed-frame {
    border-radius:12px; overflow:hidden;
    border:1px solid var(--border); background:rgba(0,0,0,0.3);
    aspect-ratio:4/3; display:flex; align-items:center;
    justify-content:center; position:relative;
  }
  .feed-frame img { width:100%; height:100%; object-fit:cover; display:block; }
  .feed-overlay {
    position:absolute; top:10px; right:10px;
    background:rgba(0,0,0,0.6); backdrop-filter:blur(6px);
    border-radius:8px; padding:5px 10px;
    font-family:var(--font-mono); font-size:10px;
    color:var(--accent); display:flex; align-items:center; gap:5px;
  }
  .live-dot {
    width:6px; height:6px; border-radius:50%;
    background:var(--accent); animation:pulse-dot 1.5s ease infinite;
  }
  .no-feed-msg {
    text-align:center; color:var(--muted);
    font-family:var(--font-mono); font-size:12px; line-height:1.8;
  }
  .no-feed-msg .icon { font-size:36px; display:block; margin-bottom:10px; opacity:0.5; }
  .result-box {
    margin-top:18px; background:rgba(0,0,0,0.25);
    border:1px solid var(--border); border-radius:12px;
    padding:16px 18px; font-family:var(--font-mono);
    font-size:13px; color:var(--muted); min-height:56px;
    transition:all 0.4s;
  }
  .result-box.has-result { border-color:var(--accent-dim); color:var(--text); }
  .r-label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
  .r-name { font-size:16px; font-weight:500; color:#fff; font-family:var(--font-head); }
  .conf-bar-track {
    height:4px; background:var(--border);
    border-radius:4px; margin-top:6px; overflow:hidden;
  }
  .conf-bar-fill {
    height:100%; border-radius:4px;
    background:linear-gradient(90deg,var(--accent-dim),var(--accent));
    transition:width 0.8s cubic-bezier(0.22,1,0.36,1);
  }
  .conf-pct { font-size:11px; color:var(--accent); }
  .timestamp {
    font-family:var(--font-mono); font-size:10px;
    color:var(--muted); margin-top:8px;
  }
  footer {
    margin-top:48px; padding-top:24px;
    border-top:1px solid var(--border);
    display:flex; align-items:center; justify-content:space-between;
    font-family:var(--font-mono); font-size:11px; color:var(--muted);
  }
</style>
</head>
<body>
<div class="bg-blob"></div>
<div class="bg-blob"></div>
<div class="bg-blob"></div>
<div class="wrapper">

  <header>
    <div class="logo">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke="#050f09" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2C6 2 3 8 3 12c0 5 4 9 9 9s9-4 9-9c0-3-1.5-6-4-8"/>
          <path d="M12 2c2 3 3 6 3 10"/>
          <path d="M7 15c1-3 3-5 5-6"/>
        </svg>
      </div>
      <div class="logo-text">Plant<span>Scan</span></div>
    </div>
    <div class="status-pill">
      <div class="status-dot"></div>
      Models Online
    </div>
  </header>

  <div class="grid">

    <!-- Upload Card -->
    <div class="card">
      <div class="section-label">Manual Analysis</div>
      <div class="card-title">Upload Leaf Image</div>
      <div class="card-subtitle">Supports JPG, PNG, WEBP</div>
      <form id="upload-form">
        <div class="drop-zone" id="drop-zone">
          <input type="file" name="image" id="file-input" accept="image/*">
          <span class="drop-icon">📷</span>
          <div class="drop-text">
            <strong>Click to browse</strong> or drag & drop
          </div>
        </div>
        <div id="preview-wrap">
          <img id="preview-img" src="" alt="Preview">
        </div>
        <button type="submit" class="btn" id="analyze-btn">
          <div class="spinner"></div>
          <svg class="btn-icon" width="16" height="16" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0
                 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0
                 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0
                 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0
                 00-3.09 3.09z"/>
          </svg>
          Run Analysis
        </button>
      </form>
      <div class="result-box" id="upload-result">
        <span style="opacity:0.4">Result will appear here</span>
      </div>
    </div>

    <!-- Browser camera card -->
    <div class="card">
      <div class="section-label">Camera Analysis</div>
      <div class="card-title">Use Your Webcam</div>
      <div class="card-subtitle">Capture a leaf photo directly from this browser</div>
      <div class="feed-frame" id="feed-frame">
        <video id="camera-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      </div>
      <button type="button" class="btn" id="camera-btn"><span class="btn-icon">📸</span> Capture & Analyze</button>
      <div class="result-box" id="camera-result"><span style="opacity:0.4">Allow camera access, then capture a leaf</span></div>
      <div class="timestamp" id="camera-status">Requesting camera access…</div>
    </div>

  </div>

  <footer>
    <div>PhytoScan · CropGuard ResNet-50 + ONNX Runtime</div>
    <div>38 conditions across 14 supported crops</div>
  </footer>

</div>

<script>
  const fileInput   = document.getElementById('file-input');
  const previewWrap = document.getElementById('preview-wrap');
  const previewImg  = document.getElementById('preview-img');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      previewWrap.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('upload-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('analyze-btn');
    btn.classList.add('loading');
    const formData = new FormData(this);
    try {
      const res  = await fetch('/upload_json', { method:'POST', body:formData });
      const data = await res.json();
      showResult('upload-result', data.prediction, data.confidence);
      showAnnotatedImage(data.annotated_image);
    } catch(err) {
      showResult('upload-result', 'Error processing image', 0);
    } finally {
      btn.classList.remove('loading');
    }
  });

  function showResult(boxId, prediction, confidence) {
    const box   = document.getElementById(boxId);
    const pct   = (confidence * 100).toFixed(1);
    const color = confidence > 0.75 ? '#3dffa0'
                : confidence > 0.50 ? '#ffb547' : '#ff5e5e';
    box.classList.add('has-result');
    box.innerHTML = `
      <div class="r-label">Diagnosis</div>
      <div class="r-name">${prediction}</div>
      <div class="r-conf">
        <span class="conf-pct" style="color:${color}">${pct}% confidence</span>
        <div class="conf-bar-track">
          <div class="conf-bar-fill"
               style="width:0%;background:linear-gradient(90deg,${color}88,${color})">
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      box.querySelector('.conf-bar-fill').style.width = pct + '%';
    }, 50);
  }

  function showAnnotatedImage(dataUrl) {
    if (!dataUrl) return;
    previewImg.src = dataUrl;
    previewWrap.style.display = 'block';
  }

  const cameraVideo = document.getElementById('camera-video');
  const cameraStatus = document.getElementById('camera-status');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then(stream => {
      cameraVideo.srcObject = stream;
      cameraStatus.textContent = 'Camera ready — keep one leaf in clear light';
    })
    .catch(() => {
      cameraStatus.textContent = 'Camera unavailable — use image upload instead';
      document.getElementById('camera-btn').disabled = true;
    });

  document.getElementById('camera-btn').addEventListener('click', async () => {
    if (!cameraVideo.videoWidth) return;
    const button = document.getElementById('camera-btn');
    button.classList.add('loading');
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
    const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const formData = new FormData();
    formData.append('image', imageBlob, 'webcam-leaf.jpg');
    try {
      const res = await fetch('/upload_json', { method: 'POST', body: formData });
      const data = await res.json();
      showResult('camera-result', data.prediction, data.confidence);
      showAnnotatedImage(data.annotated_image);
      cameraStatus.textContent = 'Analysis completed: ' + new Date().toLocaleTimeString();
    } catch (_) {
      showResult('camera-result', 'Error processing image', 0);
    } finally {
      button.classList.remove('loading');
    }
  });
</script>
</body>
</html>
"""

# ─── ROUTES ───────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"ok": True, "service": "smart-greenhouse-disease-api"})


@app.route("/")
def home():
    return render_template("dashboard.html")


@app.route("/api/telemetry", methods=["POST"])
def receive_telemetry():
    """ESP32-S3 endpoint. Send Content-Type: application/json."""
    global latest_telemetry
    try:
        payload = request.get_json(force=True)
        if not isinstance(payload, dict):
            raise ValueError("Telemetry must be a JSON object")
        reading = normalise_telemetry(payload)
        with telemetry_lock:
            latest_telemetry = reading
            telemetry_history.append(reading)
        maybe_send_alert(reading)
        return jsonify({"ok": True, "config": control_config})
    except (TypeError, ValueError) as error:
        return jsonify({"ok": False, "error": str(error)}), 400


@app.route("/api/telemetry", methods=["GET"])
def get_telemetry():
    with telemetry_lock:
        return jsonify({
            "latest": latest_telemetry,
            "history": list(telemetry_history),
            "connected": latest_telemetry is not None,
        })


@app.route("/api/config", methods=["GET", "PUT"])
def greenhouse_config():
    if request.method == "GET":
        return jsonify(control_config)
    try:
        payload = request.get_json(force=True)
        for key in ("temperatureOn", "temperatureOff", "soilMoistureOn", "soilMoistureOff", "irrigationBurstSeconds", "irrigationSoakSeconds", "lightStartHour", "lightEndHour"):
            if key in payload:
                control_config[key] = float(payload[key])
        if isinstance(payload.get("modes"), dict):
            for actuator in control_config["modes"]:
                if payload["modes"].get(actuator) in ("auto", "manual"):
                    control_config["modes"][actuator] = payload["modes"][actuator]
        if isinstance(payload.get("manual"), dict):
            for actuator in control_config["manual"]:
                if actuator in payload["manual"]:
                    control_config["manual"][actuator] = bool(payload["manual"][actuator])
        if control_config["temperatureOff"] >= control_config["temperatureOn"]:
            raise ValueError("Fan off threshold must be lower than fan on threshold")
        if not (1 <= control_config["irrigationBurstSeconds"] <= 60 and 1 <= control_config["irrigationSoakSeconds"] <= 300):
            raise ValueError("Irrigation durations must be between 1 and 60/300 seconds")
        if not (0 <= control_config["lightStartHour"] <= 23 and 0 <= control_config["lightEndHour"] <= 23):
            raise ValueError("Grow-light hours must be from 0 through 23")
        return jsonify({"ok": True, "config": control_config})
    except (TypeError, ValueError) as error:
        return jsonify({"ok": False, "error": str(error)}), 400

@app.route("/latest.jpg")
def latest_image():
    if os.path.exists("latest.jpg"):
        return send_file("latest.jpg", mimetype="image/jpeg")
    return "", 204

latest_result = {}

@app.route("/latest_result")
def get_latest_result():
    return jsonify(latest_result)

@app.route("/upload_json", methods=["POST"])
def upload_json():
    try:
        file     = request.files["image"]
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)

        img = Image.open(filepath).convert("RGB")
        img = np.array(img)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        prediction, confidence = plant_pipeline(img)
        annotated_image = annotated_image_data_url(img, prediction, confidence)
        # Specification: email a confident disease finding. Healthy and uncertain
        # classifications do not generate a biological-threat alert.
        if confidence > 0.85 and "healthy" not in prediction.lower() and "uncertain" not in prediction.lower():
            send_email_alert_async(
                {"timestamp": utc_now(), "disease": prediction, "confidence": round(confidence, 3)},
                [f"Disease detected: {prediction} ({confidence * 100:.1f}% confidence)."]
            )

        return jsonify({
            "prediction": prediction,
            "confidence": round(confidence, 3),
            "annotated_image": annotated_image,
            "guidance": disease_guidance(prediction, confidence),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/predict", methods=["POST"])
def predict():
    global latest_result
    try:
        img = decode_image(request)
        cv2.imwrite("latest.jpg", img)

        prediction, confidence = plant_pipeline(img)

        latest_result = {
            "prediction": prediction,
            "confidence": round(confidence, 3)
        }

        print(f"ESP32 → {prediction} ({round(confidence * 100, 1)}%)")
        return jsonify(latest_result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── RUN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
