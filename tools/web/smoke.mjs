// Open the live pages in headless Chrome and fail if any of them throws, logs an error, or stops
// animating. A page that breaks in the browser answers 200 to every server check, so only a browser
// can see it: the home globe once crashed on a new partner tier and stood still for a day.
//
//   node tools/web/smoke.mjs                          # the live site
//   node tools/web/smoke.mjs --base http://localhost:8778/platform/ --chrome /path/to/chrome
//
// For each page: load it, wait for it to settle, collect uncaught exceptions and console errors,
// count animation frames over two seconds, and take a screenshot into $SMOKE_OUT if set.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const BASE = args.get('base') || 'https://greater-turkiye.github.io/platform/';
const CHROME = args.get('chrome') || process.env.CHROME || 'google-chrome';
const PAGES = ['', 'panel.html', 'deniz.html', 'hava.html', 'ticaret.html', 'sicil.html', 'method.html', 'videolar.html'];
const WIDTHS = [[1600, 1000], [390, 844]];
// messages that are not the site's fault: the browser's own complaints about a headless session
const IGNORE = [/favicon\.ico/i, /Failed to load resource.*(404|net::ERR_ABORTED).*favicon/i];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'smoke-'))}`, 'about:blank'], { stdio: 'ignore' });

let ready = false;
for (let i = 0; i < 80 && !ready; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); ready = true; } catch { await sleep(250); } }
if (!ready) { console.error(`no Chrome on port ${port} (${CHROME})`); process.exit(2); }

async function open() {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const problems = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    let text = null;
    if (d.method === 'Runtime.exceptionThrown') {
      const x = d.params.exceptionDetails;
      text = 'exception: ' + (x.exception && x.exception.description ? x.exception.description.split('\n').slice(0, 3).join(' | ') : x.text);
    } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      text = 'console.error: ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    } else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
      text = 'browser: ' + d.params.entry.text + (d.params.entry.url ? ' ' + d.params.entry.url : '');
    }
    if (text && !IGNORE.some((rx) => rx.test(text))) problems.push(text.slice(0, 400));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  return { ws, send, problems, targetId: target.id };
}

const failures = [];
const out = process.env.SMOKE_OUT;
for (const [w, h] of WIDTHS) {
  for (const page of PAGES) {
    const url = BASE + page;
    const t = await open();
    await t.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await t.send('Page.navigate', { url });
    await sleep(9000);
    const r = await t.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else {
        // what a reader can actually scroll to, not what an off-canvas drawer adds to scrollWidth
        scrollTo(99999, 0); const overflow = scrollX; scrollTo(0, 0);
        res({ frames: n, overflow }); } };
      requestAnimationFrame(tick); })` });
    const v = (r.result && r.result.result && r.result.result.value) || {};
    const label = `${page || 'index'} @${w}px`;
    if (!v.frames || v.frames < 20) t.problems.push(`animation stalled: ${v.frames || 0} frames in 2 s`);
    if (v.overflow > 2) t.problems.push(`page scrolls sideways by ${v.overflow}px`);
    if (out) {
      const shot = await t.send('Page.captureScreenshot', { format: 'png' });
      if (shot.result) writeFileSync(path.join(out, `${(page || 'index').replace('.html', '')}-${w}.png`), Buffer.from(shot.result.data, 'base64'));
    }
    console.log(`${t.problems.length ? 'FAIL' : 'ok  '} ${label}  frames=${v.frames}`);
    for (const p of t.problems) console.log(`     ${p}`);
    if (t.problems.length) failures.push(label);
    t.ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${t.targetId}`).catch(() => {});
  }
}
chrome.kill();
if (failures.length) { console.log(`\n${failures.length} page(s) broken in the browser: ${failures.join(', ')}`); process.exit(1); }
console.log('\nall pages load, animate and log no errors');
