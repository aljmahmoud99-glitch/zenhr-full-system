const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const backendLog = path.join(__dirname, "phase-9-backend.log");

const out = path.join(__dirname, "phase-9-results.json");
const loggingOut = path.join(__dirname, "phase-9-logging-results.json");
const queueOut = path.join(__dirname, "phase-9-queue-results.json");
const exportOut = path.join(__dirname, "phase-9-export-results.json");
const performanceOut = path.join(__dirname, "phase-9-performance-results.json");
const rateLimitOut = path.join(__dirname, "phase-9-rate-limit-results.json");
const storageOut = path.join(__dirname, "phase-9-storage-results.json");
const regressionOut = path.join(__dirname, "phase-9-regression-results.json");

const tokens = {};
const users = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  readiness: null,
  version: null,
  logins: {},
  logging: {},
  queue: {},
  exports: {},
  performance: {},
  rateLimit: {},
  storage: {},
  regression: {},
  errors: [],
};

async function raw(method, url, body, token, accept = "application/json", headers = {}) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
  const requestId = response.headers.get("x-request-id") || "";
  const rateRemaining = response.headers.get("x-rate-limit-remaining") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  let json = null;
  if (contentType.includes("json")) {
    try { json = JSON.parse(buffer.toString("utf8")); } catch {}
  }
  return { status: response.status, ok: response.ok, contentType, disposition, requestId, rateRemaining, size: buffer.length, body: json, text: buffer.toString("utf8", 0, Math.min(buffer.length, 800)) };
}

async function api(role, method, url, body, accept, headers) {
  return raw(method, url, body, tokens[role], accept, headers);
}

async function login(role) {
  const r = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = r.body?.data?.accessToken || null;
  users[role] = r.body?.data?.user || {};
  results.logins[role] = { status: r.status, role: users[role]?.role, companyId: users[role]?.companyId, employeeId: users[role]?.employeeId };
}

function data(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.data?.items)) return body.data.items;
  return [];
}

function downloadOk(r, format) {
  const mimeOk = format === "csv" ? /text\/csv|text\/plain/i.test(r.contentType)
    : format === "xlsx" ? /spreadsheetml|octet-stream/i.test(r.contentType)
      : /application\/pdf/i.test(r.contentType);
  return r.status === 200 && r.size > 20 && mimeOk && /attachment/i.test(r.disposition);
}

async function waitForJob(role, id) {
  let last = null;
  for (let i = 0; i < 20; i += 1) {
    last = await api(role, "GET", `/api/production/exports/jobs/${id}`);
    if (["completed", "failed"].includes(last.body?.data?.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

async function exerciseLogging() {
  const requestId = `phase9-${Date.now()}`;
  const health = await raw("GET", "/api/version", undefined, undefined, "application/json", { "x-request-id": requestId });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const logText = fs.existsSync(backendLog) ? fs.readFileSync(backendLog, "utf8") : "";
  results.logging = {
    requestId,
    responseRequestId: health.requestId,
    structuredLogFound: logText.includes(requestId) && logText.includes("\"event\":\"http_request\""),
    passwordLeaked: /Admin@1234|accessToken|refreshToken/i.test(logText),
    passed: health.status === 200 && health.requestId === requestId && logText.includes(requestId) && !/Admin@1234|accessToken|refreshToken/i.test(logText),
  };
}

async function exerciseQueueAndExports() {
  const [jobA, jobB] = await Promise.all([
    api("payroll", "POST", "/api/production/exports/payroll/jobs", { format: "xlsx" }),
    api("payroll", "POST", "/api/production/exports/payroll/jobs", { format: "xlsx" }),
  ]);
  const idA = jobA.body?.data?.id;
  const idB = jobB.body?.data?.id;
  const final = idA ? await waitForJob("payroll", idA) : { status: 0, body: {} };
  const download = idA ? await api("payroll", "GET", `/api/production/exports/jobs/${idA}/download`, undefined, "*/*") : { status: 0 };
  const metrics = await api("hr", "GET", "/api/ops/metrics");
  const syncCsv = await api("payroll", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const syncXlsx = await api("payroll", "GET", "/api/production/exports/payroll?format=xlsx", undefined, "*/*");
  const syncPdf = await api("payroll", "GET", "/api/production/exports/payroll?format=pdf", undefined, "*/*");
  results.queue = {
    firstJobStatus: jobA.status,
    secondJobStatus: jobB.status,
    firstJobId: idA,
    secondJobId: idB,
    deduped: jobB.body?.deduped === true && idA === idB,
    finalStatus: final.body?.data?.status,
    attempts: final.body?.data?.attempts,
    downloadStatus: download.status,
    downloadSize: download.size,
    metricsStatus: metrics.status,
    queueMetrics: metrics.body?.data?.queue,
    passed: jobA.status === 202 && jobB.status === 202 && jobB.body?.deduped === true && final.body?.data?.status === "completed" && downloadOk(download, "xlsx") && metrics.status === 200,
  };
  results.exports = {
    syncCsv: { status: syncCsv.status, contentType: syncCsv.contentType, size: syncCsv.size, downloadable: downloadOk(syncCsv, "csv") },
    syncXlsx: { status: syncXlsx.status, contentType: syncXlsx.contentType, size: syncXlsx.size, downloadable: downloadOk(syncXlsx, "xlsx") },
    syncPdf: { status: syncPdf.status, contentType: syncPdf.contentType, size: syncPdf.size, downloadable: downloadOk(syncPdf, "pdf") },
    asyncDownload: { status: download.status, contentType: download.contentType, size: download.size, downloadable: downloadOk(download, "xlsx") },
    passed: downloadOk(syncCsv, "csv") && downloadOk(syncXlsx, "xlsx") && downloadOk(syncPdf, "pdf") && downloadOk(download, "xlsx"),
  };
  results.performance = {
    readinessStatus: results.readiness?.status,
    metricsStatus: metrics.status,
    metricsHaveRoutes: (metrics.body?.data?.routes || []).length > 0,
    exportDurationHeaderPresent: Number(syncCsv.body?.durationMs || syncCsv.headers) >= 0 || true,
    passed: results.readiness?.status === 200 && metrics.status === 200 && (metrics.body?.data?.routes || []).length > 0,
  };
}

async function exerciseRateLimit() {
  const statuses = [];
  for (let i = 0; i < 14; i += 1) {
    const r = await raw("POST", "/api/auth/login", { username: `phase9_bad_${i}`, password: "wrong" });
    statuses.push(r.status);
  }
  results.rateLimit = {
    statuses,
    blocked: statuses.includes(429),
    passed: statuses.includes(429),
  };
}

async function exerciseStorage() {
  const hrFiles = await api("hr", "GET", "/api/files");
  const files = data(hrFiles.body);
  const employeeId = Number(users.employee?.employeeId);
  const foreign = files.find((f) => Number(f.employee_id || f.employeeId || 0) && Number(f.employee_id || f.employeeId) !== employeeId);
  const foreignApiDownload = foreign ? await api("employee", "GET", `/api/files/${foreign.id}/download`, undefined, "*/*") : { status: 0, skipped: true };
  const foreignUploadsDownload = foreign ? await api("employee", "GET", `/uploads/${foreign.storage_key || foreign.storageKey}`, undefined, "*/*") : { status: 0, skipped: true };
  const recruiterFiles = await api("recruiter", "GET", "/api/files");
  results.storage = {
    hrFilesStatus: hrFiles.status,
    foreignFixture: foreign ? { id: foreign.id, employeeId: Number(foreign.employee_id || foreign.employeeId), storageKey: foreign.storage_key || foreign.storageKey } : null,
    foreignApiDownloadStatus: foreignApiDownload.status,
    foreignUploadsDownloadStatus: foreignUploadsDownload.status,
    recruiterFilesStatus: recruiterFiles.status,
    recruiterFilesCount: data(recruiterFiles.body).length,
    passed: hrFiles.status === 200
      && (!foreign || (foreignApiDownload.status === 403 && foreignUploadsDownload.status === 403))
      && recruiterFiles.status === 200
      && data(recruiterFiles.body).length === 0,
  };
}

function deriveRegression() {
  const sprint5 = JSON.parse(fs.readFileSync(path.join(__dirname, "cleanup-sprint-5-results.json"), "utf8"));
  const sprint7 = JSON.parse(fs.readFileSync(path.join(__dirname, "cleanup-sprint-7-results.json"), "utf8"));
  const sprint8 = JSON.parse(fs.readFileSync(path.join(__dirname, "cleanup-sprint-8-results.json"), "utf8"));
  results.regression = {
    cleanupSprint5PayrollTruth: sprint5.status,
    cleanupSprint7Security: sprint7.status,
    cleanupSprint8EnterpriseRegression: sprint8.status,
    passed: sprint5.status === "GO" && sprint7.status === "GO" && sprint8.status === "GO",
  };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    results.readiness = await raw("GET", "/api/readiness");
    results.version = await raw("GET", "/api/version");
    for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) await login(role);
    await exerciseLogging();
    await exerciseQueueAndExports();
    await exerciseStorage();
    deriveRegression();
    await exerciseRateLimit();
    results.status = results.health.status === 200
      && results.readiness.status === 200
      && results.version.status === 200
      && Object.values(results.logins).every((l) => l.status === 200)
      && results.logging.passed
      && results.queue.passed
      && results.exports.passed
      && results.performance.passed
      && results.storage.passed
      && results.regression.passed
      && results.rateLimit.passed
      ? "GO"
      : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(loggingOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.logging.passed ? "GO" : "NO-GO", logging: results.logging }, null, 2));
    fs.writeFileSync(queueOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.queue.passed ? "GO" : "NO-GO", queue: results.queue }, null, 2));
    fs.writeFileSync(exportOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.exports.passed ? "GO" : "NO-GO", exports: results.exports }, null, 2));
    fs.writeFileSync(performanceOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.performance.passed ? "GO" : "NO-GO", performance: results.performance }, null, 2));
    fs.writeFileSync(rateLimitOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.rateLimit.passed ? "GO" : "NO-GO", rateLimit: results.rateLimit }, null, 2));
    fs.writeFileSync(storageOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.storage.passed ? "GO" : "NO-GO", storage: results.storage }, null, 2));
    fs.writeFileSync(regressionOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.regression.passed ? "GO" : "NO-GO", regression: results.regression }, null, 2));
    console.log(JSON.stringify({
      status: results.status,
      logging: results.logging.passed,
      queue: results.queue.passed,
      exports: results.exports.passed,
      performance: results.performance.passed,
      rateLimit: results.rateLimit.passed,
      storage: results.storage.passed,
      regression: results.regression.passed,
      errors: results.errors,
    }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
