const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5037);
const baseUrl = process.env.FRONTEND_URL || `http://localhost:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "phase-11-1-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  backend,
  pages: {},
  browserSecurity: {},
  consoleErrors: [],
  networkErrors: [],
  errors: [],
};

async function request(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
  let tabs = null;
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      tabs = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  if (!tabs) throw lastError || new Error("Chrome CDP port did not become ready");
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

async function setSession(page, loginData, lang = "en", theme = "dark") {
  const script = `
    localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
    localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
    localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
    localStorage.setItem('zenjo_lang', ${JSON.stringify(lang)});
    localStorage.setItem('zenjo_theme', ${JSON.stringify(theme)});
  `;
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
  await page.send("Page.navigate", { url: `${baseUrl}/` });
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.send("Runtime.evaluate", { expression: script });
}

async function inspect(page, key, route, width = 1366) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 600 });
  await page.send("Page.navigate", { url: `${baseUrl}/#${route}` });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const evaluated = await page.send("Runtime.evaluate", {
    expression: `(() => {
      const text=document.body.innerText||"";
      return {
        url: location.href,
        length: text.length,
        loadingStuck: /Loading|تحميل/.test(text) && text.length < 220,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        actionable: [...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>e.offsetParent!==null).length
      };
    })()`,
    returnByValue: true,
  });
  results.pages[key] = evaluated.result?.result?.value || {};
}

async function main() {
  let server = null;
  let chrome = null;
  let page = null;
  try {
    server = await serveDist();
    const manager = await login("manager");
    const hr = await login("hr");
    const managerId = Number(manager.user?.employeeId);
    const hrEmployeeId = Number(hr.user?.employeeId);
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    fs.mkdirSync(path.join(__dirname, ".chrome-localappdata"), { recursive: true });
    fs.mkdirSync(path.join(__dirname, ".chrome-temp"), { recursive: true });
    const port = 14700 + Math.floor(Math.random() * 500);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(__dirname, `.chrome-phase-11-1-${Date.now()}`)}`,
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--no-sandbox",
      "--no-first-run",
      "about:blank",
    ], {
      stdio: "ignore",
      env: {
        ...process.env,
        LOCALAPPDATA: path.join(__dirname, ".chrome-localappdata"),
        TEMP: path.join(__dirname, ".chrome-temp"),
        TMP: path.join(__dirname, ".chrome-temp"),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    page = await connect(port);

    await setSession(page, manager, "en", "dark");
    await inspect(page, "manager_dashboard", "/app/dashboard", 1366);
    await inspect(page, "manager_employees", "/app/employees", 1366);
    await inspect(page, "manager_employees_mobile", "/app/employees", 390);

    const security = await page.send("Runtime.evaluate", {
      expression: `fetch('/api/employees/${hrEmployeeId}', { headers: { authorization: 'Bearer ${manager.accessToken}' } })
        .then(async r => ({ status: r.status, text: (await r.text()).slice(0, 500) }))
        .catch(e => ({ status: 0, text: String(e) }))`,
      awaitPromise: true,
      returnByValue: true,
    });
    const own = await page.send("Runtime.evaluate", {
      expression: `fetch('/api/employees/${managerId}', { headers: { authorization: 'Bearer ${manager.accessToken}' } })
        .then(async r => ({ status: r.status, text: (await r.text()).slice(0, 500) }))
        .catch(e => ({ status: 0, text: String(e) }))`,
      awaitPromise: true,
      returnByValue: true,
    });
    results.browserSecurity = {
      managerOwnStatus: own.result?.result?.value?.status,
      managerUnrelatedStatus: security.result?.result?.value?.status,
      managerUnrelatedForbidden: [403, 404].includes(Number(security.result?.result?.value?.status)),
      sensitiveTextLeaked: /hr admin|hradmin|hr@/i.test(security.result?.result?.value?.text || ""),
    };

    const pages = Object.values(results.pages);
    results.status = pages.every((p) => (p.length || 0) > 200 && !p.loadingStuck && !p.overflow)
      && results.browserSecurity.managerOwnStatus === 200
      && results.browserSecurity.managerUnrelatedForbidden
      && !results.browserSecurity.sensitiveTextLeaked
      && results.consoleErrors.length === 0
      && results.networkErrors.length === 0
      ? "GO"
      : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    if (page?.ws) page.ws.close();
    if (chrome) chrome.kill();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify({ status: results.status, browserSecurity: results.browserSecurity, errors: results.errors, networkErrors: results.networkErrors, consoleErrors: results.consoleErrors }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
  }
}

main();
