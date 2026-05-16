const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5043);
const baseUrl = process.env.FRONTEND_URL || `http://127.0.0.1:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const screenshotsDir = path.join(__dirname, "enterprise-ui-2-3-screenshots");
const only = process.env.UI23_ONLY || "all";
const singleRole = process.env.UI23_ROLE || "";

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  health: null,
  map: {},
  dropdowns: {},
  arabic: {},
  darkMode: {},
  documentsExport: {},
  mobileTopbar: {},
  consoleErrors: [],
  networkErrors: [],
  errors: [],
  screenshotsDir: "qa/enterprise-ui-2-3-screenshots",
};

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let json = null;
  const text = await response.text();
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json, text: text.slice(0, 500) };
}

async function login(username) {
  let response = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await request("POST", "/api/auth/login", { username, password });
    if (response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 12000 + attempt * 4000));
  }
  if (!response.body?.data?.accessToken) {
    throw new Error(`${username} login failed: ${response.status} ${response.text || ""}`);
  }
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
    const type = ext === ".js" ? "text/javascript"
      : ext === ".css" ? "text/css"
        : ext === ".html" ? "text/html"
          : ext === ".json" ? "application/json"
            : "application/octet-stream";
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
  if (!tabs) throw new Error(`Chrome CDP did not become available on ${port}`);
  const page = tabs.find((tab) => tab.type === "page") || tabs[0];
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
      const text = (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      if (!/favicon|ResizeObserver|Could not parse CSS stylesheet|Failed to load resource/i.test(text)) {
        results.consoleErrors.push(text);
      }
    }
    if (message.method === "Runtime.exceptionThrown") {
      results.consoleErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
    }
    if (message.method === "Network.responseReceived") {
      const status = Number(message.params?.response?.status || 0);
      const url = message.params?.response?.url || "";
      if (status >= 500 && /\/api\//.test(url)) results.networkErrors.push({ status, url });
    }
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
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
  await send("Performance.enable");
  return { ws, send };
}

async function evalPage(page, expression) {
  const response = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return response.result?.result?.value;
}

async function screenshot(page, key) {
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!shot.result?.data) return null;
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const file = `${key}.png`;
  fs.writeFileSync(path.join(screenshotsDir, file), Buffer.from(shot.result.data, "base64"));
  return `qa/enterprise-ui-2-3-screenshots/${file}`;
}

async function prepareSession(page, loginData, lang = "ar", theme = "dark", width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await page.send("Page.navigate", { url: `${baseUrl}/` });
  await new Promise((resolve) => setTimeout(resolve, 900));
  await evalPage(page, `
    (() => {
      localStorage.clear();
      localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
      localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
      localStorage.setItem('zenjo_theme', ${JSON.stringify(theme)});
      document.documentElement.dir = ${JSON.stringify(lang === "ar" ? "rtl" : "ltr")};
    })()
  `);
}

async function navigate(page, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await page.send("Page.navigate", { url: `${baseUrl}/?uat=${Date.now()}#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 4200));
}

async function inspectMapOpenStress(page, loginData) {
  await prepareSession(page, loginData, "ar", "dark", 1366);
  await navigate(page, "/app/attendance", 1366);
  await evalPage(page, `
    (() => {
      window.__openedMaps = [];
      window.open = (url, target, features) => {
        window.__openedMaps.push({ url: String(url || ''), target, features, route: location.href, at: Date.now() });
        return { closed: false, focus() {} };
      };
    })()
  `);
  const before = await page.send("Performance.getMetrics");
  const data = await evalPage(page, `
    (() => {
      const visibleButtons = () => [...document.querySelectorAll('button')]
        .filter((button) => button.offsetParent !== null);
      const findButton = (pattern) => visibleButtons()
        .find((button) => pattern.test(button.innerText || '') || pattern.test(button.getAttribute('aria-label') || ''));
      const mapTab = [...document.querySelectorAll('.view-tabs .view-tab')]
        .find((button) => button.querySelector('.material-icons')?.textContent?.trim() === 'location_on')
        || visibleButtons().find((button) => /Map|خريطة|المواقع|Locations/i.test(button.innerText || ''));
      mapTab?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const existingMapButtons = [...document.querySelectorAll('button.inline-map-button')]
        .filter((button) => button.offsetParent !== null);
      const add = findButton(/Add location|إضافة موقع/i) || document.querySelector('.z-card-header .z-btn-primary');
      add?.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const picker = document.querySelector('.map-picker');
      if (picker) {
        const rect = picker.getBoundingClientRect();
        picker.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * 0.61, clientY: rect.top + rect.height * 0.41 }));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const openButtons = [...document.querySelectorAll('button.inline-map-button, button')]
        .filter((button) => /Google Maps|خرائط Google|افتح|Open/i.test(button.innerText || '') && button.offsetParent !== null);
      for (const button of openButtons.slice(0, 4)) {
        button.click();
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        route: location.href,
        pickerFound: !!picker,
        openButtonCount: openButtons.length,
        openedMaps: window.__openedMaps || [],
        bodyLength: (document.body.innerText || '').length,
        pageResponsive: !!document.querySelector('.attendance-page'),
        mapTabClicked: !!mapTab,
        addClicked: !!add,
        existingMapButtonCount: existingMapButtons.length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      };
    })()
  `);
  const after = await page.send("Performance.getMetrics");
  const metric = (packet, name) => packet.result?.metrics?.find((m) => m.name === name)?.value || 0;
  const taskDurationDelta = metric(after, "TaskDuration") - metric(before, "TaskDuration");
  const opened = data?.openedMaps || [];
  const pass = data?.pageResponsive
    && data?.openButtonCount > 0
    && opened.length > 0
    && opened.every((entry) => /google\.com\/maps/.test(entry.url) && entry.target === "_blank" && /noopener/.test(entry.features || ""))
    && taskDurationDelta < 6
    && !data?.overflow;
  results.map = {
    status: pass ? "PASS" : "FAIL",
    waitedAfterOpenMs: 1500,
    taskDurationDelta,
    ...data,
    screenshot: await screenshot(page, "attendance-map-open-stress"),
  };
}

async function inspectDropdown(page, role, loginData, lang, route, expectedGroups, width = 1366) {
  await prepareSession(page, loginData, lang, "dark", width);
  await navigate(page, route, width);
  const data = await evalPage(page, `
    (async () => {
      const expected = ${JSON.stringify(expectedGroups)};
      const candidates = [...document.querySelectorAll('.nav-group-wrap, .top-nav-group, .nav-item')].filter((el) => {
        const text = (el.innerText || '').trim();
        return text.length > 0 && el.getBoundingClientRect().width > 0;
      });
      let opened = false;
      let bestTitles = [];
      let bestScore = -1;
      for (const el of candidates.slice(0, 8)) {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        const button = el.querySelector('button, a');
        button?.click();
        const titles = [...document.querySelectorAll('.dropdown-section-title')]
          .map((title) => (title.textContent || '').trim())
          .filter(Boolean);
        const text = titles.join(' ');
        const score = expected.filter((group) => text.includes(group)).length;
        if (titles.length > 0) {
          opened = true;
          if (score > bestScore) {
            bestScore = score;
            bestTitles = titles;
          }
          if (score >= Math.min(2, expected.length)) break;
        }
      }
      const dropdown = document.querySelector('.nav-dropdown, .dropdown-panel, .nav-menu-dropdown, .topbar-dropdown');
      const rect = dropdown?.getBoundingClientRect();
      return {
        route: location.href,
        opened,
        sectionTitles: bestTitles,
        bestScore,
        visibleText: (document.body.innerText || '').slice(0, 1600),
        dropdownWidth: rect?.width || 0,
        dropdownHeight: rect?.height || 0,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        accessDenied: /Access denied|غير مصرح|غير مسموح/.test(document.body.innerText || '')
      };
    })()
  `);
  const safeData = data || {
    route: "unknown",
    opened: false,
    sectionTitles: [],
    bestScore: -1,
    visibleText: "",
    dropdownWidth: 0,
    dropdownHeight: 0,
    noHorizontalOverflow: false,
    accessDenied: true,
    evaluateFailed: true,
  };
  const found = expectedGroups.filter((group) => safeData.sectionTitles.some((title) => title.includes(group)));
  const pass = !safeData.accessDenied
    && safeData.noHorizontalOverflow
    && safeData.sectionTitles.length > 0
    && found.length >= Math.min(2, expectedGroups.length)
    && safeData.dropdownWidth <= 430
    && safeData.dropdownHeight <= 650;
  results.dropdowns[role] = {
    status: pass ? "PASS" : "FAIL",
    expectedGroups,
    matchedGroups: found,
    ...safeData,
    screenshot: await screenshot(page, `dropdown-${role}`),
  };
}

async function inspectMobileTopbar(page, loginData) {
  await prepareSession(page, loginData, "ar", "dark", 390);
  await navigate(page, "/app/attendance", 390);
  const data = await evalPage(page, `
    (async () => {
      const buttons = [...document.querySelectorAll('button')].filter((button) => button.offsetParent !== null);
      const menu = buttons.find((button) => /menu|القائمة|☰/i.test(button.getAttribute('aria-label') || button.innerText || '')) || buttons[0];
      menu?.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
      return {
        route: location.href,
        visibleButtons: buttons.length,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        textLength: (document.body.innerText || '').length
      };
    })()
  `);
  results.mobileTopbar = {
    status: data.noHorizontalOverflow && data.textLength > 100 ? "PASS" : "FAIL",
    ...data,
    screenshot: await screenshot(page, "mobile-topbar"),
  };
}

async function inspectArabicAndDarkMode(page, loginData) {
  const pages = [
    ["/app/settings", "settings"],
    ["/app/attendance", "attendance"],
    ["/app/notifications", "notifications"],
    ["/app/approvals", "approvals"],
    ["/app/payroll/runs", "payroll"],
  ];
  const pageResults = {};
  const mojibake = /[\u00d8\u00d9\u00c3\u00c2\ufffd]|\u00e2\u20ac|\u00c2\u00a0/;
  for (const [route, key] of pages) {
    await prepareSession(page, loginData, "ar", "dark", 1366);
    await navigate(page, route, 1366);
    pageResults[key] = await evalPage(page, `
      (() => {
        const text = document.body.innerText || '';
        const fields = [...document.querySelectorAll('input, select, textarea, .filter-field, .search-input')].slice(0, 12).map((el) => {
          const style = getComputedStyle(el);
          return { bg: style.backgroundColor, color: style.color, border: style.borderColor };
        });
        const bodyStyle = getComputedStyle(document.body);
        return {
          route: location.href,
          textSample: text.slice(0, 900),
          textLength: text.length,
          hasMojibake: ${mojibake}.test(text),
          accessDenied: /Access denied|غير مصرح|غير مسموح/.test(text),
          dir: document.documentElement.dir || document.body.dir || '',
          bodyBg: bodyStyle.backgroundColor,
          fields,
          noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
        };
      })()
    `);
    pageResults[key].screenshot = await screenshot(page, `arabic-${key}`);
  }
  const visiblePages = Object.values(pageResults).filter((entry) => !entry.accessDenied);
  const arabicPass = visiblePages.length >= 3 && visiblePages.every((entry) => !entry.hasMojibake && entry.noHorizontalOverflow);
  const darkPass = visiblePages.every((entry) => {
    const bodyIsNotWhite = !/255,\s*255,\s*255/.test(entry.bodyBg || "");
    const fieldsAreNotBareWhite = (entry.fields || []).every((field) => !/255,\s*255,\s*255/.test(field.bg || "") || /15|16|17|18|19|20|24|30|31|38|39|45|55/.test(field.border || ""));
    return bodyIsNotWhite && fieldsAreNotBareWhite;
  });
  results.arabic = { status: arabicPass ? "PASS" : "FAIL", pages: pageResults };
  results.darkMode = { status: darkPass ? "PASS" : "FAIL", pages: pageResults };
}

async function inspectDocumentsExport(page, loginData) {
  await prepareSession(page, loginData, "en", "dark", 1366);
  await navigate(page, "/app/documents-reporting", 1366);
  const data = await evalPage(page, `
    (() => {
      const text = document.body.innerText || '';
      const visibleExportCreate = [...document.querySelectorAll('button')]
        .some((button) => /New Export|Create Export|إنشاء تصدير/.test(button.innerText || '') && button.offsetParent !== null);
      return {
        route: location.href,
        visibleExportCreate,
        unavailableLabel: /not currently available|غير متاح/.test(text),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
      };
    })()
  `);
  results.documentsExport = {
    status: !data.visibleExportCreate && data.noHorizontalOverflow ? "PASS" : "FAIL",
    ...data,
    screenshot: await screenshot(page, "documents-export-unavailable"),
  };
}

function writeArtifacts() {
  const dropdownEntries = Object.values(results.dropdowns);
  const dropdownPass = dropdownEntries.length > 0 && dropdownEntries.every((entry) => entry.status === "PASS");
  const browserPass = results.map.status === "PASS"
    && dropdownPass
    && results.arabic.status === "PASS"
    && results.darkMode.status === "PASS"
    && results.documentsExport.status === "PASS"
    && results.mobileTopbar.status === "PASS"
    && results.consoleErrors.length === 0
    && results.networkErrors.length === 0;

  results.status = browserPass ? "GO" : (results.errors.length ? "NO-GO" : "PARTIAL");

  fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-3-browser-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-3-map-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.map }, null, 2)}\n`);
  fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-3-dropdown-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, status: dropdownPass ? "PASS" : "FAIL", roles: results.dropdowns }, null, 2)}\n`);
  fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-3-arabic-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.arabic }, null, 2)}\n`);
  fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-3-darkmode-results.json"), `${JSON.stringify({ generatedAt: results.generatedAt, ...results.darkMode }, null, 2)}\n`);
  return browserPass;
}

async function main() {
  let server;
  let chrome;
  let page;
  try {
    server = await serveDist();
    results.health = await request("GET", "/api/healthz");
    const neededUsers = new Set(only === "dropdowns"
      ? (singleRole ? [singleRole === "superadmin" ? "admin" : singleRole] : ["hr", "payroll", "manager", "employee", "recruiter", "admin"])
      : only === "map" || only === "arabic" || only === "docs"
        ? ["hr"]
        : only === "mobile"
          ? ["employee"]
          : ["hr", "payroll", "manager", "employee", "recruiter", "admin"]);
    const logins = {};
    for (const username of neededUsers) {
      logins[username] = await login(username);
    }

    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 15300 + Math.floor(Math.random() * 500);
    const chromeProfileDir = path.join(process.env.TEMP || __dirname, `.chrome-ui23-${Date.now()}`);
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

    if (only === "all" || only === "map") await inspectMapOpenStress(page, logins.hr);
    if (only === "all" || only === "dropdowns") {
      const dropdownPlan = [
        ["hr", logins.hr, "ar", "/app/dashboard", ["القوى العاملة", "الرواتب", "التوظيف", "المستندات والامتثال", "التقارير والتحليلات", "الإعدادات"]],
        ["payroll", logins.payroll, "ar", "/app/dashboard", ["عمليات الرواتب", "سياسات الرواتب", "تقارير الرواتب"]],
        ["manager", logins.manager, "en", "/app/dashboard", ["Team", "Approvals", "Attendance", "Performance"]],
        ["employee", logins.employee, "en", "/app/dashboard", ["My Work", "Attendance", "Leave", "Documents", "Payslips", "Notifications"]],
        ["recruiter", logins.recruiter, "en", "/app/notifications", ["Recruitment", "Candidates", "Hiring Pipeline"]],
        ["superadmin", logins.admin, "en", "/admin/companies", ["Platform", "Companies", "Plans & Modules", "System Settings"]],
      ].filter(([role]) => !singleRole || role === singleRole);
      for (const [role, loginData, lang, route, groups] of dropdownPlan) {
        await inspectDropdown(page, role, loginData, lang, route, groups);
      }
    }
    if (only === "all" || only === "mobile") await inspectMobileTopbar(page, logins.employee);
    if (only === "all" || only === "arabic") await inspectArabicAndDarkMode(page, logins.hr);
    if (only === "all" || only === "docs") await inspectDocumentsExport(page, logins.hr);
  } catch (error) {
    results.errors.push(error?.stack || String(error));
  } finally {
    try { if (page?.ws) page.ws.close(); } catch {}
    try { if (chrome) chrome.kill(); } catch {}
    if (server) await new Promise((resolve) => server.close(resolve));
    if (chrome?.pid) {
      try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    }
    const pass = writeArtifacts();
    console.log(JSON.stringify({
      status: results.status,
      map: results.map.status,
      dropdowns: Object.fromEntries(Object.entries(results.dropdowns).map(([role, entry]) => [role, entry.status])),
      arabic: results.arabic.status,
      darkMode: results.darkMode.status,
      documentsExport: results.documentsExport.status,
      mobileTopbar: results.mobileTopbar.status,
      consoleErrors: results.consoleErrors.length,
      networkErrors: results.networkErrors.length,
      errors: results.errors,
    }, null, 2));
    if (!pass) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
