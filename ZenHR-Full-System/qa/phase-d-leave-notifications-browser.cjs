const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const WebSocket = global.WebSocket || require('ws');
const root = path.resolve(__dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let frontend = process.env.FRONTEND_URL || '';
const backend = process.env.BACKEND_URL || 'http://localhost:3001';
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const outputFile = process.env.OUTPUT_FILE || path.join(root, 'qa', 'phase-d-leave-notifications-ui-results.json');
const debugPort = 10650 + Math.floor(Math.random() * 300);
const userDataDir = path.join(process.env.TEMP || root, `.chrome-phase-d-ui-${Date.now()}`);

const results = {
  generatedAt: new Date().toISOString(),
  frontend,
  backend,
  auth: {},
  pages: {},
  interactions: {},
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
  const port = Number(process.env.PORT || (5300 + Math.floor(Math.random() * 300)));
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8'
  };
  staticServer = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
      const target = new URL(url, backend);
      const out = http.request(target, { method: req.method, headers: { ...req.headers, host: new URL(backend).host } }, upstream => {
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
  for (let i = 0; i < 80; i += 1) {
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
  await wait(1200);
}
async function apiLogin(username) {
  const res = await fetch(`${backend}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`Login API failed for ${username}: ${res.status}`);
  return { accessToken: body.data.accessToken, refreshToken: body.data.refreshToken, user: body.data.user };
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
  await evalJs(`
    (() => {
      localStorage.clear();
      localStorage.setItem('zenjo_lang','ar');
      localStorage.setItem('zenjo_theme','dark');
      localStorage.setItem('zenjo_token', ${JSON.stringify(session.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(session.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(session.user))});
      return true;
    })()
  `);
  results.auth[username] = { passed: true, role: session.user?.role, companyId: session.user?.companyId };
}
async function inspectPage(username, route, selector, key) {
  await login(username);
  await navigate(`${frontend}/#${route}`);
  if (!await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 30000)) {
    results.pages[`${key}Failure`] = await evalJs(`({ href: location.href, hash: location.hash, text: (document.body.innerText || '').slice(0, 1000), html: document.body.innerHTML.slice(0, 1000) })`).catch(error => ({ error: String(error) }));
    throw new Error(`${route} did not render ${selector}`);
  }
  results.pages[key] = await evalJs(`
    (() => {
      const text = document.body.innerText || '';
      const root = document.querySelector(${JSON.stringify(selector)});
      const panel = root?.querySelector('.panel, .form-card, .notification-row, .data-card') || root;
      const cs = getComputedStyle(panel);
      const mojibake = /(?:ï¿½|�|Ã|Â|ط[§¥£ھ¬خ±]|ظ[„…ˆٹƒ‡])/.test(text);
      return {
        url: location.href,
        dir: root?.getAttribute('dir') || document.dir,
        hasArabic: /[\\u0600-\\u06FF]/.test(text),
        hasMojibake: mojibake,
        hasRawEnum: /pending_manager|pending_hr|pending_payroll/.test(text),
        readableDark: cs.backgroundColor !== 'rgb(255, 255, 255)' && cs.color !== 'rgb(255, 255, 255)',
        bg: cs.backgroundColor,
        color: cs.color,
        textSample: text.slice(0, 400)
      };
    })()
  `);
}
async function exerciseNotifications() {
  await navigate(`${frontend}/#/app/notifications`);
  await waitFor(`!!document.querySelector('.notifications-shell')`, 25000);
  results.interactions.sendTest = await evalJs(`
    (async () => {
      const before = document.querySelectorAll('.notification-row').length;
      const testButton = [...document.querySelectorAll('button')].find(b => /اختبار|Test/.test(b.innerText));
      testButton?.click();
      await new Promise(r => setTimeout(r, 1000));
      const readButton = [...document.querySelectorAll('button')].find(b => /مقروء|Read/.test(b.innerText));
      readButton?.click();
      await new Promise(r => setTimeout(r, 500));
      const unreadButton = [...document.querySelectorAll('button')].find(b => /غير مقروء|Unread/.test(b.innerText));
      unreadButton?.click();
      await new Promise(r => setTimeout(r, 500));
      return { before, after: document.querySelectorAll('.notification-row').length, clickedTest: !!testButton, clickedRead: !!readButton, clickedUnread: !!unreadButton };
    })()
  `);
}
async function exerciseLeaveRequestForm() {
  await navigate(`${frontend}/#/app/leave-management`);
  await waitFor(`!!document.querySelector('.phase-shell')`, 25000);
  results.interactions.leaveForm = await evalJs(`
    (() => {
      const form = document.querySelector('form.form-card');
      const hasTypeSelect = !!form?.querySelector('select[name="leaveTypeId"]');
      const hasSubmit = !![...document.querySelectorAll('button')].find(b => /إرسال الطلب|Submit request/.test(b.innerText));
      const hasApprove = !![...document.querySelectorAll('button')].find(b => /اعتماد|Approve/.test(b.innerText));
      return { hasForm: !!form, hasTypeSelect, hasSubmit, hasApprove };
    })()
  `);
}
async function responsive(width, height, name, route, selector) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await navigate(`${frontend}/#${route}`);
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 25000);
  const state = await evalJs(`
    (() => ({
      width: innerWidth,
      route: location.hash,
      overflow: document.documentElement.scrollWidth > innerWidth + 4,
      hasContent: (document.body.innerText || '').length > 200
    }))()
  `);
  results.responsive.push({ name, width, height, ...state, passed: !state.overflow && state.hasContent });
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
      const type = msg.params?.type || msg.params?.entry?.level || '';
      if (!/debug|log|info/i.test(type) && !/fonts\\.googleapis|fonts\\.gstatic|favicon|401|403/i.test(rendered) && /error|failed|500|exception/i.test(rendered)) {
        results.consoleErrors.push(msg);
      }
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

  await inspectPage('employee', '/app/leave-management', '.phase-shell', 'employeeLeaveManagement');
  await exerciseLeaveRequestForm();
  await inspectPage('hr', '/app/leave-management', '.phase-shell', 'hrLeaveManagement');
  await inspectPage('employee', '/app/notifications', '.notifications-shell', 'employeeNotifications');
  await exerciseNotifications();
  await responsive(390, 820, 'mobileLeave', '/app/leave-management', '.phase-shell');
  await responsive(820, 900, 'tabletNotifications', '/app/notifications', '.notifications-shell');

  const pagesPass = Object.values(results.pages).every(p => p.hasArabic && !p.hasMojibake && !p.hasRawEnum && p.readableDark);
  const interactionsPass = results.interactions.leaveForm?.hasForm && results.interactions.leaveForm?.hasTypeSelect && results.interactions.sendTest?.clickedTest && results.interactions.sendTest?.clickedRead && results.interactions.sendTest?.clickedUnread;
  const responsivePass = results.responsive.every(r => r.passed);
  results.verdict = pagesPass && interactionsPass && responsivePass && results.consoleErrors.length === 0 ? 'PASS' : 'FAIL';
}

main().catch(error => {
  results.verdict = 'FAIL';
  results.fatal = String(error?.stack || error);
}).finally(() => {
  writeResults();
  try { if (chrome?.pid) chrome.kill(); } catch {}
  try { if (staticServer) staticServer.close(); } catch {}
  try { if (ws) ws.close(); } catch {}
  process.exit(results.verdict === 'PASS' ? 0 : 1);
});
