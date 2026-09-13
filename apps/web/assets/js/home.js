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
  if (globe) globe.invalidate(); else drawStatic();

  document.addEventListener('gt:lang', () => { if (globe) globe.invalidate(); else drawStatic(); renderData(); });

  /* ================= animated globe (canvas) ================= */
  function createGlobe(loWorld) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', GT.t('hero.mapAria'));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.replaceChildren(canvas);
    const ctx = canvas.getContext('2d');
    const cache = document.createElement('canvas');
    const cctx = cache.getContext('2d');
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
    const path = d3.geoPath(proj);
    const grat = d3.geoGraticule().step([10, 10])();
    const sphere = { type: 'Sphere' };

    // timeline (seconds): hold on Türkiye → depart → orbit → approach → hold …
    const T = { hold: 9, depart: 3.4, spin: 20, approach: 3.8 };
    const CYCLE = T.hold + T.depart + T.spin + T.approach;
    const V = 360 / (T.depart / 2 + T.spin + T.approach / 2); // orbit speed so each cycle is exactly one turn
    const SPIN_TILT = -26;

    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, sFull = 0, sFocus = 0, narrow = false;
    // ?globe-t=<seconds> starts the cycle at a given moment (handy for reviewing each phase)
    let t = Math.max(0, Number(new URLSearchParams(location.search).get('globe-t')) || 0) % CYCLE;
    let last = performance.now(), visible = true, cacheValid = false, hudTick = 0, hover = null;

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
      return g;
    };
    const G = { lo: group(loWorld), hi: null };
    const TR_CENTROID = d3.geoCentroid(loWorld.countries.find((f) => GT.a3(f) === 'TUR'));

    function resize() {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [canvas, cache]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      narrow = W < 860;
      cx = narrow ? W * 0.5 : W * 0.63;
      // on phones the text and legend fill the lower half, so keep the globe in the top third
      cy = narrow ? H * 0.25 : H * 0.53;
      const rFocus = narrow ? Math.min(W * 0.62, H * 0.26) : Math.min(H * 0.5, W * 0.36);
      sFocus = rFocus / Math.sin((31 * Math.PI) / 180);
      sFull = narrow ? Math.min(W * 0.42, H * 0.22) : Math.min(H * 0.42, W * 0.3);
      cacheValid = false;
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

    function drawGlobe(c, g) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      path.context(c);
      const r = proj.scale();
      // atmosphere
      if (r < Math.hypot(W, H)) {
        const halo = c.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.16);
        halo.addColorStop(0, 'rgba(200,0,42,0.18)');
        halo.addColorStop(1, 'rgba(200,0,42,0)');
        c.fillStyle = halo;
        c.beginPath(); c.arc(cx, cy, r * 1.16, 0, Math.PI * 2); c.fill();
      }
      c.beginPath(); path(sphere); c.fillStyle = '#070707'; c.fill();
      c.beginPath(); path(grat); c.strokeStyle = 'rgba(232,227,220,0.06)'; c.lineWidth = 0.6; c.stroke();
      for (const k of ['land', 'watch', 'kin', 'coop', 'ally']) {
        if (!g[k].length) continue;
        c.beginPath();
        for (const f of g[k]) path(f);
        c.fillStyle = STYLE[k][0]; c.fill();
        c.strokeStyle = STYLE[k][1]; c.lineWidth = k === 'ally' ? 0.8 : 0.5; c.stroke();
      }
      for (const d of g.disputed) {
        c.beginPath(); path(d.f);
        c.fillStyle = (STYLE[d.style] || STYLE.land)[0]; c.fill();
        if (d.f.properties.occupier) { // territory under occupation: hatch + dashed outline
          if (!drawGlobe.hatch) {
            const t = document.createElement('canvas'); t.width = t.height = 6;
            const x = t.getContext('2d'); x.strokeStyle = 'rgba(232,227,220,0.42)'; x.lineWidth = 1.2;
            x.beginPath(); x.moveTo(-1, 7); x.lineTo(7, -1); x.stroke();
            drawGlobe.hatch = c.createPattern(t, 'repeat');
          }
          c.fillStyle = drawGlobe.hatch; c.fill();
          c.setLineDash([2, 2]); c.strokeStyle = 'rgba(232,227,220,0.55)'; c.lineWidth = 0.8; c.stroke(); c.setLineDash([]);
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
      // Mavi Vatan (blue): agreed areas solid, schematic areas lighter with dashed edge, notified limits as glowing dashed lines
      for (const m of loWorld.maritime) {
        const st = m.properties.status;
        c.beginPath(); path(m);
        c.save();
        if (st === 'licence') {
          // KKTC licence blocks sit inside the merged Türkiye + KKTC area: thin outline only (the fill comes from the merged area)
          c.strokeStyle = 'rgba(150,200,255,0.75)'; c.lineWidth = 0.7; c.stroke();
          c.restore();
          continue;
        }
        c.shadowColor = 'rgba(70,150,255,0.8)'; c.shadowBlur = 8;
        if (/Polygon/.test(m.geometry.type)) {
          c.fillStyle = st === 'schematic' ? 'rgba(38,120,220,0.26)' : 'rgba(38,120,220,0.42)'; c.fill();
          c.setLineDash(st === 'schematic' ? [4, 3] : []);
          c.strokeStyle = 'rgba(110,180,255,0.9)'; c.lineWidth = 1.1; c.stroke();
        } else {
          c.setLineDash(st === 'claimed' ? [6, 3] : []);
          c.strokeStyle = 'rgba(110,180,255,1)'; c.lineWidth = 2.2; c.stroke();
        }
        c.restore();
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
      c.save(); c.shadowColor = 'rgba(200,0,42,0.9)'; c.shadowBlur = 14; c.strokeStyle = '#c8002a'; c.lineWidth = 1.2; c.stroke(); c.restore();
      // officially acknowledged Turkish presence (country level): dashed outline
      if (g.presence.length) {
        c.beginPath();
        for (const f of g.presence) path(f);
        c.setLineDash([3, 2]); c.strokeStyle = 'rgba(232,227,220,0.8)'; c.lineWidth = 0.9; c.stroke(); c.setLineDash([]);
      }
      // Türkiye's diplomatic missions (city level) — visible across the globe while it orbits
      const centre = [-proj.rotate()[0], -proj.rotate()[1]];
      c.fillStyle = 'rgba(255,90,110,0.9)';
      for (const m of loWorld.missions) {
        const ll = m.geometry.coordinates;
        if (d3.geoDistance(ll, centre) > Math.PI / 2 - 0.02) continue;
        const p = proj(ll);
        if (p) { c.beginPath(); c.arc(p[0], p[1], 1.4, 0, Math.PI * 2); c.fill(); }
      }
      // limb
      c.beginPath(); path(sphere); c.strokeStyle = 'rgba(232,227,220,0.14)'; c.lineWidth = 1; c.stroke();
    }

    function spaced(c, text, x, y, spacing) {
      const chars = [...text];
      const widths = chars.map((ch) => c.measureText(ch).width);
      let px = x - (widths.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1)) / 2;
      chars.forEach((ch, i) => { c.fillText(ch, px, y); px += widths[i] + spacing; });
    }
    const inView = (p) => p && p[0] > 20 && p[0] < W - 20 && p[1] > 60 && p[1] < H - 20 && (narrow || p[0] > W * 0.46);
    const facing = (ll) => d3.geoDistance(ll, [-proj.rotate()[0], -proj.rotate()[1]]) < Math.PI / 2 - 0.05;

    function drawOverlay(c, alpha, now) {
      if (alpha <= 0) return;
      c.save();
      c.globalAlpha = alpha;
      c.textBaseline = 'middle';
      const R = sFocus * Math.sin((31 * Math.PI) / 180);
      const fs = Math.max(8.5, Math.min(11, R / 34));
      const center = proj([35, 39]);
      // radar sweep around Türkiye
      if (c.createConicGradient && center) {
        const ang = ((now / 1000) % 7) / 7 * Math.PI * 2;
        const sg = c.createConicGradient(ang, center[0], center[1]);
        sg.addColorStop(0, 'rgba(200,0,42,0)');
        sg.addColorStop(0.9, 'rgba(200,0,42,0)');
        sg.addColorStop(0.997, 'rgba(200,0,42,0.20)');
        sg.addColorStop(1, 'rgba(200,0,42,0)');
        c.fillStyle = sg;
        c.fillRect(0, 0, W, H);
      }
      // sea and country labels
      c.font = `300 italic ${fs * 1.05}px Montserrat, sans-serif`;
      c.fillStyle = 'rgba(232,227,220,0.24)';
      for (const s of GT.SEAS) {
        if (!facing(s.at)) continue;
        const p = proj(s.at);
        if (inView(p)) spaced(c, GT.upper(s[GT.lang]), p[0], p[1], fs * 0.42);
      }
      c.font = `500 ${fs}px "Plex Mono", monospace`;
      c.fillStyle = 'rgba(232,227,220,0.46)';
      for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
        if (['CYP', 'MKD', 'ALB', 'KWT', 'ARM', 'LBN', 'ISR'].includes(a3)) continue;
        if (narrow && !['GRC', 'SYR', 'IRQ', 'IRN', 'BGR', 'EGY', 'GEO', 'SAU', 'PAK', 'AZE'].includes(a3)) continue;
        const p = proj(at);
        if (inView(p) && facing(at)) spaced(c, GT.upper(GT.countryName(a3)), p[0], p[1], fs * 0.22);
      }
      // Türkiye — centred on the country's area-weighted centroid
      const tp = proj(TR_CENTROID);
      if (tp) {
        const ts = Math.max(10, R / 26);
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
      // real sites and events (examples never appear on the home page)
      if (data) {
        const pulse = ((now / 1000) % 2.6) / 2.6;
        for (const s of data.site) {
          const g = s.location && s.location.geometry;
          if (!g || g.type !== 'Point' || !facing(g.coordinates)) continue;
          const p = proj(g.coordinates);
          if (!inView(p)) continue;
          c.fillStyle = '#e8e3dc';
          c.beginPath(); c.moveTo(p[0], p[1] - 4.5); c.lineTo(p[0] + 3.2, p[1]); c.lineTo(p[0], p[1] + 4.5); c.lineTo(p[0] - 3.2, p[1]); c.closePath(); c.fill();
        }
        for (const e of data.event) {
          const g = e.location && e.location.geometry;
          if (!g || g.type !== 'Point' || !facing(g.coordinates)) continue;
          const p = proj(g.coordinates);
          if (!inView(p)) continue;
          const col = e.assessment.status === 'verified' ? '#4fae7b' : ['partially_verified', 'disputed'].includes(e.assessment.status) ? '#d6a13a' : '#c8002a';
          c.strokeStyle = col; c.globalAlpha = alpha * (1 - pulse);
          c.beginPath(); c.arc(p[0], p[1], 3.5 + pulse * 11, 0, Math.PI * 2); c.stroke();
          c.globalAlpha = alpha;
          c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 3.4, 0, Math.PI * 2); c.fill();
        }
      }
      c.restore();
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      t = (t + dt) % CYCLE;
      const cam = camera(t);
      proj.rotate(cam.rot).scale(cam.s).translate([cx, cy]);

      const detailed = G.hi || G.lo;
      const useDetail = cam.phase === 'hold' || (cam.phase === 'approach' && cam.u > 0.82) || (cam.phase === 'depart' && cam.u < 0.18);
      if (cam.phase === 'hold') {
        if (!cacheValid) { drawGlobe(cctx, detailed); cacheValid = true; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cache, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        drawGlobe(ctx, useDetail ? detailed : G.lo);
      }
      // overlay fades in after arrival and out before leaving
      let a = 0;
      if (cam.phase === 'hold') a = Math.min(1, t / 0.9, (T.hold - t) / 0.7);
      else if (cam.phase === 'approach') a = Math.max(0, (cam.u - 0.9) / 0.1) * 0.6;
      drawOverlay(ctx, a, now);

      if (now - hudTick > 150 && hudFocus) {
        hudTick = now;
        const r = proj.rotate();
        let lon = -r[0] % 360; if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
        hudFocus.textContent = GT.fmtLL([lon, -r[1]]);
      }
    }

    // hover → HUD shows the country / region under the cursor
    canvas.addEventListener('pointermove', GT.debounce((ev) => {
      const r = canvas.getBoundingClientRect();
      const ll = proj.invert([ev.clientX - r.left, ev.clientY - r.top]);
      let hit = null;
      if (ll && facing(ll)) hit = loWorld.countries.find((f) => d3.geoContains(f, ll)) || null;
      if (hit === hover) return;
      hover = hit;
      if (!hudRegion) return;
      if (!hit) { hudRegion.textContent = '—'; return; }
      const region = GT.REGION_OF[GT.a3(hit)];
      hudRegion.textContent = GT.upper(region ? GT.label('regions', region) : GT.countryName(hit));
    }, 40));
    canvas.addEventListener('pointerleave', () => { hover = null; if (hudRegion) hudRegion.textContent = '—'; });

    // pause when the hero is scrolled away
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => { visible = en[0].isIntersecting; last = performance.now(); }).observe(host);
    }

    resize();
    requestAnimationFrame((n) => { last = n; frame(n); });
    return {
      resize,
      setDetail(world) { G.hi = group(world); cacheValid = false; },
      invalidate() { cacheValid = false; canvas.setAttribute('aria-label', GT.t('hero.mapAria')); },
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
        .attr('class', 'm-land m-disputed' + (GT.REGION_OF[a] ? ' m-watch' : '') + GT.partnerClass(a) + (d.properties.occupier ? ' m-occupied' : ''));
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
