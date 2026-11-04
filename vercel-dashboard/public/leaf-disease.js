(() => {
  const mount = () => {
    const root = document.querySelector("main.shell");
    if (!root || document.getElementById("leaf-disease-panel")) return;
    const style = document.createElement("style");
    style.textContent = `
      .leaf-panel{margin-top:16px;overflow:hidden}.leaf-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:17px}.leaf-heading h2{font-size:18px}.scan-tag{font:700 10px "DM Mono",monospace;letter-spacing:.7px;padding:7px 9px;border-radius:8px;background:rgba(25,174,196,.12);color:#1592a6}.leaf-grid{display:grid;grid-template-columns:1.12fr .88fr;gap:16px}.leaf-frame{position:relative;overflow:hidden;min-height:270px;border-radius:16px;background:radial-gradient(circle at 40% 15%,#265f70,#0c1c36 65%);display:grid;place-items:center}.leaf-frame:before{content:"";position:absolute;inset:14px;border:1px dashed rgba(189,244,232,.42);border-radius:11px;pointer-events:none}.leaf-frame:after{content:"";position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,transparent,#6cf1cb,transparent);opacity:0;animation:scan 2.2s infinite}.leaf-frame.scanning:after{opacity:1}.leaf-frame video,.leaf-frame img{position:relative;width:100%;height:100%;min-height:270px;object-fit:contain;z-index:1}.leaf-placeholder{position:relative;z-index:2;max-width:260px;color:#d9f4fa;padding:20px;text-align:center;line-height:1.6}.leaf-placeholder b{display:block;margin-bottom:5px;color:#fff;font-size:15px}.leaf-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:11px}.leaf-button,.leaf-upload{border:1px solid transparent;border-radius:11px;padding:10px 13px;background:linear-gradient(120deg,#5576f5,#8c65ef);color:#fff;font:700 12px Manrope,sans-serif;cursor:pointer;box-shadow:0 8px 18px rgba(85,118,245,.23)}.leaf-button.alt,.leaf-upload{background:color-mix(in srgb,var(--surface-solid) 80%,transparent);color:var(--text);border-color:var(--line);box-shadow:none}.leaf-upload input{display:none}.leaf-result{min-height:320px;border:1px solid var(--line);border-radius:16px;padding:17px;background:linear-gradient(145deg,color-mix(in srgb,var(--teal) 8%,var(--surface-solid)),var(--surface-solid))}.leaf-result h3{margin:0 0 8px;font-size:13px}.leaf-result p{color:var(--muted);font-size:12px;line-height:1.5}.leaf-result img{width:100%;max-height:220px;object-fit:contain;border-radius:11px;display:none;margin:10px 0}.leaf-name{font-size:20px;font-weight:800;line-height:1.25;letter-spacing:-.5px}.leaf-confidence{color:var(--teal);font:700 11px "DM Mono",monospace;margin:5px 0 10px}.leaf-guidance{display:grid;gap:6px;margin-top:11px}.leaf-guidance-item{font-size:11px;color:var(--muted);line-height:1.45;padding-left:13px;position:relative}.leaf-guidance-item:before{content:"";position:absolute;left:0;top:.5em;width:5px;height:5px;border-radius:50%;background:var(--green)}@keyframes scan{0%{transform:translateY(0)}50%{transform:translateY(265px)}100%{transform:translateY(0)}}@media(max-width:800px){.leaf-grid{grid-template-columns:1fr}.leaf-frame{min-height:230px}}`;
    document.head.appendChild(style);
    root.insertAdjacentHTML("beforeend", `<section class="card leaf-panel" id="leaf-disease-panel"><div class="leaf-heading"><div><h2>Leaf health studio</h2><p class="muted">Scan a single, well-lit leaf for a model-based diagnosis and practical next actions.</p></div><span class="scan-tag">AI VISION</span></div><div class="leaf-grid"><div><div class="leaf-frame" id="leaf-frame"><video id="leaf-video" autoplay muted playsinline></video><div id="leaf-placeholder" class="leaf-placeholder"><b>Ready to inspect a leaf</b>Open your camera or upload a sharp close-up. Keep the leaf centred and use even daylight.</div></div><div class="leaf-actions"><button class="leaf-button alt" id="open-leaf-camera">Open camera</button><button class="leaf-button" id="capture-leaf">Capture & analyze</button><label class="leaf-upload">Upload image<input id="leaf-file" type="file" accept="image/*"></label></div></div><div class="leaf-result"><h3>Diagnosis & care</h3><p id="leaf-message">Checking disease-analysis service…</p><img id="leaf-annotated" alt="Annotated leaf diagnosis"><div id="leaf-name" class="leaf-name"></div><div id="leaf-confidence" class="leaf-confidence"></div><div id="leaf-guidance" class="leaf-guidance"></div></div></div></section>`);
    const $ = (id) => document.getElementById(id);
    const apiUrl = (window.GREENHOUSE_CONFIG?.diseaseApiUrl || "").replace(/\/+$/, "");
    let stream;
    const setMessage = (message) => { $("leaf-message").textContent = message; };
    const showGuidance = (guidance) => {
      const target = $("leaf-guidance"); target.innerHTML = "";
      const items = Array.isArray(guidance) ? guidance : (guidance?.actions || guidance?.recommendations || []);
      items.slice(0, 4).forEach((item) => { const line = document.createElement("div"); line.className = "leaf-guidance-item"; line.textContent = typeof item === "string" ? item : (item?.text || item?.action || ""); if (line.textContent) target.appendChild(line); });
    };
    async function openCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        $("leaf-video").srcObject = stream; $("leaf-placeholder").style.display = "none";
        setMessage("Camera ready. Capture a well-lit leaf photo.");
      } catch { setMessage("Camera access was not granted. You can still upload an image."); }
    }
    async function analyze(file) {
      if (!apiUrl) { setMessage("Connect the analysis service: set DISEASE_API_URL in Vercel after the Render backend is live."); return; }
      const frame = $("leaf-frame"); frame.classList.add("scanning"); setMessage("Scanning leaf pattern and preparing care guidance…");
      $("leaf-name").textContent = ""; $("leaf-confidence").textContent = ""; $("leaf-guidance").innerHTML = "";
      try {
        const form = new FormData(); form.append("image", file, file.name || "webcam-leaf.jpg");
        const response = await fetch(`${apiUrl}/upload_json`, { method: "POST", body: form });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Analysis failed");
        setMessage("Scan complete · review the suggested next actions below.");
        $("leaf-name").textContent = String(data.prediction || "Unknown").replaceAll("___", " – ").replaceAll("_", " ");
        $("leaf-confidence").textContent = `${(Number(data.confidence || 0) * 100).toFixed(1)}% MODEL CONFIDENCE`;
        showGuidance(data.guidance);
        if (data.annotated_image) { $("leaf-annotated").src = data.annotated_image; $("leaf-annotated").style.display = "block"; }
      } catch (error) { setMessage(`Analysis unavailable: ${error.message}`); }
      finally { frame.classList.remove("scanning"); }
    }
    $("open-leaf-camera").onclick = openCamera;
    $("capture-leaf").onclick = () => { const video = $("leaf-video"); if (!video.videoWidth) { openCamera(); return; } const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d").drawImage(video, 0, 0); canvas.toBlob((blob) => blob && analyze(new File([blob], "webcam-leaf.jpg", { type: "image/jpeg" })), "image/jpeg", .92); };
    $("leaf-file").onchange = (event) => { const file = event.target.files?.[0]; if (file) analyze(file); };
    setMessage(apiUrl ? "Ready for a leaf image." : "Connect the Render scanner by adding DISEASE_API_URL in Vercel.");
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
