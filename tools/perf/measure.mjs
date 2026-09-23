/**
 * What the site costs a reader, measured rather than guessed.
 *
 *     node tools/perf/measure.mjs --base http://127.0.0.1:8778/web
 *     node tools/perf/measure.mjs --base http://127.0.0.1:8778/web --only panel-zoom --out out/
 *
 * It drives a headless Chrome over the DevTools Protocol **with the GPU on** (`--no-gpu` for
 * the software renderer), throttles the CPU (4x stands in for a
 * modest laptop; without throttling every number reads fine and tells you nothing), runs the
 * scripted interaction in `runs.json`, and reports three things per run:
 *
 *   frame times      p50 / p90 / p99 and the worst frame, from requestAnimationFrame
 *
 * A word on `worst`, which is reported but deliberately not budgeted. In a run that goes idle —
 * and most of these do, between scripted steps — requestAnimationFrame stops firing, because
 * nothing is animating and there is nothing to present. The gap that leaves is recorded as one
 * enormous frame. The evidence is in the numbers themselves: home-idle animates a globe without
 * pause and its worst frame is 133 ms, while panel-phone sits still after load and reports 1,767 ms
 * with zero blocked time. Nothing can hold a frame for 1.7 seconds without doing any work.
 *
 * So `worst` measures rAF starvation more often than it measures jank, and a budget on it would
 * fail on stillness. `p99` and `longTaskMs` are the honest pair: p99 is a frame the reader waited
 * for, and blocked time is the main thread actually being busy.
 *   long tasks       how much of the wall clock the main thread was blocked, from PerformanceObserver
 *   where it went    script, layout and style time, layout and restyle counts, from Performance.getMetrics
 *
 * `budget` in runs.json turns a measurement into a check: exceeding it exits non-zero and says
 * which run and which figure. A .cpuprofile is written next to the report for anything that needs
 * a closer look (open it in DevTools, or aggregate self time with your own script).
 *
 * Requires Chrome installed at CHROME (or --chrome), and a server already serving the site —
 * `python -m http.server` over a directory holding `web/` and `datasets/` is enough.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const BASE = args.get('base') || 'http://127.0.0.1:8778/web';
const OUT = args.get('out') || path.join(process.cwd(), 'perf-out');
const ONLY = args.get('only');
const PORT = Number(args.get('port') || 9347);
const NO_GPU = args.has('no-gpu');
const CHROME = args.get('chrome') || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CONFIG = JSON.parse(fs.readFileSync(args.get('runs') || new URL('runs.json', import.meta.url), 'utf8'));
const runs = CONFIG.runs.filter((r) => !ONLY || r.name === ONLY);

fs.mkdirSync(OUT, { recursive: true });
const profileDir = path.join(OUT, 'chrome-profile');
fs.mkdirSync(profileDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child = null;
try {
  await fetch(`http://127.0.0.1:${PORT}/json/version`); // a browser is already listening: use it
} catch {
  /* `--disable-gpu` was here from the first version and it quietly invalidated every number this
     tool ever produced about the basemap: with no GPU, WebGL falls back to software rasterisation,
     so MapLibre's shader compilation and every frame it draws were being measured against a
     renderer no reader will ever use. Measuring a GPU workload without a GPU is not a pessimistic
     measurement, it is a different measurement.

     The default is now the GPU, because that is what a reader has. `--no-gpu` keeps the old
     behaviour for the one thing it was honestly good for: showing what the site costs somebody
     whose driver has been blocklisted. Whichever was used is recorded in the report. */
  const gpuFlags = NO_GPU
    ? ['--disable-gpu']
    : ['--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  child = spawn(CHROME, ['--headless=new', ...gpuFlags, '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--window-size=1600,1000',
    'about:blank'], { stdio: 'ignore' });
}

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`no Chrome on port ${PORT}; is ${CHROME} installed?`);
}

// Frame times and long tasks are collected in the page itself: nothing else sees a frame.
const FRAME_HOOK = `(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__longTasks = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration)); })
      .observe({ entryTypes: ['longtask'] });
  } catch { /* Safari and old Chrome have no longtask entries */ }
})()`;

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  waiting.set(n, (msg) => resolve(msg.result ?? msg.error));
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true }); // measure the code on disk, not a cached copy
await send('Runtime.enable');
await send('Profiler.enable');
await send('Performance.enable');
const metrics = async () => Object.fromEntries(
  (await send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
);

const report = [];
let failed = 0;
for (const run of runs) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: run.width || 1400, height: run.height || 900, deviceScaleFactor: 1, mobile: !!run.mobile,
  });
  await send('Emulation.setCPUThrottlingRate', { rate: run.cpu || 1 });
  await send('Page.navigate', { url: run.url.replace('{base}', BASE) });
  await sleep(run.settle ?? 6000);
  await send('Runtime.evaluate', { expression: FRAME_HOOK });
  const before = await metrics();
  await send('Profiler.setSamplingInterval', { interval: 200 });
  await send('Profiler.start');
  if (run.script) await send('Runtime.evaluate', { expression: run.script, awaitPromise: true });
  await sleep((run.seconds ?? 6) * 1000);
  const { profile } = await send('Profiler.stop');
  const after = await metrics();
  const delta = (k) => Math.round(((after[k] || 0) - (before[k] || 0)) * 1000);
  const stats = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const f = window.__frames.slice(2).sort((a, b) => a - b);
      const q = (p) => (f.length ? Math.round(f[Math.floor(f.length * p)]) : 0);
      const lt = window.__longTasks || [];
      return { frames: f.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
        worst: Math.round(f[f.length - 1] || 0), over32: f.filter((x) => x > 32).length,
        longTasks: lt.length, longTaskMs: lt.reduce((a, b) => a + b, 0) };
    })()`,
  });
  const s = {
    ...stats.result.value,
    scriptMs: delta('ScriptDuration'), layoutMs: delta('LayoutDuration'), styleMs: delta('RecalcStyleDuration'),
    layouts: (after.LayoutCount || 0) - (before.LayoutCount || 0),
    restyles: (after.RecalcStyleCount || 0) - (before.RecalcStyleCount || 0),
    nodes: after.Nodes,
  };
  fs.writeFileSync(path.join(OUT, `${run.name}.cpuprofile`), JSON.stringify(profile));

  const over = Object.entries(run.budget || {}).filter(([k, limit]) => s[k] > limit);
  failed += over.length ? 1 : 0;
  report.push({ name: run.name, cpu: run.cpu || 1, ...s, over: over.map(([k, l]) => `${k} ${s[k]} > ${l}`) });
  console.log(
    `${run.name.padEnd(12)} cpu x${run.cpu || 1}  ` +
    `p50 ${String(s.p50).padStart(3)}  p90 ${String(s.p90).padStart(4)}  p99 ${String(s.p99).padStart(4)}  ` +
    `worst ${String(s.worst).padStart(4)}ms  blocked ${String(s.longTaskMs).padStart(4)}ms  ` +
    `script ${String(s.scriptMs).padStart(4)}  layout ${String(s.layoutMs).padStart(4)}  style ${String(s.styleMs).padStart(4)}  ` +
    `nodes ${s.nodes}` + (over.length ? `\n${' '.repeat(13)}OVER BUDGET: ${over.map(([k, l]) => `${k} ${s[k]} > ${l}`).join(', ')}` : ''),
  );
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, gpu: !NO_GPU, at: new Date().toISOString(), report }, null, 1));
ws.close();
if (child) child.kill();
process.exit(failed ? 1 : 0);
