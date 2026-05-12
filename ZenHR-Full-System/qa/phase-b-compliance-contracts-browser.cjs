const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const WebSocket = global.WebSocket || require('ws');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const root = path.resolve(__dirname, '..');
let frontend = process.env.FRONTEND_URL || '';
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const debugPort = 9900 + Math.floor(Math.random() * 300);
const userDataDir = path.join(process.env.TEMP || root, `.chrome-phase-b-${Date.now()}`);
const outputFile = process.env.OUTPUT_FILE || path.join(root, 'qa', 'phase-b-compliance-contracts-ui-results.json');

const results = {
  generatedAt: new Date().toISOString(),
  frontend,
  auth: null,
  route: null,
  interactions: [],
  consoleErrors: [],
  darkMode: null,
  responsive: [],
  verdict: 'PENDING',
};

let chrome;
let ws;
let staticServer;
let seq = 0;
const pending = new Map();

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function writeResults() {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function startStaticServer() {
  if (frontend) return Promise.resolve();
  const distRoot = process.env.STATIC_ROOT || path.join(root, 'frontend', 'dist', 'zenjo-ng', 'browser');
  const backend = new URL(process.env.BACKEND_URL || 'http://localhost:3001');
  const port = Number(process.env.PORT || (5100 + Math.floor(Math.random() * 300)));
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  staticServer = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
      const target = new URL(url, backend);
      const out = http.request(target, { method: req.method, headers: { ...req.headers, host: backend.host } }, upstream => {
        res.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(res);
      });
      out.on('error', err => {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      });
      req.pipe(out);
      return;
    }
    const clean = decodeURIComponent(url.split('?')[0]);
    const rel = clean === '/' ? '/index.html' : clean;
    const candidate = path.resolve(distRoot, `.${rel}`);
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distRoot, 'index.html');
    res.writeHead(200, { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => {
    staticServer.listen(port, '127.0.0.1', () => {
      frontend = `http://127.0.0.1:${port}`;
      results.frontend = frontend;
      resolve();
    });
  });
}

async function waitForDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await httpGetJson(`http://127.0.0.1:${debugPort}/json`);
      const page = tabs.find(t => t.type === 'page') || tabs[0];
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(250);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

function addSocketListener(socket, event, handler, once = false) {
  if (typeof socket.on === 'function' && !once) return socket.on(event, handler);
  if (typeof socket.once === 'function' && once) return socket.once(event, handler);
  socket.addEventListener(event, ev => handler(ev.data ?? ev), { once });
}

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 45000);
    pending.set(id, { resolve, reject, timer });
  });
}

async function evalJs(expression, awaitPromise = true) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime exception');
  }
  return res.result?.value;
}

async function navigate(url) {
  await send('Page.navigate', { url });
  await wait(1200);
}

async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await evalJs(`Boolean(${expression})`).catch(() => false);
    if (ok) return true;
    await wait(350);
  }
  return false;
}

async function main() {
  await startStaticServer();
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);
  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--disable-popup-blocking',
    'about:blank',
  ], { stdio: 'ignore', detached: true });

  const wsUrl = await waitForDebugger();
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    addSocketListener(ws, 'open', resolve, true);
    addSocketListener(ws, 'error', reject, true);
  });
  addSocketListener(ws, 'message', raw => {
    const msg = JSON.parse(String(raw));
    if ((msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded')) {
      const rendered = JSON.stringify(msg);
      if (/fonts\.googleapis|fonts\.gstatic|favicon/i.test(rendered)) return;
      if (/error|failed|500|exception/i.test(rendered)) results.consoleErrors.push(msg);
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timer);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result || {});
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  await navigate(`${frontend}/#/login`);
  if (!await waitFor(`document.querySelector('input[name="username"]') && document.querySelector('input[name="password"]')`)) {
    throw new Error('Login form did not render');
  }
  await evalJs(`
    (() => {
      const u = document.querySelector('input[name="username"]');
      const p = document.querySelector('input[name="password"]');
      u.value = 'hr'; u.dispatchEvent(new Event('input', { bubbles: true }));
      p.value = ${JSON.stringify(password)}; p.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...document.querySelectorAll('button')].find(b => /login|دخول|تسجيل/i.test(b.innerText));
      btn.click();
    })()
  `);
  if (!await waitFor(`location.hash.includes('/app/')`, 25000)) throw new Error('Login did not reach app route');
  results.auth = { passed: true, url: await evalJs('location.href') };

  await evalJs(`location.hash = '#/app/compliance-contracts'`);
  if (!await waitFor(`document.body.innerText.includes('محرك العقود والامتثال') || document.body.innerText.includes('Compliance & Contracts Engine')`, 25000)) {
    throw new Error('Compliance contracts screen did not render');
  }
  const routeState = await evalJs(`
    (() => {
      const text = document.body.innerText || '';
      return {
        url: location.href,
        hasArabic: /[\\u0600-\\u06FF]/.test(text),
        hasTitle: text.includes('محرك العقود والامتثال') || text.includes('Compliance & Contracts Engine'),
        hasTable: text.includes('سجل العقود') || text.includes('Contracts register'),
        hasActions: text.includes('عقد جديد') || text.includes('New contract'),
        mojibake: /�|ï|Ã|Â|ط·|ظ…|ظ†|ظٹ/.test(text),
        direction: getComputedStyle(document.querySelector('.contracts-shell') || document.body).direction,
      };
    })()
  `);
  results.route = { passed: routeState.hasTitle && routeState.hasTable && routeState.hasActions && !routeState.mojibake, ...routeState };

  const createResult = await evalJs(`
    (async () => {
      const clickButton = (matcher) => {
        const button = [...document.querySelectorAll('button')].find(b => matcher.test(b.innerText));
        if (!button) return false;
        button.click();
        return true;
      };
      if (!clickButton(/عقد جديد|New contract/i)) return { ok: false, reason: 'new contract button missing' };
      await new Promise(r => setTimeout(r, 300));
      const modal = document.querySelector('.modal');
      if (!modal) return { ok: false, reason: 'modal missing' };
      const employee = modal.querySelector('select[name="employeeId"]');
      const type = modal.querySelector('select[name="contractTypeId"]');
      if (!employee?.options?.length || !type?.options?.length) return { ok: false, reason: 'dropdowns not loaded' };
      employee.selectedIndex = employee.options.length > 1 ? 1 : 0;
      employee.dispatchEvent(new Event('change', { bubbles: true }));
      type.selectedIndex = type.options.length > 1 ? 1 : 0;
      type.dispatchEvent(new Event('change', { bubbles: true }));
      const set = (name, value) => {
        const el = modal.querySelector('[name="' + name + '"]');
        if (!el) return false;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const unique = Date.now();
      set('contractNumber', 'UAT-' + unique);
      set('titleAr', 'عقد تجربة واجهة');
      set('titleEn', 'Browser UAT Contract');
      set('startDate', '2026-05-12');
      set('endDate', '2026-12-31');
      set('probationEndDate', '2026-08-10');
      set('notesAr', 'تم إنشاؤه من اختبار المتصفح.');
      set('notesEn', 'Created by browser UAT.');
      const save = [...modal.querySelectorAll('button')].find(b => /حفظ|Save/i.test(b.innerText));
      if (!save) return { ok: false, reason: 'save missing' };
      save.click();
      await new Promise(r => setTimeout(r, 1800));
      const text = document.body.innerText || '';
      return {
        ok: !document.querySelector('.modal') && (text.includes('عقد تجربة واجهة') || text.includes('Browser UAT Contract') || text.includes('UAT-' + unique)),
        unique,
        modalClosed: !document.querySelector('.modal'),
        visible: text.includes('عقد تجربة واجهة') || text.includes('Browser UAT Contract') || text.includes('UAT-' + unique)
      };
    })()
  `);
  results.interactions.push({ name: 'create contract dialog save', passed: Boolean(createResult.ok), state: createResult });

  const detailResult = await evalJs(`
    (async () => {
      const button = [...document.querySelectorAll('.row-actions button')].find(b => (b.title || '').includes('تفاصيل') || (b.title || '').includes('Details'));
      if (!button) return { ok: false, reason: 'details button missing' };
      button.click();
      await new Promise(r => setTimeout(r, 800));
      const text = document.body.innerText || '';
      return { ok: Boolean(document.querySelector('.details-panel')) && (text.includes('تفاصيل العقد') || text.includes('Contract details')), panel: Boolean(document.querySelector('.details-panel')) };
    })()
  `);
  results.interactions.push({ name: 'details panel opens', passed: Boolean(detailResult.ok), state: detailResult });

  const filterResult = await evalJs(`
    (async () => {
      const input = document.querySelector('.filter-grid input[type="search"]');
      if (!input) return { ok: false, reason: 'search input missing' };
      input.value = 'Browser UAT';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const apply = [...document.querySelectorAll('button')].find(b => /تطبيق|Apply/i.test(b.innerText));
      if (!apply) return { ok: false, reason: 'apply missing' };
      apply.click();
      await new Promise(r => setTimeout(r, 1200));
      const text = document.body.innerText || '';
      return { ok: text.includes('Browser UAT') || text.includes('عقد تجربة واجهة'), textMatched: text.includes('Browser UAT') || text.includes('عقد تجربة واجهة') };
    })()
  `);
  results.interactions.push({ name: 'search/filter applies', passed: Boolean(filterResult.ok), state: filterResult });

  await evalJs(`
    (() => {
      document.documentElement.dataset.theme = 'dark';
      document.body.dataset.theme = 'dark';
      document.body.classList.add('theme-dark');
      document.documentElement.style.setProperty('--surface', '#111c18');
      document.documentElement.style.setProperty('--surface-elevated', '#17241f');
      document.documentElement.style.setProperty('--surface-muted', '#0d1713');
      document.documentElement.style.setProperty('--foreground', '#eef8f3');
      document.documentElement.style.setProperty('--foreground-muted', '#b7c9c0');
      document.documentElement.style.setProperty('--border', 'rgba(191, 219, 207, 0.14)');
      document.documentElement.style.setProperty('--card-bg', 'rgba(17, 28, 24, 0.94)');
      document.documentElement.style.setProperty('--input-bg', '#0d1713');
      document.documentElement.style.setProperty('--dropdown-hover', 'rgba(39, 174, 96, 0.16)');
    })()
  `);
  await wait(500);
  const darkMode = await evalJs(`
    (() => {
      const panel = document.querySelector('.panel');
      const modal = document.querySelector('.details-panel') || panel;
      const panelStyle = getComputedStyle(panel);
      const modalStyle = getComputedStyle(modal);
      const tableHeader = getComputedStyle(document.querySelector('th'));
      return {
        panelBg: panelStyle.backgroundColor,
        panelText: panelStyle.color,
        modalBg: modalStyle.backgroundColor,
        modalText: modalStyle.color,
        tableHeaderBg: tableHeader.backgroundColor,
        readable: panelStyle.backgroundColor !== panelStyle.color && modalStyle.backgroundColor !== modalStyle.color
      };
    })()
  `);
  results.darkMode = { passed: Boolean(darkMode.readable), ...darkMode };

  for (const size of [
    { name: 'tablet', width: 820, height: 900, mobile: false },
    { name: 'mobile', width: 390, height: 820, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
    await wait(600);
    const state = await evalJs(`
      (() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        hasHero: Boolean(document.querySelector('.hero')),
        hasTable: Boolean(document.querySelector('.table-wrap')),
        hasActions: Boolean(document.querySelector('.hero-actions')),
      }))()
    `);
    results.responsive.push({ ...size, ...state, passed: state.hasHero && state.hasTable && !state.overflow });
  }

  const criticalConsole = results.consoleErrors.filter(entry => !/favicon|404/.test(JSON.stringify(entry)));
  const interactionPass = results.interactions.every(item => item.passed);
  const responsivePass = results.responsive.every(item => item.passed);
  results.verdict = results.auth?.passed && results.route?.passed && interactionPass && results.darkMode?.passed && responsivePass && criticalConsole.length === 0 ? 'PASS' : 'FAIL';
  if (results.verdict !== 'PASS') process.exitCode = 1;
}

main().catch(error => {
  results.verdict = 'FAIL';
  results.error = String(error?.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  writeResults();
  try { if (ws) ws.close(); } catch {}
  try { if (chrome?.pid) chrome.kill(); } catch {}
  try { if (staticServer) staticServer.close(); } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 100);
  console.log(JSON.stringify({ verdict: results.verdict, route: results.route, interactions: results.interactions, darkMode: results.darkMode, responsive: results.responsive, error: results.error }, null, 2));
});
