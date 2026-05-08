const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = path.resolve(__dirname, "..");
const frontend = "http://localhost:5000";
const backend = "http://localhost:3001";
const password = "Admin@1234";
const debugPort = 9600 + Math.floor(Math.random() * 200);
const userDataDir = path.join(root, "qa", `.chrome-post-go-hotfix-${Date.now()}`);
const outputFile = path.join(root, "qa", "post-go-ui-hotfix-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  auth: [],
  pages: [],
  interactions: [],
  darkMode: [],
  responsive: [],
  consoleErrors: [],
  verdict: "pending",
};

let chrome;
let ws;
let seq = 0;
const pending = new Map();

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const tabs = await httpGetJson(`http://127.0.0.1:${debugPort}/json`);
      const page = tabs.find(t => t.type === "page") || tabs[0];
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
  const res = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Runtime exception");
  }
  return res.result?.value;
}

async function waitForLoad() {
  await wait(800);
  for (let i = 0; i < 30; i++) {
    const ready = await evalJs("document.readyState").catch(() => null);
    if (ready === "complete") break;
    await wait(250);
  }
  await wait(1100);
}

async function navigate(route) {
  const url = route.startsWith("http") ? route : `${frontend}/#${route}`;
  await send("Page.navigate", { url });
  await waitForLoad();
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
}

async function login(username) {
  await send("Storage.clearDataForOrigin", { origin: frontend, storageTypes: "all" }).catch(() => {});
  await navigate("about:blank");
  await navigate(frontend);
  await evalJs(`(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB && indexedDB.databases && indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name))); } catch {} return true; })()`).catch(() => false);
  await navigate("about:blank");
  await navigate("/login");
  await evalJs(`(() => { localStorage.setItem('zenjo_lang','ar'); localStorage.setItem('zenjo_theme','light'); return true; })()`).catch(() => false);
  await wait(600);
  const submitted = await evalJs(`
    (() => {
      const u = document.querySelector('input[name="username"]');
      const p = document.querySelector('input[name="password"]');
      const b = document.querySelector('button[type="submit"]');
      if (!u || !p || !b) return false;
      u.value = ${JSON.stringify(username)};
      p.value = ${JSON.stringify(password)};
      u.dispatchEvent(new Event('input', { bubbles: true }));
      p.dispatchEvent(new Event('input', { bubbles: true }));
      b.click();
      return true;
    })()
  `);
  await wait(4000);
  const state = await evalJs(`(() => {
    let user = null;
    try { user = JSON.parse(localStorage.getItem('zenjo_user') || 'null'); } catch {}
    return { url: location.href, username: user && user.username, role: user && user.role, textLength: document.body.innerText.length };
  })()`);
  const passed = submitted && state.username === username;
  results.auth.push({ username, passed, ...state });
  return passed;
}

async function inspectRoute(route) {
  await navigate(route);
  const info = await evalJs(`(() => {
    const text = document.body.innerText || '';
    const badChars = [];
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c === 0xfffd || c === 0x00ef || c === 0x00d8 || c === 0x00d9) badChars.push(ch);
      if (badChars.length > 20) break;
    }
    const rawEnums = /(pending_hr|pending_manager|pending_payroll|salary_change|suspension_lifted)/i.test(text);
    const errors = Array.from(document.querySelectorAll('.error,.alert-error')).map(e => e.innerText.trim()).filter(Boolean);
    return {
      url: location.href,
      textLength: text.length,
      sample: text.slice(0, 450),
      hasArabic: /[\\u0600-\\u06FF]/.test(text),
      badCharCount: badChars.length,
      rawEnums,
      errors,
      direction: getComputedStyle(document.body).direction,
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input,select,textarea').length
    };
  })()`);
  const passed = info.url.includes(`#${route}`) && info.textLength > 80 && info.hasArabic && info.badCharCount === 0 && !info.rawEnums && info.errors.length === 0;
  results.pages.push({ route, passed, ...info });
  return passed;
}

async function testDark(route) {
  await evalJs(`localStorage.setItem('zenjo_theme','dark'); document.documentElement.setAttribute('data-theme','dark'); document.body.classList.add('dark-theme');`);
  await navigate(route);
  const audit = await evalJs(`(() => {
    const nodes = Array.from(document.querySelectorAll('.z-card,.card,.panel,.modal,.dropdown,.menu,table,input,select,button')).slice(0, 120);
    const bad = [];
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      if (/255, 255, 255/.test(cs.backgroundColor) && /255, 255, 255/.test(cs.color)) {
        bad.push({ tag: el.tagName, cls: String(el.className).slice(0,80), text: (el.innerText || el.placeholder || '').slice(0,80), bg: cs.backgroundColor, color: cs.color });
      }
    }
    return { checked: nodes.length, bad, bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color };
  })()`);
  results.darkMode.push({ route, passed: audit.bad.length === 0, ...audit });
}

async function testResponsive(route) {
  for (const vp of [{ name: "tablet", width: 820, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    await setViewport(vp.width, vp.height);
    await navigate(route);
    const r = await evalJs(`(() => ({ width: innerWidth, textLength: document.body.innerText.length, overflowX: document.documentElement.scrollWidth > innerWidth + 8 }))()`);
    results.responsive.push({ route, viewport: vp.name, passed: r.textLength > 80 && !r.overflowX, ...r });
  }
  await setViewport(1440, 950);
}

async function testLeaveFilters() {
  await navigate("/app/leave");
  const state = await evalJs(`(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const before = document.body.innerText.length;
    const leaveSelect = selects.find(s => Array.from(s.options).some(o => o.value && /annual|sick|emergency|1|2/.test(o.value)));
    const statusSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'pending' || o.value === 'approved'));
    if (leaveSelect && leaveSelect.options.length > 1) {
      leaveSelect.value = leaveSelect.options[1].value;
      leaveSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (statusSelect) {
      statusSelect.value = 'pending';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const reset = Array.from(document.querySelectorAll('button')).find(b => /reset|مسح|clear/i.test(b.innerText || ''));
    return { selectCount: selects.length, before, hasReset: !!reset, text: document.body.innerText.slice(0, 500) };
  })()`);
  await wait(700);
  const after = await evalJs(`(() => ({ textLength: document.body.innerText.length, hasChips: document.querySelectorAll('.chip').length > 0, sample: document.body.innerText.slice(0,500) }))()`);
  results.interactions.push({ name: "leave filters", passed: state.selectCount >= 3 && after.hasChips, state, after });
}

async function testAttendanceMap() {
  await navigate("/app/attendance");
  const opened = await evalJs(`(() => {
    const mapButton = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('.material-icons')?.innerText.trim() === 'location_on' || /map/i.test(b.innerText || ''));
    if (mapButton) mapButton.click();
    return !!mapButton;
  })()`);
  await wait(1200);
  const saved = await evalJs(`(async () => {
    const cards = Array.from(document.querySelectorAll('section.z-card, .z-card'));
    const locationCards = cards.filter(c => /location|map|geofence|work site|موقع|الخريطة|النطاق/i.test(c.innerText || ''));
    const targetCard = locationCards[locationCards.length - 1] || cards[cards.length - 1] || document.body;
    const primaryButtons = Array.from(targetCard.querySelectorAll('button.z-btn-primary, button')).filter(b => !b.disabled);
    const add = primaryButtons.find(b => /add|new|location|إضافة|موقع/i.test(b.innerText || '')) || primaryButtons[primaryButtons.length - 1];
    if (!add) return { opened: false, cardText: (targetCard.innerText || '').slice(0, 900), buttonTexts: primaryButtons.map(b => b.innerText).slice(0, 10) };
    add.click();
    await new Promise(r => setTimeout(r, 800));
    const modal = document.querySelector('.modal-card, .modal, [role="dialog"]');
    const inputs = Array.from((modal || document).querySelectorAll('input'));
    if (inputs[0]) { inputs[0].value = 'Release Browser Location'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
    if (inputs[1]) { inputs[1].value = 'Release Browser Location'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
    if (inputs[2]) { inputs[2].value = 'Amman'; inputs[2].dispatchEvent(new Event('input', { bubbles: true })); }
    const map = (modal || document).querySelector('.map-picker');
    if (map) map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: map.getBoundingClientRect().left + map.clientWidth * 0.55, clientY: map.getBoundingClientRect().top + map.clientHeight * 0.45 }));
    const radius = inputs.find(i => i.type === 'number');
    if (radius) { radius.value = '180'; radius.dispatchEvent(new Event('input', { bubbles: true })); }
    const modalButtons = Array.from((modal || document).querySelectorAll('button')).filter(b => !b.disabled);
    const save = modalButtons.find(b => b.classList.contains('z-btn-primary') || /save|حفظ/i.test(b.innerText || '')) || modalButtons[modalButtons.length - 1];
    if (!save) return { opened: true, saved: false, hasMapPicker: !!map, modalText: modal?.innerText || '', buttonTexts: modalButtons.map(b => b.innerText).slice(0, 10) };
    save.click();
    await new Promise(r => setTimeout(r, 2200));
    const stillOpen = !!document.querySelector('.modal-card, .modal, [role="dialog"]');
    return { opened: true, saved: !stillOpen, hasMapPicker: !!map, modalText: document.querySelector('.modal-card, .modal, [role="dialog"]')?.innerText || '', text: document.body.innerText.slice(0,900) };
  })()`);
  const token = await evalJs(`localStorage.getItem('zenjo_token')`);
  const cleanup = await evalJs(`(async () => {
    const token = localStorage.getItem('zenjo_token');
    const res = await fetch('${backend}/api/attendance/locations', { headers: { Authorization: 'Bearer ' + token } });
    const json = await res.json();
    const item = (json.data || []).find(x => x.nameEn === 'Release Browser Location');
    if (item) await fetch('${backend}/api/attendance/locations/' + item.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    return { found: !!item, count: (json.data || []).length };
  })()`);
  results.interactions.push({ name: "attendance map picker save", passed: opened && saved.opened && saved.saved && saved.hasMapPicker, opened, saved, cleanup: { ...cleanup, tokenPresent: !!token } });
}

async function testEmployeeGeofence() {
  await login("employee");
  await navigate("/app/attendance");
  const state = await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /Clock in|حضور|تسجيل/i.test(b.innerText || ''));
    if (btn && !btn.disabled) btn.click();
    return { buttonFound: !!btn, disabled: !!btn?.disabled, text: document.body.innerText.slice(0,700) };
  })()`);
  await wait(1800);
  const after = await evalJs(`(() => {
    const text = document.body.innerText || '';
    return { text: text.slice(0,900), hasGeoMessage: /location|الموقع|نطاق|السماح/i.test(text) };
  })()`);
  results.interactions.push({ name: "employee geofence check-in UX", passed: state.disabled || after.hasGeoMessage, state, after });
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--remote-allow-origins=*",
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
      msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result || {});
    } else if (msg.method === "Runtime.exceptionThrown") {
      results.consoleErrors.push({ type: "exception", text: msg.params?.exceptionDetails?.text || "" });
    } else if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params?.entry?.level)) {
      results.consoleErrors.push({ type: msg.params.entry.level, text: msg.params.entry.text, url: msg.params.entry.url });
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await setViewport(1440, 950);

  if (await login("hr")) {
    for (const route of ["/app/workflows", "/app/forms", "/app/attendance", "/app/leave"]) await inspectRoute(route);
    await testLeaveFilters();
    await testAttendanceMap();
    for (const route of ["/app/workflows", "/app/forms", "/app/attendance", "/app/leave"]) await testDark(route);
    for (const route of ["/app/leave", "/app/attendance"]) await testResponsive(route);
  }
  await testEmployeeGeofence();

  const criticalConsole = results.consoleErrors.filter(e => {
    const text = `${e.text || ""} ${e.url || ""}`;
    return !/favicon|manifest|ResizeObserver|401|Unauthorized|auth\/me/i.test(text);
  });
  const groups = [results.auth, results.pages, results.interactions, results.darkMode, results.responsive];
  results.verdict = groups.every(group => group.every(x => x.passed)) && criticalConsole.length === 0 ? "PASS" : "FAIL";
  results.criticalConsoleErrors = criticalConsole;
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  ws.close();
  chrome.kill();
}

main().catch(error => {
  results.verdict = "ERROR";
  results.error = error.stack || String(error);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.error(error);
  try { if (ws) ws.close(); } catch {}
  try { if (chrome) chrome.kill(); } catch {}
  process.exit(1);
});
