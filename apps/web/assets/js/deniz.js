/* Greater Türkiye — deniz paneli / the sea dashboard.
 *
 * A console for one subject: the sea. It draws what this repository already holds — the maritime
 * jurisdiction as Türkiye states it, the Straits, the TRNC licence blocks, the Turkish islands, the
 * Aegean register with each point's own uncertainty, and the grid of activity other states
 * announced to mariners between 2015 and 2021 — and reads the seas off the same grid.
 *
 * It is light where the main dashboard is dark, and deliberately so: a chart is read, not driven.
 * Land is nearly white and the water carries the colour, which is the way round a nautical chart
 * works.
 *
 * Nothing here is a vessel's position. There is no layer for it, no field for it and no tooltip
 * that could carry one (handbook ADR 0022): merchant ships in these waters are being attacked, and
 * a position published beside a cargo is what turns a compliance record into a target list.
 *
 * Drawn with D3 alone — no tiles and no MapLibre. At this scale the 1:50m coastline we ship is
 * enough, and a map with nothing moving costs nothing to keep on screen.
 */
(async function () {
  'use strict';
  GT.initChrome();
  GT.clock(document.getElementById('n-utc'));

  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  /* The frame: Ionian to the Caucasus, Libya to Ukraine on a wide screen. A phone is portrait, so
     fitting that box would spend half the height on land nobody came for; the narrow frame keeps
     the seas and drops the margins. */
  const VIEW_WIDE = [[18.5, 29.5], [45.5, 48.5]];
  const VIEW_NARROW = [[22.0, 30.5], [42.0, 47.5]];
  let VIEW = VIEW_WIDE;

  /* The seas, as boxes. A cell or a site counts for a sea when it falls inside the box. The boxes
     do not overlap: a sea is a place, unlike a watch region, which is an interest. */
  const SEAS = {
    blacksea: { tr: 'Karadeniz', en: 'Black Sea', box: [[27.4, 41.0], [41.8, 47.3]] },
    marmara: { tr: 'Marmara ve Boğazlar', en: 'Marmara and the Straits', box: [[26.0, 40.0], [30.2, 41.6]] },
    aegean: { tr: 'Ege', en: 'Aegean', box: [[22.5, 35.0], [28.0, 41.0]] },
    eastmed: { tr: 'Doğu Akdeniz', en: 'Eastern Mediterranean', box: [[28.0, 30.5], [36.5, 37.0]] },
    cyprus: { tr: 'Kıbrıs çevresi', en: 'Around Cyprus', box: [[32.0, 34.2], [35.0, 36.0]] },
  };

  const lyr = {
    jur: $('l-jur'), straits: $('l-straits'), lic: $('l-lic'),
    act: $('l-act'), isl: $('l-isl'), sites: $('l-sites'),
  };

  const state = { sea: params.get('sea') || '', selected: params.get('id') || '' };
  let world = null, density = null, vessels = null, trade = null, records = null;
  let svg = null, gRoot = null, gUnc = null, gMark = null, gStatic = null, gCells = null, proj = null, path = null;
  let zoom = null, k = 1, W = 0, H = 0, lastFocus = null;

  const mapBox = $('n-map');
  const mapSel = () => d3.select(mapBox);

  /* ---------------- data helpers ---------------- */

  const siteList = () => (records && records.site ? records.site : [])
    .filter((s) => s.location && s.location.geometry && s.location.geometry.type === 'Point');

  const inBox = ([lon, lat], box) =>
    lon >= box[0][0] && lon <= box[1][0] && lat >= box[0][1] && lat <= box[1][1];

  function seaRows() {
    const step = (density && density.method && density.method.cell_deg) || 0.25;
    const half = step / 2;
    const sites = siteList();
    return Object.entries(SEAS).map(([key, s]) => {
      let mil = 0, cells = 0;
      for (const [lon, lat, m] of (density ? density.cells : [])) {
        if (inBox([lon + half, lat + half], s.box)) { mil += m; cells += 1; }
      }
      return {
        key,
        name: GT.lang === 'tr' ? s.tr : s.en,
        mil,
        cells,
        sites: sites.filter((r) => inBox(r.location.geometry.coordinates, s.box)).length,
      };
    }).sort((a, b) => b.mil - a.mil);
  }

  /* ---------------- map ---------------- */

  function drawMap() {
    if (!world || !mapBox) return;
    W = mapBox.clientWidth;
    H = mapBox.clientHeight;
    if (!W || !H) return;

    /* Two corners rather than a rectangle: d3-geo reads a ring's winding on the sphere, and a box
       drawn the wrong way round means "everything except this" — which once framed the whole
       world. A MultiPoint has no winding to get wrong. */
    VIEW = W / H < 1.1 ? VIEW_NARROW : VIEW_WIDE;
    proj = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], {
      type: 'MultiPoint', coordinates: [VIEW[0], VIEW[1]],
    });
    path = d3.geoPath(proj);
    mapSel().select('svg').remove();

    svg = mapSel().append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', GT.t('s.mapAria'));
    gRoot = svg.append('g');

    gRoot.append('rect').attr('class', 'n-water').attr('width', W).attr('height', H);

    const land = gRoot.append('g');
    land.selectAll('path').data(world.countries).join('path')
      .attr('d', path)
      .attr('class', (f) => 'n-land' + (GT.a3(f) === 'TUR' ? ' is-tur' : ''));
    gRoot.append('path').datum(world.borders).attr('d', path).attr('class', 'n-border');

    drawActivity();
    drawAreas();
    gUnc = gRoot.append('g').attr('class', 'n-unc-layer');
    gStatic = gRoot.append('g');
    drawIslands();
    gMark = gRoot.append('g');
    drawSites();
    drawSeaLabels();
    rescale();

    zoom = d3.zoom().scaleExtent([1, 24])
      .translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]])
      .on('zoom', (ev) => {
        gRoot.attr('transform', ev.transform);
        if (ev.transform.k !== k) { k = ev.transform.k; rescale(); }
        $('n-scale').textContent = k.toFixed(1) + '×';
      });
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('pointermove.coords', (ev) => {
      if (!proj) return;
      const t = d3.zoomTransform(mapBox);
      const [mx, my] = d3.pointer(ev, mapBox);
      const ll = proj.invert(t.invert([mx, my]));
      $('n-coords').textContent = ll ? GT.fmtLL(ll) : '—';
    });
    svg.on('pointerleave.coords', () => { $('n-coords').textContent = '—'; });
    svg.on('click', (ev) => { if (!ev.target.closest('.n-mk')) closeDrawer(); });
  }

  /* Where activity was announced, as a wash under the limits rather than over them. Only the
     military class is drawn, which is what the sea board counts. */
  function drawActivity() {
    gCells = gRoot.append('g').attr('class', 'n-cells');
    const g = gCells;
    if (!density || !lyr.act.checked) return;
    const step = (density.method && density.method.cell_deg) || 0.25;
    const cells = density.cells.filter(([lon, lat, mil]) =>
      mil > 0 && lon >= VIEW[0][0] && lon <= VIEW[1][0] && lat >= VIEW[0][1] && lat <= VIEW[1][1]);
    const peak = Math.max(1, ...cells.map((c) => c[2]));
    for (const [lon, lat, mil] of cells) {
      const share = mil / peak;
      if (share < 0.02) continue;
      const a = proj([lon, lat]);
      const b = proj([lon + step, lat + step]);
      g.append('rect')
        .attr('x', Math.min(a[0], b[0])).attr('y', Math.min(a[1], b[1]))
        .attr('width', Math.abs(b[0] - a[0])).attr('height', Math.abs(b[1] - a[1]))
        .attr('class', 'n-cell')
        .attr('opacity', (0.08 + 0.5 * Math.sqrt(share)).toFixed(3));
    }
  }

  function drawAreas() {
    const g = gRoot.append('g').attr('class', 'n-areas');
    for (const f of world.maritime || []) {
      const p = f.properties;
      const straits = p.kind === 'internal-waters';
      const licence = p.status === 'licence';
      if (straits && !lyr.straits.checked) continue;
      if (licence && !lyr.lic.checked) continue;
      if (!straits && !licence && !lyr.jur.checked) continue;
      /* A line is a limit and an area is an area: filling a LineString would paint the sea inside
         the curve. And a status with no class of its own would fall through to the SVG default,
         which is solid black — that is how the licence blocks first appeared as a slab. */
      const line = /LineString/.test(f.geometry.type);
      const known = ['agreed', 'claimed', 'schematic', 'licence'].includes(p.status);
      const kind = straits ? 'straits' : (known ? p.status : 'claimed');
      const node = g.append('path')
        .attr('d', path(f))
        .attr('class', 'n-area ' + (line ? 'n-limit n-limit-' + kind : 'n-' + kind));
      const name = GT.lang === 'tr' ? p.name_tr : p.name_en;
      const basis = (GT.lang === 'tr' ? p.basis_tr : p.basis_en) || '';
      node.on('pointermove', (ev) => showTip(ev, name, basis)).on('pointerleave', hideTip);
    }
  }

  /* Islands and sea names are drawn at a fixed size, like the markers: a dot that grows with the
     zoom stops being a dot, and a label that grows becomes a banner across the water. Both sit in
     `gStatic`, which `rescale` counter-scales. */
  function drawIslands() {
    if (!lyr.isl.checked) return;
    for (const f of world.islands || []) {
      const [x, y] = proj(f.geometry.coordinates);
      const name = GT.lang === 'tr' ? f.properties.name_tr : f.properties.name_en;
      const g = gStatic.append('g').attr('class', 'n-fixed').attr('data-x', x).attr('data-y', y);
      g.append('circle').attr('r', 2.8).attr('class', 'n-island')
        .on('pointermove', (ev) => showTip(ev, name, GT.t('s.lg.island')))
        .on('pointerleave', hideTip);
    }
  }

  /* The register on the map. Each point carries the uncertainty its own record states: a record
     known to the island is drawn as the island-wide circle it is, never as a point like one known
     to a few hundred metres (ADR 0021 §5). */
  const UNC_FROM = 1500;
  const uncircle = d3.geoCircle();

  function drawSites() {
    if (!gUnc || !gMark) return;
    gUnc.selectAll('*').remove();
    gMark.selectAll('*').remove();
    if (!lyr.sites.checked) return;
    for (const r of siteList()) {
      const loc = r.location;
      const [lon, lat] = loc.geometry.coordinates;
      if (loc.uncertainty_m >= UNC_FROM) {
        const shape = uncircle.center([lon, lat]).radius((loc.uncertainty_m / 6371008.8) * 180 / Math.PI)();
        gUnc.append('path')
          .attr('d', path(shape))
          .attr('class', 'n-unc' + (r.id === state.selected ? ' sel' : ''));
      }
      const [x, y] = proj([lon, lat]);
      const g = gMark.append('g')
        .attr('class', 'n-mk' + (r.id === state.selected ? ' sel' : ''))
        .attr('data-x', x).attr('data-y', y)
        .attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', GT.txt(r.name));
      g.append('path').attr('class', 'n-mk-dot').attr('d', d3.symbol(d3.symbolDiamond, 72)());
      const sub = GT.upper(GT.label('site-types', r.site_type)) + ' · ±' + fmtUnc(loc.uncertainty_m);
      g.on('pointermove', (ev) => showTip(ev, GT.txt(r.name), sub))
        .on('pointerleave', hideTip)
        .on('click', (ev) => { ev.stopPropagation(); select(r, true); })
        .on('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(r, true); }
        });
    }
    rescale();
  }

  function drawSeaLabels() {
    const NAMES = [
      { at: [25.4, 38.2], tr: 'EGE DENİZİ', en: 'AEGEAN SEA' },
      { at: [32.5, 33.2], tr: 'AKDENİZ', en: 'MEDITERRANEAN' },
      { at: [34.5, 43.8], tr: 'KARADENİZ', en: 'BLACK SEA' },
      { at: [28.0, 40.75], tr: 'MARMARA', en: 'MARMARA' },
    ];
    for (const n of NAMES) {
      const [x, y] = proj(n.at);
      gStatic.append('g').attr('class', 'n-fixed').attr('data-x', x).attr('data-y', y)
        .append('text').attr('class', 'n-sea-label')
        .attr('text-anchor', 'middle').text(GT.lang === 'tr' ? n.tr : n.en);
    }
  }

  /* Markers keep their size as the map zooms; the uncertainty circles do not, because their size
     is the claim. */
  function rescale() {
    const place = function () {
      return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / k})`;
    };
    if (gMark) gMark.selectAll('.n-mk').attr('transform', place);
    if (gStatic) gStatic.selectAll('.n-fixed').attr('transform', place);
    /* The wash is a seven-year aggregate on a quarter-degree grid: at the overview it shows where
       activity concentrates, and the closer the map gets the less a cell of that size can mean, so
       it steps back rather than becoming a field of grey squares over the coast. The fade is one
       opacity on the group — setting it per cell meant fifteen hundred style recalculations on
       every frame of a zoom, which measured as 1.2 s of style time across five transitions. */
    if (gCells) gCells.attr('opacity', Math.max(0.2, Math.min(1, 1.25 - k / 10)).toFixed(3));
  }

  function fmtUnc(m) {
    if (m == null) return '—';
    return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : m + ' m';
  }

  /* ---------------- tooltip ---------------- */

  const tip = $('n-tip');
  function showTip(ev, title, sub) {
    if (!tip) return;
    tip.hidden = false;
    tip.replaceChildren(GT.el('b', null, title || ''), ...(sub ? [GT.el('span', null, sub)] : []));
    const box = mapBox.getBoundingClientRect();
    const x = Math.min(Math.max(ev.clientX - box.left + 14, 8), Math.max(8, box.width - 270));
    const y = Math.min(Math.max(ev.clientY - box.top + 14, 8), Math.max(8, box.height - 80));
    tip.style.transform = `translate(${x}px,${y}px)`;
  }
  function hideTip() { if (tip) tip.hidden = true; }

  /* ---------------- sidebar ---------------- */

  function renderStats() {
    const rows = seaRows();
    const nf = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
    const mil = rows.reduce((a, r) => a + r.mil, 0);
    const changed = vessels && vessels.counts ? vessels.counts.with_former_flag : null;
    const share = tradeSeaShare();
    $('n-stats').replaceChildren(
      stat(nf.format(mil), GT.t('n.st.act')),
      stat(String(siteList().length), GT.t('n.st.sites')),
      stat(changed == null ? '—' : nf.format(changed), GT.t('n.st.flags')),
      stat(share == null ? '—' : Math.round(share * 100) + '%', GT.t('n.st.sea')),
    );
    const at = records && records.manifest && records.manifest.built_at;
    $('n-pulse').textContent = GT.t('n.pulse', {
      at: at ? at.slice(0, 16).replace('T', ' ') + 'Z' : '—',
      w: density && density.method && density.method.window ? density.method.window.join('–') : '—',
    });
  }

  function tradeSeaShare() {
    if (!trade || !trade.series) return null;
    const rows = trade.series.filter((s) => s.tur_exports_to_isr
      && s.by_mode && s.by_mode.tur_exports && s.by_mode.tur_exports.sea);
    if (!rows.length) return null;
    return rows.reduce((a, s) => a + s.by_mode.tur_exports.sea / s.tur_exports_to_isr, 0) / rows.length;
  }

  function stat(value, label) {
    const d = GT.el('div', 'n-stat');
    d.append(GT.el('b', 'mono', value), GT.el('span', null, label));
    return d;
  }

  function renderSeas() {
    const rows = seaRows();
    const peak = Math.max(1, ...rows.map((r) => r.mil));
    const nf = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
    $('n-seas').replaceChildren(...rows.map((r) => {
      const b = GT.el('button', 'n-row' + (state.sea === r.key ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.sea === r.key));
      const val = GT.el('span', 'n-val');
      const bar = GT.el('span', 'n-bar');
      bar.style.setProperty('--w', (100 * r.mil / peak).toFixed(1) + '%');
      val.append(bar, GT.el('b', 'mono', nf.format(r.mil)));
      b.append(GT.el('span', 'n-name', r.name), val, GT.el('span', 'n-sub mono', r.sites || '·'));
      b.title = GT.t('n.seaTip', { c: nf.format(r.cells) });
      b.addEventListener('click', () => setSea(state.sea === r.key ? '' : r.key));
      return b;
    }));
    $('n-clear').hidden = !state.sea;
  }

  function renderList() {
    const all = siteList();
    const box = state.sea ? SEAS[state.sea].box : null;
    const list = box ? all.filter((r) => inBox(r.location.geometry.coordinates, box)) : all;
    list.sort((a, b) => GT.txt(a.name).localeCompare(GT.txt(b.name), GT.lang === 'tr' ? 'tr' : 'en'));
    $('n-count').textContent = GT.t('n.count', { n: list.length });
    if (!list.length) {
      $('n-list').replaceChildren(GT.el('p', 'n-empty', GT.t('n.none')));
      return;
    }
    $('n-list').replaceChildren(...list.map((r) => {
      const li = GT.el('div');
      li.setAttribute('role', 'listitem');
      const b = GT.el('button', 'n-item' + (r.id === state.selected ? ' on' : ''));
      b.type = 'button';
      b.append(
        GT.el('span', 'n-item-name', GT.txt(r.name)),
        GT.el('span', 'n-item-meta mono',
          `${GT.upper(GT.label('site-types', r.site_type))} · ±${fmtUnc(r.location.uncertainty_m)}`),
      );
      b.addEventListener('click', () => select(r, true));
      li.append(b);
      return li;
    }));
  }

  function syncLayerCount() {
    const off = Object.values(lyr).filter((c) => !c.checked).length;
    $('n-layers-n').textContent = off ? String(off) : '';
    $('n-layers').classList.toggle('has-n', !!off);
    document.querySelectorAll('.n-lg[data-lyr]').forEach((el) => {
      const key = Object.keys(lyr).find((name) => lyr[name].id === el.dataset.lyr);
      el.hidden = !(key && lyr[key].checked);
    });
  }

  /* ---------------- selection ---------------- */

  function setSea(key) {
    state.sea = key;
    renderSeas();
    renderList();
    syncUrl();
    if (!zoom) return;
    if (!key) {
      mapSel().transition().duration(reduce ? 0 : 600).call(zoom.transform, d3.zoomIdentity);
      return;
    }
    const box = SEAS[key].box;
    const a = proj(box[0]), b = proj(box[1]);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const kk = Math.max(1, Math.min(18, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    mapSel().transition().duration(reduce ? 0 : 750).call(zoom.transform, t);
  }

  function select(rec, fly) {
    lastFocus = document.activeElement;
    state.selected = rec.id;
    renderDrawer(rec);
    const drawer = $('n-drawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.inert = false;
    $('n-close').focus();
    drawSites();
    renderList();
    syncUrl();
    if (fly && zoom && rec.location && rec.location.geometry) {
      const [x, y] = proj(rec.location.geometry.coordinates);
      const kk = Math.max(k, 6);
      const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-x, -y);
      mapSel().transition().duration(reduce ? 0 : 750).call(zoom.transform, t);
    }
  }

  function closeDrawer() {
    const drawer = $('n-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    state.selected = '';
    drawSites();
    renderList();
    syncUrl();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderDrawer(r) {
    const loc = r.location || {};
    const rows = [];
    const add = (label, value) => { if (value) rows.push([label, value]); };
    add(GT.t('d.type'), GT.label('site-types', r.site_type));
    add(GT.t('d.country'), r.country ? GT.countryName(r.country) : null);
    if (loc.geometry) {
      add(GT.t('n.d.at'), GT.fmtLL(loc.geometry.coordinates));
      add(GT.t('n.d.unc'), `±${fmtUnc(loc.uncertainty_m)} · ${GT.txt(GT.PRECISION[loc.precision]) || loc.precision}`);
      add(GT.t('n.d.method'), loc.method);
    }
    const parts = [GT.el('h2', 'n-d-title', GT.txt(r.name))];
    if (r.name && r.name.local) parts.push(GT.el('p', 'n-d-local', r.name.local));
    const dl = GT.el('dl', 'n-d-rows');
    for (const [label, value] of rows) dl.append(GT.el('dt', null, label), GT.el('dd', 'mono', value));
    parts.push(dl);
    if (r.description) parts.push(rich('p', 'n-d-desc', GT.txt(r.description)));
    if (r.sources && r.sources.length) {
      parts.push(GT.el('h3', 'n-d-h', GT.t('d.sources')));
      const ul = GT.el('ul', 'n-d-src');
      for (const c of r.sources) {
        const li = GT.el('li');
        const a = GT.el('a', null, c.title || c.url);
        a.href = c.url; a.target = '_blank'; a.rel = 'noopener';
        li.append(a);
        for (const arc of c.archives || []) {
          const s = GT.el('a', 'n-d-arc', GT.t('d.archive'));
          s.href = arc.url; s.target = '_blank'; s.rel = 'noopener';
          li.append(' · ', s);
        }
        ul.append(li);
      }
      parts.push(ul);
    }
    $('n-drawer-body').replaceChildren(...parts);
  }

  /* The records carry markdown emphasis. Printing the asterisks would be sloppy and setting
     innerHTML would be worse, so the text is split on `**` and the odd pieces become <b>. */
  function rich(tag, cls, text) {
    const node = GT.el(tag, cls);
    String(text || '').split('**').forEach((piece, i) => {
      node.append(i % 2 ? GT.el('b', null, piece) : document.createTextNode(piece));
    });
    return node;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.sea) p.set('sea', state.sea);
    if (state.selected) p.set('id', state.selected);
    const q = p.toString();
    history.replaceState(null, '', q ? '?' + q : location.pathname);
  }

  /* ---------------- render ---------------- */

  function render() {
    drawMap();
    renderStats();
    renderSeas();
    renderList();
    syncLayerCount();
    $('n-state').hidden = true;
  }

  /* ---------------- load ---------------- */

  const optional = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };

  const [w, d, v, t, recs] = await Promise.allSettled([
    GT.loadWorld('assets/data/countries-50m.json'),
    optional('assets/data/msi-density.json'),
    optional('assets/data/vessels-sanctioned.json'),
    optional('assets/data/trade-il.json'),
    GT.loadData(),
  ]);
  if (w.status === 'fulfilled') world = w.value; else console.warn(w.reason);
  density = d.status === 'fulfilled' ? d.value : null;
  vessels = v.status === 'fulfilled' ? v.value : null;
  trade = t.status === 'fulfilled' ? t.value : null;
  records = recs.status === 'fulfilled' ? recs.value : null;

  if (!world) {
    $('n-state').textContent = GT.t('s.err');
    return;
  }

  render();
  if (state.sea && SEAS[state.sea]) setSea(state.sea);
  const pre = state.selected && siteList().find((r) => r.id === state.selected);
  if (pre) select(pre, true);

  Object.values(lyr).forEach((c) => c.addEventListener('change', render));
  $('n-clear').addEventListener('click', () => setSea(''));
  $('n-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  $('n-in').addEventListener('click', () => svg && mapSel().transition().duration(reduce ? 0 : 300).call(zoom.scaleBy, 1.7));
  $('n-out').addEventListener('click', () => svg && mapSel().transition().duration(reduce ? 0 : 300).call(zoom.scaleBy, 1 / 1.7));
  $('n-reset').addEventListener('click', () => setSea(''));
  window.addEventListener('resize', GT.debounce(() => { render(); if (state.sea) setSea(state.sea); }, 220));
  document.addEventListener('gt:lang', render);

  // the screenshot harness and the performance engine drive the map through this
  window.GT_SEA = { setSea, select, seas: SEAS };
})();
