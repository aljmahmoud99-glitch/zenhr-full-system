const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5041);
const baseUrl = process.env.FRONTEND_URL || `http://localhost:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const screenshotsDir = path.join(__dirname, "enterprise-ui-2-1-screenshots");
const out = path.join(__dirname, "enterprise-ui-2-1-browser-results.json");

const results = { generatedAt: new Date().toISOString(), status: "RUNNING", baseUrl, pages: {}, checks: {}, consoleErrors: [], networkErrors: [], errors: [], screenshotsDir };

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, body: json };
}
async function login(username) {
  let r = await request("POST", "/api/auth/login", { username, password });
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    r = await request("POST", "/api/auth/login", { username, password });
  }
  if (!r.body?.data?.accessToken) throw new Error(`${username} login failed: ${r.status}`);
  return r.body.data;
}
function serveDist() {
  const distRoot = path.resolve(__dirname, "..", "frontend", "dist", "zenjo-ng", "browser");
  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      const proxyReq = http.request(`${backend}${req.url}`, { method: req.method, headers: req.headers }, (proxyRes) => { res.writeHead(proxyRes.statusCode || 502, proxyRes.headers); proxyRes.pipe(res); });
      proxyReq.on("error", (error) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ success: false, message: error.message })); });
      req.pipe(proxyReq); return;
    }
    const rawPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    const candidate = path.resolve(distRoot, `.${rawPath === "/" ? "/index.html" : rawPath}`);
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(distRoot, "index.html");
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(frontendPort, "127.0.0.1", () => resolve(server)); });
}
function findChrome() {
  return [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((p) => fs.existsSync(p));
}
async function connect(port) {
  let tabs = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      tabs = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!tabs) throw new Error(`Chrome CDP did not become available on ${port}`);
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map();
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
    const timer = setTimeout(() => { pending.delete(callId); resolve({ timeout: true, method }); }, 15000);
    pending.set(callId, (message) => { clearTimeout(timer); resolve(message); });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
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
  await page.send("Runtime.evaluate", { expression: script });
}
async function inspect(page, key, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Page.navigate", { url: `${baseUrl}/#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (key === "hr_attendance_map") {
    await page.send("Runtime.evaluate", { expression: `(() => { const btn=[...document.querySelectorAll('button')].find(b=>/Map|الخريطة/.test(b.innerText||"")); btn?.click(); })()` });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.send("Runtime.evaluate", { expression: `(() => { const btn=[...document.querySelectorAll('button')].find(b=>/Add work location|إضافة موقع|موقع عمل/.test(b.innerText||"")); btn?.click(); })()` });
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (key === "hr_job_profiles") {
    await page.send("Runtime.evaluate", { expression: `(() => { const btn=[...document.querySelectorAll('button')].find(b=>/Add|إضافة/.test(b.innerText||"")); btn?.click(); })()` });
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  const evalResult = await page.send("Runtime.evaluate", { expression: `(() => {
    const text=document.body.innerText||"";
    const selectors={
      mapPicker:!!document.querySelector('.map-picker'),
      schedulePanel:!!document.querySelector('.employee-schedule-panel'),
      groupedDropdown:false,
      jobProfileModal:!!document.querySelector('.master-create-modal')
    };
    const navButton=[...document.querySelectorAll('.nav-group-wrap')].find(el=>/الموارد|HR|الرواتب|Payroll|الخدمة|Self/.test(el.innerText||""));
    if(navButton){ navButton.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true})); }
    selectors.groupedDropdown=!!document.querySelector('.dropdown-section-title');
    return {
      url:location.href,
      length:text.length,
      actionable:[...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>e.offsetParent!==null).length,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
      hasMojibake:/(ï؟½|Ø§|Ù|ط§|ظ„|ظ…|ظٹ){4,}/.test(text),
      accessDenied:/access denied|غير مصرح|لا تملك صلاحية/i.test(text),
      selectors
    };
  })()`, returnByValue: true });
  const value = evalResult.result?.result?.value || {};
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (shot.result?.data) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const file = `${key}.png`;
    fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
    value.screenshot = `qa/enterprise-ui-2-1-screenshots/${file}`;
  }
  results.pages[key] = value;
}

async function main() {
  let server, chrome, page;
  try {
    server = await serveDist();
    const logins = { hr: await login("hr"), employee: await login("employee"), manager: await login("manager"), payroll: await login("payroll"), recruiter: await login("recruiter") };
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 15100 + Math.floor(Math.random() * 500);
    const chromeProfileDir = path.join(process.env.TEMP || __dirname, `.chrome-ui21-${Date.now()}`);
    chrome = spawn(chromePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${chromeProfileDir}`, "--headless", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--no-first-run", "about:blank"], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    page = await connect(port);
    await setSession(page, logins.hr, "ar", "dark");
    await inspect(page, "hr_attendance_map", "/app/attendance", 1366);
    await inspect(page, "hr_shifts_assignment", "/app/shifts", 1366);
    await inspect(page, "hr_job_profiles", "/app/job-descriptions", 1366);
    await setSession(page, logins.employee, "ar", "dark");
    await inspect(page, "employee_attendance_schedule_mobile", "/app/attendance", 390);
    await setSession(page, logins.manager, "en", "dark");
    await inspect(page, "manager_nav_dropdown", "/app/dashboard", 1024);
    const pages = Object.values(results.pages);
    results.checks = {
      pagesLoaded: pages.every((p) => (p.length || 0) > 200),
      noUnexpected500s: results.networkErrors.length === 0,
      noCriticalConsoleErrors: results.consoleErrors.length === 0,
      noHorizontalOverflow: pages.every((p) => !p.overflow),
      mapSurfaceAvailable: results.pages.hr_attendance_map?.selectors?.mapPicker === true,
      employeeSchedulePanelAvailable: results.pages.employee_attendance_schedule_mobile?.selectors?.schedulePanel === true,
      groupedDropdownAvailable: pages.some((p) => p.selectors?.groupedDropdown),
    };
    results.status = Object.values(results.checks).every(Boolean) ? "GO" : "PARTIAL";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    if (page?.ws) page.ws.close();
    if (chrome) chrome.kill();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ status: results.status, checks: results.checks, errors: results.errors, networkErrors: results.networkErrors, consoleErrors: results.consoleErrors }, null, 2));
    if (results.status === "NO-GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
