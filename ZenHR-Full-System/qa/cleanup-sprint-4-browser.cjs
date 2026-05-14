const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const frontend = process.env.FRONTEND_URL || "http://localhost:5000";
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const debugPort = 9900 + Math.floor(Math.random() * 150);
const userDataDir = path.join(__dirname, `.chrome-cleanup-sprint-4-${Date.now()}`);
const outputFile = path.join(__dirname, "cleanup-sprint-4-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  pages: {},
  checks: {},
  consoleErrors: [],
  errors: [],
};

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function httpJson(url, method = "GET", body) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
}
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
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
      if (!/Angular is running|DevTools/.test(text)) results.consoleErrors.push({ type: msg.params.type, text });
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer); pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({
      send(method, params = {}, timeoutMs = 10000) {
        const id = ++seq;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveSend, rejectSend) => {
          const timer = setTimeout(() => { pending.delete(id); rejectSend(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
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
async function pageProbe(client, url, waitMs = 4200) {
  await client.send("Page.navigate", { url });
  await wait(waitMs);
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const text = document.body.innerText || '';
      const links = [...document.querySelectorAll('a')].map(a => a.getAttribute('href') || '');
      const panel = document.querySelector('main, section, .z-page, .app-shell');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        url: location.href,
        textSample: text.slice(0, 1200),
        links,
        hasLegacyLeaveLink: links.some(h => h && h.includes('/app/leave') && !h.includes('/app/leave-management')),
        hasDocumentsLegacyLink: links.some(h => h && h.includes('/app/documents') && !h.includes('/app/documents-reporting')),
        hasReportsLegacyLink: links.some(h => h && h.includes('/app/reports')),
        hasFormsLegacyLink: links.some(h => h && h.includes('/app/forms')),
        hasCanonicalLeave: links.some(h => h && h.includes('/app/leave-management')),
        hasCanonicalApprovals: links.some(h => h && h.includes('/app/approvals')),
        hasCanonicalDocsReporting: links.some(h => h && h.includes('/app/documents-reporting')),
        hasCompatibilityBanner: text.includes('Compatibility screen') || text.includes('شاشة توافق'),
        darkSurface: style ? { background: style.backgroundColor, color: style.color } : null,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      };
    })()`,
  });
  return result.result?.value;
}

async function main() {
  let chrome;
  let client;
  try {
    const hrLogin = await httpJson(`${backend}/api/auth/login`, "POST", { username: "hr", password });
    const employeeLogin = await httpJson(`${backend}/api/auth/login`, "POST", { username: "employee", password });
    if (!hrLogin.ok || !employeeLogin.ok) throw new Error("Login failed");
    chrome = spawn(chromePath, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, "--no-first-run", "--disable-default-apps", "--window-size=1366,900", "about:blank"], { stdio: "ignore" });
    client = await cdp(await waitForDebugger());
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await setSession(client, hrLogin, "ar");
    results.pages.hrCanonical = await pageProbe(client, `${frontend}/#/app/leave-management`);
    results.pages.hrLegacyLeave = await pageProbe(client, `${frontend}/#/app/leave`, 3000);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    results.pages.mobile = await pageProbe(client, `${frontend}/#/app/documents-reporting`, 3000);
    await client.send("Page.navigate", { url: "about:blank" });
    await wait(500);
    await setSession(client, employeeLogin, "ar");
    results.pages.employee = await pageProbe(client, `${frontend}/#/app/dashboard`, 3000);

    results.checks.canonicalPagesLoad =
      results.pages.hrCanonical.url.includes("/app/leave-management") &&
      results.pages.mobile.url.includes("/app/documents-reporting") &&
      !/Cannot match any routes|404|Not found/i.test(results.pages.hrCanonical.textSample + results.pages.mobile.textSample);
    results.checks.legacyNavHiddenForHr = !results.pages.hrCanonical.hasLegacyLeaveLink && !results.pages.hrCanonical.hasDocumentsLegacyLink && !results.pages.hrCanonical.hasReportsLegacyLink && !results.pages.hrCanonical.hasFormsLegacyLink;
    results.checks.legacyLeaveRouteHasBanner = results.pages.hrLegacyLeave.hasCompatibilityBanner;
    results.checks.employeeNavClean = results.pages.employee.hasCanonicalLeave && results.pages.employee.hasCanonicalDocsReporting && !results.pages.employee.hasLegacyLeaveLink && !results.pages.employee.hasDocumentsLegacyLink;
    results.checks.darkModeReadable = Boolean(results.pages.hrCanonical.darkSurface?.background && results.pages.hrCanonical.darkSurface?.color && results.pages.hrCanonical.darkSurface.background !== results.pages.hrCanonical.darkSurface.color);
    results.checks.responsiveNoOverflow = results.pages.hrCanonical.horizontalOverflow === false && results.pages.mobile.horizontalOverflow === false;
    results.status = Object.values(results.checks).every(Boolean) && results.consoleErrors.length === 0 ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    try { client?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
