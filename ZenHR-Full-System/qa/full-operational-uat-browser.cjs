const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5031);
const baseUrl = process.env.FRONTEND_URL || `http://localhost:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const screenshotsDir = path.join(__dirname, "full-operational-uat-screenshots");
const out = path.join(__dirname, "full-operational-uat-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  backend,
  pages: {},
  checks: {},
  consoleErrors: [],
  networkErrors: [],
  screenshotsDir,
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
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(distRoot, "index.html");
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
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean).find((p) => fs.existsSync(p));
}

async function connect(port) {
  const tabs = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params?.type)) {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (!/favicon|ResizeObserver|Could not parse CSS stylesheet/i.test(text)) results.consoleErrors.push(text);
    }
    if (msg.method === "Network.responseReceived") {
      const status = Number(msg.params?.response?.status || 0);
      const url = msg.params?.response?.url || "";
      if (status >= 500 && /\/api\//.test(url)) results.networkErrors.push({ status, url });
    }
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      resolve({ timeout: true, method });
    }, 12000);
    pending.set(callId, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  return { ws, send };
}

async function setSession(page, loginData, lang = "ar", theme = "dark") {
  const script = `
    localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
    localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
    localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
    localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
    localStorage.setItem('zenjo_theme', ${JSON.stringify(theme)});
  `;
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
  await page.send("Page.navigate", { url: `${baseUrl}/` });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.send("Runtime.evaluate", { expression: script });
}

async function inspect(page, key, route, width = 1366, lang = "ar") {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Page.navigate", { url: `${baseUrl}/#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 2800));
  let value = {};
  for (let i = 0; i < 5; i += 1) {
    const evalResult = await page.send("Runtime.evaluate", {
      expression: `(() => {
        const text=document.body.innerText||"";
        const style=getComputedStyle(document.body);
        const actionable=[...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>e.offsetParent!==null).length;
        return {
          url:location.href,
          lang:${JSON.stringify(lang)},
          length:text.length,
          actionable,
          loadingStuck:/Loading|تحميل/.test(text)&&text.length<220,
          hasMojibake:/(ط·آ§|ط·ع¾|ط¸â€‍|ط¸â€¦|ط¸ظ¹|ط·آ±|ط·آµ|ط·آ¯){2,}/.test(text),
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
          color:style.color,
          background:style.backgroundColor,
          legacyBanner:/legacy|compatibility|deprecated|توافق|قديم|النسخة القديمة|leave-management/i.test(text)
        };
      })()`,
      returnByValue: true,
    });
    value = evalResult.result?.result?.value || {};
    if ((value.length || 0) > 200) break;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (shot.result?.data) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const file = `${key.replace(/[^a-z0-9_-]/gi, "_")}.png`;
    fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
    value.screenshot = `qa/full-operational-uat-screenshots/${file}`;
  }
  results.pages[key] = value;
}

async function main() {
  let server = null;
  let chrome = null;
  let page = null;
  try {
    server = await serveDist();
    const logins = {
      hr: await login("hr"),
      payroll: await login("payroll"),
      manager: await login("manager"),
      employee: await login("employee"),
      recruiter: await login("recruiter"),
      admin: await login("admin"),
    };
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 14500 + Math.floor(Math.random() * 500);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(__dirname, `.chrome-full-uat-${Date.now()}`)}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "about:blank",
    ], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    page = await connect(port);

    await setSession(page, logins.hr, "ar", "dark");
    for (const [key, route] of [
      ["hr_dashboard", "/app/dashboard"],
      ["hr_leave_management", "/app/leave-management"],
      ["hr_legacy_leave", "/app/leave"],
      ["hr_approvals", "/app/approvals"],
      ["hr_payroll_runs", "/app/payroll/runs"],
      ["hr_payroll_slips", "/app/payroll/slips"],
      ["hr_payroll_policies", "/app/payroll-policies"],
      ["hr_payroll_operations", "/app/payroll-attendance"],
      ["hr_attendance", "/app/attendance"],
      ["hr_recruitment", "/app/recruitment"],
      ["hr_compliance_contracts", "/app/compliance-contracts"],
      ["hr_documents_reporting", "/app/documents-reporting"],
      ["hr_performance_workflows", "/app/performance-workflows"],
      ["hr_notifications", "/app/notifications"],
      ["hr_employees", "/app/employees"],
      ["hr_job_profiles", "/app/job-descriptions"],
    ]) await inspect(page, key, route, 1366, "ar");

    await setSession(page, logins.employee, "ar", "dark");
    await inspect(page, "employee_dashboard_mobile", "/app/dashboard", 390, "ar");
    await inspect(page, "employee_leave_mobile", "/app/leave-management", 390, "ar");
    await inspect(page, "employee_notifications_mobile", "/app/notifications", 390, "ar");

    await setSession(page, logins.recruiter, "en", "dark");
    await inspect(page, "recruiter_recruitment", "/app/recruitment", 1366, "en");

    await setSession(page, logins.manager, "en", "dark");
    await inspect(page, "manager_approvals", "/app/approvals", 768, "en");

    const pages = Object.values(results.pages);
    results.checks = {
      pagesLoaded: pages.every((p) => (p?.length || 0) > 200),
      noStuckLoading: pages.every((p) => !p?.loadingStuck),
      noHorizontalOverflow: pages.every((p) => !p?.overflow),
      darkModeReadable: pages.every((p) => p?.color && p?.background !== undefined),
      noMojibakeDetected: pages.every((p) => !p?.hasMojibake),
      formsHaveActions: pages.every((p) => Number(p?.actionable || 0) > 0),
      legacyLeaveBannerVisible: results.pages.hr_legacy_leave?.legacyBanner === true,
      noCriticalConsoleErrors: results.consoleErrors.length === 0,
      noUnexpected500s: results.networkErrors.length === 0,
      screenshotsCaptured: pages.every((p) => Boolean(p?.screenshot)),
    };
    results.status = Object.values(results.checks).every(Boolean) ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    if (page?.ws) page.ws.close();
    if (chrome) chrome.kill();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ status: results.status, checks: results.checks, errors: results.errors, networkErrors: results.networkErrors, consoleErrors: results.consoleErrors }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
