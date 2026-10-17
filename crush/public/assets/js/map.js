// Tab 1 — interactive map of the lower-48 US.
// Leaflet + CARTO light_all tiles, county outlines from /api/geo/us (TopoJSON),
// user-placed community bubbles laid out with spread.js.

import { diameterFor, zoomScale, spread } from "./spread.js";
import * as data from "./data.js";

const L = window.L;
const US_BOUNDS = [[24.4, -125.0], [49.5, -66.9]];
const EXCLUDED_STATES = new Set(["02", "15", "60", "66", "69", "72", "78"]); // AK, HI, territories

let map, countyLayer, bubbleLayer, pendingMarker;
let counties = []; // { fips, feature, layer, bounds }
let bubbles = [];
let onBubbleClick = () => {};

export async function initMap(el, { onSelect }) {
  onBubbleClick = onSelect;
  map = L.map(el, {
    zoomControl: false,
    minZoom: 3,
    maxBounds: L.latLngBounds(US_BOUNDS).pad(0.25),
    maxBoundsViscosity: 0.8,
    attributionControl: true,
  }).fitBounds(US_BOUNDS);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 12,
  }).addTo(map);

  bubbleLayer = L.layerGroup().addTo(map);
  map.on("click", (e) => placePending(e.latlng));
  map.on("zoomend moveend", renderBubbles);

  await loadCounties();
  await refresh();
}

// Call when the tab becomes visible again; Leaflet can't measure a hidden container.
export function onShow() {
  map?.invalidateSize();
  renderBubbles();
}

export function resetView() {
  map.flyToBounds(US_BOUNDS, { duration: 0.8 });
}

export async function refresh() {
  bubbles = await data.listBubbles();
  const active = new Set(bubbles.map((b) => b.county_fips));
  for (const c of counties) c.layer.setStyle(countyStyle(active.has(c.fips)));
  renderBubbles();
}

async function loadCounties() {
  const res = await fetch("/api/geo/us");
  const topo = await res.json();
  const fc = window.topojson.feature(topo, topo.objects.counties);
  fc.features = fc.features.filter((f) => !EXCLUDED_STATES.has(String(f.id).padStart(5, "0").slice(0, 2)));
  countyLayer = L.geoJSON(fc, { style: countyStyle(false), interactive: false }).addTo(map);
  countyLayer.eachLayer((layer) => {
    counties.push({ fips: String(layer.feature.id).padStart(5, "0"), feature: layer.feature, layer, bounds: layer.getBounds() });
  });
  const states = window.topojson.mesh(topo, topo.objects.states, (a, b) => a !== b);
  L.geoJSON(states, { style: { color: "#09090B", weight: 0.8, opacity: 0.5, fill: false }, interactive: false }).addTo(map);
}

function countyStyle(active) {
  return active
    ? { color: "#3F3F46", weight: 0.4, fillColor: "#52525B", fillOpacity: 0.85 }
    : { color: "#A1A1AA", weight: 0.3, fillColor: "#D4D4D8", fillOpacity: 0.25 };
}

export function countyAt(latlng) {
  for (const c of counties) {
    if (!c.bounds.contains(latlng)) continue;
    if (pointInFeature([latlng.lng, latlng.lat], c.feature.geometry)) return c;
  }
  return null;
}

function pointInFeature(pt, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  return polys.some((rings) => inRing(pt, rings[0]) && !rings.slice(1).some((hole) => inRing(pt, hole)));
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function placePending(latlng) {
  const county = countyAt(latlng);
  if (!county) return;
  if (pendingMarker) pendingMarker.remove();
  pendingMarker = L.marker(latlng, {
    icon: L.divIcon({ className: "pending-pin", html: "<span>+</span>", iconSize: [44, 44], iconAnchor: [22, 22] }),
    keyboard: false,
  }).addTo(map);

  const form = document.createElement("form");
  form.className = "pin-form";
  form.innerHTML = `
    <label>Name this community<input name="name" required minlength="2" maxlength="60" placeholder="e.g. Duke Students"></label>
    <div class="row"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">Create bubble</button></div>
    <p class="err" hidden></p>`;
  form.querySelector("[data-cancel]").onclick = clearPending;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector(".err");
    try {
      await data.createBubble({ name: form.name.value.trim(), lat: latlng.lat, lng: latlng.lng, county_fips: county.fips });
      clearPending();
      await refresh();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  };
  pendingMarker.bindPopup(form, { closeButton: false, className: "crush-popup", offset: [0, -16] }).openPopup();
  pendingMarker.on("popupclose", clearPending);
  setTimeout(() => form.name.focus(), 50);
}

function clearPending() {
  if (!pendingMarker) return;
  const m = pendingMarker;
  pendingMarker = null;
  m.off("popupclose");
  m.remove();
}

function renderBubbles() {
  if (!map) return;
  bubbleLayer.clearLayers();
  const s = zoomScale(map.getZoom());
  const items = bubbles.map((b) => {
    const p = map.latLngToLayerPoint([b.lat, b.lng]);
    const c = counties.find((x) => x.fips === b.county_fips);
    let box = null;
    if (c) {
      const nw = map.latLngToLayerPoint(c.bounds.getNorthWest());
      const se = map.latLngToLayerPoint(c.bounds.getSouthEast());
      box = { minX: nw.x, minY: nw.y, maxX: se.x, maxY: se.y };
    }
    return { x: p.x, y: p.y, d: diameterFor(b.members) * s, box };
  });
  const laid = spread(items);
  // Larger bubbles first so smaller ones sit on top and stay clickable.
  const order = laid.map((_, i) => i).sort((a, b) => laid[b].d - laid[a].d);
  order.forEach((i, z) => {
    const b = bubbles[i], { x, y, d } = laid[i];
    const icon = L.divIcon({
      className: "bubble",
      html: `<div class="bubble-inner" style="width:${d}px;height:${d}px;font-size:${Math.max(9, d / 7)}px">
               ${b.logo_url ? `<img src="${escapeAttr(b.logo_url)}" alt="">` : ""}
               <span>${escapeHtml(b.name)}</span><small>${b.members}</small></div>`,
      iconSize: [d, d],
      iconAnchor: [d / 2, d / 2],
    });
    L.marker(map.layerPointToLatLng([x, y]), { icon, zIndexOffset: z, title: b.name })
      .on("click", (e) => { L.DomEvent.stopPropagation(e); onBubbleClick(b); })
      .addTo(bubbleLayer);
  });
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escapeAttr = escapeHtml;
