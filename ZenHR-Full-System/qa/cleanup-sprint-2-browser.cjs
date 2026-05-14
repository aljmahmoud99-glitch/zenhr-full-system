const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const frontend = process.env.FRONTEND_URL || "http://localhost:5000";
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const debugPort = 9400 + Math.floor(Math.random() * 250);
const userDataDir = path.join(__dirname, `.chrome-cleanup-sprint-2-${Date.now()}`);
const outputFile = path.join(__dirname, "cleanup-sprint-2-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  frontend,
  backend,
  auth: null,
  page: null,
  checks: {},
  consoleErrors: [],
  errors: [],
};

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function httpJson(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
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

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params?.type)) {
      results.consoleErrors.push({ type: msg.params.type, text: (msg.params.args || []).map(a => a.value || a.description || "").join(" ") });
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({
      send(method, params = {}, timeoutMs = 10000) {
        const id = ++seq;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveSend, rejectSend) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            rejectSend(new Error(`CDP timeout: ${method}`));
          }, timeoutMs);
          pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = reject;
  });
}

async function waitForDebugger() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const page = await httpGetJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`).catch(async () => {
        const tabs = await httpGetJson(`http://127.0.0.1:${debugPort}/json`);
        return tabs.find(t => t.type === "page") || tabs[0];
      });
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(250);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

async function main() {
  let chrome;
  let client;
  try {
    const login = await httpJson(`${backend}/api/auth/login`, "POST", { username: "hr", password });
    results.auth = { status: login.status, role: login.body?.data?.user?.role };
    if (!login.ok) throw new Error("HR login failed");

    chrome = spawn(chromePath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-default-apps",
      "--window-size=1366,900",
      "about:blank",
    ], { stdio: "ignore" });

    const wsUrl = await waitForDebugger();
    client = await cdp(wsUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('zenjo_token', ${JSON.stringify(login.body.data.accessToken)});
        localStorage.setItem('zenjo_refresh', ${JSON.stringify(login.body.data.refreshToken)});
        localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(login.body.data.user))});
        localStorage.setItem('zenjo_lang', 'en');
        localStorage.setItem('zenjo_theme', 'dark');
      `,
    });
    await client.send("Page.navigate", { url: `${frontend}/#/app/approvals` });
    await wait(4500);
    const evalResult = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const text = document.body.innerText || '';
        const card = document.querySelector('.approval-card');
        const style = card ? getComputedStyle(card) : null;
        const actions = [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean);
        return {
          url: location.href,
          title: document.title,
          hasApprovalCenter: text.includes('Approval Center') || text.includes('مركز الاعتمادات'),
          hasNoPendingOrCards: text.includes('No pending approvals') || text.includes('لا توجد اعتمادات') || document.querySelectorAll('.approval-card').length > 0,
          cardCount: document.querySelectorAll('.approval-card').length,
          approveButtons: actions.filter(a => a.includes('Approve') || a.includes('اعتماد')).length,
          bodyDir: document.querySelector('.approvals-page')?.getAttribute('dir'),
          darkSurface: style ? { background: style.backgroundColor, color: style.color } : null,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        };
      })()`,
    });
    results.page = evalResult.result?.value;
    results.checks.loaded = Boolean(results.page?.hasApprovalCenter);
    results.checks.hasDataOrEmptyState = Boolean(results.page?.hasNoPendingOrCards);
    results.checks.darkModeReadableSample = Boolean(results.page?.darkSurface?.background && results.page?.darkSurface?.color && results.page.darkSurface.background !== results.page.darkSurface.color);
    results.checks.responsiveNoHorizontalOverflowDesktop = results.page?.horizontalOverflow === false;

    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await wait(1000);
    const mobile = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `({ horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2, url: location.href })`,
    });
    results.checks.responsiveNoHorizontalOverflowMobile = mobile.result?.value?.horizontalOverflow === false;
    results.status = Object.values(results.checks).every(Boolean) && results.consoleErrors.length === 0 ? "GO" : "NO-GO";
  } catch (e) {
    results.status = "NO-GO";
    results.errors.push(e?.stack || String(e));
  } finally {
    try { client?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
