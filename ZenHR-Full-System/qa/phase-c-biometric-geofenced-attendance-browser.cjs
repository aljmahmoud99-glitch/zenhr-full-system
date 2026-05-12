const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const WebSocket = global.WebSocket || require('ws');
const root = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const backend = new URL(process.env.BACKEND_URL || 'http://localhost:3001');
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const outputFile = process.env.OUTPUT_FILE || path.join(root, 'qa', 'phase-c-biometric-geofenced-attendance-ui-results.json');
let frontend = process.env.FRONTEND_URL || '';
const debugPort = 10450 + Math.floor(Math.random() * 300);
const userDataDir = path.join(process.env.TEMP || root, `.chrome-phase-c-ui-${Date.now()}`);

const results = {
  generatedAt: new Date().toISOString(),
  frontend,
  backend: backend.href,
  auth: {},
  employee: null,
  hr: null,
  darkMode: null,
  responsive: [],
  consoleErrors: [],
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
  const port = Number(process.env.PORT || (5200 + Math.floor(Math.random() * 300)));
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
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
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(distRoot, 'index.html');
    res.writeHead(200, { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => staticServer.listen(port, '127.0.0.1', () => {
    frontend = `http://127.0.0.1:${port}`;
    results.frontend = frontend;
    resolve();
  }));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
  });
}
async function evalJs(expression, awaitPromise = true) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime exception');
  return res.result?.value;
}
async function navigate(url) {
  await send('Page.navigate', { url });
  await wait(1000);
}
async function apiLogin(username) {
  const res = await fetch(`${frontend}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`Login API failed for ${username}: ${res.status}`);
  const payload = JSON.parse(Buffer.from(body.data.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const user = { ...body.data.user, companyId: Number(payload.companyId || body.data.user.companyId || 0) };
  return { accessToken: body.data.accessToken, refreshToken: body.data.refreshToken, user };
}
async function waitFor(expression, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await evalJs(`Boolean(${expression})`).catch(() => false);
    if (ok) return true;
    await wait(350);
  }
  return false;
}
async function login(username) {
  const session = await apiLogin(username);
  await navigate(`${frontend}/#/login`);
  const seeded = await evalJs(`
    (() => {
      localStorage.clear();
      localStorage.setItem('zenjo_lang','ar');
      localStorage.setItem('zenjo_theme','dark');
      localStorage.setItem('zenjo_token', ${JSON.stringify(session.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(session.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(session.user))});
      location.hash = '#/app/attendance';
      return { ok: true, user: ${JSON.stringify(session.user)} };
    })()
  `);
  if (!seeded?.ok) throw new Error(`Login failed for ${username}: ${JSON.stringify(seeded)}`);
  if (!await waitFor(`location.hash.includes('/app/attendance')`, 25000)) throw new Error(`Attendance navigation failed for ${username}`);
  results.auth[username] = { passed: true, url: await evalJs('location.href'), role: seeded.user?.role };
}

async function attendanceState(label) {
  await evalJs(`location.hash = '#/app/attendance'`);
  if (!await waitFor(`!!document.querySelector('.attendance-page')`, 25000)) throw new Error(`${label} attendance route did not render`);
  return evalJs(`
    (() => {
      const text = document.body.innerText || '';
      const hasMojibake = /ط§|ظ„|ï¿½|�/.test(text);
      const buttons = [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean);
      const deviceButton = [...document.querySelectorAll('button')].find(b => /جهازي الموثوق|الأجهزة الموثوقة|Trusted/.test(b.innerText));
      deviceButton?.click();
      const card = document.querySelector('.z-card') || document.body;
      const cs = getComputedStyle(card);
      return {
        url: location.href,
        dir: document.querySelector('.attendance-page')?.getAttribute('dir') || document.dir,
        hasArabic: text.includes('الحضور') && text.includes('جهاز'),
        hasDeviceTab: !!deviceButton,
        hasSecureRules: text.includes('لا يوجد بديل PIN') || text.includes('No PIN'),
        hasRequiredMessages: text.includes('جهازك غير مسجل للحضور') || text.includes('البصمة') || text.includes('Face ID'),
        hasMojibake,
        buttonSample: buttons.slice(0, 8),
        cardBg: cs.backgroundColor,
        cardColor: cs.color,
        readableDark: cs.backgroundColor !== 'rgb(255, 255, 255)'
      };
    })()
  `);
}

async function responsive(width, height, name) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await wait(500);
  const state = await evalJs(`
    (() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      hasAttendance: (document.body.innerText || '').includes('الحضور') || (document.body.innerText || '').includes('Attendance'),
      hasDevices: (document.body.innerText || '').includes('جهاز') || (document.body.innerText || '').includes('Device')
    }))()
  `);
  results.responsive.push({ name, width, height, ...state, passed: !state.overflow && state.hasAttendance });
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
      if (!/fonts\.googleapis|fonts\.gstatic|favicon/i.test(rendered) && /error|failed|500|exception/i.test(rendered)) results.consoleErrors.push(msg);
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

  await login('employee');
  results.employee = await attendanceState('employee');
  results.darkMode = { passed: results.employee.readableDark, cardBg: results.employee.cardBg, cardColor: results.employee.cardColor };
  await responsive(390, 820, 'mobile');

  await login('hr');
  results.hr = await attendanceState('hr');
  await responsive(820, 900, 'tablet');

  const pass = results.employee.hasDeviceTab && results.hr.hasDeviceTab && !results.employee.hasMojibake && !results.hr.hasMojibake && results.darkMode.passed && results.responsive.every(r => r.passed) && results.consoleErrors.length === 0;
  results.verdict = pass ? 'PASS' : 'FAIL';
}

main().catch(error => {
  results.verdict = 'FAIL';
  results.fatal = String(error?.stack || error);
}).finally(() => {
  writeResults();
  try { if (chrome?.pid) chrome.kill(); } catch {}
  try { if (staticServer) staticServer.close(); } catch {}
  if (ws) try { ws.close(); } catch {}
  process.exit(results.verdict === 'PASS' ? 0 : 1);
});
