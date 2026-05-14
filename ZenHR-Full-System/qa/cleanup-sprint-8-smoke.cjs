const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const out = path.join(__dirname, "cleanup-sprint-8-results.json");
const regressionOut = path.join(__dirname, "cleanup-sprint-8-regression-results.json");
const payrollOut = path.join(__dirname, "cleanup-sprint-8-payroll-reconciliation.json");
const auditOut = path.join(__dirname, "cleanup-sprint-8-audit-results.json");
const exportOut = path.join(__dirname, "cleanup-sprint-8-export-results.json");
const rbacOut = path.join(__dirname, "cleanup-sprint-8-rbac-results.json");
const uxOut = path.join(__dirname, "cleanup-sprint-8-ux-results.json");
const compatibilityOut = path.join(__dirname, "cleanup-sprint-8-compatibility-results.json");

const tokens = {};
const users = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  exports: {},
  payroll: {},
  audit: {},
  rbac: {},
  compatibility: {},
  regression: {},
  ux: {},
  errors: [],
};

async function raw(method, url, body, token, accept = "application/json") {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  let json = null;
  if (contentType.includes("json")) {
    try { json = JSON.parse(buffer.toString("utf8")); } catch {}
  }
  return { status: response.status, ok: response.ok, contentType, disposition, size: buffer.length, body: json, text: buffer.toString("utf8", 0, Math.min(buffer.length, 1200)) };
}

async function api(role, method, url, body, accept) {
  return raw(method, url, body, tokens[role], accept);
}

async function login(role) {
  const r = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = r.body?.data?.accessToken || null;
  users[role] = r.body?.data?.user || {};
  results.logins[role] = { status: r.status, role: users[role]?.role, companyId: users[role]?.companyId, employeeId: users[role]?.employeeId };
}

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8")); }
  catch { return null; }
}

function downloadOk(r, format) {
  const mimeOk = format === "csv" ? /text\/csv|text\/plain/i.test(r.contentType)
    : format === "xlsx" ? /spreadsheetml|octet-stream/i.test(r.contentType)
      : /application\/pdf/i.test(r.contentType);
  return r.status === 200 && r.size > 20 && mimeOk && /attachment/i.test(r.disposition);
}

function headerClean(text) {
  const first = String(text || "").split(/\r?\n/)[0] || "";
  return !/(ط§|طھ|ظ„|ظ…|ظٹ|ط±|طµ|ط¯)/.test(first);
}

async function exerciseExports() {
  const datasets = ["employees", "attendance", "payroll", "recruitment", "evaluations", "reports", "workflows"];
  const matrix = {};
  for (const dataset of datasets) {
    matrix[dataset] = {};
    const role = dataset === "payroll" ? "payroll" : dataset === "recruitment" ? "recruiter" : "hr";
    for (const format of ["csv", "xlsx", "pdf"]) {
      const r = await api(role, "GET", `/api/production/exports/${dataset}?format=${format}`, undefined, format === "csv" ? "text/csv" : "*/*");
      matrix[dataset][format] = {
        role,
        status: r.status,
        contentType: r.contentType,
        disposition: r.disposition,
        size: r.size,
        downloadable: downloadOk(r, format),
        cleanCsvHeader: format === "csv" ? headerClean(r.text) : true,
      };
    }
  }
  const employeePayroll = await api("employee", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const recruiterPayroll = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const managerPayroll = await api("manager", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  results.exports = {
    datasets: matrix,
    denied: {
      employeePayrollStatus: employeePayroll.status,
      recruiterPayrollStatus: recruiterPayroll.status,
      managerPayrollStatus: managerPayroll.status,
    },
    passed: Object.values(matrix).every((formats) => Object.values(formats).every((r) => r.downloadable && r.cleanCsvHeader))
      && employeePayroll.status === 403
      && recruiterPayroll.status === 403
      && managerPayroll.status === 403,
  };
}

async function exerciseCompatibility() {
  const legacyLeave = await api("employee", "GET", "/api/leave/me/requests");
  const enterpriseLeave = await api("employee", "GET", "/api/leave/management/requests");
  const legacyNotifications = await api("employee", "GET", "/api/notifications");
  const notificationCenter = await api("employee", "GET", "/api/notifications/center");
  const legacyHeadcount = await api("hr", "GET", "/api/reports/headcount");
  const approvals = await api("hr", "GET", "/api/approvals/pending");
  results.compatibility = {
    legacyLeaveStatus: legacyLeave.status,
    enterpriseLeaveStatus: enterpriseLeave.status,
    legacyNotificationsStatus: legacyNotifications.status,
    notificationCenterStatus: notificationCenter.status,
    legacyHeadcountStatus: legacyHeadcount.status,
    approvalsStatus: approvals.status,
    passed: legacyLeave.status === 200
      && enterpriseLeave.status === 200
      && legacyNotifications.status === 200
      && notificationCenter.status === 200
      && legacyHeadcount.status === 200
      && approvals.status === 200,
  };
}

async function exerciseRbac() {
  const employeeApprovals = await api("employee", "GET", "/api/approvals/pending");
  const employeePayrollPreview = await api("employee", "GET", `/api/payroll/preview/${users.employee.employeeId}?month=1&year=2042`);
  const recruiterPayrollAdjustments = await api("recruiter", "GET", "/api/payroll-adjustments");
  const payrollRecruitmentMutation = await api("payroll", "POST", "/api/recruitment/candidates", { fullNameEn: "Forbidden", email: `forbidden.${Date.now()}@example.test` });
  const employeeOtherProfile = await api("employee", "GET", `/api/employees/${Number(users.employee.employeeId) + 1}`);
  results.rbac = {
    employeeApprovalsStatus: employeeApprovals.status,
    employeePayrollPreviewStatus: employeePayrollPreview.status,
    recruiterPayrollAdjustmentsStatus: recruiterPayrollAdjustments.status,
    payrollRecruitmentMutationStatus: payrollRecruitmentMutation.status,
    employeeOtherProfileStatus: employeeOtherProfile.status,
    passed: [employeeApprovals, employeePayrollPreview, recruiterPayrollAdjustments, payrollRecruitmentMutation, employeeOtherProfile].every((r) => [403, 404].includes(r.status)),
  };
}

function deriveRegression() {
  const sprint2 = readJson("cleanup-sprint-2-results.json");
  const sprint3 = readJson("cleanup-sprint-3-results.json");
  const sprint5 = readJson("cleanup-sprint-5-results.json");
  const sprint6 = readJson("cleanup-sprint-6-results.json");
  const sprint7 = readJson("cleanup-sprint-7-results.json");
  results.regression = {
    cleanupSprint2: sprint2?.status || "MISSING",
    cleanupSprint3: sprint3?.status || "MISSING",
    cleanupSprint5: sprint5?.status || "MISSING",
    cleanupSprint6: sprint6?.status || "MISSING",
    cleanupSprint7: sprint7?.status || "MISSING",
    passed: [sprint2, sprint3, sprint5, sprint6, sprint7].every((r) => r?.status === "GO"),
  };
  results.payroll = {
    source: "qa/cleanup-sprint-5-results.json",
    status: sprint5?.status || "MISSING",
    reconciliation: sprint5?.reconciliation || null,
    rerunProtection: sprint5?.rerunProtection || null,
    exports: sprint5?.exports || null,
    passed: sprint5?.status === "GO" && sprint5?.reconciliation?.passed === true && sprint5?.rerunProtection?.duplicatePrevented === true && sprint5?.exports?.passed === true,
  };
  results.audit = {
    leaveAuditRows: sprint3?.leave?.auditRows || 0,
    leaveNotificationPresent: sprint3?.notifications?.leaveNotificationPresent === true,
    unifiedApprovalsStatus: sprint2?.approvals?.pendingStatus || sprint2?.approvals?.historyStatus || null,
    notificationDedupe: sprint2?.notifications?.dedupePassed ?? sprint2?.notifications?.passed ?? true,
    performancePayrollAuditSource: "Sprint 5 payroll adjustments and Sprint 3 leave audit evidence",
    passed: Number(sprint3?.leave?.auditRows || 0) > 0 && sprint3?.notifications?.leaveNotificationPresent === true && sprint2?.status === "GO",
  };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) await login(role);
    await exerciseExports();
    await exerciseCompatibility();
    await exerciseRbac();
    deriveRegression();
    results.ux = {
      source: "qa/cleanup-sprint-8-browser-results.json",
      note: "Browser UX checks are produced by cleanup-sprint-8-browser.cjs after this API gate.",
      passed: null,
    };
    results.status = results.health.status === 200
      && Object.values(results.logins).every((l) => l.status === 200)
      && results.exports.passed
      && results.compatibility.passed
      && results.rbac.passed
      && results.regression.passed
      && results.payroll.passed
      && results.audit.passed
      ? "GO"
      : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(regressionOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.regression.passed ? "GO" : "NO-GO", regression: results.regression }, null, 2));
    fs.writeFileSync(payrollOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.payroll.passed ? "GO" : "NO-GO", payroll: results.payroll }, null, 2));
    fs.writeFileSync(auditOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.audit.passed ? "GO" : "NO-GO", audit: results.audit }, null, 2));
    fs.writeFileSync(exportOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.exports.passed ? "GO" : "NO-GO", exports: results.exports }, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.rbac.passed ? "GO" : "NO-GO", rbac: results.rbac }, null, 2));
    fs.writeFileSync(uxOut, JSON.stringify({ generatedAt: results.generatedAt, status: "PENDING_BROWSER", ux: results.ux }, null, 2));
    fs.writeFileSync(compatibilityOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.compatibility.passed ? "GO" : "NO-GO", compatibility: results.compatibility }, null, 2));
    console.log(JSON.stringify({ status: results.status, exports: results.exports.passed, compatibility: results.compatibility.passed, rbac: results.rbac.passed, payroll: results.payroll.passed, audit: results.audit.passed, errors: results.errors }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
