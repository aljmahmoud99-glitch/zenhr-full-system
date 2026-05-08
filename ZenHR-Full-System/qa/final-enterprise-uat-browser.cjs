const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = path.resolve(__dirname, "..");
const downloadDir = path.join(root, "qa", "final-uat-downloads");
const runId = Date.now();
const userDataDir = path.join(root, "qa", `.chrome-final-uat-${runId}`);
const debugPort = 9300 + Math.floor(Math.random() * 300);
const frontend = "http://localhost:5000";
const backend = "http://localhost:3001";
const password = "Admin@1234";
const outputFile = process.env.UAT_OUTPUT || path.join(root, "qa", "final-enterprise-uat-results.json");

const allAccounts = [
  { username: "admin", role: "superadmin", pages: ["/admin/companies", "/admin/plans-subscriptions", "/admin/analytics", "/admin/audit-logs", "/admin/automation"] },
  { username: "hr", role: "hradmin", pages: ["/app/dashboard", "/app/hr-master-data", "/app/job-descriptions", "/app/recruitment", "/app/payroll-attendance", "/app/performance-workflows", "/app/documents-reporting"] },
  { username: "payroll", role: "payrolladmin", pages: ["/app/dashboard", "/app/payroll", "/app/payroll-attendance", "/app/performance-workflows", "/app/documents-reporting"] },
  { username: "manager", role: "manager", pages: ["/app/dashboard", "/app/payroll-attendance", "/app/performance-workflows", "/app/documents-reporting"] },
  { username: "employee", role: "employee", pages: ["/app/dashboard", "/app/performance-workflows", "/app/documents-reporting"] },
  { username: "recruiter", role: "recruiter", pages: ["/app/recruitment", "/app/documents-reporting"] },
];
const accountFilter = process.env.UAT_ACCOUNT;
const accounts = accountFilter ? allAccounts.filter(a => a.username === accountFilter) : allAccounts;

const results = {
  timestamp: new Date().toISOString(),
  mode: "Chrome DevTools Protocol fallback; Browser Use Node REPL tool was unavailable.",
  browser: { chromePath, frontend, backend },
  auth: [],
  pages: [],
  search: [],
  theme: [],
  responsive: [],
  exports: [],
  forbidden: [],
  consoleErrors: [],
  screenshots: [],
};

let chrome;
let ws;
let seq = 0;
let currentStep = "startup";
const pending = new Map();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function httpJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForDebugger() {
  for (let i = 0; i < 40; i++) {
    try {
      const page = await httpJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, "PUT").catch(async () => {
        const tabs = await httpGetJson(`http://127.0.0.1:${debugPort}/json`);
        return tabs.find(t => t.type === "page") || tabs[0];
      });
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(250);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 45000);
    pending.set(id, { resolve, reject, method, timer });
  });
}

async function evalJs(expression, awaitPromise = true) {
  currentStep = `Runtime.evaluate: ${expression.slice(0, 90)}`;
  let res;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await send("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await wait(750);
    }
  }
  if (lastError) throw lastError;
  if (res.exceptionDetails) {
    const description = res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Runtime exception";
    throw new Error(description);
  }
  return res.result?.value;
}

async function navigate(url) {
  currentStep = `Page.navigate: ${url}`;
  await send("Page.navigate", { url });
  await waitForLoad();
}

function appUrl(route) {
  if (route.startsWith("http")) return route;
  return `${frontend}/#${route}`;
}

async function waitForLoad() {
  await wait(700);
  for (let i = 0; i < 30; i++) {
    const ready = await evalJs("document.readyState").catch(() => null);
    if (ready === "complete") break;
    await wait(250);
  }
  await wait(900);
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
}

async function login(account) {
  await send("Storage.clearDataForOrigin", { origin: frontend, storageTypes: "all" }).catch(() => {});
  await navigate("about:blank");
  await navigate(appUrl("/login"));
  await evalJs(`(() => { try { localStorage.setItem('zenjo_lang','ar'); localStorage.setItem('zenjo_theme','light'); return true; } catch (e) { return String(e && e.message || e); } })()`).catch(() => false);
  for (let i = 0; i < 15; i++) {
    const hasForm = await evalJs(`!!document.querySelector('input[name="username"]') && !!document.querySelector('input[name="password"]')`);
    if (hasForm) break;
    await wait(300);
  }
  const submitted = await evalJs(`
    (() => {
      const u = document.querySelector('input[name="username"]');
      const p = document.querySelector('input[name="password"]');
      if (!u || !p) return false;
      u.value = ${JSON.stringify(account.username)};
      p.value = ${JSON.stringify(password)};
      u.dispatchEvent(new Event('input', { bubbles: true }));
      p.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type="submit"]').click();
      return true;
    })()
  `);
  if (!submitted) {
    results.auth.push({ user: account.username, role: account.role, passed: false, url: await send("Runtime.evaluate", { expression: "location.href", returnByValue: true }).then(r => r.result?.value), reason: "login form not found" });
    return false;
  }
  await wait(4500);
  await send("Page.stopLoading").catch(() => {});
  const state = await evalJs(`(() => ({ url: location.href, textLength: document.body.innerText.length, user: localStorage.getItem('zenjo_user') }))()`);
  let storedUser = null;
  try { storedUser = JSON.parse(state.user || "null"); } catch {}
  const passed = storedUser?.username === account.username;
  results.auth.push({ user: account.username, role: account.role, passed, url: state.url, textLength: state.textLength, storedUser: storedUser?.username, storedRole: storedUser?.role });
  return passed;
}

async function inspectPage(account, route, viewport = "desktop") {
  await navigate(appUrl(route));
  const info = await evalJs(`(() => {
    const text = document.body.innerText || '';
    const errors = Array.from(document.querySelectorAll('.error,.alert-error')).map(e => e.innerText.trim()).filter(Boolean);
    const loaders = Array.from(document.querySelectorAll('.spinner,.loading,.skeleton,[aria-busy="true"]')).length;
    const buttons = document.querySelectorAll('button').length;
    const tables = document.querySelectorAll('table,.enterprise-table,.data-table').length;
    const cards = document.querySelectorAll('.card,.metric-card,.panel,.dashboard-card').length;
    return { url: location.href, title: document.title, textLength: text.length, sample: text.slice(0, 280), errors, loaders, buttons, tables, cards, dir: document.documentElement.dir || document.body.dir || getComputedStyle(document.body).direction };
  })()`);
  const passed = info.textLength > 80 && !info.url.includes("/login") && info.url.includes(`#${route}`) && info.errors.length === 0;
  results.pages.push({ user: account.username, role: account.role, route, viewport, passed, ...info });
}

async function testSearch(account) {
  await navigate(appUrl(account.pages[0]));
  const opened = await evalJs(`(() => {
    const candidates = Array.from(document.querySelectorAll('button,input,[role="button"]'));
    const search = candidates.find(el => /بحث|search|ctrl|⌘|k/i.test(el.innerText || el.placeholder || el.getAttribute('aria-label') || ''));
    if (search) { search.click(); return true; }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
    return false;
  })()`);
  await wait(500);
  const state = await evalJs(`(() => {
    const input = Array.from(document.querySelectorAll('input')).find(i => /بحث|search|employees|reports|plans/i.test(i.placeholder || '') || i.offsetParent);
    if (input) {
      input.focus();
      input.value = 'hr';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { opened: !!input, placeholder: input?.placeholder || '' };
  })()`);
  await wait(1000);
  const after = await evalJs(`(() => {
    const text = document.body.innerText || '';
    const hasResults = /hr|موظف|employee|user|شركة|company|لا توجد|no results/i.test(text);
    return { textLength: text.length, hasResults, sample: text.slice(0, 400) };
  })()`);
  results.search.push({ user: account.username, route: account.pages[0], openedByClick: opened, inputFound: state.opened, placeholder: state.placeholder, passed: state.opened && after.hasResults, sample: after.sample });
}

async function testDarkMode(route) {
  await evalJs(`localStorage.setItem('zenjo_theme','dark'); document.documentElement.setAttribute('data-theme','dark'); document.body.classList.add('dark-theme');`);
  await navigate(appUrl(route));
  const audit = await evalJs(`(() => {
    const nodes = Array.from(document.querySelectorAll('.card,.panel,.dropdown,.dropdown-menu,.menu,.drawer,.modal,table,input,button')).slice(0, 80);
    const bad = [];
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const color = cs.color;
      if (/255, 255, 255/.test(bg) && /255, 255, 255/.test(color)) bad.push({ tag: el.tagName, cls: el.className, bg, color, text: (el.innerText || el.placeholder || '').slice(0, 60) });
    }
    return { checked: nodes.length, bad, bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color };
  })()`);
  results.theme.push({ route, passed: audit.bad.length === 0, ...audit });
}

async function testResponsive(route) {
  for (const vp of [{ name: "tablet", width: 820, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    await setViewport(vp.width, vp.height);
    await navigate(appUrl(route));
    const r = await evalJs(`(() => ({ width: innerWidth, overflowX: document.documentElement.scrollWidth > innerWidth + 8, textLength: document.body.innerText.length, url: location.href }))()`);
    results.responsive.push({ route, viewport: vp.name, passed: r.textLength > 80 && !r.overflowX, ...r });
  }
  await setViewport(1440, 950);
}

async function downloadApi(account, dataset, format, expectedStatus = 200) {
  const token = await evalJs(`localStorage.getItem('zenjo_token')`);
  const res = await fetch(`${backend}/api/production/exports/${dataset}?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
  const buffer = Buffer.from(await res.arrayBuffer());
  const file = path.join(downloadDir, `${account.username}-${dataset}.${format}`);
  if (res.status === 200) await fsp.writeFile(file, buffer);
  const magic = buffer.slice(0, 8).toString("hex");
  const passed = res.status === expectedStatus && (expectedStatus !== 200 || buffer.length > 50);
  results.exports.push({ user: account.username, dataset, format, status: res.status, expectedStatus, bytes: buffer.length, contentType: res.headers.get("content-type"), magic, file: res.status === 200 ? file : null, passed });
}

async function screenshot(name) {
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = path.join(root, "qa", `${name}.png`);
  await fsp.writeFile(file, Buffer.from(res.data, "base64"));
  results.screenshots.push(file);
}

async function main() {
  await fsp.mkdir(downloadDir, { recursive: true });
  await fsp.mkdir(userDataDir, { recursive: true });
  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-dev-shm-usage",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--window-size=1440,950",
    "about:blank",
  ], { stdio: "ignore" });

  const wsUrl = await waitForDebugger();
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result || {});
    } else if (msg.method === "Runtime.exceptionThrown") {
      results.consoleErrors.push({ type: "exception", details: msg.params?.exceptionDetails?.text || "" });
    } else if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params?.entry?.level)) {
      results.consoleErrors.push({ type: msg.params.entry.level, text: msg.params.entry.text, url: msg.params.entry.url });
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await setViewport(1440, 950);

  for (const account of accounts) {
    const ok = await login(account);
    if (!ok) continue;
    for (const route of account.pages) await inspectPage(account, route);
    await testSearch(account);
    if (account.username === "hr") {
      await testDarkMode("/app/documents-reporting");
      await testDarkMode("/app/payroll-attendance");
      await testResponsive("/app/documents-reporting");
      await screenshot("final-uat-hr-documents-reporting");
      await downloadApi(account, "employees", "csv");
      await downloadApi(account, "employees", "xlsx");
      await downloadApi(account, "employees", "pdf");
    }
    if (account.username === "payroll") await downloadApi(account, "payroll", "xlsx");
    if (account.username === "recruiter") await downloadApi(account, "recruitment", "csv");
    if (account.username === "employee") await downloadApi(account, "payroll", "csv", 403);
    if (account.username === "admin") await downloadApi(account, "employees", "csv", 403);
  }

  await fsp.writeFile(outputFile, JSON.stringify(results, null, 2), "utf8");
}

main().catch(async e => {
  results.fatal = e.stack || String(e);
  results.fatalStep = currentStep;
  await fsp.writeFile(outputFile, JSON.stringify(results, null, 2), "utf8").catch(() => {});
  process.exitCode = 1;
}).finally(() => {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
});
