/* Greater Türkiye — OSINT panel: zoomable map, filters, record feed, detail drawer. */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('p-utc'));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const els = {
    map: $('p-map'), feed: $('p-feed'), count: $('p-count'), drawer: $('p-drawer'), body: $('p-drawer-body'), close: $('p-close'),
    search: $('f-search'), region: $('f-region'), type: $('f-type'), status: $('f-status'), banner: $('p-banner'),
    coords: $('p-coords'), scale: $('p-scale'), tip: $('p-tip'), stateBox: $('p-state'),
  };
  const lyr = { regions: $('l-regions'), sites: $('l-sites'), events: $('l-events'), examples: $('l-examples') };
  const params = new URLSearchParams(location.search);
  const state = { region: params.get('region') || '', type: params.get('type') || '', status: params.get('status') || '', q: '', selected: params.get('id') || '' };

  let world = null, data = null, loadError = false;
  let svg = null, gRoot, gCountries, gLabels, gSites, gEvents, proj, zoom, k = 1, W = 0, H = 0;
  let lastFocus = null;

  wireUi();
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

  function filtered() {
    const q = fold(state.q.trim());
    return allEvents()
      .filter((e) => (!state.region || e.regions.includes(state.region))
        && (!state.type || e.event_type.split('.')[0] === state.type)
        && (!state.status || e.assessment.status === state.status)
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
  }
  function fillSelect(sel, opts, value) {
    sel.replaceChildren(...opts.map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; }));
    sel.value = value || '';
  }

  /* ---------------- map ---------------- */
  function drawMap() {
    if (!world) return;
    W = els.map.clientWidth; H = els.map.clientHeight;
    if (!W || !H) return;
    k = 1;
    // Balkans to Pakistan, Black Sea to the Gulf
    proj = d3.geoMercator().fitExtent([[24, 24], [W - 24, H - 24]], { type: 'MultiPoint', coordinates: [[13, 22], [74, 48]] });
    const path = d3.geoPath(proj);

    // the <svg> sits in a plain box that carries the pan/zoom transform while the map moves (see liveZoom)
    mover = d3.select(els.map).selectAll('div.p-mover').data([0]).join('div').attr('class', 'p-mover');
    svg = mover.selectAll('svg').data([0]).join('svg')
      .attr('viewBox', `0 0 ${W} ${H}`).attr('aria-label', GT.t('hero.mapAria'));
    svg.selectAll('*').remove();
    GT.mapDefs(svg);

    gRoot = svg.append('g');
    gRoot.append('path').datum(d3.geoGraticule().step([5, 5])()).attr('class', 'm-grat').attr('d', path);
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
          GT.t({ claimed: 'lg.position', schematic: 'lg.schematic', licence: 'lg.licence' }[p.status] || 'lg.agreed')))
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
    gRoot.append('path').datum(tr).attr('class', 'm-tr-glow').attr('d', path).attr('filter', 'url(#glow)');
    gLabels = gRoot.append('g');
    const c = proj([35, 39]);
    sweepG = GT.sweep(gRoot.append('g').attr('transform', `translate(${c[0]},${c[1]})`), Math.hypot(W, H) * 1.1, reduce, 16);
    gSites = gRoot.append('g');
    gEvents = gRoot.append('g');
    drawLabels();

    // the zoom behaviour lives on the map's container, so its coordinates don't move with the map (see liveZoom)
    pending.zoom = null; rendered = d3.zoomIdentity; moving = false; clearTimeout(settle);
    mover.style('transform', null);
    zoom = d3.zoom().scaleExtent([1, 16])
      .translateExtent([[-W * 0.3, -H * 0.3], [W * 1.3, H * 1.3]])
      .on('zoom', (ev) => {
        pending.zoom = ev.transform;
        clearTimeout(settle);
        if (!moving) { moving = true; hideTip(); }
        schedule();
      })
      // re-render once a gesture has rested for a moment (or right after an animated zoom)
      .on('end', (ev) => { clearTimeout(settle); settle = setTimeout(() => requestAnimationFrame(commitZoom), ev.sourceEvent ? 150 : 0); });
    mapSel().property('__zoom', d3.zoomIdentity).call(zoom).on('dblclick.zoom', null);
    svg.on('pointermove.coords', (ev) => { pending.coords = d3.pointer(ev, els.map); schedule(); });
  }
  const mapSel = () => d3.select(els.map);

  /* Input-driven DOM writes (zoom transform, cursor read-out, tooltip) are applied once per animation frame.
     Several pointer/wheel/touch events can arrive per frame, and a write between two of them makes the next
     d3.pointer() read force a synchronous layout of the whole map. */
  const pending = { zoom: null, coords: null, tip: undefined };
  /* Zooming and panning move the already-drawn map with a CSS transform on its box (compositor work only): re-laying
     out and repainting the map's text, strokes and markers at every step is what made them stutter. The map is drawn
     again at the new zoom once the gesture or animation rests (commitZoom). The map is its own layer (will-change,
     site.css): a pan is a pure offset, a zoom scales the drawn map until it is redrawn sharp at the end. The
     transform sits on a plain box, not on the <svg> itself: a transform on the SVG root makes Chrome lay the SVG out
     again, and every SVG label with it, since SVG text follows the on-screen scale. */
  let rendered = d3.zoomIdentity, moving = false, settle = 0, mover = null;
  function liveZoom(t) {
    const s = t.k / rendered.k;
    mover.style('transform', `translate(${t.x - s * rendered.x}px,${t.y - s * rendered.y}px) scale(${s})`);
    if (els.scale) els.scale.textContent = t.k.toFixed(1) + '×';
  }
  function commitZoom() {
    if (!svg) return;
    const t = d3.zoomTransform(els.map);
    moving = false;
    rendered = t;
    gRoot.attr('transform', t);
    // labels and markers only depend on the zoom level: a pan leaves them untouched
    if (t.k !== k) { k = t.k; rescale(); }
    mover.style('transform', null);
  }
  let frameReq = 0;
  function schedule() { if (!frameReq) frameReq = requestAnimationFrame(flush); }
  function flush() {
    frameReq = 0;
    if (pending.zoom && svg) { liveZoom(pending.zoom); pending.zoom = null; }
    if (pending.coords && svg) {
      const ll = proj.invert(d3.zoomTransform(els.map).invert(pending.coords));
      if (ll) els.coords.textContent = GT.fmtLL(ll);
      pending.coords = null;
    }
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
    // centred on Türkiye's centroid; letters spaced with thin spaces (CSS letter-spacing would add a trailing gap)
    const trF = world.countries.find((f) => GT.a3(f) === 'TUR');
    add('m-tr-label', d3.geoCentroid(trF), 19, [...GT.upper('Türkiye')].join('  '));
    rescale();
  }

  let sweepG = null, gIslands = null;
  function rescale() {
    if (!gLabels) return;
    svg.classed('zoomed', k >= 1.25); // small-country and region labels only appear once zoomed in
    if (sweepG) sweepG.style('opacity', Math.max(0, 1 - (k - 1) / 1.2)); // the sweep is an overview effect; fade it when zoomed in
    // labels shrink as the map zooms (by k^0.82) through their transform, so zooming never re-lays out text;
    // the Türkiye label's outline keeps its width in map units, as before
    const f = Math.pow(k, 0.82);
    gLabels.selectAll('text').attr('transform', function () { return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / f})`; });
    gLabels.selectAll('.m-tr-label').style('stroke-width', 3 * f + 'px');
    const place = function () { return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / k})`; };
    gSites.selectAll('.mk').attr('transform', place);
    gEvents.selectAll('.mk').attr('transform', place);
    if (gIslands) gIslands.selectAll('.mk').attr('transform', place);
    if (els.scale) els.scale.textContent = k.toFixed(1) + '×';
  }

  function drawMarkers(list) {
    if (!gSites) return;
    gSites.selectAll('*').remove();
    gEvents.selectAll('*').remove();
    const bind = (m, rec, title, sub) => m
      .attr('class', 'mk' + (rec.id === state.selected ? ' sel' : ''))
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', title)
      .on('click', (ev) => { ev.stopPropagation(); select(rec, true); })
      .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(rec, true); } })
      .on('pointermove', (ev) => showTip(ev, title, sub))
      .on('pointerleave', hideTip);

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
      const perRegion = {};
      for (const e of list) {
        const g = e.location && e.location.geometry;
        let pt = g ? (g.type === 'Point' ? g.coordinates : d3.geoCentroid(g)) : null;
        let regional = false;
        if (!pt) {
          // no coordinates in the record: show a hollow ring at the region's anchor, fanned out so rings don't stack
          const r = GT.REGIONS[e.regions[0]];
          if (!r || !r.at) continue;
          const n = (perRegion[e.regions[0]] = (perRegion[e.regions[0]] || 0) + 1) - 1;
          const ang = n * 2.4, rad = n ? 0.55 + 0.18 * n : 0;
          pt = [r.at[0] + rad * Math.cos(ang), r.at[1] + rad * Math.sin(ang)];
          regional = true;
        }
        const [x, y] = proj(pt);
        const m = gEvents.append('g').attr('data-x', x).attr('data-y', y);
        bind(m, e, GT.txt(e.title), GT.upper(GT.label('event-types', e.event_type)) + (regional ? ' · ' + GT.t('p.regional') : ''));
        if (!reduce && !regional && (pulseAll || e.id === state.selected)) m.append('circle').attr('class', 'mk-pulse').attr('r', 6);
        m.append('circle').attr('class', 'mk-ev st-' + e.assessment.status + (e._example ? ' is-example' : '') + (regional ? ' is-regional' : '')).attr('r', regional ? 5 : 5.5);
      }
    }
    rescale();
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
    if (!zoom || !r) return;
    const a = proj(r.bbox[0]), b = proj(r.bbox[1]);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const kk = Math.max(1, Math.min(16, 0.82 / Math.max((x1 - x0) / viewW(), (y1 - y0) / H)));
    const t = d3.zoomIdentity.translate(viewW() / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    mapSel().transition().duration(animate && !reduce ? 900 : 0).call(zoom.transform, t);
  }
  // Visible map width: the open drawer covers the right side on wide screens.
  const viewW = () => (els.drawer.classList.contains('open') && window.innerWidth > 860 ? Math.max(200, W - els.drawer.offsetWidth) : W);

  function flyTo(rec) {
    const g = rec.location && rec.location.geometry;
    if (!zoom) return;
    if (!g) { if (rec.regions && rec.regions.length) zoomToRegion(rec.regions[0], true); return; }
    const [x, y] = proj(g.type === 'Point' ? g.coordinates : d3.geoCentroid(g));
    const kk = Math.max(k, rec.id.startsWith('sit_') ? 6 : 4);
    const t = d3.zoomIdentity.translate(viewW() / 2, H / 2).scale(kk).translate(-x, -y);
    mapSel().transition().duration(reduce ? 0 : 900).call(zoom.transform, t);
  }

  function setRegion(code) {
    state.region = code;
    els.region.value = code;
    render();
    if (code) zoomToRegion(code, true);
    else if (svg) mapSel().transition().duration(reduce ? 0 : 700).call(zoom.transform, d3.zoomIdentity);
  }

  /* ---------------- rendering ---------------- */
  function render() {
    const list = filtered();
    els.count.textContent = GT.t('p.count', { n: list.length });
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
    if (state.selected) p.set('id', state.selected);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function wireUi() {
    els.search.addEventListener('input', GT.debounce(() => { state.q = els.search.value; render(); }, 120));
    els.region.addEventListener('change', () => setRegion(els.region.value));
    els.type.addEventListener('change', () => { state.type = els.type.value; render(); });
    els.status.addEventListener('change', () => { state.status = els.status.value; render(); });
    Object.values(lyr).forEach((c) => c.addEventListener('change', render));
    $('z-in').addEventListener('click', () => svg && mapSel().transition().duration(reduce ? 0 : 350).call(zoom.scaleBy, 1.7));
    $('z-out').addEventListener('click', () => svg && mapSel().transition().duration(reduce ? 0 : 350).call(zoom.scaleBy, 1 / 1.7));
    $('z-reset').addEventListener('click', () => setRegion(''));
    els.close.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    document.addEventListener('gt:lang', () => {
      buildFilters();
      drawLabels();
      render();
      const r = state.selected && data && data.byId.get(state.selected);
      if (r) renderDrawer(r);
    });
    window.addEventListener('resize', GT.debounce(() => { drawMap(); render(); if (state.region) zoomToRegion(state.region, false); }, 200));
  }
})();
