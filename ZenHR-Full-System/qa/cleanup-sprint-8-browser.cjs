const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5018);
const baseUrl = process.env.FRONTEND_URL || `http://localhost:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "cleanup-sprint-8-browser-results.json");
const uxOut = path.join(__dirname, "cleanup-sprint-8-ux-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  backend,
  pages: {},
  checks: {},
  consoleErrors: [],
  networkErrors: [],
  errors: [],
};

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, body: json };
}

async function login(username) {
  const r = await request("POST", "/api/auth/login", { username, password });
  if (!r.body?.data?.accessToken) throw new Error(`${username} login failed: ${r.status}`);
  return r.body.data;
}

function serveDist() {
  const distRoot = path.resolve(__dirname, "..", "frontend", "dist", "zenjo-ng", "browser");
  if (!fs.existsSync(distRoot)) throw new Error(`Angular dist not found: ${distRoot}`);
  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      const proxyReq = http.request(`${backend}${req.url}`, { method: req.method, headers: req.headers }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (error) => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: error.message }));
      });
      req.pipe(proxyReq);
      return;
    }
    const rawPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    const rel = rawPath === "/" ? "/index.html" : rawPath;
    const candidate = path.resolve(distRoot, `.${rel}`);
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distRoot, "index.html");
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(frontendPort, "127.0.0.1", () => resolve(server));
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function connect(port) {
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (!/favicon|ResizeObserver/i.test(text)) results.consoleErrors.push(text);
    }
    if (msg.method === "Network.responseReceived") {
      const status = Number(msg.params?.response?.status || 0);
      const url = msg.params?.response?.url || "";
      if (status >= 500 && /\/api\//.test(url)) results.networkErrors.push({ status, url });
    }
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  return { ws, send };
}

function sessionScript(loginData, lang = "ar", theme = "dark") {
  return `
    localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
    localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
    localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
    localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
    localStorage.setItem('zenjo_theme', ${JSON.stringify(theme)});
  `;
}

async function setSession(page, loginData, lang = "ar", theme = "dark") {
  const script = sessionScript(loginData, lang, theme);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
  await page.send("Page.navigate", { url: `${baseUrl}/` });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.send("Runtime.evaluate", { expression: script });
}

async function inspect(page, key, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Page.navigate", { url: `${baseUrl}/#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  let value = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const evaluation = await page.send("Runtime.evaluate", {
      expression: `(() => {
      const text = document.body.innerText || "";
      const style = getComputedStyle(document.body);
      return {
        url: location.href,
        text: text.slice(0, 2500),
        length: text.length,
        loadingStuck: /تحميل\\.\\.\\.|Loading\\.\\.\\./.test(text) && text.length < 200,
        hasMojibake: /(ط§|طھ|ظ„|ظ…|ظٹ){3,}/.test(text),
        hasForbidden: /Forbidden|غير مصرح|ليس لديك صلاحية|401|403/i.test(text),
        hasPayrollTerms: /Payroll|Payslip|صافي الراتب|مسير الرواتب/i.test(text),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        color: style.color,
        background: style.backgroundColor
      };
    })()`,
      returnByValue: true,
    });
    value = evaluation.result?.result?.value;
    if ((value?.length || 0) > 200) break;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  results.pages[key] = value;
  return results.pages[key];
}

async function main() {
  let server = null;
  let chrome = null;
  try {
    server = await serveDist();
    const logins = {
      hr: await login("hr"),
      payroll: await login("payroll"),
      employee: await login("employee"),
      manager: await login("manager"),
      recruiter: await login("recruiter"),
    };
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 12400 + Math.floor(Math.random() * 600);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      "--user-data-dir=" + path.join(__dirname, `.chrome-sprint-8-${Date.now()}`),
      "--headless=new",
      "--disable-gpu",
      "about:blank",
    ], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const page = await connect(port);

    await setSession(page, logins.hr);
    await inspect(page, "hrDashboard", "/app/dashboard");
    await inspect(page, "hrLeaveManagement", "/app/leave-management");
    await inspect(page, "hrApprovals", "/app/approvals");
    await inspect(page, "hrRecruitment", "/app/recruitment");
    await inspect(page, "hrComplianceContracts", "/app/compliance-contracts");
    await inspect(page, "hrDocumentsReporting", "/app/documents-reporting");
    await inspect(page, "hrPerformanceWorkflows", "/app/performance-workflows");

    await setSession(page, logins.payroll);
    await inspect(page, "payrollOperations", "/app/payroll-attendance");
    await inspect(page, "payrollPolicies", "/app/payroll-policies");

    await setSession(page, logins.employee);
    await inspect(page, "employeeDashboard", "/app/dashboard");
    await inspect(page, "employeeLeaveCompatibility", "/app/leave");
    await inspect(page, "employeeNotifications", "/app/notifications");
    await inspect(page, "employeeMobileNotifications", "/app/notifications", 390);

    await setSession(page, logins.manager);
    await inspect(page, "managerApprovals", "/app/approvals");

    await setSession(page, logins.recruiter);
    await inspect(page, "recruiterRecruitment", "/app/recruitment");
    await inspect(page, "recruiterPayrollForbidden", "/app/payroll");

    page.ws.close();

    const pageValues = Object.values(results.pages);
    results.checks = {
      pagesLoaded: pageValues.every((p) => p?.length > 200),
      noStuckLoading: pageValues.every((p) => !p?.loadingStuck),
      noHorizontalOverflow: pageValues.every((p) => !p?.overflow),
      darkModeReadable: pageValues.every((p) => p?.color && p?.background),
      noMojibakeDetected: pageValues.every((p) => !p?.hasMojibake),
      recruiterPayrollNoSensitiveData: !!results.pages.recruiterPayrollForbidden?.hasForbidden || !results.pages.recruiterPayrollForbidden?.hasPayrollTerms,
      noCriticalConsoleErrors: results.consoleErrors.length === 0,
      noUnexpected500s: results.networkErrors.length === 0,
    };
    results.status = Object.values(results.checks).every(Boolean) ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    if (chrome) chrome.kill();
    if (server) server.close();
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(uxOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, checks: results.checks, pages: Object.fromEntries(Object.entries(results.pages).map(([k, v]) => [k, { url: v.url, length: v.length, overflow: v.overflow, hasMojibake: v.hasMojibake, loadingStuck: v.loadingStuck }])) }, null, 2));
    console.log(JSON.stringify({ status: results.status, checks: results.checks, errors: results.errors, networkErrors: results.networkErrors }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
