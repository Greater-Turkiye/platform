/* Greater Türkiye — fast orthographic paths for the home globe (Canvas 2D).
   Draws GeoJSON the way d3.geoPath(d3.geoOrthographic().clipAngle(90).precision(0.6)) does, without d3's
   per-point trigonometry: each vertex becomes a unit vector once, and a frame projects it with three dot products.
   The output follows d3: polygons crossing the horizon are closed along the limb, lines stop at it, and segments
   are subdivided by d3's own resampling rule, so a still frame drawn either way matches within anti-aliasing.
   Parts (each polygon of a MultiPolygon, each line) are culled by a bounding cap before any vertex is touched.
   Assumes every polygon is smaller than a hemisphere (true for countries and the map's overlays); the rare part
   whose limb crossing can't be resolved locally is handed to d3. */
(function () {
  'use strict';
  const RAD = Math.PI / 180;
  const DELTA2_STILL = 0.36; // d3: precision 0.6 px, squared
  const DELTA2_MOVING = 1; // moving frames: 1 px is plenty
  let DELTA2 = DELTA2_STILL;
  const COS_MIN = Math.cos(30 * RAD); // d3: always subdivide segments longer than 30°
  const MAX_DEPTH = 16; // d3: resampling recursion limit
  const COS_BIG = Math.cos(45 * RAD); // parts wider than this may enclose the far pole of the view: d3 closes them
  const CULL_MARGIN = 40; // px beyond the canvas still drawn (stroke widths, dashes, shadow blur)

  const prepared = new WeakMap(); // geometry object → { polys, lines }

  function toUnits(ring, closed) {
    let n = ring.length;
    if (closed && n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
    const v = new Float64Array(n * 3);
    for (let i = 0, k = 0; i < n; i++, k += 3) {
      const l = ring[i][0] * RAD, p = ring[i][1] * RAD, cp = Math.cos(p);
      v[k] = cp * Math.cos(l); v[k + 1] = cp * Math.sin(l); v[k + 2] = Math.sin(p);
    }
    return v;
  }
  // smallest-ish cap holding every vertex: centre = normalised mean, radius = farthest vertex; null = never culled
  function capOf(arrays) {
    let x = 0, y = 0, z = 0, n = 0;
    for (const v of arrays) for (let k = 0; k < v.length; k += 3) { x += v[k]; y += v[k + 1]; z += v[k + 2]; n++; }
    const len = Math.hypot(x, y, z);
    if (!n || len < 1e-6 * n) return null;
    x /= len; y /= len; z /= len;
    let cos = 1;
    for (const v of arrays) for (let k = 0; k < v.length; k += 3) cos = Math.min(cos, v[k] * x + v[k + 1] * y + v[k + 2] * z);
    if (cos <= 0.02) return null;
    return { x, y, z, cos, sin: Math.sqrt(1 - cos * cos), chord: Math.sqrt(2 - 2 * cos) };
  }
  function prep(o) {
    let p = prepared.get(o);
    if (p) return p;
    p = { polys: [], lines: [] };
    const g = o.type === 'Feature' ? o.geometry : o;
    const poly = (rings) => {
      const rs = rings.map((r) => toUnits(r, true)).filter((r) => r.length >= 9);
      if (rs.length) p.polys.push({ rings: rs, cap: capOf(rs), coords: rings });
    };
    const line = (pts) => {
      const v = toUnits(pts, false);
      if (v.length >= 6) p.lines.push({ pts: v, cap: capOf([v]) });
    };
    if (g) {
      if (g.type === 'Polygon') poly(g.coordinates);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly);
      else if (g.type === 'LineString') line(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(line);
      else if (g.type === 'GeometryCollection') for (const c of g.geometries) { const q = prep(c); p.polys.push(...q.polys); p.lines.push(...q.lines); }
    }
    prepared.set(o, p);
    return p;
  }

  /* ---- view (module state, set once per frame) ---- */
  let D0 = 1, D1 = 0, D2 = 0, R0 = 0, R1 = 1, R2 = 0, U0 = 0, U1 = 0, U2 = 1, S = 1, TX = 0, TY = 0, VW = 0, VH = 0;
  let CT = null; // path target of the current call
  let FAST = false; // moving frames: coarser resampling, rings closed with a line instead of closePath (cheaper in Chrome)
  const view = { d: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1], s: 1, x: 0, y: 0 };
  const fbProj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const fbPath = d3.geoPath(fbProj);
  const unit = (lon, lat) => { const l = lon * RAD, p = lat * RAD, cp = Math.cos(p); return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]; };

  function setView(rotate, scale, translate, width, height, fast) {
    FAST = !!fast;
    DELTA2 = FAST ? DELTA2_MOVING : DELTA2_STILL;
    const rot = d3.geoRotation(rotate);
    const d = unit(...rot.invert([0, 0])), r = unit(...rot.invert([90, 0])), u = unit(...rot.invert([0, 90]));
    [D0, D1, D2] = d; [R0, R1, R2] = r; [U0, U1, U2] = u;
    S = scale; TX = translate[0]; TY = translate[1]; VW = width; VH = height;
    Object.assign(view, { d, r, u, s: S, x: TX, y: TY });
    fbProj.rotate(rotate).scale(scale).translate(translate).precision(FAST ? 1 : 0.6);
  }

  // 0 = cull, 1 = wholly in front (no clipping), 2 = may cross the horizon
  function cull(cap) {
    if (!cap) return 2;
    const dc = cap.x * D0 + cap.y * D1 + cap.z * D2;
    if (dc < -cap.sin) return 0;
    // orthographic projection never stretches distances: the cap lands within S·chord of its centre's projection
    const px = TX + S * (cap.x * R0 + cap.y * R1 + cap.z * R2), py = TY - S * (cap.x * U0 + cap.y * U1 + cap.z * U2);
    const rr = S * cap.chord + CULL_MARGIN;
    if (px + rr < 0 || px - rr > VW || py + rr < 0 || py - rr > VH) return 0;
    return dc > cap.sin ? 1 : 2;
  }

  // scratch: rotated unit vector (A = depth, B = right, C = up) and screen position per vertex
  let A = new Float64Array(0), B = A, C = A, X = A, Y = A;
  function project(v) {
    const n = v.length / 3;
    if (A.length < n) { const m = Math.max(n, A.length * 2); A = new Float64Array(m); B = new Float64Array(m); C = new Float64Array(m); X = new Float64Array(m); Y = new Float64Array(m); }
    for (let i = 0, k = 0; i < n; i++, k += 3) {
      const x = v[k], y = v[k + 1], z = v[k + 2];
      const b = x * R0 + y * R1 + z * R2, c = x * U0 + y * U1 + z * U2;
      A[i] = x * D0 + y * D1 + z * D2; B[i] = b; C[i] = c; X[i] = TX + S * b; Y[i] = TY - S * c;
    }
    return n;
  }

  /* path output. Moving frames drop a vertex closer than a pixel to the last one drawn: at orbit size the 1:110m
     outlines are mostly sub-pixel steps, and every edge costs rasterisation time. */
  const EPS2 = 1;
  let LX = NaN, LY = NaN;
  function M(x, y) { CT.moveTo(x, y); LX = x; LY = y; }
  function L(x, y) {
    if (FAST) { const dx = x - LX, dy = y - LY; if (dx * dx + dy * dy < EPS2) return; }
    CT.lineTo(x, y); LX = x; LY = y;
  }

  // d3's adaptive resampling (d3-geo resample.js) on rotated unit vectors: same tests, no trigonometry
  function resample(x0, y0, a0, b0, c0, x1, y1, a1, b1, c1, depth) {
    const dx = x1 - x0, dy = y1 - y0, d2 = dx * dx + dy * dy;
    if (d2 > 4 * DELTA2 && depth--) {
      let a = a0 + a1, b = b0 + b1, c = c0 + c1;
      const m = Math.sqrt(a * a + b * b + c * c);
      a /= m; b /= m; c /= m;
      const x2 = TX + S * b, y2 = TY - S * c, dx2 = x2 - x0, dy2 = y2 - y0, dz = dy * dx2 - dx * dy2;
      if (dz * dz / d2 > DELTA2 || Math.abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 || a0 * a1 + b0 * b1 + c0 * c1 < COS_MIN) {
        resample(x0, y0, a0, b0, c0, x2, y2, a, b, c, depth);
        L(x2, y2);
        resample(x2, y2, a, b, c, x1, y1, a1, b1, c1, depth);
      }
    }
  }
  const seg = (i, j) => { resample(X[i], Y[i], A[i], B[i], C[i], X[j], Y[j], A[j], B[j], C[j], MAX_DEPTH); L(X[j], Y[j]); };
  const wrap = (x) => (x > Math.PI ? x - 2 * Math.PI : x < -Math.PI ? x + 2 * Math.PI : x);
  // horizon crossing on the great-circle segment i → j (one end visible): the limb point, as [right, up]
  const cross = (i, j) => {
    const t = A[i] / (A[i] - A[j]);
    const b = B[i] + t * (B[j] - B[i]), c = C[i] + t * (C[j] - C[i]), n = Math.hypot(b, c);
    return [b / n, c / n];
  };

  function closedRing(n) {
    M(X[0], Y[0]);
    for (let i = 1; i < n; i++) seg(i - 1, i);
    resample(X[n - 1], Y[n - 1], A[n - 1], B[n - 1], C[n - 1], X[0], Y[0], A[0], B[0], C[0], MAX_DEPTH);
    if (FAST) CT.lineTo(X[0], Y[0]); else CT.closePath();
  }

  /* A ring that crosses the horizon: visible stretches are drawn as they are; each hidden stretch is replaced by the
     limb arc from where it leaves to where it comes back. The arc turns the way the hidden vertices turn around the
     view axis (for a ring that doesn't enclose the far pole of the view, the hidden stretch and the arc enclose the
     hidden area together), which is how d3 closes it too. Returns false (nothing drawn with emit=false) when a hidden
     stretch turns more than half a circle, the one case this rule can't vouch for. */
  function crossingRing(n, emit) {
    let s0 = -1;
    for (let i = 0; i < n; i++) if (A[i] <= 0 && A[i + 1 === n ? 0 : i + 1] > 0) { s0 = i; break; }
    if (s0 < 0) return true;
    const j0 = s0 + 1 === n ? 0 : s0 + 1;
    const [eb, ec] = cross(j0, s0);
    if (emit) {
      const ex = TX + S * eb, ey = TY - S * ec;
      M(ex, ey);
      resample(ex, ey, 0, eb, ec, X[j0], Y[j0], A[j0], B[j0], C[j0], MAX_DEPTH);
      L(X[j0], Y[j0]);
    }
    let az0 = 0, last = 0, sweep = 0;
    for (let k = 1; k <= n; k++) {
      const i = (s0 + k) % n, j = i + 1 === n ? 0 : i + 1;
      if (A[i] > 0) {
        if (A[j] > 0) { if (emit) seg(i, j); continue; }
        const [pb, pc] = cross(i, j); // leaves
        if (emit) { const px = TX + S * pb, py = TY - S * pc; resample(X[i], Y[i], A[i], B[i], C[i], px, py, 0, pb, pc, MAX_DEPTH); L(px, py); }
        az0 = last = Math.atan2(pc, pb); sweep = 0;
        continue;
      }
      const az = Math.atan2(C[i], B[i]);
      sweep += wrap(az - last); last = az;
      if (A[j] <= 0) continue;
      const [qb, qc] = k === n ? [eb, ec] : cross(j, i); // comes back
      sweep += wrap(Math.atan2(qc, qb) - last);
      if (Math.abs(sweep) > Math.PI) return false;
      if (emit) {
        CT.arc(TX, TY, S, -az0, -(az0 + sweep), sweep > 0); LX = NaN;
        if (k < n) { const qx = TX + S * qb, qy = TY - S * qc; resample(qx, qy, 0, qb, qc, X[j], Y[j], A[j], B[j], C[j], MAX_DEPTH); L(X[j], Y[j]); }
      }
    }
    if (emit && !FAST) CT.closePath(); // the last limb arc already ends where the ring started
    return true;
  }

  function polyPart(part) {
    const vis = cull(part.cap);
    if (!vis) return;
    if (vis === 1) { for (const ring of part.rings) closedRing(project(ring)); return; }
    // may cross: check first, so a part the limb rule can't vouch for goes to d3 whole
    let ok = true;
    for (const ring of part.rings) {
      const n = project(ring);
      let vis0 = false, hid = false;
      for (let i = 0; i < n; i++) if (A[i] > 0) vis0 = true; else hid = true;
      if (vis0 && hid && (!part.cap || part.cap.cos < COS_BIG || !crossingRing(n, false))) { ok = false; break; }
    }
    if (!ok) { fbPath.context(CT)({ type: 'Polygon', coordinates: part.coords }); return; }
    for (const ring of part.rings) {
      const n = project(ring);
      let vis0 = false, hid = false;
      for (let i = 0; i < n; i++) if (A[i] > 0) vis0 = true; else hid = true;
      if (!vis0) continue; // wholly behind the horizon
      if (!hid) closedRing(n); else crossingRing(n, true);
    }
  }

  function linePart(part) {
    const vis = cull(part.cap);
    if (!vis) return;
    const n = project(part.pts);
    if (vis === 1) { M(X[0], Y[0]); for (let i = 1; i < n; i++) seg(i - 1, i); return; }
    let prev = false;
    for (let i = 0; i < n; i++) {
      if (A[i] > 0) {
        if (i === 0) M(X[0], Y[0]);
        else if (!prev) { // comes back over the horizon
          const [pb, pc] = cross(i, i - 1), px = TX + S * pb, py = TY - S * pc;
          M(px, py);
          resample(px, py, 0, pb, pc, X[i], Y[i], A[i], B[i], C[i], MAX_DEPTH);
          L(X[i], Y[i]);
        } else seg(i - 1, i);
        prev = true;
      } else {
        if (prev) { // leaves
          const [pb, pc] = cross(i - 1, i), px = TX + S * pb, py = TY - S * pc;
          resample(X[i - 1], Y[i - 1], A[i - 1], B[i - 1], C[i - 1], px, py, 0, pb, pc, MAX_DEPTH);
          L(px, py);
        }
        prev = false;
      }
    }
  }

  // append the outline of `o` (Feature, FeatureCollection, any geometry, or {type:'Sphere'}) to context `c`
  function path(c, o) {
    if (!o) return;
    if (o.type === 'FeatureCollection') { for (const f of o.features) path(c, f); return; }
    CT = c;
    if (o.type === 'Sphere') { c.moveTo(TX + S, TY); c.arc(TX, TY, S, 0, 2 * Math.PI); return; }
    const p = prep(o);
    for (const part of p.polys) polyPart(part);
    for (const part of p.lines) linePart(part);
  }

  // screen bounds of what `path` would draw ([[x0, y0], [x1, y1]], Infinity when nothing is visible)
  function bounds(o) {
    const b = [[Infinity, Infinity], [-Infinity, -Infinity]];
    const add = (x, y) => { if (x < b[0][0]) b[0][0] = x; if (y < b[0][1]) b[0][1] = y; if (x > b[1][0]) b[1][0] = x; if (y > b[1][1]) b[1][1] = y; };
    path({ moveTo: add, lineTo: add, closePath() {}, arc(cx, cy, r, a0, a1) { add(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); add(cx + r * Math.cos(a1), cy + r * Math.sin(a1)); } }, o);
    return b;
  }

  // cheap pre-test for d3.geoContains: can [lon, lat] lie inside `f` at all?
  function mayContain(f, ll) {
    const [x, y, z] = unit(ll[0], ll[1]);
    return prep(f).polys.some((p) => !p.cap || x * p.cap.x + y * p.cap.y + z * p.cap.z >= p.cap.cos - 1e-9);
  }

  GT.ortho = { setView, path, bounds, prepare: prep, mayContain, unit, view };
})();
