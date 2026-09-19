/* Greater Türkiye — the Aegean register page.
 *
 * It renders the `site` records of the register (handbook ADR 0019) straight from the published
 * dataset: one card per island, the treaty article it is held to, what is documented so far, and —
 * stated as plainly as the records themselves do — what is still missing. There is no map here on
 * purpose: the records carry no coordinates until each one has been verified against a primary
 * source, and a page that drew them anyway would be claiming more than the data says.
 */
(function () {
  'use strict';
  GT.initChrome();
  GT.initReveal();

  const TAG = 'ege-silahsizlandirilmis-statu';
  /* Which treaty article a record is held to, and how to say it in one line. The tag is on the
     record; the wording lives here so the page reads as a sentence rather than a code. */
  const TREATY = {
    'lozan-md-13': { tr: 'Lozan 1923, md. 13', en: 'Lausanne 1923, Art. 13' },
    'paris-md-14': { tr: 'Paris 1947, md. 14(2)', en: 'Paris 1947, Art. 14(2)' },
    'lozan-bogazlar-sozlesmesi': { tr: 'Lozan 1923 + Boğazlar Sözleşmesi', en: 'Lausanne 1923 + Straits Convention' },
  };
  const FLAG = {
    'birincil-kaynak-bekliyor': { tr: 'birincil kaynak bekliyor', en: 'primary source pending' },
    'koordinat-yok': { tr: 'koordinat yok', en: 'no coordinates' },
  };

  const els = { state: document.getElementById('r-state'), cards: document.getElementById('r-cards') };
  let records = [];

  function card(rec) {
    const el = document.createElement('article');
    el.className = 'r-card rv';
    const treaty = (rec.tags || []).map((t) => TREATY[t]).find(Boolean);
    const flags = (rec.tags || []).map((t) => FLAG[t]).filter(Boolean);

    const h = document.createElement('h3');
    h.className = 'r-name';
    h.textContent = GT.txt(rec.name);
    el.append(h);

    const meta = document.createElement('p');
    meta.className = 'r-meta';
    const place = rec.location && rec.location.place_name ? GT.txt(rec.location.place_name) : '';
    meta.textContent = [place, treaty ? GT.txt(treaty) : ''].filter(Boolean).join(' · ');
    el.append(meta);

    const body = document.createElement('p');
    body.className = 'r-body';
    body.textContent = GT.txt(rec.description);
    el.append(body);

    if (flags.length) {
      const row = document.createElement('p');
      row.className = 'r-flags';
      flags.forEach((f) => {
        const chip = document.createElement('span');
        chip.className = 'r-flag';
        chip.textContent = GT.txt(f);
        row.append(chip);
      });
      el.append(row);
    }

    const src = document.createElement('p');
    src.className = 'r-src';
    const label = document.createElement('span');
    label.textContent = GT.t('r.sources');
    src.append(label);
    (rec.sources || []).forEach((s) => {
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      // the host is what a reader scans for; the full title is there on hover and for screen readers
      a.textContent = new URL(s.url).hostname.replace(/^www\./, '');
      if (s.title) a.title = s.title;
      src.append(a);
    });
    el.append(src);
    return el;
  }

  function render() {
    els.cards.replaceChildren(...records.map(card));
    els.state.textContent = GT.t('r.count', { n: records.length });
    GT.initReveal();
  }

  GT.loadData().then((data) => {
    records = (data.site || []).filter((r) => (r.tags || []).includes(TAG));
    records.sort((a, b) => GT.txt(a.name).localeCompare(GT.txt(b.name), GT.lang === 'tr' ? 'tr' : 'en'));
    if (!records.length) { els.state.textContent = GT.t('r.empty'); return; }
    render();
  }).catch((e) => {
    console.warn(e);
    els.state.textContent = GT.t('r.err');
  });

  document.addEventListener('gt:lang', () => { if (records.length) render(); });
})();
