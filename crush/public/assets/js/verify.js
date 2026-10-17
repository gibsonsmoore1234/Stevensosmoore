// Live selfie capture (WebRTC) with an on-device presence check.
//
// The browser check only screens out the obvious — a frozen frame, a photo held
// perfectly still, a dark or blank camera. It is NOT the liveness / face-match
// decision: the two selfies and profile photos are uploaded privately and an
// account becomes "verified" only when your liveness vendor or a moderator
// sets it with the service role (see README → Identity verification).

const SAMPLE_MS = 2500;
const SAMPLE_EVERY = 100;

export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open a camera. Try Chrome or Safari on a phone or laptop.");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

// Samples the centre of the frame for SAMPLE_MS and returns a JPEG blob of the
// last frame plus the presence metrics. Throws if the feed looks static/blank.
export async function captureLive(video, onProgress = () => {}) {
  const w = 64, h = 48;
  const small = document.createElement("canvas");
  small.width = w; small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });

  let prev = null, motion = [], light = [];
  const start = performance.now();
  while (performance.now() - start < SAMPLE_MS) {
    // Centre 60% of the frame, where the face should be.
    const vw = video.videoWidth, vh = video.videoHeight;
    sctx.drawImage(video, vw * 0.2, vh * 0.2, vw * 0.6, vh * 0.6, 0, 0, w, h);
    const px = sctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < gray.length; i++) { gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114; sum += gray[i]; }
    light.push(sum / gray.length);
    if (prev) {
      let d = 0;
      for (let i = 0; i < gray.length; i++) d += Math.abs(gray[i] - prev[i]);
      motion.push(d / gray.length);
    }
    prev = gray;
    onProgress((performance.now() - start) / SAMPLE_MS);
    await new Promise((r) => setTimeout(r, SAMPLE_EVERY));
  }

  const avgLight = light.reduce((a, b) => a + b, 0) / light.length;
  const moving = motion.filter((m) => m > 0.6).length / motion.length;
  const maxMotion = Math.max(...motion);
  if (avgLight < 35) throw new Error("It's too dark — face a light and try again.");
  if (moving < 0.15) throw new Error("We couldn't detect natural movement. Blink and move slightly while capturing.");
  if (maxMotion > 60) throw new Error("Too much movement — hold the camera steady and try again.");

  const faces = await detectFaces(video);
  if (faces === 0) throw new Error("No face found — centre your face in the frame.");
  if (faces > 1) throw new Error("Only one person should be in the frame.");

  const full = document.createElement("canvas");
  full.width = video.videoWidth; full.height = video.videoHeight;
  full.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((r) => full.toBlob(r, "image/jpeg", 0.9));
  return { blob, metrics: { avgLight: Math.round(avgLight), moving: +moving.toFixed(2), faces } };
}

// Uses the Shape Detection API where available (Chrome/Android); returns null
// (unknown) elsewhere so capture isn't blocked on browsers without it.
async function detectFaces(video) {
  if (!("FaceDetector" in window)) return null;
  try {
    return (await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(video)).length;
  } catch {
    return null;
  }
}

// Downscale an uploaded profile photo to ≤1280px JPEG.
export async function prepPhoto(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
}
