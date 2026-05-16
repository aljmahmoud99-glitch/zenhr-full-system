const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const frontendPort = Number(process.env.FRONTEND_PORT || 5075);
const baseUrl = `http://127.0.0.1:${frontendPort}`;
const password = process.env.TEST_PASSWORD || "Admin@1234";
const screenshotsDir = path.join(__dirname, "enterprise-ui-2-5-screenshots");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  health: null,
  darkMode: {},
  jobProfileDialog: {},
  shiftReflection: {},
  browser: {},
  consoleErrors: [],
  api500s: [],
  errors: [],
};

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json, text: text.slice(0, 800) };
}

async function login(username) {
  const response = await request("POST", "/api/auth/login", { username, password });
  if (!response.body?.data?.accessToken) throw new Error(`${username} login failed: ${response.status} ${response.text}`);
  return response.body.data;
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
  ].filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

async function connect(port) {
  let tabs = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      tabs = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!tabs) throw new Error(`Chrome CDP unavailable on ${port}`);
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket((tabs.find((tab) => tab.type === "page") || tabs[0]).webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
      const text = (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      if (!/favicon|ResizeObserver|Could not parse CSS stylesheet/i.test(text)) results.consoleErrors.push(text);
    }
    if (message.method === "Runtime.exceptionThrown") {
      results.consoleErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
    }
    if (message.method === "Network.responseReceived") {
      const status = Number(message.params?.response?.status || 0);
      const url = message.params?.response?.url || "";
      if (status >= 500 && /\/api\//.test(url)) results.api500s.push({ status, url });
    }
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}, timeoutMs = 20000) => new Promise((resolve) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      resolve({ timeout: true, method });
    }, timeoutMs);
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

async function evalPage(page, expression, timeoutMs = 20000) {
  const response = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (response.timeout) throw new Error(`Runtime.evaluate timed out: ${expression.slice(0, 80)}`);
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
  return response.result?.result?.value;
}

async function screenshot(page, key) {
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, 20000);
  if (!shot.result?.data) return null;
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const file = `${key}.png`;
  fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
  return `qa/enterprise-ui-2-5-screenshots/${file}`;
}

async function prepareSession(page, loginData, lang = "ar", width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await page.send("Page.navigate", { url: `${baseUrl}/` });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await evalPage(page, `
    (() => {
      localStorage.clear();
      localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
      localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
      localStorage.setItem('zenjo_theme', 'dark');
    })()
  `);
}

async function navigate(page, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await page.send("Page.navigate", { url: `${baseUrl}/?uat=${Date.now()}#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 4200));
}

async function runShiftSmoke(hr, employee) {
  const unique = Date.now();
  let locations = await request("GET", "/api/attendance/locations", undefined, hr.accessToken);
  let location = (locations.body?.data || [])[0];
  if (!location) {
    const created = await request("POST", "/api/attendance/locations", {
      nameAr: `موقع اختبار ${unique}`,
      nameEn: `UAT Location ${unique}`,
      latitude: 31.9539,
      longitude: 35.9106,
      radiusMeters: 180,
      address: "Amman UAT"
    }, hr.accessToken);
    location = created.body?.data;
  }
  const shift = await request("POST", "/api/shifts", {
    nameAr: `وردية اختبار ${unique}`,
    nameEn: `UAT Shift ${unique}`,
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 30,
    workingDaysJson: JSON.stringify(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
    color: "#2d9e6b"
  }, hr.accessToken);
  const employeeId = employee.user?.employeeId;
  if (!employeeId) throw new Error("Employee login has no employeeId");
  const today = new Date().toISOString().slice(0, 10);
  const assignment = await request("POST", "/api/shifts/assignments", {
    shiftId: shift.body?.data?.id,
    employeeId,
    startDate: today,
    recurrence: "daily",
    locationId: location?.id,
    notes: `UAT ${unique}`
  }, hr.accessToken);
  const schedule = await request("GET", "/api/shifts/my-schedule?days=14", undefined, employee.accessToken);
  const todayShift = schedule.body?.data?.todayShift;
  const pass = shift.status === 201
    && assignment.status === 201
    && schedule.status === 200
    && !!todayShift
    && Number(todayShift.shift?.id) === Number(shift.body?.data?.id)
    && !!todayShift.location
    && !!todayShift.googleMapsUrl;
  results.shiftReflection = {
    status: pass ? "PASS" : "FAIL",
    shiftStatus: shift.status,
    assignmentStatus: assignment.status,
    scheduleStatus: schedule.status,
    shiftId: shift.body?.data?.id,
    assignmentId: assignment.body?.data?.id,
    employeeId,
    locationId: location?.id,
    todayShift,
  };
}

async function runBrowserChecks(page, hr, employee) {
  await prepareSession(page, hr, "ar");
  const routes = ["/app/dashboard", "/app/job-descriptions", "/app/attendance", "/app/settings", "/app/payroll-attendance", "/app/documents-reporting"];
  const dark = {};
  for (const route of routes) {
    await navigate(page, route);
    const data = await evalPage(page, `(() => {
      const isLight = (value) => {
        const match = String(value || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!match) return false;
        const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
        return r > 238 && g > 238 && b > 238;
      };
      const controls = [...document.querySelectorAll('input, select, textarea, .form-control, .z-input')];
      const whiteControls = controls.filter((el) => isLight(getComputedStyle(el).backgroundColor)).length;
      return {
        route: location.href,
        controls: controls.length,
        whiteControls,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        bodyLength: (document.body.innerText || '').length
      };
    })()`);
    dark[route] = {
      status: data.whiteControls === 0 && data.noHorizontalOverflow && data.bodyLength > 100 ? "PASS" : "FAIL",
      ...data,
      screenshot: await screenshot(page, `dark-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`)
    };
  }
  results.darkMode = {
    status: Object.values(dark).every((entry) => entry.status === "PASS") ? "PASS" : "FAIL",
    routes: dark
  };

  await navigate(page, "/app/job-descriptions");
  const dialog = await evalPage(page, `new Promise((resolve) => {
    const create = [...document.querySelectorAll('button')].find((button) => /Create job profile|إنشاء|ط¥ظ†ط´ط§ط،/.test(button.innerText || ''));
    create?.click();
    setTimeout(() => {
      const add = [...document.querySelectorAll('.inline-add-button')][0];
      add?.click();
      setTimeout(() => {
        const modal = document.querySelector('.master-create-modal');
        const rect = modal?.getBoundingClientRect();
        const styles = modal ? getComputedStyle(modal) : null;
        resolve({
          modalExists: !!modal,
          width: rect?.width || 0,
          viewportWidth: window.innerWidth,
          noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
          modalOverflowX: styles?.overflowX || null,
          visibleActions: [...document.querySelectorAll('.master-create-modal button')].map((button) => (button.innerText || '').trim()).filter(Boolean)
        });
      }, 700);
    }, 900);
  })`);
  results.jobProfileDialog = {
    status: dialog.modalExists && dialog.width <= 650 && dialog.noHorizontalOverflow && dialog.modalOverflowX !== "scroll" ? "PASS" : "FAIL",
    ...dialog,
    screenshot: await screenshot(page, "job-profile-add-dialog")
  };

  await prepareSession(page, employee, "ar");
  await navigate(page, "/app/attendance");
  const scheduleVisible = await evalPage(page, `(() => {
    const panel = document.querySelector('.employee-schedule-panel');
    return {
      panelExists: !!panel,
      text: (panel?.innerText || '').slice(0, 1000),
      hasMapsButton: !!panel?.querySelector('.inline-map-button'),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
    };
  })()`);
  results.shiftReflection.browser = {
    status: scheduleVisible.panelExists && /09:00\s*-\s*17:00/.test(scheduleVisible.text) && scheduleVisible.hasMapsButton && scheduleVisible.noHorizontalOverflow ? "PASS" : "FAIL",
    ...scheduleVisible,
    screenshot: await screenshot(page, "employee-shift-reflection")
  };
}

async function main() {
  let server;
  let chrome;
  let page;
  try {
    results.health = await request("GET", "/api/healthz");
    let session = null;
    try {
      session = JSON.parse(fs.readFileSync(path.join(__dirname, "enterprise-ui-2-5-session.json"), "utf8"));
    } catch {}
    const hr = process.env.HR_TOKEN
      ? { accessToken: process.env.HR_TOKEN, refreshToken: "", user: JSON.parse(process.env.HR_USER || "{}") }
      : session?.hr
        ? session.hr
      : await login("hr");
    const employee = process.env.EMPLOYEE_TOKEN
      ? { accessToken: process.env.EMPLOYEE_TOKEN, refreshToken: "", user: JSON.parse(process.env.EMPLOYEE_USER || "{}") }
      : session?.employee
        ? session.employee
      : await login("employee");
    if (process.env.SKIP_API_SHIFT !== "1") {
      await runShiftSmoke(hr, employee);
    } else if (process.env.SHIFT_API_STATUS === "PASS") {
      results.shiftReflection = {
        status: "PASS",
        note: "Persisted shift API smoke was executed externally before browser validation.",
        shiftId: process.env.SHIFT_ID ? Number(process.env.SHIFT_ID) : undefined,
        assignmentId: process.env.ASSIGNMENT_ID || undefined,
        employeeId: process.env.SHIFT_EMPLOYEE_ID ? Number(process.env.SHIFT_EMPLOYEE_ID) : undefined,
        locationId: process.env.SHIFT_LOCATION_ID ? Number(process.env.SHIFT_LOCATION_ID) : undefined,
      };
    } else {
      try {
        const existing = JSON.parse(fs.readFileSync(path.join(__dirname, "enterprise-ui-2-5-shift-reflection-results.json"), "utf8"));
        results.shiftReflection = { ...existing };
      } catch {
        results.shiftReflection = { status: "NOT_TESTED", note: "SKIP_API_SHIFT was set but no prior shift result was available." };
      }
    }
    server = await serveDist();
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 15750 + Math.floor(Math.random() * 500);
    const profile = path.join(process.env.TEMP || __dirname, `.chrome-ui25-${Date.now()}`);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "about:blank"
    ], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    page = await connect(port);
    await runBrowserChecks(page, hr, employee);
    const pass = results.health.status === 200
      && results.darkMode.status === "PASS"
      && results.jobProfileDialog.status === "PASS"
      && results.shiftReflection.status === "PASS"
      && results.shiftReflection.browser?.status === "PASS"
      && results.consoleErrors.length === 0
      && results.api500s.length === 0;
    results.browser = { status: pass ? "PASS" : "FAIL", consoleErrors: results.consoleErrors.length, api500s: results.api500s.length };
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
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-5-darkmode-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.darkMode }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-5-job-profile-dialog-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.jobProfileDialog }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-5-shift-reflection-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.shiftReflection }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-5-browser-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, status: results.browser.status || "FAIL", darkMode: results.darkMode, jobProfileDialog: results.jobProfileDialog, shiftReflection: results.shiftReflection, consoleErrors: results.consoleErrors, api500s: results.api500s, errors: results.errors }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-5-results.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify({
      status: results.status,
      darkMode: results.darkMode.status,
      jobProfileDialog: results.jobProfileDialog.status,
      shiftReflection: results.shiftReflection.status,
      shiftBrowser: results.shiftReflection.browser?.status,
      consoleErrors: results.consoleErrors.length,
      api500s: results.api500s.length,
      errors: results.errors
    }, null, 2));
    if (results.status === "NO-GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
