/* Greater Türkiye — home page.
   Hero: a canvas globe that orbits the whole world, then glides in and holds on Türkiye (radar sweep, labels,
   markers) before orbiting again. It starts on light 1:110m data and swaps in 1:50m detail for the hold once loaded.
   Reduced-motion users get the static SVG map instead. */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('hud-utc'));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = document.getElementById('hero-map');
  const hudRegion = document.getElementById('hud-region');
  const hudFocus = document.getElementById('hud-focus');
  const FOCUS = [-41, -35, 0]; // view centre 41°E 35°N: Türkiye with the Balkans, the Gulf and Pakistan in frame
  let hi = null; // 1:50m world, used by the static map and for the globe's hold on Türkiye
  let data = null;
  let dataFailed = false;

  initReveal();

  let globe = null;
  if (!reduce && document.createElement('canvas').getContext) {
    const lo = await GT.loadWorld('assets/data/countries-110m.json').catch((e) => { console.warn(e); return null; });
    if (lo) globe = createGlobe(lo);
  }
  if (globe) {
    GT.loadWorld('assets/data/countries-50m.json').then((w) => { hi = w; globe.setDetail(w); }).catch((e) => console.warn(e));
  } else {
    hi = await GT.loadWorld('assets/data/countries-50m.json').catch((e) => { console.warn(e); return null; });
    drawStatic();
  }
  window.addEventListener('resize', GT.debounce(() => (globe ? globe.resize() : drawStatic()), 160));

  try { data = await GT.loadData(); } catch (e) { dataFailed = true; console.warn(e); }
  renderData();
  if (globe) globe.refresh(); else drawStatic();

  document.addEventListener('gt:lang', () => { if (globe) globe.invalidate(); else drawStatic(); renderData(); });

  /* ================= animated globe (canvas) ================= */
  /* Layers, bottom to top:
     - halo:  the atmosphere of the moving globe, a CSS radial gradient scaled by the compositor;
     - move:  redrawn only while the camera moves (1:110m, no shadow blur) with the fast orthographic paths (ortho.js);
              sized to the globe, at a device-pixel ratio that steps down if frames run slow;
     - hold:  the still frame on Türkiye (1:50m, glows, exact atmosphere), rendered once and cross-faded by opacity after
              arrival and before departure — the hold looks exactly as before and costs nothing per frame;
     - sweep: the radar sweep, a CSS conic-gradient wedge turned by the compositor;
     - over:  labels, islands and sites, drawn once per hold and faded by opacity;
     - ev:    the pulsing event markers, a small canvas redrawn each frame. */
  function createGlobe(loWorld) {
    const R = GT.ortho;
    const layer = (tag) => { const c = document.createElement(tag); c.setAttribute('aria-hidden', 'true'); return c; };
    const haloEl = layer('div'), cvMove = layer('canvas'), cvHold = layer('canvas'), sweepEl = layer('div'), cvOver = layer('canvas'), cvEv = layer('canvas');
    cvOver.removeAttribute('aria-hidden');
    cvOver.setAttribute('role', 'img');
    cvOver.setAttribute('aria-label', GT.t('hero.mapAria'));
    sweepEl.className = 'globe-sweep';
    haloEl.className = 'globe-halo';
    cvHold.style.opacity = '0';
    cvEv.style.pointerEvents = 'none';
    host.replaceChildren(haloEl, cvMove, cvHold, sweepEl, cvOver, cvEv);
    // the still frame is opaque (it paints the page background), which lets the compositor skip what lies beneath it
    const mctx = cvMove.getContext('2d'), hctx = cvHold.getContext('2d', { alpha: false }), octx = cvOver.getContext('2d'), ectx = cvEv.getContext('2d');
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.6); // label and marker positions, hit-testing
    const grat = d3.geoGraticule().step([10, 10])();
    const gratMoving = d3.geoGraticule().step([10, 10]).precision(5)(); // fewer points; resampling keeps the curves
    const sphere = { type: 'Sphere' };

    // timeline (seconds): hold on Türkiye → depart → orbit → approach → hold …
    const T = { hold: 9, depart: 3.4, spin: 20, approach: 3.8 };
    const CYCLE = T.hold + T.depart + T.spin + T.approach;
    const V = 360 / (T.depart / 2 + T.spin + T.approach / 2); // orbit speed so each cycle is exactly one turn
    const SPIN_TILT = -26;
    const FADE = 0.35; // s: the still hold frame fades in after arrival and out before departure
    const JOB_BUDGET = 6; // ms per animation frame for re-rendering the hold frame in the background

    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, sFull = 0, sFocus = 0, narrow = false;
    // ?globe-t=<seconds> starts the cycle at a given moment (handy for reviewing each phase)
    let t = Math.max(0, Number(new URLSearchParams(location.search).get('globe-t')) || 0) % CYCLE;
    let last = performance.now(), visible = true, hudTick = 0, hudText = '', hover = null;
    let holdReady = false, holdAlpha = -1, moveKey = '', job = null, fontsPending = false;

    const styleOf = (a3) => {
      if (a3 === 'TUR') return 'tr';
      const p = GT.PARTNERS[a3];
      if (p) return p.tier;
      return GT.REGION_OF[a3] ? 'watch' : 'land';
    };
    const STYLE = {
      land: ['#161616', 'rgba(232,227,220,0.13)'],
      watch: ['#1b1818', 'rgba(232,227,220,0.15)'],
      ally: ['rgba(153,0,28,0.58)', 'rgba(200,0,42,0.85)'],
      coop: ['#300a13', 'rgba(153,0,28,0.72)'],
      kin: ['#241017', 'rgba(200,0,42,0.45)'],
    };
    const group = (world) => {
      const g = { land: [], watch: [], ally: [], coop: [], kin: [], tr: [], presence: [] };
      for (const f of world.countries) {
        const a = GT.a3(f);
        g[styleOf(a)].push(f);
        if (GT.PARTNERS[a] && GT.PARTNERS[a].presence) g.presence.push(f);
      }
      g.disputed = world.disputed.map((d) => ({ f: d, style: styleOf(d.properties.de_jure) }));
      g.borders = world.borders;
      g.all = [...world.countries, ...world.disputed, world.borders]; // what has to be prepared before drawing
      return g;
    };
    // G.lo: 1:110m (moving frames); G.hi: 1:50m once prepared; G.next: 1:50m being prepared in the background
    const G = { lo: group(loWorld), hi: null, next: null };
    const best = () => G.next || G.hi || G.lo;
    const TR_CENTROID = d3.geoCentroid(loWorld.countries.find((f) => GT.a3(f) === 'TUR'));
    const HOLD_CAM = { rot: FOCUS, phase: 'hold' };

    /* moving canvas: covers only the globe and its atmosphere; its pixel ratio starts at 1.5 (phones) / 2 and steps
       down by 0.25 while frames take longer than ~21 ms (down to 1, or 0.75 on phones: a moving globe hides it) */
    const mv = { x: 0, y: 0, w: 0, h: 0 };
    let moveCap = 1, moveDpr = 1, slowFrames = 0, moveWall = 0;
    function placeMove(s) {
      const m = s * 1.17 + 4, q = 32;
      const x0 = Math.max(0, Math.floor((cx - m) / q) * q), y0 = Math.max(0, Math.floor((cy - m) / q) * q);
      const w = Math.max(1, Math.min(W, Math.ceil((cx + m) / q) * q) - x0), h = Math.max(1, Math.min(H, Math.ceil((cy + m) / q) * q) - y0);
      const bw = Math.round(w * moveDpr), bh = Math.round(h * moveDpr);
      if (cvMove.width !== bw || cvMove.height !== bh) { cvMove.width = bw; cvMove.height = bh; }
      if (w !== mv.w || h !== mv.h) { cvMove.style.width = w + 'px'; cvMove.style.height = h + 'px'; }
      if (x0 !== mv.x || y0 !== mv.y) cvMove.style.transform = `translate(${x0}px,${y0}px)`;
      Object.assign(mv, { x: x0, y: y0, w, h });
    }
    function adapt() {
      const now = Date.now(), dt = now - moveWall; // wall clock between consecutive moving frames
      moveWall = now;
      if (dt > 200) return; // first frame after a pause
      slowFrames = dt > 21 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      const floor = narrow ? 0.75 : 1;
      if (slowFrames >= 8 && moveDpr > floor) { moveDpr = Math.max(floor, moveDpr - 0.25); slowFrames = 0; }
    }

    function resize() {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      narrow = W < 860;
      dpr = Math.min(2, window.devicePixelRatio || 1); // still frame and overlay: as sharp as before
      moveCap = moveDpr = Math.min(narrow ? 1.5 : 2, dpr);
      for (const c of [cvHold, cvOver]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      cx = narrow ? W * 0.5 : W * 0.63;
      // on phones the text and legend fill the lower half, so keep the globe in the top third
      cy = narrow ? H * 0.25 : H * 0.53;
      const rFocus = narrow ? Math.min(W * 0.62, H * 0.26) : Math.min(H * 0.5, W * 0.36);
      sFocus = rFocus / Math.sin((31 * Math.PI) / 180);
      sFull = narrow ? Math.min(W * 0.42, H * 0.22) : Math.min(H * 0.42, W * 0.3);
      HOLD_CAM.s = sFocus;
      moveKey = ''; labelsKey = ''; sweepKey = ''; haloKey = ''; mv.w = 0;
      // the still frame must match the new size right away
      job = null;
      const g = best();
      for (const f of g.all) R.prepare(f);
      setCamera(HOLD_CAM, false);
      run(drawGlobe(hctx, g, true, dpr, 0, 0));
      if (g === G.next) { G.hi = g; G.next = null; }
      holdReady = true;
      fontsPending = !!document.fonts && document.fonts.status !== 'loaded';
    }

    const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const geo = (a, b, u) => a * Math.pow(b / a, u);

    // camera state for time tt within the cycle
    function camera(tt) {
      if (tt < T.hold) return { rot: FOCUS, s: sFocus, phase: 'hold', u: tt / T.hold };
      let x = tt - T.hold;
      if (x < T.depart) {
        const u = x / T.depart, e = easeInOut(u);
        return { rot: [FOCUS[0] + (V * T.depart * u * u) / 2, FOCUS[1] + (SPIN_TILT - FOCUS[1]) * e, 0], s: geo(sFocus, sFull, e), phase: 'depart', u };
      }
      x -= T.depart;
      const l1 = FOCUS[0] + (V * T.depart) / 2;
      if (x < T.spin) return { rot: [l1 + V * x, SPIN_TILT, 0], s: sFull, phase: 'spin', u: x / T.spin };
      x -= T.spin;
      const u = x / T.approach, e = easeInOut(u);
      const l2 = l1 + V * T.spin;
      return { rot: [l2 + V * T.approach * (u - (u * u) / 2), SPIN_TILT + (FOCUS[1] - SPIN_TILT) * e, 0], s: geo(sFull, sFocus, e), phase: 'approach', u };
    }
    function setCamera(cam, fast) {
      proj.rotate(cam.rot).scale(cam.s).translate([cx, cy]);
      R.setView(cam.rot, cam.s, [cx, cy], W, H, fast);
    }
    const run = (gen) => { while (!gen.next().done); };

    // Dots at unit vectors `vecs`, one fill per group of dots that can't share a pixel. The groups are independent of
    // draw order and every dot has the same colour, so this matches filling each dot on its own, at a fraction of the calls.
    function drawDots(c, vecs, radius, minDepth) {
      const { d, r, u, s } = R.view;
      const gap = 2 * radius + 3, layers = [];
      for (const v of vecs) {
        if (v[0] * d[0] + v[1] * d[1] + v[2] * d[2] < minDepth) continue;
        const px = R.view.x + s * (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]);
        const py = R.view.y - s * (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]);
        const gx = Math.floor(px / gap), gy = Math.floor(py / gap);
        let layer = layers.find((L) => {
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const cell = L.cells.get((gx + i) * 65536 + gy + j);
            if (cell) for (const q of cell) if (Math.hypot(q[0] - px, q[1] - py) < gap) return false;
          }
          return true;
        });
        if (!layer) layers.push((layer = { cells: new Map(), pts: [] }));
        const key = gx * 65536 + gy;
        if (!layer.cells.has(key)) layer.cells.set(key, []);
        layer.cells.get(key).push([px, py]);
        layer.pts.push(px, py);
      }
      for (const L of layers) {
        c.beginPath();
        for (let i = 0; i < L.pts.length; i += 2) { c.moveTo(L.pts[i] + radius, L.pts[i + 1]); c.arc(L.pts[i], L.pts[i + 1], radius, 0, Math.PI * 2); }
        c.fill();
      }
    }
    const missionVecs = loWorld.missions.map((m) => R.unit(...m.geometry.coordinates));

    /* atmosphere of the moving globe: the same radial gradient as a CSS disc under the moving canvas (site.css .globe-halo),
       placed and scaled by a compositor transform — no per-frame drawing at all. The sphere covers its inner part. */
    let haloKey = '';
    function placeHalo(r, show) {
      const key = show ? r.toFixed(2) + ',' + cx + ',' + cy : 'off';
      if (key === haloKey) return;
      haloKey = key;
      if (!show) { haloEl.style.visibility = 'hidden'; return; }
      const d = 2.32 * sFull; // laid out at the orbit size, scaled from there
      haloEl.style.visibility = '';
      haloEl.style.width = haloEl.style.height = d + 'px';
      haloEl.style.transform = `translate(${cx - d / 2}px,${cy - d / 2}px) scale(${r / sFull})`;
    }

    /* The globe, layer by layer (a generator, so the still frame can be re-rendered a few layers per animation frame).
       full = the still hold frame: exact atmosphere and glows, painted opaque so it hides the moving canvas beneath.
       Moving frames leave out the shadow blur; on a device that had to lower their resolution (lean) they also leave out
       the faint grid and the faint land outlines. (ox, oy): canvas origin on the page. */
    function* drawGlobe(c, g, full, ratio, ox, oy) {
      const path = (o) => R.path(c, o);
      path.bounds = (o) => R.bounds(o);
      const r = proj.scale();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      c.setTransform(ratio, 0, 0, ratio, -ox * ratio, -oy * ratio);
      if (full) { c.fillStyle = '#050505'; c.fillRect(0, 0, W, H); } // the page background
      // atmosphere (moving frames: the .globe-halo element beneath)
      if (full && r < Math.hypot(W, H)) {
        const halo = c.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.16);
        halo.addColorStop(0, 'rgba(200,0,42,0.18)');
        halo.addColorStop(1, 'rgba(200,0,42,0)');
        c.fillStyle = halo;
        c.beginPath(); c.arc(cx, cy, r * 1.16, 0, Math.PI * 2); c.fill();
      }
      c.beginPath(); path(sphere); c.fillStyle = '#070707'; c.fill();
      const lean = !full && moveDpr < moveCap;
      if (!lean) { c.beginPath(); path(full ? grat : gratMoving); c.strokeStyle = 'rgba(232,227,220,0.06)'; c.lineWidth = 0.6; c.stroke(); }
      yield;
      for (const k of ['land', 'watch', 'kin', 'coop', 'ally']) {
        if (!g[k].length) continue;
        c.beginPath();
        for (const f of g[k]) path(f);
        c.fillStyle = STYLE[k][0]; c.fill();
        if (!lean || (k !== 'land' && k !== 'watch')) { c.strokeStyle = STYLE[k][1]; c.lineWidth = k === 'ally' ? 0.8 : 0.5; c.stroke(); }
        yield;
      }
      for (const d of g.disputed) {
        c.beginPath(); path(d.f);
        // de jure state's colour, stroked in the same colour so no line separates it from that state
        c.fillStyle = c.strokeStyle = (STYLE[d.style] || STYLE.land)[0]; c.fill(); c.lineWidth = 1.2; c.stroke();
        if (d.f.properties.occupier) { // territory under occupation: hatch on top
          if (!drawGlobe.hatch) {
            const t = document.createElement('canvas'); t.width = t.height = 6;
            const x = t.getContext('2d'); x.strokeStyle = 'rgba(232,227,220,0.42)'; x.lineWidth = 1.2;
            x.beginPath(); x.moveTo(-1, 7); x.lineTo(7, -1); x.stroke();
            drawGlobe.hatch = c.createPattern(t, 'repeat');
          }
          c.fillStyle = drawGlobe.hatch; c.fill();
        }
      }
      // human-rights markers (East Turkestan): turquoise dashed outline + label, visible while orbiting
      for (const cr of loWorld.concern) {
        c.beginPath(); path(cr);
        c.fillStyle = 'rgba(63,208,201,0.12)'; c.fill();
        c.setLineDash([4, 3]); c.strokeStyle = 'rgba(63,208,201,0.95)'; c.lineWidth = 1.3; c.stroke(); c.setLineDash([]);
        const at = cr.properties.label_at;
        if (at && d3.geoDistance(at, [-proj.rotate()[0], -proj.rotate()[1]]) < Math.PI / 2 - 0.1) {
          const lp = proj(at);
          c.save(); c.font = '600 10px "Plex Mono", monospace'; c.fillStyle = 'rgba(120,230,222,0.95)'; c.textAlign = 'center';
          c.fillText([...GT.upper(cr.properties['label_' + GT.lang] || cr.properties.label_tr)].join(' '), lp[0], lp[1]);
          c.restore();
        }
      }
      yield;
      // Mavi Vatan (blue): agreed areas solid, schematic areas lighter with dashed edge, notified limits as glowing dashed lines
      for (const m of loWorld.maritime) {
        const st = m.properties.status;
        if (st === 'licence') continue; // KKTC licence blocks are part of the merged Türkiye + KKTC area; the panel names them on hover
        c.beginPath(); path(m);
        c.save();
        if (full) { c.shadowColor = 'rgba(70,150,255,0.8)'; c.shadowBlur = 8; } // glow on the still frame only
        if (/Polygon/.test(m.geometry.type)) {
          c.fillStyle = st === 'schematic' ? 'rgba(38,120,220,0.26)' : 'rgba(38,120,220,0.42)'; c.fill();
          c.setLineDash(st === 'schematic' ? [4, 3] : []);
          c.strokeStyle = 'rgba(110,180,255,0.9)'; c.lineWidth = 1.1; c.stroke();
        } else {
          c.setLineDash(st === 'claimed' ? [6, 3] : []);
          c.strokeStyle = 'rgba(110,180,255,1)'; c.lineWidth = 2.2; c.stroke();
        }
        c.restore();
        if (full) yield;
      }
      // label once zoomed in on Türkiye
      if (proj.scale() > sFull * 1.6) {
        const at = [34.2, 42.35]; // inside the (agreed) Black Sea EEZ fill, clear of the other labels
        const lp = proj(at);
        if (lp && d3.geoDistance(at, [-proj.rotate()[0], -proj.rotate()[1]]) < Math.PI / 2) {
          c.save();
          c.font = '600 10px "Plex Mono", monospace'; c.fillStyle = 'rgba(120,185,255,0.95)'; c.textAlign = 'center';
          c.fillText([...GT.upper('Mavi Vatan')].join(' '), lp[0], lp[1]);
          c.restore();
        }
      }
      c.beginPath(); path(g.borders); c.strokeStyle = 'rgba(232,227,220,0.18)'; c.lineWidth = 0.5; c.stroke();
      yield;
      // Türkiye: gradient fill + glow
      c.beginPath();
      for (const f of g.tr) path(f);
      const b = path.bounds({ type: 'FeatureCollection', features: g.tr });
      if (b.flat().every(Number.isFinite)) { // Türkiye may be behind the horizon mid-orbit
        const tg = c.createLinearGradient(b[0][0], b[0][1], b[1][0], b[1][1]);
        tg.addColorStop(0, '#3d000b'); tg.addColorStop(0.55, '#7a0016'); tg.addColorStop(1, '#99001c');
        c.fillStyle = tg;
      } else c.fillStyle = '#7a0016';
      c.fill();
      c.save();
      if (full) { c.shadowColor = 'rgba(200,0,42,0.9)'; c.shadowBlur = 14; }
      c.strokeStyle = '#c8002a'; c.lineWidth = 1.2; c.stroke(); c.restore();
      // officially acknowledged Turkish presence (country level): dashed outline
      if (g.presence.length) {
        c.beginPath();
        for (const f of g.presence) path(f);
        c.setLineDash([3, 2]); c.strokeStyle = 'rgba(232,227,220,0.8)'; c.lineWidth = 0.9; c.stroke(); c.setLineDash([]);
      }
      // Türkiye's diplomatic missions (city level) — visible across the globe while it orbits (hidden within 0.02 rad of the limb)
      c.fillStyle = 'rgba(255,90,110,0.9)';
      drawDots(c, missionVecs, 1.4, Math.sin(0.02));
      // limb
      c.beginPath(); path(sphere); c.strokeStyle = 'rgba(232,227,220,0.14)'; c.lineWidth = 1; c.stroke();
    }

    /* Re-rendering the still frame (1:50m arrived, language, fonts) runs in the background, a few layers per animation
       frame, into a spare canvas that replaces the old frame when complete. */
    function startJob() {
      const g = best();
      const buf = document.createElement('canvas');
      buf.width = cvHold.width; buf.height = cvHold.height;
      const bctx = buf.getContext('2d');
      job = {
        g, buf,
        gen: (function* () {
          let i = 0;
          for (const f of g.all) { R.prepare(f); if (++i % 16 === 0) yield; }
          yield* drawGlobe(bctx, g, true, dpr, 0, 0);
        })(),
      };
    }
    function pumpJob() {
      if (!job) return;
      const t0 = performance.now();
      setCamera(HOLD_CAM, false);
      while (job && performance.now() - t0 < JOB_BUDGET) {
        const step = job.gen.next();
        // rasterise now rather than all at once when the finished frame is copied
        if (window.createImageBitmap) createImageBitmap(job.buf).then((bm) => bm.close(), () => {});
        if (step.done) {
          hctx.setTransform(1, 0, 0, 1, 0, 0);
          hctx.drawImage(job.buf, 0, 0);
          if (job.g === G.next) { G.hi = job.g; G.next = null; }
          job = null;
        }
      }
    }

    function spaced(c, text, x, y, spacing) {
      const chars = [...text];
      const widths = chars.map((ch) => c.measureText(ch).width);
      const total = widths.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1);
      let px = x - total / 2;
      chars.forEach((ch, i) => { c.fillText(ch, px, y); px += widths[i] + spacing; });
      return total;
    }
    const onScreen = (p) => p && p[0] > 20 && p[0] < W - 20 && p[1] > 60 && p[1] < H - 20 && (narrow || p[0] > W * 0.46);
    const facing = (ll) => d3.geoDistance(ll, [-proj.rotate()[0], -proj.rotate()[1]]) < Math.PI / 2 - 0.05;

    // seas, countries, Türkiye, islands and sites
    function drawLabels(c) {
      c.save();
      c.textBaseline = 'middle';
      const R0 = sFocus * Math.sin((31 * Math.PI) / 180);
      const fs = Math.max(8.5, Math.min(11, R0 / 34));
      c.font = `300 italic ${fs * 1.05}px Montserrat, sans-serif`;
      c.fillStyle = 'rgba(232,227,220,0.24)';
      for (const s of GT.SEAS) {
        if (!facing(s.at)) continue;
        const p = proj(s.at);
        if (onScreen(p)) spaced(c, GT.upper(s[GT.lang]), p[0], p[1], fs * 0.42);
      }
      c.font = `500 ${fs}px "Plex Mono", monospace`;
      c.fillStyle = 'rgba(232,227,220,0.46)';
      for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
        if (['CYP', 'MKD', 'ALB', 'KWT', 'ARM', 'LBN', 'ISR'].includes(a3)) continue;
        if (narrow && !['GRC', 'SYR', 'IRQ', 'IRN', 'BGR', 'EGY', 'GEO', 'SAU', 'PAK', 'AZE'].includes(a3)) continue;
        const p = proj(at);
        if (onScreen(p) && facing(at)) spaced(c, GT.upper(GT.countryName(a3)), p[0], p[1], fs * 0.22);
      }
      // Türkiye — centred on the country's area-weighted centroid
      const tp = proj(TR_CENTROID);
      if (tp) {
        const ts = Math.max(10, R0 / 26);
        c.font = `300 ${ts}px Montserrat, sans-serif`;
        c.fillStyle = 'rgba(255,255,255,0.94)';
        spaced(c, GT.upper('Türkiye'), tp[0], tp[1], ts * 0.62);
      }
      // Turkish islands as dots; Kardak hollow blue (Türkiye's position, contested)
      for (const i of loWorld.islands) {
        const ll = i.geometry.coordinates;
        const p = facing(ll) ? proj(ll) : null;
        if (!p) continue;
        c.beginPath(); c.arc(p[0], p[1], 2, 0, Math.PI * 2);
        if (i.properties.status === 'tur') { c.fillStyle = '#e8e3dc'; c.fill(); } else { c.strokeStyle = '#5aa5ff'; c.lineWidth = 1.2; c.stroke(); }
      }
      // real sites (examples never appear on the home page)
      if (data) {
        for (const s of data.site) {
          const g = s.location && s.location.geometry;
          if (!g || g.type !== 'Point' || !facing(g.coordinates)) continue;
          const p = proj(g.coordinates);
          if (!onScreen(p)) continue;
          c.fillStyle = '#e8e3dc';
          c.beginPath(); c.moveTo(p[0], p[1] - 4.5); c.lineTo(p[0] + 3.2, p[1]); c.lineTo(p[0], p[1] + 4.5); c.lineTo(p[0] - 3.2, p[1]); c.closePath(); c.fill();
        }
      }
      c.restore();
    }
    // real events: position and colour of those in view
    function events() {
      const out = [];
      if (data) {
        for (const e of data.event) {
          const g = e.location && e.location.geometry;
          if (!g || g.type !== 'Point' || !facing(g.coordinates)) continue;
          const p = proj(g.coordinates);
          if (!onScreen(p)) continue;
          out.push({ p, col: e.assessment.status === 'verified' ? '#4fae7b' : ['partially_verified', 'disputed'].includes(e.assessment.status) ? '#d6a13a' : '#c8002a' });
        }
      }
      return out;
    }
    function drawEvents(c, evs, now) {
      const pulse = ((now / 1000) % 2.6) / 2.6;
      for (const { p, col } of evs) {
        c.strokeStyle = col; c.globalAlpha = 1 - pulse;
        c.beginPath(); c.arc(p[0], p[1], 3.5 + pulse * 11, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 3.4, 0, Math.PI * 2); c.fill();
      }
    }

    /* Overlay, faded as a whole (opacity) after arrival and before departure. While the camera holds still the labels
       are drawn once and only the small event canvas changes; during the last tenth of the approach everything moves. */
    let overA = -1, labelsKey = '', sweepKey = '', evs = [], evBox = null;
    function overlay(cam, a, now) {
      if (a !== overA) {
        overA = a;
        for (const el of [cvOver, cvEv, sweepEl]) el.style.opacity = String(a);
        sweepEl.style.display = a > 0 ? '' : 'none';
        if (a <= 0) { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, cvOver.width, cvOver.height); cvEv.style.display = 'none'; labelsKey = ''; }
      }
      if (a <= 0) return;
      // sweep: wedge anchored at its centre; sized once so moving it is a compositor-only translate
      const c0 = proj([35, 39]);
      if (!sweepKey) {
        const far = Math.hypot(Math.max(c0[0], W - c0[0]), Math.max(c0[1], H - c0[1])) + 24;
        sweepEl.style.width = far + 'px';
        sweepEl.style.height = far * Math.sin((36 * Math.PI) / 180) + 2 + 'px';
        sweepEl.dataset.h = String(far * Math.sin((36 * Math.PI) / 180) + 2);
      }
      const key = c0[0].toFixed(1) + ',' + c0[1].toFixed(1);
      if (key !== sweepKey) { sweepKey = key; sweepEl.style.translate = `${c0[0]}px ${c0[1] - Number(sweepEl.dataset.h)}px`; }

      const still = cam.phase === 'hold';
      const lk = still ? [W, H, dpr, GT.lang, !!data].join('|') : '';
      if (!still || lk !== labelsKey) {
        labelsKey = lk;
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, cvOver.width, cvOver.height);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawLabels(octx);
        evs = events();
        if (still && evs.length) { // the event canvas covers just the pulses
          const pad = 16, xs = evs.map((e) => e.p[0]), ys = evs.map((e) => e.p[1]);
          const x0 = Math.floor(Math.min(...xs) - pad), y0 = Math.floor(Math.min(...ys) - pad);
          const w = Math.ceil(Math.max(...xs) + pad) - x0, h = Math.ceil(Math.max(...ys) + pad) - y0;
          evBox = { x0, y0 };
          cvEv.width = Math.round(w * dpr); cvEv.height = Math.round(h * dpr);
          Object.assign(cvEv.style, { width: w + 'px', height: h + 'px', transform: `translate(${x0}px,${y0}px)`, display: '' });
        } else cvEv.style.display = 'none';
      }
      if (still) {
        if (evs.length) {
          ectx.setTransform(1, 0, 0, 1, 0, 0);
          ectx.clearRect(0, 0, cvEv.width, cvEv.height);
          ectx.setTransform(dpr, 0, 0, dpr, -evBox.x0 * dpr, -evBox.y0 * dpr);
          drawEvents(ectx, evs, now);
        }
      } else drawEvents(octx, evs, now);
    }

    function frame(now) {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      t = (t + dt) % CYCLE;
      const cam = camera(t);
      pumpJob();
      setCamera(cam, true);

      // still frame: fully shown during the hold, faded at both ends
      const hA = cam.phase === 'hold' && holdReady ? Math.max(0, Math.min(1, t / FADE, (T.hold - t) / FADE)) : 0;
      if (hA !== holdAlpha) { holdAlpha = hA; cvHold.style.opacity = String(hA); cvMove.style.visibility = hA >= 1 ? 'hidden' : ''; }
      placeHalo(cam.s, hA < 1 && cam.s < Math.hypot(W, H));
      // moving frame: only when the camera moved and the still frame doesn't cover it
      const key = cam.rot[0] + ',' + cam.rot[1] + ',' + cam.s + ',' + moveDpr;
      if (hA < 1 && key !== moveKey) {
        moveKey = key;
        placeMove(cam.s);
        run(drawGlobe(mctx, G.lo, false, moveDpr, mv.x, mv.y));
        if (cam.phase !== 'hold') adapt();
      }

      // overlay fades in after arrival and out before leaving
      let a = 0;
      if (cam.phase === 'hold') a = Math.min(1, t / 0.9, (T.hold - t) / 0.7);
      else if (cam.phase === 'approach') a = Math.max(0, (cam.u - 0.9) / 0.1) * 0.6;
      overlay(cam, Math.max(0, a), now);

      if (now - hudTick > 150 && hudFocus) {
        hudTick = now;
        const r = proj.rotate();
        let lon = -r[0] % 360; if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
        const text = GT.fmtLL([lon, -r[1]]);
        if (text !== hudText) { hudText = text; hudFocus.textContent = text; }
      }
    }

    // hover → HUD shows the country / region under the cursor
    cvOver.addEventListener('pointermove', GT.debounce((ev) => {
      const r = cvOver.getBoundingClientRect();
      const ll = proj.invert([ev.clientX - r.left, ev.clientY - r.top]);
      let hit = null;
      if (ll && facing(ll)) hit = loWorld.countries.find((f) => R.mayContain(f, ll) && d3.geoContains(f, ll)) || null;
      if (hit === hover) return;
      hover = hit;
      if (!hudRegion) return;
      if (!hit) { hudRegion.textContent = '—'; return; }
      const region = GT.REGION_OF[GT.a3(hit)];
      hudRegion.textContent = GT.upper(region ? GT.label('regions', region) : GT.countryName(hit));
    }, 40));
    cvOver.addEventListener('pointerleave', () => { hover = null; if (hudRegion) hudRegion.textContent = '—'; });

    // stop everything (including the compositor sweep) while the hero is scrolled away or the tab is hidden
    let running = false, rafId = 0;
    const update = () => {
      const on = visible && !document.hidden;
      if (on === running) return;
      running = on;
      if (on) { overA = -1; moveWall = 0; rafId = requestAnimationFrame((n) => { last = n; frame(n); }); }
      else { cancelAnimationFrame(rafId); sweepEl.style.display = 'none'; }
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => { visible = en[0].isIntersecting; update(); }).observe(host);
    }
    document.addEventListener('visibilitychange', update);
    // canvas text drawn before the web fonts arrived is redrawn once they have
    if (document.fonts) document.fonts.ready.then(() => { labelsKey = ''; if (fontsPending) { fontsPending = false; startJob(); } });

    resize();
    update();
    return {
      resize() { resize(); moveDpr = moveCap; },
      setDetail(world) { G.next = group(world); startJob(); },
      // new data: only the overlay shows it
      refresh() { labelsKey = ''; },
      // language: the still frame carries two labels, the overlay the rest
      invalidate() { labelsKey = ''; startJob(); cvOver.setAttribute('aria-label', GT.t('hero.mapAria')); },
    };
  }

  /* ================= static map (reduced motion / no canvas) ================= */
  function drawStatic() {
    const world = hi;
    if (!world) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const narrow = w < 860;
    const R = narrow ? Math.min(w * 0.7, h * 0.36) : Math.min(h * 0.5, w * 0.36);
    const cx = narrow ? w * 0.5 : w * 0.63;
    const cy = narrow ? h * 0.36 : h * 0.53;
    const proj = d3.geoOrthographic().rotate(FOCUS).scale(R / Math.sin((31 * Math.PI) / 180))
      .translate([cx, cy]).clipAngle(90).precision(0.35);
    const path = d3.geoPath(proj);

    const svg = d3.select(host).selectAll('svg').data([0]).join('svg')
      .attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', GT.t('hero.mapAria'));
    svg.selectAll('*').remove();
    GT.mapDefs(svg);

    svg.append('path').datum(d3.geoGraticule().step([5, 5])()).attr('class', 'm-grat').attr('d', path);
    const land = svg.append('g');
    land.selectAll('path').data(world.countries).join('path')
      .attr('class', (f) => {
        const a = GT.a3(f);
        if (a === 'TUR') return 'm-land m-tr';
        return 'm-land' + (GT.REGION_OF[a] ? ' m-watch' : '') + GT.partnerClass(a);
      })
      .attr('data-region', (f) => GT.REGION_OF[GT.a3(f)] || null)
      .attr('d', path)
      .on('pointerenter', (ev, f) => highlight(land, GT.REGION_OF[GT.a3(f)], f))
      .on('pointerleave', () => highlight(land, null));
    for (const d of world.disputed) {
      const a = d.properties.de_jure;
      svg.append('path').datum(d).attr('d', path)
        .attr('class', 'm-land m-disputed' + (GT.REGION_OF[a] ? ' m-watch' : '') + GT.partnerClass(a));
      if (d.properties.occupier) svg.append('path').datum(d).attr('d', path).attr('class', 'm-occupied');
    }
    for (const cr of world.concern) svg.append('path').datum(cr).attr('d', path).attr('class', 'm-concern');

    const tr = world.countries.find((f) => GT.a3(f) === 'TUR');
    svg.append('path').datum(world.borders).attr('class', 'm-border').attr('d', path);
    svg.append('path').datum(tr).attr('class', 'm-tr-glow').attr('d', path).attr('filter', 'url(#glow)');
    const c = proj([35, 39]);
    GT.sweep(svg.append('g').attr('transform', `translate(${c[0]},${c[1]})`), Math.hypot(w, h), true, 14);

    const fs = Math.max(8.5, Math.min(11, R / 34));
    const labels = svg.append('g');
    const ok = (p) => p && p[0] > 20 && p[0] < w - 20 && p[1] > 60 && p[1] < h - 20 && (narrow || p[0] > w * 0.46);
    for (const s of GT.SEAS) {
      const p = proj(s.at);
      if (ok(p)) labels.append('text').attr('class', 'm-sea').attr('x', p[0]).attr('y', p[1]).attr('font-size', fs * 1.05 * s.size).text(GT.upper(s[GT.lang]));
    }
    for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
      if (['CYP', 'MKD', 'ALB', 'KWT', 'ARM', 'LBN', 'ISR'].includes(a3)) continue;
      if (narrow && !['GRC', 'SYR', 'IRQ', 'IRN', 'BGR', 'EGY', 'GEO'].includes(a3)) continue;
      const p = proj(at);
      if (ok(p)) labels.append('text').attr('class', 'm-label').attr('x', p[0]).attr('y', p[1]).attr('font-size', fs).text(GT.upper(GT.countryName(a3)));
    }
    const tp = proj(d3.geoCentroid(tr));
    labels.append('text').attr('class', 'm-tr-label').attr('x', tp[0]).attr('y', tp[1])
      .attr('font-size', Math.max(10, R / 26)).text([...GT.upper('Türkiye')].join('  '));

    if (data) {
      const mk = svg.append('g');
      for (const s of data.site) {
        const g = s.location && s.location.geometry;
        const p = g && g.type === 'Point' ? proj(g.coordinates) : null;
        if (!ok(p)) continue;
        const m = mk.append('g').attr('class', 'mk').attr('transform', `translate(${p[0]},${p[1]})`);
        m.append('path').attr('class', 'mk-site').attr('d', d3.symbol(d3.symbolDiamond, 42)());
        m.append('title').text(GT.txt(s.name));
      }
      for (const e of data.event) {
        const g = e.location && e.location.geometry;
        const p = g && g.type === 'Point' ? proj(g.coordinates) : null;
        if (!ok(p)) continue;
        const m = mk.append('g').attr('class', 'mk').attr('transform', `translate(${p[0]},${p[1]})`);
        m.append('circle').attr('class', 'mk-ev st-' + e.assessment.status).attr('r', 3.6);
        m.append('title').text(GT.txt(e.title));
      }
    }
  }

  function highlight(land, region, feature) {
    land.selectAll('.m-land').classed('hl', function () { return !!region && this.getAttribute('data-region') === region; });
    if (!hudRegion) return;
    if (region) hudRegion.textContent = GT.upper(GT.label('regions', region));
    else if (feature) hudRegion.textContent = GT.upper(GT.countryName(feature));
    else hudRegion.textContent = '—';
  }

  /* ================= data sections ================= */
  function renderData() {
    renderStats();
    renderTicker();
    renderRegions();
    const rec = document.getElementById('hud-records');
    if (rec) rec.textContent = data ? String(data.event.length).padStart(3, '0') : '—';
  }

  function renderStats() {
    const note = document.getElementById('stats-note');
    document.querySelectorAll('[data-stat]').forEach((el) => {
      const n = data ? (data.manifest.counts[el.dataset.stat] ?? 0) : null;
      if (n == null) { el.textContent = '—'; return; }
      countUp(el, n);
    });
    if (note) note.firstChild.textContent = GT.t(dataFailed ? 'stats.err' : 'stats.note') + (data ? ' · ' + data.manifest.built_at.slice(0, 10) : '');
  }

  function countUp(el, n) {
    if (reduce || el.dataset.done === String(n)) { el.textContent = String(n); el.dataset.done = String(n); return; }
    const start = performance.now(), dur = 1400;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(n * (1 - Math.pow(1 - k, 4))));
      if (k < 1) requestAnimationFrame(step); else el.dataset.done = String(n);
    };
    requestAnimationFrame(step);
  }

  function renderTicker() {
    const box = document.getElementById('ticker');
    if (!box) return;
    box.replaceChildren();
    const items = [];
    if (data && data.event.length) {
      const list = [...data.event].sort((a, b) => b.time.start.localeCompare(a.time.start)).slice(0, 14);
      for (const e of list) {
        const a = GT.el('a', 'ticker-item');
        a.href = 'panel.html?id=' + encodeURIComponent(e.id);
        a.append(GT.el('b', null, GT.label('regions', e.regions[0])), GT.el('span', null, GT.txt(e.title)), GT.el('time', null, GT.fmtTime(e.time.start, e.time.precision)));
        items.push(a);
      }
    } else {
      const lead = GT.el('span', 'ticker-item');
      lead.append(GT.el('b', null, dataFailed ? 'ERR' : 'INFO'), GT.el('span', null, GT.t(dataFailed ? 'ticker.err' : 'ticker.empty')));
      items.push(lead);
      for (const code of GT.REGION_CODES) {
        const a = GT.el('a', 'ticker-item');
        a.href = 'panel.html?region=' + code;
        a.append(GT.el('b', null, code), GT.el('span', null, GT.label('regions', code)));
        items.push(a);
      }
    }
    // duplicate for a seamless loop; the copy is hidden from assistive tech
    items.forEach((n) => box.append(n));
    items.forEach((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; box.append(c); });
  }

  function renderRegions() {
    const grid = document.getElementById('region-grid');
    if (!grid) return;
    grid.replaceChildren();
    const counts = {};
    if (data) for (const e of data.event) for (const r of e.regions) counts[r] = (counts[r] || 0) + 1;
    GT.REGION_CODES.forEach((code, i) => {
      const a = GT.el('a', 'region rv in');
      a.href = 'panel.html?region=' + code;
      a.style.transitionDelay = (i % 4) * 60 + 'ms';
      a.append(GT.el('span', 'region-code', String(i + 1).padStart(2, '0') + ' / ' + code));
      a.append(GT.el('span', 'region-name', GT.label('regions', code)));
      a.append(GT.el('span', 'region-def', GT.definition('regions', code)));
      const foot = GT.el('span', 'region-foot');
      const n = GT.el('span');
      n.append(GT.el('span', 'n', String(counts[code] || 0)), document.createTextNode(' ' + GT.t('regions.records')));
      const go = GT.el('span', 'go');
      go.setAttribute('aria-hidden', 'true');
      foot.append(n, go);
      a.append(foot);
      a.setAttribute('aria-label', GT.label('regions', code) + ' — ' + GT.t('regions.open'));
      grid.append(a);
    });
  }

  function initReveal() {
    const els = document.querySelectorAll('.rv');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
  }
})();
