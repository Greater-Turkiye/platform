/* Greater Türkiye — home page: hero globe, feed ticker, regions, stats. */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('hud-utc'));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = document.getElementById('hero-map');
  const hudRegion = document.getElementById('hud-region');
  let world = null;
  let data = null;
  let dataFailed = false;

  initReveal();

  try { world = await GT.loadWorld('assets/data/countries-50m.json'); } catch (e) { console.warn(e); }
  drawHero();
  window.addEventListener('resize', GT.debounce(drawHero, 160));

  try { data = await GT.loadData(); } catch (e) { dataFailed = true; console.warn(e); }
  renderData();
  drawHero();

  document.addEventListener('gt:lang', () => { drawHero(); renderData(); });

  /* ---------------- hero globe ---------------- */
  function drawHero() {
    if (!world) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const narrow = w < 860;
    const R = narrow ? Math.min(w * 0.7, h * 0.36) : Math.min(h * 0.5, w * 0.36);
    const cx = narrow ? w * 0.5 : w * 0.63;
    const cy = narrow ? h * 0.36 : h * 0.53;
    const proj = d3.geoOrthographic().rotate([-35, -39]).scale(R / Math.sin((21 * Math.PI) / 180))
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
        return 'm-land' + (a === 'TUR' ? ' m-tr' : GT.REGION_OF[a] ? ' m-watch' : '');
      })
      .attr('data-region', (f) => GT.REGION_OF[GT.a3(f)] || null)
      .attr('d', path)
      .on('pointerenter', (ev, f) => highlight(land, GT.REGION_OF[GT.a3(f)], f))
      .on('pointerleave', () => highlight(land, null));

    const tr = world.countries.find((f) => GT.a3(f) === 'TUR');
    svg.append('path').datum(world.borders).attr('class', 'm-border').attr('d', path);
    svg.append('path').datum(tr).attr('class', 'm-tr-glow').attr('d', path).attr('filter', 'url(#glow)');

    // radar sweep centred on Türkiye
    const c = proj([35, 39]);
    GT.sweep(svg.append('g').attr('transform', `translate(${c[0]},${c[1]})`), Math.hypot(w, h), reduce, 14);

    // labels
    const fs = Math.max(8.5, Math.min(11, R / 34));
    const labels = svg.append('g');
    for (const s of GT.SEAS) {
      const p = proj(s.at);
      if (!p || !inView(p, w, h)) continue;
      labels.append('text').attr('class', 'm-sea').attr('x', p[0]).attr('y', p[1])
        .attr('font-size', fs * 1.05 * s.size).text(GT.upper(s[GT.lang]));
    }
    for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
      if (narrow && !['GRC', 'SYR', 'IRQ', 'IRN', 'BGR', 'EGY', 'GEO'].includes(a3)) continue;
      if (['CYP', 'XNC', 'MKD', 'ALB', 'KWT'].includes(a3)) continue; // too small to label at this scale
      const p = proj(at);
      if (!p || !inView(p, w, h)) continue;
      if (!narrow && p[0] < w * 0.46) continue; // keep the text column clean
      labels.append('text').attr('class', 'm-label').attr('x', p[0]).attr('y', p[1])
        .attr('font-size', ['CYP', 'XNC', 'LBN', 'ISR', 'ARM'].includes(a3) ? fs * 0.8 : fs).text(GT.upper(GT.countryName(a3)));
    }
    const tp = proj([35.1, 39.05]);
    labels.append('text').attr('class', 'm-tr-label').attr('x', tp[0]).attr('y', tp[1] + fs * 0.9)
      .attr('font-size', Math.max(15, R / 13)).text(GT.upper('Türkiye'));

    // markers: real sites and events only (examples are never shown on the home page)
    if (data) {
      const mk = svg.append('g');
      for (const s of data.site) {
        const g = s.location && s.location.geometry;
        if (!g || g.type !== 'Point') continue;
        const p = proj(g.coordinates);
        if (!p || (!narrow && p[0] < w * 0.46)) continue;
        const m = mk.append('g').attr('class', 'mk').attr('transform', `translate(${p[0]},${p[1]})`);
        m.append('path').attr('class', 'mk-site').attr('d', d3.symbol(d3.symbolDiamond, 42)());
        m.append('title').text(GT.txt(s.name));
      }
      for (const e of data.event) {
        const g = e.location && e.location.geometry;
        if (!g || g.type !== 'Point') continue;
        const p = proj(g.coordinates);
        if (!p || (!narrow && p[0] < w * 0.46)) continue;
        const m = mk.append('g').attr('class', 'mk').attr('transform', `translate(${p[0]},${p[1]})`);
        if (!reduce) m.append('circle').attr('class', 'mk-pulse').attr('r', 4);
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

  function inView(p, w, h) { return p[0] > 20 && p[0] < w - 20 && p[1] > 60 && p[1] < h - 20; }

  /* ---------------- data sections ---------------- */
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
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
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
