const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const frontend = process.env.FRONTEND_URL || "http://localhost:5000";
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const debugPort = 9650 + Math.floor(Math.random() * 250);
const userDataDir = path.join(__dirname, `.chrome-cleanup-sprint-3-${Date.now()}`);
const outputFile = path.join(__dirname, "cleanup-sprint-3-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  frontend,
  backend,
  pages: {},
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
      const text = (msg.params.args || []).map(a => a.value || a.description || "").join(" ");
      if (!/DevTools|Angular is running/.test(text)) results.consoleErrors.push({ type: msg.params.type, text });
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
  for (let i = 0; i < 50; i += 1) {
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

async function setSession(client, login, lang = "ar") {
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      localStorage.setItem('zenjo_token', ${JSON.stringify(login.body.data.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(login.body.data.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(login.body.data.user))});
      localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
      localStorage.setItem('zenjo_theme', 'dark');
    `,
  });
}

async function evaluatePage(client, url, waitMs = 4500) {
  await client.send("Page.navigate", { url });
  await wait(waitMs);
  const value = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const text = document.body.innerText || '';
      const firstPanel = document.querySelector('.panel, .card, section, main');
      const style = firstPanel ? getComputedStyle(firstPanel) : null;
      const links = [...document.querySelectorAll('a')].map(a => a.getAttribute('href') || '');
      return {
        url: location.href,
        textSample: text.slice(0, 1000),
        hasArabicLeave: text.includes('إجاز') || text.includes('طلبات الإجازات') || text.includes('مركز إجازاتي'),
        hasEnglishLeave: text.includes('Leave'),
        hasMojibake: /[§£¥¢¤œ�Ãâ]/.test(text),
        hasRawLegacyLeaveAdminLink: links.some(h => h.includes('/app/leave') && !h.includes('/app/leave-management')),
        darkSurface: style ? { background: style.backgroundColor, color: style.color } : null,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        tableOrEmpty: Boolean(document.querySelector('table')) || /طلبات|إجاز|Leave requests|No matching|No data/.test(text)
      };
    })()`,
  });
  return value.result?.value;
}

async function main() {
  let chrome;
  let client;
  try {
    const hrLogin = await httpJson(`${backend}/api/auth/login`, "POST", { username: "hr", password });
    const employeeLogin = await httpJson(`${backend}/api/auth/login`, "POST", { username: "employee", password });
    results.auth = { hr: hrLogin.status, employee: employeeLogin.status };
    if (!hrLogin.ok || !employeeLogin.ok) throw new Error("Login failed");

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

    await setSession(client, hrLogin, "ar");
    results.pages.hrLeaveManagement = await evaluatePage(client, `${frontend}/#/app/leave-management`);

    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    results.pages.hrMobile = await evaluatePage(client, `${frontend}/#/app/leave-management`, 2500);
    await client.send("Emulation.clearDeviceMetricsOverride");

    await client.send("Page.navigate", { url: "about:blank" });
    await wait(500);
    await setSession(client, employeeLogin, "ar");
    results.pages.employeeLegacy = await evaluatePage(client, `${frontend}/#/app/leave`, 3500);

    results.checks.hrLeaveManagementLoads = Boolean(results.pages.hrLeaveManagement?.hasArabicLeave && results.pages.hrLeaveManagement?.tableOrEmpty);
    results.checks.adminNavHidesLegacyLeave = results.pages.hrLeaveManagement?.hasRawLegacyLeaveAdminLink === false;
    results.checks.employeeCompatibilityRouteLoads = Boolean(results.pages.employeeLegacy?.hasArabicLeave || results.pages.employeeLegacy?.hasEnglishLeave);
    results.checks.noMojibake = results.pages.hrLeaveManagement?.hasMojibake === false && results.pages.employeeLegacy?.hasMojibake === false;
    results.checks.darkModeReadable = Boolean(results.pages.hrLeaveManagement?.darkSurface?.background && results.pages.hrLeaveManagement?.darkSurface?.color && results.pages.hrLeaveManagement.darkSurface.background !== results.pages.hrLeaveManagement.darkSurface.color);
    results.checks.responsiveDesktop = results.pages.hrLeaveManagement?.horizontalOverflow === false;
    results.checks.responsiveMobile = results.pages.hrMobile?.horizontalOverflow === false;
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
