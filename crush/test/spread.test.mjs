import { test } from "node:test";
import assert from "node:assert/strict";
import { diameterFor, zoomScale, spread, MIN_D, MAX_D } from "../public/assets/js/spread.js";

test("diameter grows with sqrt(members) within 56–150px", () => {
  assert.equal(diameterFor(0), MIN_D);
  assert.ok(diameterFor(100) > diameterFor(25));
  assert.equal(diameterFor(1e6), MAX_D);
});

test("zoom scale floors at 40%", () => {
  assert.equal(zoomScale(2), 0.4);
  assert.equal(zoomScale(12), 1);
});

test("spread separates overlapping bubbles without overlap", () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i, y: 100, d: 80, box: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 } }));
  const out = spread(items);
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++)
      assert.ok(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y) >= (out[i].d + out[j].d) / 2 - 0.5);
  assert.ok(out.every((b) => b.d >= 80 * 0.4 - 1e-9));
});

test("spread is deterministic and keeps centres in county box", () => {
  const box = { minX: 90, minY: 90, maxX: 110, maxY: 110 };
  const items = [{ x: 100, y: 100, d: 60, box }, { x: 100, y: 100, d: 60, box }];
  const a = spread(items), b = spread(items);
  assert.deepEqual(a, b);
  for (const p of a) assert.ok(p.x >= 90 && p.x <= 110 && p.y >= 90 && p.y <= 110);
});
