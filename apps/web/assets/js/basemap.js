/* Greater Türkiye — vector basemap prototype (see apps/web/README.md, "Vektör altlık").
 *
 * Off unless panel.html is opened with ?basemap=…, so a normal visitor loads none of this and
 * none of the libraries below. The basemap is a passive renderer: D3 still owns the projection,
 * the zoom behaviour and every thematic layer. MapLibre is told where to look, nothing more.
 *
 * ADR 0013: a third-party basemap has its own idea of where borders run and what places are
 * called. Every boundary layer and every country/region label is dropped from the style before
 * the map is created — never hidden afterwards — so they cannot flash up during load or come
 * back when the style is refreshed. Borders, country names and sea names stay D3's, drawn on
 * top from our own data. Settlement labels are kept (a city name is not a sovereignty claim)
 * and are asked for in Turkish first.
 */
(function () {
  'use strict';

  const VENDOR = 'assets/vendor/';
  // OpenFreeMap serves tiles, glyphs and sprites with no key and no account; see LICENSES.md.
  const OFM_STYLE = 'https://tiles.openfreemap.org/styles/dark';
  // Settlement label layers we keep from a third-party style; everything else off the `place`
  // layer (country, region/state, continent, "other") is dropped.
  const KEEP_PLACE = /city|town|village|suburb/;

  const ATTRIB = {
    ofm: [['OpenStreetMap', 'https://www.openstreetmap.org/copyright'], ['OpenFreeMap', 'https://openfreemap.org'], ['OpenMapTiles', 'https://openmaptiles.org']],
    pmtiles: [['OpenStreetMap', 'https://www.openstreetmap.org/copyright'], ['Protomaps', 'https://protomaps.com']],
  };

  let loading = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error('cannot load ' + src));
      document.head.append(s);
    });
  }
  function libs(mode) {
    if (!loading) {
      loading = loadScript(VENDOR + 'maplibre-gl.js')
        .then(() => (mode === 'pmtiles' ? loadScript(VENDOR + 'pmtiles.js') : null));
    }
    return loading;
  }

  /* ---------------- styles ---------------- */

  /* Turkish first, then the interface language, then whatever Latin name the tiles carry
     (`name:latin` in the OpenMapTiles schema, a `script` of "Latin" in Protomaps'). A place
     whose only name is in another script gets no label rather than one we cannot read: we
     vendor Latin glyphs only, and a Greek or Cyrillic exonym for somewhere we name ourselves
     is exactly what we do not want on this map. */
  const textField = (lang) => ['coalesce',
    ['get', 'name:' + lang], ['get', lang === 'tr' ? 'name:en' : 'name:tr'], ['get', 'name:latin'],
    ['case', ['==', ['get', 'script'], 'Latin'], ['get', 'name'], ''], ''];

  /* Strip a third-party style down to what we are willing to show. */
  function sanitise(style, lang) {
    const layers = [];
    for (const l of style.layers) {
      const sl = l['source-layer'];
      if (sl === 'boundary' || sl === 'boundaries') continue;       // ADR 0013: our borders only
      if (sl === 'place') {
        if (!KEEP_PLACE.test(l.id)) continue;                        // no country, region or "other" labels
        l.layout = Object.assign({}, l.layout, { 'text-field': textField(lang) });
        delete l.layout['icon-image'];                               // our own markers, not the style's dots
      }
      layers.push(l);
    }
    style.layers = layers;
    // drop sources and the sprite sheet nothing draws from any more (the shaded-relief raster
    // in some styles, the icon set behind the labels we just stripped)
    const used = new Set(layers.map((l) => l.source).filter(Boolean));
    for (const id of Object.keys(style.sources)) if (!used.has(id)) delete style.sources[id];
    if (!layers.some((l) => l.layout && l.layout['icon-image'])) delete style.sprite;
    return style;
  }

  /* Our own style over a Protomaps basemap file we host: written here rather than imported, so
     the layer list is the whole answer to "what does the basemap show". There is no boundaries
     layer and the places layer is filtered to localities, so no border and no country name can
     appear whatever the tiles contain. */
  function pmtilesStyle(url, lang) {
    const src = 'gt-base';
    const road = (id, kinds, minzoom, color, width) => ({
      id, type: 'line', source: src, 'source-layer': 'roads', minzoom,
      filter: ['in', ['get', 'kind'], ['literal', kinds]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width },
    });
    return {
      version: 8,
      // glyphs are vendored, so this style makes no third-party request at all
      glyphs: VENDOR + 'glyphs/{fontstack}/{range}.pbf',
      sources: { [src]: { type: 'vector', url: 'pmtiles://' + url } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#050505' } },
        { id: 'earth', type: 'fill', source: src, 'source-layer': 'earth', paint: { 'fill-color': '#101010' } },
        { id: 'landcover', type: 'fill', source: src, 'source-layer': 'landcover', paint: { 'fill-color': '#151515', 'fill-opacity': 0.7 } },
        { id: 'landuse', type: 'fill', source: src, 'source-layer': 'landuse', minzoom: 6, paint: { 'fill-color': '#1b1919', 'fill-opacity': 0.75 } },
        { id: 'water', type: 'fill', source: src, 'source-layer': 'water', paint: { 'fill-color': '#070a0e' } },
        road('roads-minor', ['minor_road'], 11, '#2a2a2a', ['interpolate', ['linear'], ['zoom'], 11, 0.4, 16, 3]),
        road('roads-medium', ['medium_road'], 9, '#343434', ['interpolate', ['linear'], ['zoom'], 9, 0.5, 16, 4]),
        road('roads-major', ['major_road'], 6, '#3f3c3a', ['interpolate', ['linear'], ['zoom'], 6, 0.5, 16, 5]),
        road('roads-highway', ['highway'], 4, '#57514c', ['interpolate', ['linear'], ['zoom'], 4, 0.6, 16, 6]),
        {
          id: 'places-locality', type: 'symbol', source: src, 'source-layer': 'places',
          filter: ['==', ['get', 'kind'], 'locality'],
          layout: {
            'text-field': textField(lang), 'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 12, 13],
            'text-max-width': 7, 'text-padding': 4,
          },
          paint: { 'text-color': 'rgba(232,227,220,.62)', 'text-halo-color': '#050505', 'text-halo-width': 1.2 },
        },
      ],
    };
  }

  /* ---------------- attribution ---------------- */

  function attribution(wrap, mode) {
    const box = document.createElement('div');
    box.className = 'p-attrib';
    box.append('© ');
    ATTRIB[mode].forEach(([name, href], i) => {
      if (i) box.append(' · ');
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = name;
      box.append(a);
    });
    wrap.append(box);
    return box;
  }

  /* ---------------- api ---------------- */

  /* create(container, mode, opts) → { sync, resize, setLang, destroy }
     `container` is the map box; the basemap canvas goes underneath everything D3 draws.
     `mode` is 'ofm' (OpenFreeMap) or 'pmtiles' (a .pmtiles file we host). */
  async function create(container, mode, opts) {
    const o = opts || {};
    await libs(mode);
    const holder = document.createElement('div');
    holder.className = 'p-base';
    container.prepend(holder);

    let style;
    if (mode === 'pmtiles') {
      if (!/^(https:\/\/|\.?\/|[\w-]+\/)/.test(o.url || '')) throw new Error('basemap: no .pmtiles url');
      maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
      style = pmtilesStyle(o.url, o.lang);
    } else {
      const r = await fetch(OFM_STYLE);
      if (!r.ok) throw new Error('basemap: style ' + r.status);
      style = sanitise(await r.json(), o.lang);
    }

    const map = new maplibregl.Map({
      container: holder,
      style,
      interactive: false,       // D3 keeps the pointer: this is a renderer, not a map control
      attributionControl: false, // drawn below in the panel's own style, and always visible
      fadeDuration: 0,
      center: [35, 39],
      zoom: 3,
    });
    const box = attribution(container.parentNode || container, mode);

    let lastZ = null;
    return {
      /* Put MapLibre's camera exactly where D3's projection is looking. Both are Web Mercator,
         so a d3 scale s and a zoom transform k are one MapLibre zoom: 512 px per tile. */
      sync(lng, lat, zoom) {
        if (!(zoom > -1)) return;
        map.jumpTo({ center: [lng, lat], zoom });
        lastZ = zoom;
      },
      resize() { map.resize(); },
      setLang(lang) {
        const f = textField(lang);
        for (const l of map.getStyle().layers) {
          if (l.type === 'symbol' && l.layout && l.layout['text-field']) map.setLayoutProperty(l.id, 'text-field', f);
        }
      },
      // resolves once the first frame with tiles is on screen — used by the measurements
      ready() { return map.loaded() ? Promise.resolve() : new Promise((r) => map.once('idle', r)); },
      zoom() { return lastZ; },
      destroy() { map.remove(); holder.remove(); box.remove(); },
    };
  }

  window.GT = window.GT || {};
  window.GT.basemap = { create };
})();
