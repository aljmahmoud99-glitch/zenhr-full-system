const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5060);
const baseUrl = `http://127.0.0.1:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const stressMs = Number(process.env.TOPBAR_STRESS_MS || 300000);
const screenshotsDir = path.join(__dirname, "topbar-performance-screenshots");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  health: null,
  performance: {},
  menuOrder: {},
  browser: {},
  routeSpotChecks: {},
  consoleErrors: [],
  api500s: [],
  networkDuringStress: 0,
  errors: [],
  screenshotsDir: "qa/topbar-performance-screenshots"
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
  return { status: response.status, body: json, text: text.slice(0, 500) };
}

async function login(username) {
  let response = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await request("POST", "/api/auth/login", { username, password });
    if (response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 10000 + attempt * 5000));
  }
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
  let countNetwork = false;
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
      if (countNetwork && /\/api\//.test(url)) results.networkDuringStress += 1;
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
  await send("Performance.enable");
  return { ws, send, setNetworkStressCounting: (value) => { countNetwork = value; } };
}

async function evalPage(page, expression, timeoutMs = 20000) {
  const response = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (response.timeout) throw new Error(`Runtime.evaluate timed out: ${expression.slice(0, 80)}`);
  if (response.result?.exceptionDetails) {
    const details = response.result.exceptionDetails;
    const description = details.exception?.description || details.text || "Runtime.evaluate exception";
    throw new Error(description);
  }
  return response.result?.result?.value;
}

async function screenshot(page, key) {
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, 20000);
  if (!shot.result?.data) return null;
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const file = `${key}.png`;
  fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
  return `qa/topbar-performance-screenshots/${file}`;
}

async function prepareSession(page, loginData, lang = "ar", width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  const nav = await page.send("Page.navigate", { url: `${baseUrl}/` });
  if (nav.result?.errorText) throw new Error(`Initial navigation failed: ${nav.result.errorText}`);
  let href = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    href = await evalPage(page, `location.href`, 5000).catch(() => "");
    if (String(href).startsWith(baseUrl)) break;
  }
  if (!String(href).startsWith(baseUrl)) throw new Error(`Browser stayed on ${href || "unknown"} before session setup`);
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

function metric(packet, name) {
  return packet.result?.metrics?.find((entry) => entry.name === name)?.value || 0;
}

function cleanMenuLabel(value) {
  const iconNames = new Set([
    "admin_panel_settings", "analytics", "approval", "build", "business", "check_circle", "contract",
    "dashboard", "database", "dynamic_form", "event_available", "expand_more", "fact_check",
    "folder_managed", "gavel", "groups", "inventory_2", "logout", "more_time", "notifications",
    "payments", "person", "person_off", "person_search", "policy", "price_change", "query_stats",
    "receipt_long", "reviews", "rule", "schedule", "storage", "swap_horiz", "today", "tune",
    "verified_user", "work_history"
  ]);
  const parts = String(value || "")
    .replace(/expand_more/g, "\n")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !iconNames.has(part));
  return parts[parts.length - 1] || "";
}

async function readMenu(page, role, loginData, route, expectedGroups) {
  await prepareSession(page, loginData, role === "manager" || role === "employee" ? "en" : "ar");
  await navigate(page, route);
  const data = await evalPage(page, `
    (() => {
      const iconNames = new Set(${JSON.stringify([
        "admin_panel_settings", "analytics", "approval", "build", "business", "check_circle", "contract",
        "dashboard", "database", "dynamic_form", "event_available", "expand_more", "fact_check",
        "folder_managed", "gavel", "groups", "inventory_2", "logout", "more_time", "notifications",
        "payments", "person", "person_off", "person_search", "policy", "price_change", "query_stats",
        "receipt_long", "reviews", "rule", "schedule", "storage", "swap_horiz", "today", "tune",
        "verified_user", "work_history"
      ])});
      const clean = (value) => {
        const parts = String(value || '')
          .replace(/expand_more/g, '\\n')
          .split(/\\n+/)
          .map((part) => part.trim())
          .filter(Boolean)
          .filter((part) => !iconNames.has(part));
        return parts[parts.length - 1] || '';
      };
      const labels = [...document.querySelectorAll('.nav-direct-link, .nav-group-wrap')]
        .map((node) => clean(node.innerText))
        .filter(Boolean);
      const groups = [...document.querySelectorAll('.nav-group-wrap')];
      const dropdowns = [];
      for (const group of groups) {
        group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        group.querySelector('button')?.click();
        const title = clean(group.innerText);
        const sections = [...document.querySelectorAll('.dropdown-section')].map((section) => ({
          title: (section.querySelector('.dropdown-section-title')?.textContent || '').trim(),
          items: [...section.querySelectorAll('.dropdown-item-label')].map((item) => (item.textContent || '').trim())
        }));
        dropdowns.push({ title, sections });
      }
      return {
        role: ${JSON.stringify(role)},
        route: location.href,
        labels,
        dropdowns,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        accessDenied: /Access denied|غير مصرح|غير مسموح/.test(document.body.innerText || '')
      };
    })()
  `);
  const groupLabels = data.labels.slice(1).map(cleanMenuLabel).filter(Boolean);
  const expectedVisible = expectedGroups.filter((label) => groupLabels.includes(label));
  const orderMatches = expectedVisible.every((label, index) => groupLabels[index] === label);
  const pass = !data.accessDenied && data.noHorizontalOverflow && orderMatches && expectedVisible.length >= Math.min(3, expectedGroups.length);
  results.menuOrder[role] = {
    status: pass ? "PASS" : "FAIL",
    expectedGroups,
    actualGroups: groupLabels,
    orderMatches,
    dropdowns: data.dropdowns,
    screenshot: await screenshot(page, `menu-${role}`)
  };
}

async function stressTopbar(page, loginData) {
  await prepareSession(page, loginData, "ar");
  await navigate(page, "/app/shifts");
  const before = await page.send("Performance.getMetrics");
  results.networkDuringStress = 0;
  page.setNetworkStressCounting(true);
  await evalPage(page, `
    (() => {
      window.__topbarStress = { done: false, ticks: 0, errors: [], startedAt: Date.now(), endedAt: null };
      const end = Date.now() + ${stressMs};
      const run = () => {
        try {
          const groups = [...document.querySelectorAll('.nav-group-wrap')];
          const group = groups[window.__topbarStress.ticks % Math.max(1, groups.length)];
          if (group) {
            group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            group.querySelector('button')?.click();
            group.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          }
          window.__topbarStress.ticks += 1;
        } catch (error) {
          window.__topbarStress.errors.push(String(error && error.message || error));
        }
        if (Date.now() < end) {
          setTimeout(run, 80);
        } else {
          window.__topbarStress.done = true;
          window.__topbarStress.endedAt = Date.now();
        }
      };
      run();
      return true;
    })()
  `);

  let state = null;
  for (let attempt = 0; attempt < Math.ceil(stressMs / 10000) + 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    state = await evalPage(page, `(() => window.__topbarStress || null)()`, 12000);
    if (state?.done) break;
  }
  page.setNetworkStressCounting(false);
  const after = await page.send("Performance.getMetrics");
  const taskDurationDelta = metric(after, "TaskDuration") - metric(before, "TaskDuration");
  const minTicks = Math.max(10, Math.floor(stressMs / 160));
  const maxExpectedPollingRequests = Math.ceil(stressMs / 60000) + 2;
  const dom = await evalPage(page, `(() => ({
    route: location.href,
    bodyLength: (document.body.innerText || '').length,
    navGroups: document.querySelectorAll('.nav-group-wrap').length,
    dropdownVisible: !!document.querySelector('.nav-dropdown-portal'),
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
  }))()`);
  const pass = !!state?.done
    && state.ticks >= minTicks
    && state.errors.length === 0
    && dom.navGroups > 0
    && dom.noHorizontalOverflow
    && taskDurationDelta < Math.max(20, stressMs / 8000)
    && results.consoleErrors.length === 0
    && results.api500s.length === 0
    && results.networkDuringStress <= maxExpectedPollingRequests;
  results.performance = {
    status: pass ? "PASS" : "FAIL",
    requestedDurationMs: stressMs,
    minTicks,
    maxExpectedPollingRequests,
    state,
    taskDurationDelta,
    networkDuringStress: results.networkDuringStress,
    dom,
    screenshot: await screenshot(page, "topbar-stress-final")
  };
}

async function spotCheckRoutes(page, loginData) {
  const routes = ["/app/dashboard", "/app/shifts", "/app/attendance", "/app/notifications", "/app/settings"];
  await prepareSession(page, loginData, "ar");
  const checks = {};
  for (const route of routes) {
    const beforeConsoleErrors = results.consoleErrors.length;
    const beforeApi500s = results.api500s.length;
    await navigate(page, route);
    const dom = await evalPage(page, `(() => ({
      route: location.href,
      bodyLength: (document.body.innerText || '').length,
      navGroups: document.querySelectorAll('.nav-group-wrap').length,
      accessDenied: /Access denied|غير مصرح|غير مسموح|ط؛ظٹط± ظ…طµط±ط­|ط؛ظٹط± ظ…ط³ظ…ظˆط­/.test(document.body.innerText || ''),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
    }))()`);
    checks[route] = {
      status: !dom.accessDenied
        && dom.bodyLength > 100
        && dom.navGroups > 0
        && dom.noHorizontalOverflow
        && results.consoleErrors.length === beforeConsoleErrors
        && results.api500s.length === beforeApi500s
        ? "PASS"
        : "FAIL",
      dom,
      consoleErrorsAdded: results.consoleErrors.length - beforeConsoleErrors,
      api500sAdded: results.api500s.length - beforeApi500s,
      screenshot: await screenshot(page, `route-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`)
    };
  }
  results.routeSpotChecks = checks;
}

async function main() {
  let server;
  let chrome;
  let page;
  try {
    server = await serveDist();
    results.health = await request("GET", "/api/healthz");
    const logins = {
      hr: await login("hr"),
      payroll: await login("payroll"),
      manager: await login("manager"),
      employee: await login("employee"),
    };
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 15600 + Math.floor(Math.random() * 500);
    const chromeProfileDir = path.join(process.env.TEMP || __dirname, `.chrome-topbar-${Date.now()}`);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${chromeProfileDir}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "about:blank"
    ], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    page = await connect(port);

    await stressTopbar(page, logins.hr);
    await spotCheckRoutes(page, logins.hr);
    await readMenu(page, "hr", logins.hr, "/app/dashboard", ["الموظفين", "الحضور والإجازات", "التوظيف", "الرواتب", "الامتثال والأصول", "الأداء والتحليلات", "الإدارة"]);
    await readMenu(page, "payroll", logins.payroll, "/app/dashboard", ["الرواتب", "البيانات المساندة"]);
    await readMenu(page, "manager", logins.manager, "/app/dashboard", ["My Team", "Approvals", "Performance", "Tools"]);
    await readMenu(page, "employee", logins.employee, "/app/dashboard", ["My Attendance & Leave", "My Salary", "My Profile", "Notifications"]);

    const menuPass = Object.values(results.menuOrder).every((entry) => entry.status === "PASS");
    const routePass = Object.values(results.routeSpotChecks).every((entry) => entry.status === "PASS");
    results.browser = {
      status: results.performance.status === "PASS" && menuPass && routePass && results.consoleErrors.length === 0 && results.api500s.length === 0 ? "PASS" : "FAIL",
      consoleErrors: results.consoleErrors.length,
      api500s: results.api500s.length,
      routeSpotChecks: results.routeSpotChecks
    };
    results.status = results.browser.status === "PASS" ? "GO" : "PARTIAL";
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
    fs.writeFileSync(path.join(__dirname, "topbar-performance-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.performance }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "topbar-menu-order-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, status: Object.values(results.menuOrder).every((entry) => entry.status === "PASS") ? "PASS" : "FAIL", roles: results.menuOrder }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "topbar-browser-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, status: results.browser.status || "FAIL", performance: results.performance, menuOrder: results.menuOrder, routeSpotChecks: results.routeSpotChecks, consoleErrors: results.consoleErrors, api500s: results.api500s, errors: results.errors }, null, 2)}\n`);
    fs.writeFileSync(path.join(__dirname, "topbar-performance-menu-order-results.json"), `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify({
      status: results.status,
      performance: results.performance.status,
      menu: Object.fromEntries(Object.entries(results.menuOrder).map(([role, entry]) => [role, entry.status])),
      consoleErrors: results.consoleErrors.length,
      api500s: results.api500s.length,
      errors: results.errors
    }, null, 2));
    if (results.status === "NO-GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
