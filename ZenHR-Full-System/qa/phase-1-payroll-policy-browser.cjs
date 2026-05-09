const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const WebSocket = global.WebSocket || require("ws");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = path.resolve(__dirname, "..");
const frontend = process.env.FRONTEND_URL || "http://localhost:5001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const debugPort = 9700 + Math.floor(Math.random() * 200);
const userDataDir = process.env.CHROME_USER_DATA_DIR || path.join(process.env.TEMP || root, `.chrome-payroll-policy-${Date.now()}`);
const outputFile = process.env.OUTPUT_FILE || path.join(root, "qa", "phase-1-payroll-policy-engine-ui-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  frontend,
  auth: null,
  page: null,
  interactions: [],
  darkMode: null,
  responsive: [],
  consoleErrors: [],
  verdict: "PENDING",
};

let chrome;
let ws;
let seq = 0;
const pending = new Map();

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function writeResults() {
  const payload = JSON.stringify(results, null, 2);
  try {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, payload, "utf8");
    return outputFile;
  } catch (primaryError) {
    const fallback = path.join(process.env.TEMP || process.cwd(), "phase-1-payroll-policy-engine-ui-results.json");
    try {
      fs.writeFileSync(fallback, payload, "utf8");
      console.error(`Primary result write failed: ${primaryError.message}. Wrote fallback: ${fallback}`);
      return fallback;
    } catch (fallbackError) {
      console.error(`Unable to write browser results: ${fallbackError.message}`);
      console.log(payload);
      return null;
    }
  }
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

async function waitForDebugger() {
  for (let i = 0; i < 60; i++) {
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
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 45000);
    pending.set(id, { resolve, reject, timer });
  });
}

function addSocketListener(socket, event, handler, once = false) {
  if (typeof socket.on === "function" && !once) return socket.on(event, handler);
  if (typeof socket.once === "function" && once) return socket.once(event, handler);
  const mapped = event === "message"
    ? "message"
    : event === "open"
      ? "open"
      : event === "error"
        ? "error"
        : event;
  socket.addEventListener(mapped, ev => handler(ev.data ?? ev), { once });
}

async function evalJs(expression, awaitPromise = true) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Runtime exception");
  }
  return res.result?.value;
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await wait(1200);
}

async function waitFor(predicate, timeout = 20000) {
  const expression = typeof predicate === "function" ? predicate() : predicate;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await evalJs(`Boolean(${expression})`).catch(() => false);
    if (ok) return true;
    await wait(400);
  }
  return false;
}

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);
  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    "--disable-popup-blocking",
    "about:blank",
  ], { stdio: "ignore", detached: true });

  const wsUrl = await waitForDebugger();
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    addSocketListener(ws, "open", resolve, true);
    addSocketListener(ws, "error", reject, true);
  });
  addSocketListener(ws, "message", raw => {
    const msg = JSON.parse(String(raw));
    if (msg.method === "Runtime.consoleAPICalled" || msg.method === "Log.entryAdded") {
      results.consoleErrors.push(msg);
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result || {});
    }
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  await navigate(`${frontend}/#/login`);
  if (!await waitFor(() => `document.querySelector('input[name="username"]') && document.querySelector('input[name="password"]')`)) {
    throw new Error("Login form did not render");
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
  if (!await waitFor(() => `location.hash.includes('/app/dashboard') || location.hash.includes('/app/')`, 25000)) {
    throw new Error("Login did not reach an app route");
  }
  results.auth = { passed: true, url: await evalJs("location.href") };

  await evalJs(`location.hash = '#/app/payroll-policies'`);
  await wait(1800);
  if (!await waitFor(() => `document.body.innerText.includes('محرك سياسات احتساب الرواتب') || document.body.innerText.includes('Payroll Policy Engine')`, 25000)) {
    throw new Error("Payroll policy screen did not render");
  }
  const pageInfo = await evalJs(`
    (() => {
      const root = document.querySelector('.policy-shell') || document.body;
      const text = root.innerText || '';
      const mojibake = /�|ï|Ø|Ù|Ã|Â|ط§|ظ„|ظ…|ظٹ|ظپ|ظ‚/.test(text);
      return {
        url: location.href,
        hasArabic: /[\\u0600-\\u06FF]/.test(text),
        hasTitle: text.includes('محرك سياسات احتساب الرواتب') || text.includes('Payroll Policy Engine'),
        mojibake,
        direction: getComputedStyle(root).direction,
        textLength: text.length
      };
    })()
  `);
  results.page = {
    passed: pageInfo.hasTitle && pageInfo.hasArabic && !pageInfo.mojibake,
    ...pageInfo,
  };

  const saveResult = await evalJs(`
    (async () => {
      const modeButtons = [...document.querySelectorAll('.mode-grid button')];
      const actual = modeButtons.find(b => b.innerText.includes('أيام الشهر الفعلية') || b.innerText.includes('Actual calendar days'));
      if (!actual) return { ok: false, reason: 'actual mode button missing' };
      actual.click();
      await new Promise(r => setTimeout(r, 200));
      const save = [...document.querySelectorAll('button')].find(b => b.innerText.includes('حفظ السياسة') || b.innerText.includes('Save policy'));
      if (!save) return { ok: false, reason: 'save button missing' };
      save.click();
      await new Promise(r => setTimeout(r, 1800));
      const active = document.querySelector('.mode-grid button.active')?.innerText || '';
      return {
        ok: true,
        activeIsActual: active.includes('أيام الشهر الفعلية') || active.includes('Actual calendar days'),
        toastVisible: /تم حفظ|saved/i.test(document.body.innerText)
      };
    })()
  `);
  results.interactions.push({ name: "change calculation mode and save", passed: Boolean(saveResult.ok && saveResult.activeIsActual), state: saveResult });

  await navigate(`${frontend}/#/app/payroll-policies`);
  await wait(2200);
  const persisted = await evalJs(`
    (() => {
      const active = document.querySelector('.mode-grid button.active')?.innerText || '';
      return { persisted: active.includes('أيام الشهر الفعلية') || active.includes('Actual calendar days') };
    })()
  `);
  results.interactions.push({ name: "reload confirms policy persistence", passed: Boolean(persisted.persisted), state: persisted });

  const ruleResult = await evalJs(`
    (async () => {
      const ruleButton = document.querySelector('.rule-list button');
      if (!ruleButton) return { ok: false, reason: 'rule button missing' };
      ruleButton.click();
      await new Promise(r => setTimeout(r, 200));
      const saveRule = [...document.querySelectorAll('button')].find(b => b.innerText.includes('حفظ قاعدة التوظيف') || b.innerText.includes('Save employment rule'));
      if (!saveRule) return { ok: false, reason: 'save rule missing' };
      saveRule.click();
      await new Promise(r => setTimeout(r, 1600));
      return { ok: true, toastVisible: /تم حفظ|saved/i.test(document.body.innerText) };
    })()
  `);
  results.interactions.push({ name: "employment type rule save", passed: Boolean(ruleResult.ok), state: ruleResult });

  const previewResult = await evalJs(`
    (async () => {
      const run = [...document.querySelectorAll('button')].find(b => b.innerText.includes('تشغيل المعاينة') || b.innerText.includes('Run preview'));
      if (!run) return { ok: false, reason: 'preview button missing' };
      run.click();
      await new Promise(r => setTimeout(r, 2000));
      const text = document.body.innerText;
      return { ok: text.includes('المعدل اليومي') || text.includes('Daily rate'), hasExpectedPayable: text.includes('المبلغ المتوقع') || text.includes('Expected payable') };
    })()
  `);
  results.interactions.push({ name: "policy preview calculation", passed: Boolean(previewResult.ok), state: previewResult });

  const historyVisible = await evalJs(`
    (() => {
      const text = document.body.innerText;
      return { ok: text.includes('سجل التدقيق') || text.includes('Audit History'), hasRows: /updated|created|policy|employment_type_rule/.test(text) };
    })()
  `);
  results.interactions.push({ name: "audit history visible", passed: Boolean(historyVisible.ok), state: historyVisible });

  await evalJs(`localStorage.setItem('zenjo_theme', 'dark')`);
  await navigate(`${frontend}/#/app/payroll-policies`);
  await waitFor(() => `document.body.innerText.includes('محرك سياسات احتساب الرواتب') || document.body.innerText.includes('Payroll Policy Engine')`, 25000);
  await evalJs(`
    (() => {
      if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
      const themeButton = [...document.querySelectorAll('button')]
        .find(b => (b.innerText || '').includes('dark_mode') || (b.textContent || '').includes('dark_mode'));
      if (themeButton) themeButton.click();
      return Boolean(themeButton);
    })()
  `);
  await waitFor(() => `document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('theme-dark')`, 8000);
  await wait(500);
  const dark = await evalJs(`
    (() => {
      const cards = [...document.querySelectorAll('.panel,.policy-hero,select,input,button')].slice(0, 80);
      const bad = [];
      const parse = value => {
        const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([0-9.]+))?/);
        if (!m) return null;
        return { r:+m[1], g:+m[2], b:+m[3], a:m[4] == null ? 1 : +m[4] };
      };
      const blend = (fg, bg) => {
        const a = fg.a == null ? 1 : fg.a;
        return {
          r: Math.round(fg.r * a + bg.r * (1 - a)),
          g: Math.round(fg.g * a + bg.g * (1 - a)),
          b: Math.round(fg.b * a + bg.b * (1 - a)),
          a: 1
        };
      };
      const effectiveBg = el => {
        let node = el;
        let bg = { r: 255, g: 255, b: 255, a: 1 };
        const stack = [];
        while (node && node.nodeType === 1) {
          stack.push(node);
          node = node.parentElement;
        }
        for (const item of stack.reverse()) {
          const parsed = parse(getComputedStyle(item).backgroundColor);
          if (parsed && parsed.a > 0) bg = blend(parsed, bg);
        }
        return bg;
      };
      const rel = c => {
        const parts = [c.r, c.g, c.b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
      };
      const contrast = (a, b) => {
        const l1 = rel(a), l2 = rel(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      for (const el of cards) {
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const bg = effectiveBg(el);
        const text = (el.innerText || el.placeholder || '').trim();
        if (!fg || !text) continue;
        const ratio = contrast(fg, bg);
        if (ratio < 2.2) bad.push({ tag: el.tagName, text: text.slice(0, 40), color: cs.color, bg: \`rgb(\${bg.r}, \${bg.g}, \${bg.b})\`, ratio });
      }
      return {
        checked: cards.length,
        bad,
        passed: bad.length === 0 && (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('theme-dark')),
        htmlTheme: document.documentElement.getAttribute('data-theme'),
        bodyClass: document.body.className,
        token: getComputedStyle(document.documentElement).getPropertyValue('--z-text-primary').trim()
      };
    })()
  `);
  results.darkMode = dark;

  for (const viewport of [
    { name: "tablet", width: 820, height: 900 },
    { name: "mobile", width: 390, height: 850 },
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === "mobile" });
    await wait(700);
    const state = await evalJs(`({ overflowX: document.documentElement.scrollWidth > window.innerWidth + 2, textLength: document.body.innerText.length })`);
    results.responsive.push({ ...viewport, passed: !state.overflowX, ...state });
  }

  const criticalConsoleErrors = results.consoleErrors.filter(e => {
    const s = JSON.stringify(e);
    if (/fonts\\.googleapis\\.com|fonts\\.gstatic\\.com|ERR_NETWORK_ACCESS_DENIED/i.test(s)) return false;
    return /500|TypeError|ReferenceError|DrizzleQueryError/i.test(s);
  });
  const failed = [
    !results.auth?.passed && "auth",
    !results.page?.passed && "page",
    ...results.interactions.filter(i => !i.passed).map(i => i.name),
    !results.darkMode?.passed && "dark mode",
    ...results.responsive.filter(r => !r.passed).map(r => `responsive ${r.name}`),
    criticalConsoleErrors.length && "critical console errors",
  ].filter(Boolean);
  results.verdict = failed.length ? "UI_NO_GO" : "UI_GO";
  results.failed = failed;
  writeResults();
  console.log(JSON.stringify({ verdict: results.verdict, failed }, null, 2));
}

main().catch(err => {
  results.verdict = "UI_NO_GO";
  results.error = err.message;
  writeResults();
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
});
