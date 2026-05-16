const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5042);
const baseUrl = process.env.FRONTEND_URL || `http://127.0.0.1:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const screenshotsDir = path.join(__dirname, "enterprise-ui-2-2-screenshots");
const out = path.join(__dirname, "enterprise-ui-2-2-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  attendancePerformance: {},
  map: {},
  settingsArabic: {},
  dropdowns: {},
  pages: {},
  consoleErrors: [],
  networkErrors: [],
  errors: [],
  screenshotsDir,
};

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, body: json };
}

async function login(username) {
  let r = await request("POST", "/api/auth/login", { username, password });
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 9000));
    r = await request("POST", "/api/auth/login", { username, password });
  }
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
    const candidate = path.resolve(distRoot, `.${rawPath === "/" ? "/index.html" : rawPath}`);
    const file = candidate.startsWith(distRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distRoot, "index.html");
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "application/octet-stream" });
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
  let tabs = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
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
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params?.type)) {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (!/favicon|ResizeObserver|Could not parse CSS stylesheet/i.test(text)) results.consoleErrors.push(text);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      results.consoleErrors.push(msg.params?.exceptionDetails?.text || "Runtime exception");
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
    const timer = setTimeout(() => { pending.delete(callId); resolve({ timeout: true, method }); }, 20000);
    pending.set(callId, (message) => { clearTimeout(timer); resolve(message); });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Performance.enable");
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

async function navigate(page, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Page.navigate", { url: `${baseUrl}/?uat=${Date.now()}#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function evalPage(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.result?.value;
}

async function screenshot(page, key) {
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!shot.result?.data) return null;
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const file = `${key}.png`;
  fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
  return `qa/enterprise-ui-2-2-screenshots/${file}`;
}

async function inspectAttendance(page) {
  await navigate(page, "/app/attendance", 1366);
  const before = await page.send("Performance.getMetrics");
  await new Promise((resolve) => setTimeout(resolve, 60000));
  const after = await page.send("Performance.getMetrics");
  const data = await evalPage(page, `(() => ({
    textLength: (document.body.innerText || '').length,
    mapTabVisible: [...document.querySelectorAll('button')].some(b => /Map|الخريطة/.test(b.innerText || '')),
    responsive: !!document.querySelector('.attendance-page'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).length
  }))()`);
  const metric = (packet, name) => packet.result?.metrics?.find((m) => m.name === name)?.value || 0;
  const taskDurationDelta = metric(after, "TaskDuration") - metric(before, "TaskDuration");
  results.attendancePerformance = {
    status: data?.responsive && taskDurationDelta < 10 && results.networkErrors.length === 0 ? "PASS" : "FAIL",
    waitedSeconds: 60,
    taskDurationDelta,
    pageResponsive: !!data?.responsive,
    noHorizontalOverflow: !data?.overflow,
    visibleButtons: data?.buttons,
    network500Count: results.networkErrors.length,
  };
  results.pages.hrAttendance = { ...data, screenshot: await screenshot(page, "attendance-60s") };
}

async function inspectMap(page) {
  await evalPage(page, `(() => { const btn=[...document.querySelectorAll('button')].find(b=>/Map|الخريطة/.test(b.innerText||'')); btn?.click(); })()`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await evalPage(page, `(() => { const btn=[...document.querySelectorAll('button')].find(b=>/Add location|إضافة موقع/.test(b.innerText||'')); btn?.click(); })()`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const data = await evalPage(page, `(() => {
    const picker = document.querySelector('.map-picker');
    if (picker) {
      const r = picker.getBoundingClientRect();
      picker.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.72, clientY: r.top + r.height * 0.35, pointerId: 1 }));
      picker.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width * 0.72, clientY: r.top + r.height * 0.35, pointerId: 1 }));
      picker.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.72, clientY: r.top + r.height * 0.35 }));
    }
    const lat = document.querySelector('input[type="number"]');
    const google = [...document.querySelectorAll('a')].find(a => /Google Maps|خرائط Google/.test(a.innerText || ''));
    return {
      picker: !!picker,
      latValue: lat?.value || null,
      googleHref: google?.href || null,
      modalOpen: !!document.querySelector('.modal-card')
    };
  })()`);
  results.map = {
    status: data?.picker && /google\.com\/maps/.test(data?.googleHref || "") ? "PASS" : "FAIL",
    ...data,
    screenshot: await screenshot(page, "attendance-map-picker"),
  };
}

async function inspectSettingsArabic(page, loginData) {
  await setSession(page, loginData, "ar", "dark");
  await navigate(page, "/app/settings", 1366);
  const data = await evalPage(page, `(() => {
    const text = document.body.innerText || '';
    return {
      hasSettings: /الإعدادات|تهيئة النظام/.test(text),
      hasCategoryArabic: /الرواتب وضريبة الدخل|الحضور والدوام|الموارد البشرية/.test(text),
      hasMojibake: /(Ø|Ù|Ã|Â|�|ط§|ظ„|ظٹ|ط±|â)/.test(text),
      sample: text.slice(0, 1200)
    };
  })()`);
  results.settingsArabic = {
    status: data?.hasSettings && data?.hasCategoryArabic && !data?.hasMojibake ? "PASS" : "FAIL",
    ...data,
    screenshot: await screenshot(page, "settings-arabic"),
  };
}

async function inspectDropdowns(page, role, loginData, lang = "ar") {
  await setSession(page, loginData, lang, "dark");
  const roleRoutes = {
    hr: "/app/dashboard",
    payroll: "/app/payroll/runs",
    manager: "/app/employees",
    employee: "/app/attendance",
    recruiter: "/app/recruitment",
    superadmin: "/admin/companies",
  };
  await navigate(page, roleRoutes[role] || "/app/dashboard", role === "employee" ? 390 : 1366);
  if (role !== "employee") {
    await evalPage(page, `(() => {
      const nav = [...document.querySelectorAll('.nav-group-wrap, .top-nav-group')].find(el => (el.innerText || '').trim().length > 0);
      nav?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      nav?.querySelector('button')?.click();
    })()`);
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  const data = await evalPage(page, `(() => {
    const titles = [...document.querySelectorAll('.dropdown-section-title')].map(el => (el.textContent || '').trim()).filter(Boolean);
    const text = document.body.innerText || '';
    return {
      sectionTitles: titles,
      grouped: titles.length > 0 || window.innerWidth < 600,
      hiddenForbiddenSignals: !/Payroll Adjustments|Salary Governance|Disciplinary Case Creation/.test(text),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    };
  })()`);
  results.dropdowns[role] = { status: data?.grouped && !data?.overflow ? "PASS" : "FAIL", ...data, screenshot: await screenshot(page, `dropdown-${role}`) };
}

async function main() {
  let server;
  let chrome;
  let page;
  let chromeProfileDir;
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
    const port = 15200 + Math.floor(Math.random() * 500);
    chromeProfileDir = path.join(process.env.TEMP || __dirname, `.chrome-ui22-${Date.now()}`);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${chromeProfileDir}`,
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
    await inspectAttendance(page);
    await inspectMap(page);
    await inspectSettingsArabic(page, logins.hr);
    await inspectDropdowns(page, "hr", logins.hr, "ar");
    await inspectDropdowns(page, "payroll", logins.payroll, "ar");
    await inspectDropdowns(page, "manager", logins.manager, "en");
    await inspectDropdowns(page, "employee", logins.employee, "ar");
    await inspectDropdowns(page, "recruiter", logins.recruiter, "ar");
    await inspectDropdowns(page, "superadmin", logins.admin, "ar");

    const dropdownPass = Object.values(results.dropdowns).every((entry) => entry.status === "PASS");
    const pass = results.attendancePerformance.status === "PASS"
      && results.map.status === "PASS"
      && results.settingsArabic.status === "PASS"
      && dropdownPass
      && results.consoleErrors.length === 0
      && results.networkErrors.length === 0;
    results.status = pass ? "GO" : "PARTIAL";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    try { if (page?.ws) page.ws.close(); } catch {}
    try { if (chrome) chrome.kill(); } catch {}
    if (server) await new Promise((resolve) => server.close(resolve));
    if (chrome?.pid) {
      try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    }
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-2-attendance-performance.json"), JSON.stringify({ generatedAt: results.generatedAt, ...results.attendancePerformance }, null, 2));
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-2-settings-arabic-results.json"), JSON.stringify({ generatedAt: results.generatedAt, ...results.settingsArabic }, null, 2));
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-2-dropdown-results.json"), JSON.stringify({ generatedAt: results.generatedAt, status: Object.values(results.dropdowns).every((entry) => entry.status === "PASS") ? "PASS" : "FAIL", roles: results.dropdowns }, null, 2));
    console.log(JSON.stringify({ status: results.status, attendance: results.attendancePerformance.status, map: results.map.status, settings: results.settingsArabic.status, consoleErrors: results.consoleErrors.length, networkErrors: results.networkErrors.length, errors: results.errors }, null, 2));
    if (results.status === "NO-GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
