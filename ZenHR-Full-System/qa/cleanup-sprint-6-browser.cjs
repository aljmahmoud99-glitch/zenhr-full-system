const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const frontendPort = Number(process.env.FRONTEND_PORT || 5016);
const baseUrl = process.env.FRONTEND_URL || `http://localhost:${frontendPort}`;
const backend = process.env.BACKEND_URL || "http://localhost:3001";
const out = path.join(__dirname, "cleanup-sprint-6-browser-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  baseUrl,
  backend,
  pages: {},
  checks: {},
  consoleErrors: [],
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

async function login() {
  const r = await request("POST", "/api/auth/login", { username: "hr", password: process.env.TEST_PASSWORD || "Admin@1234" });
  return r.body?.data || null;
}

function serveDist() {
  const distRoot = path.resolve(__dirname, "..", "frontend", "dist", "zenjo-ng", "browser");
  if (!fs.existsSync(distRoot)) return null;
  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      const proxyReq = http.request(`${backend}${req.url}`, {
        method: req.method,
        headers: req.headers,
      }, (proxyRes) => {
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

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

async function cdp(port, method, params = {}) {
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const wsUrl = page.webSocketDebuggerUrl;
  const WebSocket = global.WebSocket || require("ws");
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params?.type)) {
      const text = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (/error|500|failed/i.test(text)) results.consoleErrors.push(text);
    }
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (m, p = {}) => new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method: m, params: p }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send(method, params);
  return { ws, send };
}

async function main() {
  let server = null;
  let chrome = null;
  try {
    server = await serveDist();
    const loginData = await login();
    if (!loginData?.accessToken) throw new Error("HR login failed");
    const chromePath = await findChrome();
    if (!chromePath) throw new Error("Chrome/Edge executable not found");
    const port = 11260 + Math.floor(Math.random() * 500);
    chrome = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      "--user-data-dir=" + path.join(__dirname, `.chrome-sprint-6-${Date.now()}`),
      "--headless=new",
      "--disable-gpu",
      "about:blank",
    ], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const page = await cdp(port, "Runtime.enable");
    await page.send("Page.enable");
    const sessionScript = `
      localStorage.setItem('zenjo_token', ${JSON.stringify(loginData.accessToken)});
      localStorage.setItem('zenjo_refresh', ${JSON.stringify(loginData.refreshToken)});
      localStorage.setItem('zenjo_user', ${JSON.stringify(JSON.stringify(loginData.user))});
      localStorage.setItem('zenjo_lang','ar');
      localStorage.setItem('zenjo_theme','dark');
    `;
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: sessionScript });
    await page.send("Page.navigate", { url: `${baseUrl}/` });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.send("Runtime.evaluate", { expression: sessionScript });
    await page.send("Page.navigate", { url: `${baseUrl}/#/app/documents-reporting` });
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const docEval = await page.send("Runtime.evaluate", { expression: `({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, color: getComputedStyle(document.body).color, bg: getComputedStyle(document.body).backgroundColor })`, returnByValue: true });
    results.pages.documentsReporting = docEval.result?.result?.value;
    await page.send("Runtime.evaluate", { expression: `location.href='${baseUrl}/#/app/compliance-contracts';` });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const complianceEval = await page.send("Runtime.evaluate", { expression: `({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })`, returnByValue: true });
    results.pages.complianceContracts = complianceEval.result?.result?.value;
    await page.send("Runtime.evaluate", { expression: `location.href='${baseUrl}/#/app/recruitment';` });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const recruitmentEval = await page.send("Runtime.evaluate", { expression: `({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })`, returnByValue: true });
    results.pages.recruitment = recruitmentEval.result?.result?.value;
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.send("Runtime.evaluate", { expression: `location.href='${baseUrl}/#/app/documents-reporting';` });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const mobileEval = await page.send("Runtime.evaluate", { expression: `({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, text: document.body.innerText.slice(0, 500) })`, returnByValue: true });
    results.pages.mobileDocuments = mobileEval.result?.result?.value;
    page.ws.close();

    const text = `${results.pages.documentsReporting?.text || ""}\n${results.pages.complianceContracts?.text || ""}\n${results.pages.recruitment?.text || ""}`;
    results.checks = {
      documentsRouteLoads: /Documents|الوثائق|المستندات|التقارير/.test(text),
      complianceRouteLoads: /Contracts|Compliance|العقود|الامتثال/.test(text),
      recruitmentRouteLoads: /Recruitment|Candidates|التوظيف|المرشح/.test(text),
      noHorizontalOverflow: !results.pages.documentsReporting?.overflow && !results.pages.complianceContracts?.overflow && !results.pages.recruitment?.overflow && !results.pages.mobileDocuments?.overflow,
      darkModeReadable: !!results.pages.documentsReporting?.color,
      noCriticalConsoleErrors: results.consoleErrors.length === 0,
    };
    results.status = Object.values(results.checks).every(Boolean) ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    if (chrome) chrome.kill();
    if (server) server.close();
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ status: results.status, checks: results.checks, errors: results.errors, consoleErrors: results.consoleErrors }, null, 2));
  }
}

main();
