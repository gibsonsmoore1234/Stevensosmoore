// Bubble sizing and the two-phase anti-overlap layout ("spread bubbles").
// Pure functions on screen-space points so they can be unit tested.

export const MIN_D = 56;
export const MAX_D = 150;
export const MIN_ZOOM_SCALE = 0.4;
export const NUDGE_ITERATIONS = 120;

// Diameter grows with the square root of member count, clamped to 56–150px.
export function diameterFor(members) {
  return Math.max(MIN_D, Math.min(MAX_D, MIN_D + 9 * Math.sqrt(Math.max(0, members))));
}

// Zoomed out to the whole country (≈ zoom 4) bubbles shrink uniformly to a 40% floor.
export function zoomScale(zoom, fullZoom = 9, countryZoom = 4) {
  const t = (zoom - countryZoom) / (fullZoom - countryZoom);
  return Math.max(MIN_ZOOM_SCALE, Math.min(1, MIN_ZOOM_SCALE + (1 - MIN_ZOOM_SCALE) * t));
}

// items: [{ x, y, d, box: { minX, minY, maxX, maxY } }] in pixels; box = the
// origin county's bounding box. Returns new [{ x, y, d }] in the same order.
export function spread(items, { minScale = MIN_ZOOM_SCALE, iterations = NUDGE_ITERATIONS, gap = 2 } = {}) {
  const out = items.map((b) => ({ ...b }));
  if (out.length < 2) return out.map(({ x, y, d }) => ({ x, y, d }));

  // Phase 1 — uniform shrink: find the largest scale at which no pair touches,
  // but never below minScale (phase 2 resolves whatever is left).
  let scale = 1;
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const need = (a.d + b.d) / 2 + gap;
      if (dist < need) scale = Math.min(scale, dist / need);
    }
  }
  scale = Math.max(minScale, scale);
  for (const b of out) b.d *= scale;

  // Phase 2 — deterministic pairwise nudging, clamped to each county's box.
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const need = (a.d + b.d) / 2 + gap;
        if (dist >= need) continue;
        if (dist < 1e-6) {
          // Coincident centres: separate along a fixed, index-derived angle.
          const ang = (i * 2.399963 + j) % (2 * Math.PI);
          dx = Math.cos(ang); dy = Math.sin(ang); dist = 1;
        }
        const push = (need - dist) / 2;
        const ux = dx / dist, uy = dy / dist;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        clamp(a); clamp(b);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out.map(({ x, y, d }) => ({ x, y, d }));
}

function clamp(b) {
  if (!b.box) return;
  b.x = Math.max(b.box.minX, Math.min(b.box.maxX, b.x));
  b.y = Math.max(b.box.minY, Math.min(b.box.maxY, b.y));
}
