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
  const VIEW_WIDE = [[21.0, 30.2], [42.5, 47.3]];
  const VIEW_NARROW = [[23.0, 30.8], [40.5, 46.8]];
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
  let map = null, gUnc = null, gMark = null, gStatic = null, gCells = null;
  let coast = null, waterMask = null;
  let proj = null, path = null, gRoot = null, k = 1, W = 0, H = 0, lastFocus = null;
  let onLand = () => false; // filled per frame by the shared land mask

  const mapBox = $('n-map');

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
    map = GT.map.create(mapBox, {
      view: VIEW_WIDE,
      viewNarrow: VIEW_NARROW,
      scaleExtent: [1, 24],
      ariaLabel: GT.t('s.mapAria'),
      /* Flying from sea to sea re-placed every island, every sea name and every register mark on
         each frame of the animation, which measured as 1.35 s of layout across five transitions.
         Deferred, the drawn map is moved by one CSS transform and re-placed once, when it lands. */
      live: true,
      onFrame: (t) => { $('n-scale').textContent = t.k.toFixed(1) + '×'; },
      onZoom: (kk) => { k = kk; rescale(); $('n-scale').textContent = kk.toFixed(1) + '×'; },
      onCursor: (ll) => { $('n-coords').textContent = ll ? GT.fmtLL(ll) : '—'; },
      onBackground: closeDrawer,
    });
    if (!map.frame()) return;
    proj = map.proj; path = map.path; gRoot = map.gRoot;
    W = map.W; H = map.H; VIEW = map.view; k = 1;

    map.land(world, null, coast);
    /* Water only. The wash and the maritime areas are both about the sea, and both come from
       geometry whose coastline is not the one drawn here; the mask is what keeps either from
       painting the shore, at any zoom. */
    waterMask = map.waterMask(coast);
    /* The wash is about the sea, so it is masked to the sea. Half a cell of margin keeps a square
       whose centre sits just offshore from bleeding over the coast. */
    onLand = map.landMask(world, cellPx() / 2);

    drawActivity();
    drawAreas();
    gUnc = map.layer('n-unc-layer');
    gStatic = map.layer();
    drawIslands();
    gMark = map.layer();
    drawSites();
    drawSeaLabels();
    rescale();
    map.ready();
  }

  /* One grid cell in pixels at the overview, used to size the coastal margin of the land mask. */
  function cellPx() {
    const step = (density && density.method && density.method.cell_deg) || 0.25;
    const a = proj([VIEW[0][0], VIEW[0][1]]);
    const b = proj([VIEW[0][0] + step, VIEW[0][1]]);
    return Math.max(1, Math.abs(b[0] - a[0]));
  }

  /* Where activity was announced, as a wash under the limits rather than over them. Only the
     military class is drawn, which is what the sea board counts. */
  function drawActivity() {
    gCells = gRoot.append('g').attr('class', 'n-cells');
    if (waterMask) gCells.attr('mask', waterMask);
    const g = gCells;
    if (!density || !lyr.act.checked) return;
    const step = (density.method && density.method.cell_deg) || 0.25;
    const cells = density.cells.filter(([lon, lat, mil]) =>
      mil > 0 && lon >= VIEW[0][0] && lon <= VIEW[1][0] && lat >= VIEW[0][1] && lat <= VIEW[1][1]);
    const peak = Math.max(1, ...cells.map((c) => c[2]));
    for (const [lon, lat, mil] of cells) {
      const share = mil / peak;
      if (share < 0.05) continue;
      const a = proj([lon, lat]);
      const b = proj([lon + step, lat + step]);
      /* A warning is broadcast to mariners, so its cell belongs on the water. The grid is coarse
         enough that a quarter-degree square anchored at sea still reaches inland, and a wash over
         Anatolia or Ukraine reads as a claim about the land that nothing here supports. */
      if (onLand((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      /* Five steps, not a smooth fade. A continuous opacity put the weakest cells at eight per
         cent over blue water, which is not "a little activity" but a grey haze the eye reads as
         dirt on the chart. Banded, a cell either says something or is not drawn, and the legend
         can name what each band means. */
      const tier = Math.min(5, 1 + Math.floor(Math.sqrt(share) * 5));
      g.append('rect')
        .attr('x', Math.min(a[0], b[0])).attr('y', Math.min(a[1], b[1]))
        .attr('width', Math.abs(b[0] - a[0])).attr('height', Math.abs(b[1] - a[1]))
        .attr('class', 'n-cell n-cell-' + tier);
    }
  }

  function drawAreas() {
    const g = gRoot.append('g').attr('class', 'n-areas');
    if (waterMask) g.attr('mask', waterMask);
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
      const name = GT.lang === 'tr' ? f.properties.name_tr : f.properties.name_en;
      const g = map.fixed(gStatic, f.geometry.coordinates);
      g.append('circle').attr('r', 2.8).attr('class', 'n-island')
        .on('pointermove', (ev) => showTip(ev, name, GT.t('s.lg.island')))
        .on('pointerleave', hideTip);
    }
  }

  /* The register on the map. Each point carries the uncertainty its own record states: a record
     known to the island is drawn as the island-wide circle it is, never as a point like one known
     to a few hundred metres (ADR 0021 §5). */
  const UNC_FROM = 1500;

  function drawSites() {
    if (!gUnc || !gMark) return;
    gUnc.selectAll('*').remove();
    gMark.selectAll('*').remove();
    if (!lyr.sites.checked) return;
    for (const r of siteList()) {
      const loc = r.location;
      const [lon, lat] = loc.geometry.coordinates;
      if (loc.uncertainty_m >= UNC_FROM) {
        gUnc.append('path')
          .attr('d', map.uncertainty([lon, lat], loc.uncertainty_m))
          .attr('class', 'n-unc' + (r.id === state.selected ? ' sel' : ''));
      }
      const g = map.fixed(gMark, [lon, lat], 'n-mk' + (r.id === state.selected ? ' sel' : ''))
        .attr('data-gm-mark', '')
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
      map.fixed(gStatic, n.at)
        .append('text').attr('class', 'n-sea-label')
        .attr('text-anchor', 'middle').text(GT.lang === 'tr' ? n.tr : n.en);
    }
  }

  /* Markers keep their size as the map zooms; the uncertainty circles do not, because their size
     is the claim. */
  function rescale() {
    if (map) map.rescale();
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
    /* The Black Sea has eighteen thousand warnings and the Marmara has two. On a linear bar the
       Marmara is a fifth of a pixel: the reader sees an empty row and concludes the data is
       missing. The square root keeps the order and the ratio readable, and the number beside it
       stays the exact one. */
    const width = (v) => (v <= 0 ? 0 : Math.max(2.5, 100 * Math.sqrt(v / peak)));
    const nf = new Intl.NumberFormat(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');
    $('n-seas').replaceChildren(...rows.map((r) => {
      const b = GT.el('button', 'n-row' + (state.sea === r.key ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.sea === r.key));
      const val = GT.el('span', 'n-val');
      const bar = GT.el('span', 'n-bar');
      bar.style.setProperty('--w', width(r.mil).toFixed(1) + '%');
      val.append(bar, GT.el('b', 'mono', nf.format(r.mil)));
      b.append(GT.el('span', 'n-name', r.name), val, GT.el('span', 'n-sub mono' + (r.sites ? '' : ' none'), String(r.sites)));
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
    if (!map) return;
    if (!key) { map.reset(reduce ? 0 : 600); return; }
    map.gotoBox(SEAS[key].box, reduce ? 0 : 750);
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
    if (fly && map && rec.location && rec.location.geometry) {
      map.goto(rec.location.geometry.coordinates, Math.max(k, 6), reduce ? 0 : 750);
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

  const [w, d, v, t, recs, cst] = await Promise.allSettled([
    GT.loadWorld('assets/data/countries-50m.json'),
    optional('assets/data/msi-density.json'),
    optional('assets/data/vessels-summary.json'),
    optional('assets/data/trade-il.json'),
    GT.loadData(['site']),
    optional('assets/data/coast-10m.json'),
  ]);
  if (w.status === 'fulfilled') world = w.value; else console.warn(w.reason);
  density = d.status === 'fulfilled' ? d.value : null;
  vessels = v.status === 'fulfilled' ? v.value : null;
  trade = t.status === 'fulfilled' ? t.value : null;
  records = recs.status === 'fulfilled' ? recs.value : null;
  coast = cst.status === 'fulfilled' ? cst.value : null;

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
  $('n-in').addEventListener('click', () => map && map.zoomBy(1.7));
  $('n-out').addEventListener('click', () => map && map.zoomBy(1 / 1.7));
  $('n-reset').addEventListener('click', () => setSea(''));
  window.addEventListener('resize', GT.debounce(() => { render(); if (state.sea) setSea(state.sea); }, 220));
  document.addEventListener('gt:lang', render);

  // the screenshot harness and the performance engine drive the map through this
  window.GT_SEA = { setSea, select, seas: SEAS };
})();
