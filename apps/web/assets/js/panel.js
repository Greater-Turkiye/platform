/* Greater Türkiye — OSINT panel: zoomable map, filters, record feed, detail drawer. */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('p-utc'));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const els = {
    map: $('p-map'), feed: $('p-feed'), count: $('p-count'), drawer: $('p-drawer'), body: $('p-drawer-body'), close: $('p-close'),
    search: $('f-search'), region: $('f-region'), type: $('f-type'), status: $('f-status'),
    periods: $('p-periods'), board: $('p-board-rows'), boardClear: $('p-board-clear'),
    controls: $('p-controls'), controlsN: $('p-controls-n'),
    banner: $('p-banner'),
    coords: $('p-coords'), scale: $('p-scale'), tip: $('p-tip'), stateBox: $('p-state'),
  };
  const lyr = { regions: $('l-regions'), sites: $('l-sites'), events: $('l-events'), examples: $('l-examples') };
  const params = new URLSearchParams(location.search);
  const state = {
    region: params.get('region') || '', type: params.get('type') || '', status: params.get('status') || '',
    period: params.get('period') || '', q: '', selected: params.get('id') || '',
  };
  /* A period is the first thing anyone reading a situation asks for, and the dataset is ordered by
     time anyway. Days, not months: a record's time is a day at best (`time.precision`). */
  const PERIODS = { '7': 7, '30': 30, '90': 90, '365': 365 };
  /* The board can be read two ways and a reader should not have to choose one for good: by how
     much we have recorded, or by how much activity the sea is told about. Sorting is a view, so
     it stays in memory and out of the URL. */
  let boardSort = 'records';
  let regionActivity = null; // assets/data/msi-regions.json, loaded once, absent is not zero

  let world = null, data = null, loadError = false;
  let svg = null, gRoot, gCountries, gLabels, gUnc, gSites, gEvents, proj, geoPath, gmap = null, k = 1, W = 0, H = 0;
  let lastFocus = null;

  /* ---------------- vector basemap ----------------
     The map is drawn on our own OpenStreetMap tiles (assets/js/basemap.js, served by the gt-tiles
     Worker). `?basemap=0` turns it off and the map is drawn only from the 50m file we ship, which
     is also what happens if the tiles cannot be reached; `?basemap=ofm` swaps in OpenFreeMap, and
     `?tiles=<url>` points the same style at another tile endpoint. Everything that carries meaning
     — borders, maritime areas, operation areas, markers — stays D3's on top either way. */
  const baseMode = params.has('basemap')
    ? ({ 'ofm': 'ofm', 'gt': 'gt', '1': 'gt' }[params.get('basemap')] || '') // anything else, '0' included, is off
    // a phone on a metered connection gets the map it had before; ?basemap=gt overrides that
    : (navigator.connection && navigator.connection.saveData ? '' : 'gt');
  /* The basemap is what makes zooming in worth doing, and it is also 260 KB of MapLibre plus a
     tile for every visible square. At the overview neither is needed: the whole region is on
     screen, the thematic layers carry it, and the tiles under them would be read at a glance and
     thrown away. So nothing is loaded until the map is actually zoomed (BASE_FROM), which keeps a
     first load byte for byte what it was before the basemap existed. */
  const BASE_FROM = 1.6;
  let base = null, baseStarted = false;
  /* Run something once the browser has a moment. Loading MapLibre and rebuilding the map from
     inside a zoom commit is a second of work in the middle of a gesture; profiling a zoom put the
     worst frame at 1,517 ms with the basemap and 533 ms without it. None of that work is urgent —
     the reader is looking at a map that is already drawn — so it waits for an idle slot, with a
     timeout so a busy page still gets its basemap. */
  const whenIdle = (fn) => (window.requestIdleCallback
    ? window.requestIdleCallback(fn, { timeout: 1200 })
    : setTimeout(fn, 200));

  function maybeInitBase(kk) {
    if (baseStarted || !baseMode || kk < BASE_FROM) return;
    baseStarted = true;
    whenIdle(() => initBase().then(() => {
      if (!base || !svg) return;
      // The map is redrawn once, so the fills become a tint and our own city labels step aside.
      // drawMap() rebuilds the zoom behaviour from scratch, so the view the reader is looking at
      // has to be put back afterwards — otherwise their zoom would snap to the overview.
      const t = gmap.current();
      drawMap();
      render();
      gmap.transform(t);
    }));
  }
  async function initBase() {
    if (!baseMode) return;
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'assets/js/basemap.js';
        s.onload = res;
        s.onerror = () => rej(new Error('basemap.js'));
        document.head.append(s);
      });
      base = await GT.basemap.create(els.map, baseMode, { lang: GT.lang, url: params.get('tiles') || '', onFail: dropBase });
      window.GT_BASE = base; // the screenshot harness asks the basemap what it saw
    } catch (e) {
      base = null;
      console.warn('basemap disabled:', e);
    }
  }
  /* Give the map back to D3 when the tiles do not arrive: the thematic layers are already there,
     so this is one class change and a redraw, not a reload. */
  function dropBase(err) {
    if (!base) return;
    console.warn('basemap dropped:', err);
    try { base.destroy(); } catch (e) { /* the map is going away anyway */ }
    base = null;
    if (svg) { drawMap(); render(); }
  }
  /* Both D3 and MapLibre are Web Mercator, so one camera describes the two: the projection's
     scale times the zoom transform's k is a MapLibre zoom (512 px per tile), and the map's
     centre is whatever lon/lat the middle of the box inverts to. */
  function syncBase(t) {
    if (!base || !proj || !W || !H) return;
    const c = proj.invert(t.invert([W / 2, H / 2]));
    if (c) base.sync(c[0], c[1], Math.log2((proj.scale() * t.k * 2 * Math.PI) / 512));
  }

  /* A handle for the screenshot harness and for anyone checking the map by hand: put the view on a
     coordinate at a chosen zoom. It reads nothing and changes no state the map does not already own. */
  window.GT_PANEL = {
    goto(lon, lat, kk) {
      if (!gmap || !proj) return false;
      const c = proj([lon, lat]);
      const t = d3.zoomIdentity.translate(viewW() / 2, H / 2).scale(kk).translate(-c[0], -c[1]);
      gmap.transform(t);
      return true;
    },
    zoom: () => k,
  };

  /* Print is a briefing: the reader wants the map, the four summary lines and the list, with the
     filter that produced them written down. The header is built at print time so it can never
     describe a different view than the one on paper. */
  function printHeader() {
    const box = document.getElementById('p-print');
    if (!box) return;
    const bits = [
      state.region ? GT.label('regions', state.region) : GT.t('p.allRegions'),
      state.type ? (GT.DOMAIN[state.type] ? GT.txt(GT.DOMAIN[state.type]) : state.type) : null,
      state.status ? GT.txt(GT.STATUS[state.status]) : null,
      state.period ? (state.period === '365' ? GT.t('p.year') : GT.t('p.days', { n: state.period })) : null,
      state.q ? '“' + state.q + '”' : null,
    ].filter(Boolean);
    box.querySelector('[data-print="filters"]').textContent = bits.join(' · ');
    box.querySelector('[data-print="at"]').textContent = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  }
  window.addEventListener('beforeprint', printHeader);

  wireUi();
  wireKey();
  setTimeout(loadAll); // after the helpers below are initialised

  /* ---------------- loading ---------------- */
  async function loadAll() {
    els.stateBox.hidden = false;
    els.stateBox.textContent = GT.t('p.loading');
    loadError = false;
    const [w, d] = await Promise.allSettled([
      world ? Promise.resolve(world) : GT.loadWorld('assets/data/countries-50m.json'),
      GT.loadData(),
    ]);
    if (w.status === 'fulfilled') world = w.value; else console.warn(w.reason);
    if (d.status === 'fulfilled') data = d.value; else { loadError = true; console.warn(d.reason); }
    if (data) lyr.examples.checked = params.get('examples') === '1' || (params.get('examples') !== '0' && data.event.length === 0);
    els.stateBox.hidden = !!world;
    if (!world) els.stateBox.textContent = GT.t('p.err');
    buildFilters();
    drawMap();
    render();
    loadRegionActivity(); // 1 KB, after the first paint: the column fills in when it arrives
    if (state.region) zoomToRegion(state.region, false);
    const pre = state.selected && data && data.byId.get(state.selected);
    if (pre) {
      if (pre._example && !lyr.examples.checked) { lyr.examples.checked = true; render(); }
      select(pre, true);
    }
  }

  /* ---------------- records ---------------- */
  const withExamples = (list, prefix) => {
    if (!data) return [];
    const out = list.slice();
    if (lyr.examples.checked) for (const r of data.examples) if (r.id.startsWith(prefix)) out.push(r);
    return out;
  };
  const allEvents = () => withExamples(data ? data.event : [], 'evt_');
  const allSites = () => withExamples(data ? data.site : [], 'sit_');
  const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const haystack = (e) => fold([e.id, e.event_type, e.title && e.title.tr, e.title && e.title.en, e.summary && e.summary.tr, e.summary && e.summary.en,
    ...e.regions, ...e.regions.map((r) => GT.label('regions', r))].join(' '));

  function filtered(opts) {
    const q = fold(state.q.trim());
    const days = PERIODS[state.period];
    const since = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : null;
    const anyRegion = !!(opts && opts.anyRegion);
    return allEvents()
      .filter((e) => (anyRegion || !state.region || e.regions.includes(state.region))
        && (!state.type || e.event_type.split('.')[0] === state.type)
        && (!state.status || e.assessment.status === state.status)
        && (!since || (e.time.start || '').slice(0, 10) >= since)
        && (!q || haystack(e).includes(q)))
      .sort((a, b) => b.time.start.localeCompare(a.time.start));
  }

  /* ---------------- filters ---------------- */
  function buildFilters() {
    fillSelect(els.region, [['', GT.t('p.all')], ...GT.REGION_CODES.map((c) => [c, GT.label('regions', c)])], state.region);
    const domains = new Set();
    ((GT.vocab && GT.vocab['event-types']) || []).forEach((c) => domains.add(c.code.split('.')[0]));
    if (!domains.size) Object.keys(GT.DOMAIN).forEach((d) => domains.add(d));
    fillSelect(els.type, [['', GT.t('p.all')], ...[...domains].map((d) => [d, GT.DOMAIN[d] ? GT.txt(GT.DOMAIN[d]) : d])], state.type);
    fillSelect(els.status, [['', GT.t('p.all')], ...Object.keys(GT.STATUS).map((s) => [s, GT.txt(GT.STATUS[s])])], state.status);
    renderPeriods();
  }
  /* The period is the one control that belongs above the fold: everything under it — the counts,
     the board, the list — answers "as of when". Chips rather than a select, because the answer is
     read as often as it is set. */
  function renderPeriods() {
    const opts = [['', GT.t('p.all')], ...Object.keys(PERIODS).map((d) => [d, d === '365' ? GT.t('p.year') : GT.t('p.days', { n: d })])];
    els.periods.replaceChildren(...opts.map(([v, label]) => {
      const b = GT.el('button', 'p-chip', v ? (v === '365' ? GT.t('p.chip.year') : GT.t('p.chip.days', { n: v })) : GT.t('p.chip.all'));
      b.type = 'button';
      b.dataset.period = v;
      b.title = label;
      b.setAttribute('aria-pressed', String(state.period === v));
      b.addEventListener('click', () => { state.period = v; renderPeriods(); render(); });
      return b;
    }));
  }

  function fillSelect(sel, opts, value) {
    sel.replaceChildren(...opts.map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; }));
    sel.value = value || '';
  }

  /* ---------------- map ---------------- */
  function drawMap() {
    if (!world) return;
    gmap = GT.map.create(els.map, {
      // Balkans to Pakistan, Black Sea to the Gulf
      view: [[13, 22], [74, 48]],
      pad: 24,
      ariaLabel: GT.t('hero.mapAria'),
      // k 192 is about zoom 11, where our tiles stop. Without tiles the 1:50m coastline is the
      // whole map, and past ~24x it is a generalisation pretending to be a survey.
      scaleExtent: [1, baseMode ? 192 : 24],
      onMoveStart: hideTip,
      onFrame: (t) => { syncBase(t); if (els.scale) els.scale.textContent = t.k.toFixed(1) + '\u00d7'; },
      onCommit: syncBase,
      onZoom: (kk) => { k = kk; rescale(); },
      onCursor: (ll) => { if (els.coords) els.coords.textContent = ll ? GT.fmtLL(ll) : '\u2014'; },
    });
    if (!gmap.frame()) return;
    proj = gmap.proj;
    geoPath = gmap.path; // the marker layers draw geometry too, outside this function
    const path = gmap.path;
    svg = gmap.svg;
    k = 1;
    W = gmap.W; H = gmap.H;
    svg.classed('with-base', !!base); // thematic fills become a tint so the basemap reads through
    GT.mapDefs(svg);

    gRoot = gmap.gRoot;
    gRoot.append('path').datum(d3.geoGraticule().step([5, 5])()).attr('class', 'm-grat').attr('d', path);
    gActivity = gRoot.append('g').attr('class', 'm-act-g');
    drawActivity();
    gCountries = gRoot.append('g');
    gCountries.selectAll('path').data(world.countries).join('path')
      .attr('class', (f) => {
        const a = GT.a3(f);
        if (a === 'TUR') return 'm-land m-tr';
        return 'm-land' + (GT.REGION_OF[a] ? ' m-watch' : '') + GT.partnerClass(a);
      })
      .attr('data-region', (f) => GT.REGION_OF[GT.a3(f)] || null)
      .attr('d', path)
      .on('pointermove', (ev, f) => {
        const a = GT.a3(f), r = GT.REGION_OF[a];
        const sub = [r ? GT.upper(GT.label('regions', r)) : '', GT.partnerLabel(a)].filter(Boolean).join(' · ');
        showTip(ev, GT.upper(GT.countryName(f)), sub);
      })
      .on('pointerleave', hideTip)
      .on('click', (ev, f) => { const r = GT.REGION_OF[GT.a3(f)]; if (r) setRegion(state.region === r ? '' : r); });

    const tr = world.countries.find((f) => GT.a3(f) === 'TUR');
    // Crimea, Golan and Palestine drawn with their de jure state per Türkiye's position (borders go on top)
    for (const d of world.disputed) {
      const p = d.properties;
      gRoot.append('path').datum(d).attr('d', path)
        .attr('class', 'm-land m-disputed' + (GT.REGION_OF[p.de_jure] ? ' m-watch' : '') + GT.partnerClass(p.de_jure))
        .attr('data-region', GT.REGION_OF[p.de_jure] || null)
        .on('pointermove', (ev) => showTip(ev, GT.upper(GT.countryName(p.de_jure) + ' · ' + p['name_' + GT.lang]), p['note_' + GT.lang]))
        .on('pointerleave', hideTip);
      // occupied territory: hatch over the de jure state's colour
      if (p.occupier) gRoot.append('path').datum(d).attr('d', path).attr('class', 'm-occupied');
    }
    gRoot.append('path').datum(world.borders).attr('class', 'm-border').attr('d', path);
    // human-rights markers (East Turkestan): outlined region with a note — not a boundary claim
    for (const cr of world.concern) {
      const p = cr.properties;
      gRoot.append('path').datum(cr).attr('d', path).attr('class', 'm-concern')
        .on('pointermove', (ev) => showTip(ev, GT.upper(p['name_' + GT.lang] || p.name_tr), p['note_' + GT.lang]))
        .on('pointerleave', hideTip);
    }
    // Türkiye's officially announced operation areas (ADR 0015): whole areas only, with status and as-of date
    for (const op of world.ops || []) {
      const p = op.properties;
      const status = `${GT.t('ops.' + p.status)} (${p.status_as_of} ${GT.t('ops.asof')})`;
      gRoot.append('path').datum(op).attr('d', path).attr('class', 'm-ops' + (p.status === 'active' ? '' : ' ended'))
        .on('pointermove', (ev) => showTip(ev, GT.upper(p['name_' + GT.lang] || p.name_tr),
          [status, p['status_note_' + GT.lang] || p['note_' + GT.lang]].filter(Boolean).join(' · ')))
        .on('pointerleave', hideTip);
    }
    // Mavi Vatan: agreed maritime areas and Türkiye's notified limits (contested → dashed)
    for (const m of world.maritime) {
      const p = m.properties, area = /Polygon/.test(m.geometry.type);
      gRoot.append('path').datum(m).attr('d', path)
        .attr('class', (area ? 'm-blue-area' : 'm-blue-line') + (['claimed', 'schematic', 'licence'].includes(p.status) ? ' ' + p.status : ''))
        .on('pointermove', (ev) => showTip(ev, GT.upper(p['name_' + GT.lang] || p.name_tr),
          GT.t(p.kind === 'internal-waters' ? 'lg.internal' : { claimed: 'lg.position', schematic: 'lg.schematic', licence: 'lg.licence' }[p.status] || 'lg.agreed')))
        .on('pointerleave', hideTip);
    }
    // Turkish islands; Kardak drawn hollow (Türkiye's position, contested)
    gIslands = gRoot.append('g');
    for (const i of world.islands) {
      const p = i.properties, [x, y] = proj(i.geometry.coordinates);
      const name = p['name_' + GT.lang] || p.name_tr;
      const m = gIslands.append('g').attr('class', 'mk').attr('data-x', x).attr('data-y', y)
        .on('pointermove', (ev) => showTip(ev, GT.upper(name), GT.t(p.status === 'tur' ? 'lg.island' : 'lg.position')))
        .on('pointerleave', hideTip);
      m.append('circle').attr('class', 'm-isl' + (p.status === 'tur' ? '' : ' pos')).attr('r', 3.2);
    }
    // Türkiye's diplomatic missions at city level (inviolable under the Vienna Conventions, not Turkish territory)
    // Each is a zero-length round-capped stroke with vector-effect: non-scaling-stroke (an outline dot under a fill dot,
    // the same geometry as an r 2.4 circle with a 0.6 outline), so it keeps its on-screen size at any zoom untouched.
    const gMissions = gRoot.append('g');
    for (const ms of world.missions) {
      const p = ms.properties, [x, y] = proj(ms.geometry.coordinates), d = `M${x},${y}h0`;
      const m = gMissions.append('g').attr('class', 'mk m-mission-g')
        .on('pointermove', (ev) => showTip(ev, GT.upper(p['name_' + GT.lang] || p.name_tr || p.city_tr), (p['city_' + GT.lang] || p.city_tr) + ' · ' + GT.t('lg.mission')))
        .on('pointerleave', hideTip)
        .on('click', () => { if (/^https:\/\//.test(p.url || '')) window.open(p.url, '_blank', 'noopener'); });
      m.append('path').attr('class', 'm-mission-edge').attr('d', d);
      m.append('path').attr('class', 'm-mission').attr('d', d);
    }
    const lm = document.getElementById('l-missions');
    if (lm) { const sync = () => svg.classed('hide-missions', !lm.checked); lm.onchange = sync; sync(); }
    const la = document.getElementById('l-activity');
    if (la) {
      const sync = () => { svg.classed('show-activity', la.checked); ensureDensity(la.checked); syncKey(); };
      la.onchange = sync;
      sync();
    }
    syncKey();
    gRoot.append('path').datum(tr).attr('class', 'm-tr-glow').attr('d', path).attr('filter', 'url(#glow)');
    gLabels = gRoot.append('g');
    ensurePlaces();
    const c = proj([35, 39]);
    sweepG = GT.sweep(gRoot.append('g').attr('transform', `translate(${c[0]},${c[1]})`), Math.hypot(W, H) * 1.1, reduce, 16);
    gUnc = gRoot.append('g').attr('class', 'm-unc-layer');
    gSites = gRoot.append('g');
    gEvents = gRoot.append('g');
    drawLabels();

    gmap.ready();
    if (base) { base.resize(); syncBase(d3.zoomIdentity); }
  }

  /* The engine batches the transform and the cursor read-out into one animation frame. The
     tooltip is the page's own, and batched for the same reason: a DOM write between two pointer
     events makes the next d3.pointer() read force a synchronous layout of the whole map. */
  const pending = { tip: undefined };
  let frameReq = 0;
  function schedule() { if (!frameReq) frameReq = requestAnimationFrame(flush); }
  function flush() {
    frameReq = 0;
    applyTip();
  }

  function drawLabels() {
    if (!gLabels) return;
    gLabels.selectAll('*').remove();
    const add = (cls, at, fs, text, dy = 0) => {
      const p = proj(at);
      return gLabels.append('text').attr('class', cls).attr('data-x', p[0]).attr('data-y', p[1] + dy).attr('font-size', fs).text(text);
    };
    for (const s of GT.SEAS) add('m-sea', s.at, 11 * s.size, GT.upper(s[GT.lang]));
    for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
      const small = ['CYP', 'XNC', 'LBN', 'ISR', 'ARM', 'KWT', 'MKD', 'ALB'].includes(a3);
      add('m-label' + (small ? ' sm' : ''), at, small ? 7 : 9.5, GT.upper(GT.countryName(a3)));
    }
    for (const code of GT.REGION_CODES) {
      const r = GT.REGIONS[code];
      // single-country regions already carry the country label; the Black Sea already has a sea label
      if (!r.at || r.countries.length === 1 || code === 'black-sea') continue;
      add('m-rlabel', r.at, 9, GT.upper(GT.label('regions', code)), 14).attr('data-region', code);
    }
    for (const pl of GT.PLACE_LABELS || []) add('m-label sm', pl.at, 7, GT.upper(pl[GT.lang]));
    /* Badges sit under the country name and scale with the labels, not with the map: a glyph that
       grew with the zoom would be a shape on the ground. One <g> per country, one <use> per mark,
       so the glyph paths exist once in <defs> (GT.mapDefs) and the layer is a few dozen nodes. */
    for (const [a3, at] of Object.entries(GT.COUNTRY_LABELS)) {
      const marks = GT.partnerBadges(a3);
      if (!marks.length) continue;
      const p = proj(at);
      const g = gLabels.append('g').attr('class', 'm-badges').attr('data-x', p[0]).attr('data-y', p[1] + 9);
      g.append('title').text(GT.countryName(a3) + ' — ' + marks.map((m) => GT.t('bd.' + m)).join(' · '));
      /* width and height are attributes, not CSS: a <use> of a <symbol> with a viewBox and no
         size renders at the whole viewport, which is how a nine-pixel star became a mountain. */
      marks.forEach((m, i) => g.append('use').attr('href', '#bd-' + m).attr('class', 'bd bd-' + m)
        .attr('width', 9).attr('height', 9)
        .attr('x', (i - (marks.length - 1) / 2) * 11 - 4.5).attr('y', 0));
    }
    placeTiers.clear(); // the city tiers are built as the map is zoomed into them (addPlaceTier)
    // centred on Türkiye's centroid; letters spaced with thin spaces (CSS letter-spacing would add a trailing gap)
    const trF = world.countries.find((f) => GT.a3(f) === 'TUR');
    add('m-tr-label', d3.geoCentroid(trF), 19, [...GT.upper('Türkiye')].join('  '));
    rescale();
  }

  /* ---------------- map key ----------------
     The key explains what is on screen: a row whose layer is switched off is hidden, the count in
     the summary is the number of rows actually shown, and whether the key is open is remembered.
     Seventeen rows pinned open covered half the map, which is what made the panel feel crowded. */
  function syncKey() {
    const box = document.getElementById('p-legend');
    if (!box) return;
    let shown = 0;
    box.querySelectorAll('.lg').forEach((row) => {
      const id = row.dataset.lyr;
      const on = !id || (document.getElementById(id) || { checked: true }).checked;
      row.hidden = !on;
      if (on) shown += 1;
    });
    const n = document.getElementById('p-legend-n');
    if (n) n.textContent = String(shown);
  }

  let sweepG = null, gIslands = null, places = [], placesAsked = false;
  let gActivity = null, density = null, densityAsked = false;

  /* ---------------- announced activity (assets/data/msi-density.json) ----------------
     Where navigational warnings were announced between 2015 and 2021, on a 0.25° grid: a picture of
     seven years, not of anything now, and never of Turkish warnings (they are not in the file).
     It is off by default and fetched the first time it is switched on — a normal visit never asks
     for it. The cells are drawn as four paths, one per intensity band, rather than 3,579 rectangles:
     the whole layer is then four DOM nodes and redraws with the map. */
  const ACT_BANDS = [1, 4, 16, 64];
  function ensureDensity(on) {
    if (!on || densityAsked) return;
    densityAsked = true;
    fetch('assets/data/msi-density.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('msi-density: HTTP ' + r.status))))
      .then((d) => { density = d; drawActivity(); })
      .catch((e) => console.info('activity layer off:', e.message));
  }
  function drawActivity() {
    if (!gActivity || !density || !proj) return;
    const step = density.method.cell_deg;
    const bands = ACT_BANDS.map(() => []);
    for (const [lon, lat, mil, survey, other] of density.cells) {
      const n = mil + survey + other;
      let band = 0;
      while (band < ACT_BANDS.length - 1 && n >= ACT_BANDS[band + 1]) band += 1;
      const a = proj([lon, lat + step]);
      const b = proj([lon + step, lat]);
      if (!a || !b) continue;
      bands[band].push(`M${a[0].toFixed(1)},${a[1].toFixed(1)}H${b[0].toFixed(1)}V${b[1].toFixed(1)}H${a[0].toFixed(1)}Z`);
    }
    gActivity.selectAll('*').remove();
    bands.forEach((d, i) => {
      if (d.length) gActivity.append('path').attr('class', 'm-act b' + i).attr('d', d.join(''));
    });
  }
  /* Fetched the first time the map is drawn without a basemap — on a normal visit, never. */
  function ensurePlaces() {
    if (placesAsked || base) return;
    placesAsked = true;
    GT.loadPlaces().then((list) => {
      places = list;
      if (svg && !base) rescale(); // builds the tiers the current zoom calls for, and no others
    });
  }
  /* Cities are drawn tier by tier, as the map reaches the zoom that shows them. Building all 455
     labels for a view that shows twelve of them cost half a thousand DOM nodes nobody could read;
     now a tier is built the first time it is needed and never again. They are drawn only when no
     basemap is under the map: with tiles there, the settlement labels are the basemap's, and two
     sets of city names on one map is one too many. */
  const placeTiers = new Set();
  const placeTierOf = (q) => (q.cap || q.p >= 1000000 ? 1 : q.p >= 300000 ? 2 : 3);
  function addPlaceTier(tier) {
    if (base || !gLabels || !places.length || placeTiers.has(tier)) return;
    placeTiers.add(tier);
    /* A tier is a few hundred groups, and appending them one at a time makes the browser lay the
       map out a few hundred times. They are built in a fragment, off the document, and inserted
       in one go — the same nodes, one layout. */
    const NS = 'http://www.w3.org/2000/svg';
    const frag = document.createDocumentFragment();
    const size = tier === 1 ? '7.5' : '6.5';
    for (const f of places) {
      const q = f.properties;
      if (placeTierOf(q) !== tier) continue;
      const at = proj(f.geometry.coordinates);
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'm-place t' + tier);
      g.dataset.x = at[0];
      g.dataset.y = at[1];
      const dot = document.createElementNS(NS, 'path');
      dot.setAttribute('class', 'm-place-dot');
      dot.setAttribute('d', 'M0,0h0');
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', '4.5');
      text.setAttribute('y', '2.6');
      text.setAttribute('font-size', size);
      text.textContent = q.tr || q.n;
      g.append(dot, text);
      frag.append(g);
    }
    gLabels.node().append(frag);
    scaleLabels();
  }

  function scaleLabels() {
    if (!gLabels) return;
    const f = Math.pow(k, 0.82);
    const label = function () { return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / f})`; };
    gLabels.selectAll(':scope > text').attr('transform', label);
    gLabels.selectAll('g.m-place').attr('transform', label);
    gLabels.selectAll('g.m-badges').attr('transform', label);
    gLabels.selectAll('.m-tr-label').style('stroke-width', 3 * f + 'px');
  }

  function rescale() {
    if (!gLabels) return;
    maybeInitBase(k); // the first zoom past the overview is what brings the basemap in
    svg.classed('zoomed', k >= 1.25); // small-country and region labels only appear once zoomed in
    // our own city labels come in as the map zooms; the deeper tiers stay hidden until there is room
    svg.classed('zp2', k >= 2).classed('zp3', k >= 5).classed('zp4', k >= 14);
    if (k >= 2) addPlaceTier(1);
    if (k >= 5) addPlaceTier(2);
    if (k >= 14) addPlaceTier(3);
    // past this point the 50m outline is coarser than what is drawn underneath: let the tiles show
    svg.classed('deep', !!base && k >= 6);
    /* Without a basemap there is nothing underneath, and the maritime areas overlap the 1:50m land
       by hundreds of square kilometres — their own coastlines are finer than the one we draw. At a
       regional zoom that is invisible; at 40x it paints İstanbul blue. Past this point the fills
       step back to outlines, so the reader sees the claim without losing the coast. */
    svg.classed('flat-sea', !base && k >= 12);
    if (sweepG) sweepG.style('opacity', Math.max(0, 1 - (k - 1) / 1.2)); // the sweep is an overview effect; fade it when zoomed in
    // labels shrink as the map zooms (by k^0.82) through their transform, so zooming never re-lays out
    // text; the Türkiye label's outline keeps its width in map units, as before (scaleLabels)
    scaleLabels();
    const place = function () { return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / k})`; };
    gSites.selectAll('.mk').attr('transform', place);
    gEvents.selectAll('.mk').attr('transform', place);
    if (gIslands) gIslands.selectAll('.mk').attr('transform', place);
    if (els.scale) els.scale.textContent = k.toFixed(1) + '×';
  }

  /* A point is only as good as its uncertainty, and a record whose position is known to the island
     must not look like one known to the metre. Anything coarser than UNC_FROM is drawn as the circle
     the source actually supports, under the marker, in map coordinates so it keeps its real size as
     the map zooms (ADR 0021 §5). The marker stays where it is: the circle says how much of the map
     around it the claim covers. */
  const UNC_FROM = 1500; // metres: below this the circle would be smaller than the marker at any zoom
  const uncircle = d3.geoCircle();

  function drawUncertainty(records) {
    if (!gUnc) return;
    gUnc.selectAll('*').remove();
    for (const r of records) {
      const g = r.location && r.location.geometry;
      const m = r.location && r.location.uncertainty_m;
      if (!g || g.type !== 'Point' || !(m >= UNC_FROM)) continue;
      const shape = uncircle.center(g.coordinates).radius((m / 6371008.8) * 180 / Math.PI)();
      gUnc.append('path')
        .attr('class', 'm-unc' + (r.id === state.selected ? ' sel' : ''))
        .attr('d', geoPath(shape))
        .append('title')
        .text(GT.t('p.uncCircle', { n: m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : m + ' m' }));
    }
  }

  function drawMarkers(list) {
    if (!gSites) return;
    gSites.selectAll('*').remove();
    gEvents.selectAll('*').remove();
    drawUncertainty(lyr.sites.checked ? allSites() : []);
    wireMarkerEvents();
    /* Markers are rebuilt whenever the list changes, and there are a few hundred of them with the
       missions layer on. Binding four listeners to each one meant a thousand listeners per draw,
       all of them garbage a moment later: a census after load counted 11,983 live listeners.
       One set on the map, installed once (wireMarkerEvents), reads the record id off the group
       instead. The behaviour is identical; the allocation is not. */
    const bind = (m, rec, title, sub) => m
      .attr('class', 'mk' + (rec.id === state.selected ? ' sel' : ''))
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', title)
      .attr('data-id', rec.id).attr('data-tip', title).attr('data-sub', sub || '');

    if (lyr.sites.checked) {
      for (const s of allSites()) {
        const g = s.location && s.location.geometry;
        if (!g || g.type !== 'Point') continue;
        const [x, y] = proj(g.coordinates);
        const m = gSites.append('g').attr('data-x', x).attr('data-y', y);
        bind(m, s, GT.txt(s.name), GT.upper(GT.label('site-types', s.site_type)));
        m.append('path').attr('class', 'mk-site').attr('d', d3.symbol(d3.symbolDiamond, 80)());
      }
    }
    if (lyr.events.checked) {
      const pulseAll = list.length <= 40;
      /* Records without coordinates are counted, not scattered. They used to fan out from the region's
         anchor in a spiral; with forty automatic records in one region the spiral reached across
         Anatolia and drew events on Turkish soil that no record puts there. One ring per region,
         with the count, says what is known: this many records, somewhere in this region. */
      const perRegion = new Map();
      for (const e of list) {
        const g = e.location && e.location.geometry;
        const pt = g ? (g.type === 'Point' ? g.coordinates : d3.geoCentroid(g)) : null;
        if (!pt) {
          const code = e.regions[0];
          if (GT.REGIONS[code] && GT.REGIONS[code].at) perRegion.set(code, (perRegion.get(code) || []).concat(e));
          continue;
        }
        const [x, y] = proj(pt);
        const m = gEvents.append('g').attr('data-x', x).attr('data-y', y);
        bind(m, e, GT.txt(e.title), GT.upper(GT.label('event-types', e.event_type)));
        if (!reduce && (pulseAll || e.id === state.selected)) m.append('circle').attr('class', 'mk-pulse').attr('r', 6);
        m.append('circle').attr('class', 'mk-ev st-' + e.assessment.status + (e._example ? ' is-example' : '')).attr('r', 5.5);
      }
      for (const [code, recs] of perRegion) {
        const [x, y] = proj(GT.REGIONS[code].at);
        const n = recs.length;
        const worst = recs.some((r) => r.assessment.status === 'unverified') ? 'unverified' : recs[0].assessment.status;
        const title = GT.t('p.regionalN', { n, region: GT.txt(GT.REGIONS[code].label) });
        const m = gEvents.append('g').attr('data-x', x).attr('data-y', y)
          .attr('class', 'mk mk-group' + (state.region === code ? ' sel' : '')).attr('tabindex', 0).attr('role', 'button')
          .attr('aria-label', title).attr('data-region-group', code).attr('data-tip', title).attr('data-sub', GT.t('p.regional'));
        const r = n === 1 ? 5 : Math.min(16, 7 + 1.6 * Math.sqrt(n));
        m.append('circle').attr('class', 'mk-ev is-regional st-' + worst).attr('r', r);
        if (n > 1) m.append('text').attr('class', 'mk-count').attr('dy', '0.35em').text(n);
      }
    }
    rescale();
  }

  /* One set of handlers for every marker, on the map itself. `closest` finds the group a pointer
     or a key landed in, and the record comes from the id on it. */
  let markerEventsWired = false;
  function wireMarkerEvents() {
    if (markerEventsWired || !els.map) return;
    markerEventsWired = true;
    const groupAt = (ev) => (ev.target && ev.target.closest ? ev.target.closest('.mk[data-id]') : null);
    const recordOf = (g) => (g && data ? data.byId.get(g.getAttribute('data-id')) : null);
    // a regional count ring opens its region's list, the same as choosing the region on the board
    const regionGroupAt = (ev) => (ev.target && ev.target.closest ? ev.target.closest('.mk[data-region-group]') : null);
    const openRegion = (g) => { const c = g.getAttribute('data-region-group'); setRegion(state.region === c ? '' : c); };
    els.map.addEventListener('click', (ev) => {
      const rg = regionGroupAt(ev);
      if (rg) { ev.stopPropagation(); openRegion(rg); return; }
      const rec = recordOf(groupAt(ev));
      if (rec) { ev.stopPropagation(); select(rec, true); }
    });
    els.map.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const rg = regionGroupAt(ev);
      if (rg) { ev.preventDefault(); openRegion(rg); return; }
      const rec = recordOf(groupAt(ev));
      if (rec) { ev.preventDefault(); select(rec, true); }
    });
    els.map.addEventListener('pointermove', (ev) => {
      const g = groupAt(ev) || regionGroupAt(ev);
      if (g) showTip(ev, g.getAttribute('data-tip') || '', g.getAttribute('data-sub') || '');
    });
    els.map.addEventListener('pointerleave', hideTip);
  }

  function applyRegionClass() {
    if (!svg) return;
    svg.classed('show-regions', lyr.regions.checked || !!state.region);
    // countries and the areas drawn with their de jure state (Golan, Palestine, Crimea)
    gRoot.selectAll('.m-land').classed('hl', function () { return !!state.region && this.getAttribute('data-region') === state.region; });
    gLabels.selectAll('.m-rlabel').style('opacity', function () { return state.region && this.dataset.region === state.region ? 1 : null; });
  }

  function zoomToRegion(code, animate) {
    const r = GT.REGIONS[code];
    if (!gmap || !r) return;
    const a = proj(r.bbox[0]), b = proj(r.bbox[1]);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    // the map now goes to 192x; a region may use a good part of that, but not all of it — a region
    // shown at its tightest fit loses the context that makes it a region
    const kk = Math.max(1, Math.min(48, 0.82 / Math.max((x1 - x0) / viewW(), (y1 - y0) / H)));
    const t = d3.zoomIdentity.translate(viewW() / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    gmap.transform(t, animate && !reduce ? 900 : 0);
  }
  // Visible map width: the open drawer covers the right side on wide screens.
  const viewW = () => (els.drawer.classList.contains('open') && window.innerWidth > 860 ? Math.max(200, W - els.drawer.offsetWidth) : W);

  function flyTo(rec) {
    const g = rec.location && rec.location.geometry;
    if (!gmap) return;
    if (!g) { if (rec.regions && rec.regions.length) zoomToRegion(rec.regions[0], true); return; }
    const [x, y] = proj(g.type === 'Point' ? g.coordinates : d3.geoCentroid(g));
    const kk = Math.max(k, rec.id.startsWith('sit_') ? 6 : 4);
    const t = d3.zoomIdentity.translate(viewW() / 2, H / 2).scale(kk).translate(-x, -y);
    gmap.transform(t, reduce ? 0 : 900);
  }

  function setRegion(code) {
    state.region = code;
    els.region.value = code;
    render();
    if (code) zoomToRegion(code, true);
    else if (gmap) gmap.reset(reduce ? 0 : 700);
  }

  /* ---------------- the board ----------------
     The first thing on the page is not a control but an answer: for each watch region, how much we
     have recorded in the selected period, how much activity other states announced at sea there,
     and how fresh the newest record is. A row is a filter, so reading and narrowing are the same
     gesture.

     The two columns are deliberately not mixed into one score. Records are what this project has
     verified and stands behind; announced activity is a count of other states' navigational
     warnings 2015-2021 (msi-regions.json, built by tools/msi/build_activity.py). One is our work,
     the other is theirs, and a reader who sees them side by side can tell which is which. A region
     with no counted sea — the inland ones — reads "—", never "0": nobody measured, which is not
     the same as nothing happened. */
  const nf = () => new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const activityOf = (code) => (regionActivity && regionActivity[code] && regionActivity[code].cells ? regionActivity[code].military : null);

  function loadRegionActivity() {
    fetch('assets/data/msi-regions.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.regions) { regionActivity = d.regions; renderBoard(filtered({ anyRegion: true })); } })
      .catch(() => {}); // the board still reads without it; the column shows "—"
  }

  function renderBoard(list) {
    if (!els.board) return;
    const count = {}, newest = {};
    for (const e of list) {
      for (const r of e.regions || []) {
        count[r] = (count[r] || 0) + 1;
        const t = (e.time && e.time.start) || '';
        if (t > (newest[r] || '')) newest[r] = t;
      }
    }
    const rows = GT.REGION_CODES.filter((c) => c !== 'global').map((code) => ({ code, n: count[code] || 0, act: activityOf(code), last: newest[code] || '' }));
    const peak = Math.max(1, ...rows.map((r) => r.act || 0));
    const by = boardSort === 'activity'
      ? (a, b) => (b.act || 0) - (a.act || 0) || b.n - a.n
      : (a, b) => b.n - a.n || (b.act || 0) - (a.act || 0);
    rows.sort((a, b) => by(a, b) || GT.label('regions', a.code).localeCompare(GT.label('regions', b.code), GT.lang === 'tr' ? 'tr' : 'en'));

    const fmt = nf();
    els.board.replaceChildren(...rows.map((r) => {
      const b = GT.el('button', 'p-rb' + (r.n ? '' : ' is-quiet') + (state.region === r.code ? ' on' : ''));
      b.type = 'button';
      b.dataset.region = r.code;
      b.setAttribute('aria-pressed', String(state.region === r.code));
      const bar = GT.el('span', 'p-rb-act');
      if (r.act === null) {
        bar.append(GT.el('span', 'p-rb-dash', '—'));
        bar.title = GT.t('p.board.nosea');
      } else {
        const fill = GT.el('span', 'p-rb-bar');
        fill.style.setProperty('--w', (100 * r.act / peak).toFixed(1) + '%');
        bar.append(fill, GT.el('span', 'p-rb-num mono', fmt.format(r.act)));
        bar.title = GT.t('p.board.actTip', { n: new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB').format(r.act) });
      }
      const name = GT.el('span', 'p-rb-name', GT.label('regions', r.code));
      name.title = GT.label('regions', r.code); // the column is narrow; the long names are clipped
      b.append(
        name,
        GT.el('span', 'p-rb-n mono', r.n ? String(r.n) : '·'),
        bar,
        GT.el('span', 'p-rb-last mono', r.last ? GT.fmtTime(r.last, 'day').replace(/\s\d{4}$/, '') : '—'),
      );
      b.addEventListener('click', () => setRegion(state.region === r.code ? '' : r.code));
      return b;
    }));
    els.boardClear.hidden = !state.region;
    document.querySelectorAll('.p-board-sort').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.sort === boardSort)));
  }

  /* How many narrowings are folded away under the controls, so nothing is hidden silently. */
  function syncControlsCount() {
    const n = [state.q.trim(), state.type, state.status].filter(Boolean).length
      + (lyr.examples.checked ? 1 : 0)
      + Object.entries(lyr).filter(([key, el]) => key !== 'examples' && !el.checked).length;
    els.controlsN.textContent = n ? String(n) : '';
    els.controls.classList.toggle('has-n', !!n);
  }

  /* ---------------- rendering ---------------- */
  /* The four lines above the list answer, in order, the questions a reader asks before reading any
     record: how many in the window, how sure are they, where are they, and how fresh is the newest.
     Every number is derived from the filtered list, so it always describes what is on screen. */
  function renderSummary(list) {
    const box = document.getElementById('p-sum');
    if (!box) return;
    box.classList.toggle('is-empty', !list.length);
    const byStatus = {};
    const byRegion = {};
    for (const e of list) {
      byStatus[e.assessment.status] = (byStatus[e.assessment.status] || 0) + 1;
      for (const r of e.regions || []) byRegion[r] = (byRegion[r] || 0) + 1;
    }
    const days = PERIODS[state.period];
    /* The number is the value and the window is its label, not the other way round: a reader scans
       the figures down the left edge and reads the caption only when a figure surprises them. */
    document.getElementById('p-sum-window').textContent = String(list.length);
    document.getElementById('p-sum-window-k').textContent = days
      ? (days === 365 ? GT.t('p.sum.recordsYear') : GT.t('p.sum.recordsIn', { d: days }))
      : GT.t('p.sum.recordsAll');
    /* One figure, not a breakdown: how much of what is on screen the project actually stands
       behind. The full tally is a hover away rather than four words wide. */
    const statusEl = document.getElementById('p-sum-status');
    statusEl.textContent = list.length ? (byStatus.verified || 0) + ' / ' + list.length : '—';
    statusEl.title = Object.keys(GT.STATUS)
      .filter((key) => byStatus[key])
      .map((key) => GT.txt(GT.STATUS[key]) + ' ' + byStatus[key])
      .join(' · ');
    const top = Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('p-sum-top').textContent = top ? GT.label('regions', top[0]) + ' ' + top[1] : '—';
    const newest = list[0] && list[0].time && list[0].time.start;
    document.getElementById('p-sum-last').textContent = newest ? GT.fmtTime(newest, "day") : '—';
  }

  /* Whether the thing is alive is the first question anyone asks of a feed, and it should not need
     a second click. The line is the data's own account of itself: when it was built, and how much
     of each kind it holds — no estimate, no "live" claim we cannot keep. */
  function renderPulse() {
    const el = document.getElementById('p-pulse');
    if (!el) return;
    const m = data && data.manifest;
    if (!m) { el.textContent = ''; return; }
    const c = m.counts || {};
    el.textContent = GT.t('p.pulse', {
      // an ISO stamp, not a localised date: this line is a timestamp, and it has to fit on one
      at: m.built_at ? m.built_at.slice(0, 16).replace('T', ' ') + 'Z' : '—',
      e: c.event || 0, s: c.site || 0, src: c.source || 0,
    });
  }

  function render() {
    const list = filtered();
    els.count.textContent = GT.t('p.count', { n: list.length });
    renderSummary(list);
    renderBoard(filtered({ anyRegion: true }));
    renderPulse();
    syncControlsCount();
    els.banner.hidden = !lyr.examples.checked;
    renderFeed(list);
    drawMarkers(list);
    applyRegionClass();
    syncUrl();
  }

  function renderFeed(list) {
    els.feed.replaceChildren();
    if (loadError) {
      const box = GT.el('div', 'p-empty');
      box.append(GT.el('p', null, GT.t('p.err')));
      const b = GT.el('button', 'btn btn-sm', GT.t('p.retry'));
      b.type = 'button';
      b.addEventListener('click', loadAll);
      box.append(b);
      els.feed.append(box);
      return;
    }
    if (!data) return;
    if (!list.length) {
      const box = GT.el('div', 'p-empty');
      box.append(GT.el('p', null, GT.t(data.event.length ? 'p.none' : 'p.noreal')));
      if (!data.event.length) {
        const a = GT.el('a', 'btn btn-sm btn-red', GT.t('p.addFirst'));
        a.href = GT.REPO + '/datasets/issues/new/choose';
        a.target = '_blank'; a.rel = 'noopener';
        box.append(a);
      }
      els.feed.append(box);
      return;
    }
    for (const e of list) {
      const li = GT.el('div');
      li.setAttribute('role', 'listitem');
      const b = GT.el('button', 'fi');
      b.type = 'button';
      b.dataset.id = e.id;
      b.setAttribute('aria-current', String(e.id === state.selected));
      const top = GT.el('div', 'fi-top');
      top.append(GT.el('span', null, GT.fmtTime(e.time.start, e.time.precision)), GT.el('span', 'chip', GT.label('event-types', e.event_type)),
        GT.el('span', 'badge st-' + e.assessment.status, GT.txt(GT.STATUS[e.assessment.status])));
      if (e._example) top.append(GT.el('span', 'ex-tag', GT.upper(GT.t('p.example'))));
      /* How many independent publishers stand behind this, in the list rather than two clicks
         away. A single-source claim and a corroborated one look the same otherwise, and the
         difference is the whole of the verification scale: one source is a report, two are a
         finding. The registry id is the publisher when there is one; the hostname otherwise,
         so two articles from the same outlet still count once. */
      const publishers = new Set((e.sources || []).map((c) => c.ref || (c.url || '').split('/')[2]).filter(Boolean));
      if (publishers.size === 1) top.append(GT.el('span', 'chip chip-thin', GT.t('p.oneSource')));
      const where = e.location && e.location.geometry ? GT.txt(GT.PRECISION[e.location.precision]) : GT.t('p.nogeo');
      b.append(top, GT.el('div', 'fi-title', GT.txt(e.title)), GT.el('div', 'fi-meta', e.regions.map((r) => GT.label('regions', r)).join(' · ') + ' — ' + where));
      b.addEventListener('click', () => select(e, true));
      li.append(b);
      els.feed.append(li);
    }
  }

  function select(rec, fly) {
    lastFocus = document.activeElement;
    state.selected = rec.id;
    renderDrawer(rec);
    els.drawer.classList.add('open');
    els.drawer.setAttribute('aria-hidden', 'false');
    els.drawer.inert = false;
    els.close.focus({ preventScroll: true });
    els.feed.querySelectorAll('.fi').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === rec.id)));
    drawMarkers(filtered());
    if (fly) flyTo(rec);
    syncUrl();
  }

  function closeDrawer() {
    if (!els.drawer.classList.contains('open')) return;
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.drawer.inert = true;
    state.selected = '';
    els.feed.querySelectorAll('.fi').forEach((b) => b.setAttribute('aria-current', 'false'));
    drawMarkers(filtered());
    syncUrl();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  const actorName = (id) => { const a = data && data.byId.get(id); return a ? GT.txt(a.name) : id; };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
  const ext = (a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };

  function renderDrawer(rec) {
    const body = GT.el('div', 'd-body');
    const isEvt = rec.id.startsWith('evt_');
    if (rec._example) body.append(GT.el('p', 'd-warn', GT.t('d.exampleWarn')));

    const kick = GT.el('div', 'd-kicker');
    if (isEvt) kick.append(GT.el('span', 'chip', GT.label('event-types', rec.event_type)), GT.el('span', 'badge st-' + rec.assessment.status, GT.txt(GT.STATUS[rec.assessment.status])));
    if (rec.site_type) kick.append(GT.el('span', 'chip', GT.label('site-types', rec.site_type)));
    if (rec._example) kick.append(GT.el('span', 'ex-tag', GT.upper(GT.t('p.example'))));
    body.append(kick);

    const h = GT.el('h2', 'd-title', GT.txt(rec.title || rec.name));
    h.id = 'p-d-title';
    body.append(h);
    const sum = rec.summary || rec.description;
    if (sum) body.append(GT.el('p', 'd-sum', GT.txt(sum)));

    const dl = GT.el('dl', 'd-dl');
    const row = (key, content) => {
      if (content == null || content === '' || (Array.isArray(content) && !content.length)) return;
      const r = GT.el('div', 'd-row');
      r.append(GT.el('dt', null, GT.t(key)));
      const dd = GT.el('dd');
      if (Array.isArray(content)) {
        const ul = GT.el('ul');
        content.forEach((c) => { const li = GT.el('li'); li.append(c); ul.append(li); });
        dd.append(ul);
      } else dd.append(content);
      r.append(dd);
      dl.append(r);
    };
    const withSub = (main, sub) => { const s = GT.el('span', null, main); if (sub) s.append(GT.el('span', 'sub', sub)); return s; };

    if (isEvt) {
      const t = rec.time;
      row('d.time', withSub(GT.fmtTime(t.start, t.precision) + (t.end ? ' → ' + GT.fmtTime(t.end, t.precision) : ''), `${GT.t('d.basis')}: ${t.basis} · ${t.precision}`));
    }
    if (rec.location) {
      const l = rec.location, g = l.geometry, bits = [];
      if (g && g.type === 'Point') bits.push(GT.fmtLL(g.coordinates));
      if (l.uncertainty_m) bits.push('±' + (l.uncertainty_m >= 1000 ? l.uncertainty_m / 1000 + ' km' : l.uncertainty_m + ' m'));
      bits.push(l.method);
      row('d.location', withSub([GT.txt(l.place_name), GT.txt(GT.PRECISION[l.precision])].filter(Boolean).join(' — '), bits.join(' · ')));
    }
    if (rec.regions) row('d.regions', rec.regions.map((r) => GT.label('regions', r)).join(' · '));
    if (isEvt && rec.countries) row('d.countries', rec.countries.map((c) => GT.countryName(c)).join(' · '));
    if (!isEvt && rec.country) row('d.country', GT.countryName(rec.country));
    if (rec.operators) row('d.operators', rec.operators.map(actorName).join(' · '));
    if (rec.actors) row('d.actors', rec.actors.map((a) => withSub(actorName(a.ref), GT.ROLE[a.role] ? GT.txt(GT.ROLE[a.role]) : a.role)));
    if (rec.equipment) row('d.equipment', rec.equipment.map((q) => {
      const r2 = data.byId.get(q.ref);
      return (r2 ? GT.txt(r2.name) : q.ref) + (q.quantity ? ` · ${q.quantity} ${GT.t('d.qty')}` : '');
    }));
    if (rec.claims) row('d.claims', rec.claims.map((c) => withSub(GT.t('d.claimBy', { actor: actorName(c.by) }), `${GT.label('characterizations', c.characterization)} · [${c.source + 1}]`)));
    if (rec.sources) row('d.sources', rec.sources.map((s, i) => {
      const wrap = GT.el('span');
      const pub = s.ref && data.byId.get(s.ref);
      const a = ext(GT.el('a', 'd-link', `[${i + 1}] ` + (pub ? GT.txt(pub.name) : hostOf(s.url))));
      a.href = safeUrl(s.url);
      wrap.append(a);
      (s.archives || []).forEach((ar) => { const x = ext(GT.el('a', 'd-arch', GT.t('d.archive'))); x.href = safeUrl(ar.url); wrap.append(x); });
      const rel = s.reliability || (pub && pub.reliability);
      const meta = [s.lang && s.lang.toUpperCase(), s.published_at ? GT.fmtTime(s.published_at, 'minute') : '', rel ? rel + ' — ' + GT.txt(GT.RELIABILITY[rel]) : ''].filter(Boolean).join(' · ');
      if (meta) wrap.append(GT.el('span', 'sub', meta));
      return wrap;
    }));
    if (GT.isAuto(rec)) body.append(GT.el('p', 'doc-note-top', GT.t('d.auto')));
    if (rec.assessment) {
      const a = rec.assessment;
      row('d.assessment', withSub(`${GT.txt(GT.STATUS[a.status])} · ${a.credibility} — ${GT.txt(GT.CREDIBILITY[a.credibility])}`, a.method && a.method.length ? GT.t('d.method') + ': ' + a.method.join(', ') : ''));
    }
    const idBox = GT.el('span', 'd-id');
    const cp = GT.el('button', null, GT.t('d.copy'));
    cp.type = 'button';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(rec.id); cp.textContent = GT.t('d.copied'); setTimeout(() => { cp.textContent = GT.t('d.copy'); }, 1500); } catch (e) { /* clipboard blocked */ }
    });
    idBox.append(GT.el('code', null, rec.id), cp);
    row('d.id', idBox);
    body.append(dl);

    const act = GT.el('div', 'd-actions');
    const gh = ext(GT.el('a', 'btn btn-sm', GT.t('d.github')));
    gh.href = GT.recordUrl(rec);
    act.append(gh);
    if (!rec._example) {
      const cr = ext(GT.el('a', 'btn btn-sm', GT.t('d.correct')));
      cr.href = `${GT.REPO}/datasets/issues/new?template=03-correction.yml&title=${encodeURIComponent('Düzeltme / Correction: ' + rec.id)}`;
      act.append(cr);
    }
    body.append(act);
    els.body.replaceChildren(body);
  }

  /* ---------------- tooltip, url, wiring ---------------- */
  // the tooltip is written in the next animation frame (see flush); its text only when it changes
  let tipText = null;
  function showTip(ev, title, sub) {
    if (moving) return; // no tooltip while the map is being dragged or pinched
    pending.tip = { x: ev.clientX, y: ev.clientY, title, sub: sub || '' };
    schedule();
  }
  function hideTip() { pending.tip = null; schedule(); }
  function applyTip() {
    const s = pending.tip;
    if (s === undefined) return;
    pending.tip = undefined;
    if (!s) { els.tip.hidden = true; return; }
    const r = els.map.getBoundingClientRect();
    const text = s.title + '\n' + s.sub;
    if (text !== tipText) {
      tipText = text;
      els.tip.replaceChildren(document.createTextNode(s.title));
      if (s.sub) els.tip.append(GT.el('small', null, s.sub));
    }
    els.tip.style.left = s.x - r.left + 'px';
    els.tip.style.top = s.y - r.top + 'px';
    els.tip.hidden = false;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.region) p.set('region', state.region);
    if (state.type) p.set('type', state.type);
    if (state.status) p.set('status', state.status);
    if (state.period) p.set('period', state.period);
    if (state.selected) p.set('id', state.selected);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  /* The key follows every layer switch, so it can never describe a layer that is off. */
  function wireKey() {
    const box = document.getElementById('p-legend');
    if (!box) return;
    const KEY = 'gt-panel-key';
    try { box.open = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
    box.addEventListener('toggle', () => {
      try { localStorage.setItem(KEY, box.open ? '1' : '0'); } catch (e) { /* private mode */ }
    });
    ['l-events', 'l-sites', 'l-examples', 'l-missions', 'l-regions'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', syncKey);
    });
    syncKey();
  }

  function wireUi() {
    els.search.addEventListener('input', GT.debounce(() => { state.q = els.search.value; render(); }, 120));
    els.region.addEventListener('change', () => setRegion(els.region.value));
    els.type.addEventListener('change', () => { state.type = els.type.value; render(); });
    els.status.addEventListener('change', () => { state.status = els.status.value; render(); });
    els.boardClear.addEventListener('click', () => setRegion(''));
    document.querySelectorAll('.p-board-sort').forEach((el) => el.addEventListener('click', () => {
      boardSort = el.dataset.sort;
      renderBoard(filtered({ anyRegion: true }));
    }));
    Object.values(lyr).forEach((c) => c.addEventListener('change', render));
    const pb = $('p-brief');
    if (pb) pb.addEventListener('click', () => { printHeader(); window.print(); });
    $('z-in').addEventListener('click', () => gmap && gmap.zoomBy(1.7));
    $('z-out').addEventListener('click', () => gmap && gmap.zoomBy(1 / 1.7));
    $('z-reset').addEventListener('click', () => setRegion(''));
    els.close.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    document.addEventListener('gt:lang', () => {
      if (base) base.setLang(GT.lang);
      buildFilters();
      drawLabels();
      render();
      const r = state.selected && data && data.byId.get(state.selected);
      if (r) renderDrawer(r);
    });
    window.addEventListener('resize', GT.debounce(() => { drawMap(); render(); if (state.region) zoomToRegion(state.region, false); }, 200));
  }
})();
