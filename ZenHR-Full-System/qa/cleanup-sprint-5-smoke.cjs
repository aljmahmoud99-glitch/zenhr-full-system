const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const out = path.join(__dirname, "cleanup-sprint-5-results.json");
const reconciliationOut = path.join(__dirname, "cleanup-sprint-5-payroll-reconciliation.json");
const rerunOut = path.join(__dirname, "cleanup-sprint-5-rerun-protection.json");
const rbacOut = path.join(__dirname, "cleanup-sprint-5-rbac-results.json");
const exportOut = path.join(__dirname, "cleanup-sprint-5-export-results.json");

const tokens = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  reconciliation: {},
  rerunProtection: {},
  rbac: {},
  exports: {},
  regressions: {},
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
  return { status: response.status, ok: response.ok, body: json, contentType, disposition, size: buffer.length, sample: buffer.slice(0, 80).toString("utf8") };
}

async function api(role, method, url, body, accept) {
  return raw(method, url, body, tokens[role], accept);
}

async function login(username) {
  const r = await raw("POST", "/api/auth/login", { username, password });
  tokens[username] = r.body?.data?.accessToken || null;
  results.logins[username] = {
    status: r.status,
    role: r.body?.data?.user?.role,
    companyId: r.body?.data?.user?.companyId,
    employeeId: r.body?.data?.user?.employeeId,
  };
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return (Math.round(num(value) * 1000) / 1000).toFixed(3);
}

function periodDate(year, month, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function ensureType() {
  const types = await api("payroll", "GET", "/api/payroll-adjustments/types");
  const existing = (types.body?.data || []).find(t => String(t.code || "").toUpperCase() === "SPRINT5_AFTER_NET");
  if (existing) return existing;
  const create = await api("payroll", "POST", "/api/payroll-adjustments/types", {
    code: "SPRINT5_AFTER_NET",
    nameAr: "اختبار تسوية الرواتب",
    nameEn: "Sprint 5 Payroll Reconciliation",
    category: "earning",
    defaultCalculationMode: "after_net",
  });
  return create.body?.data;
}

async function createRun(month, year) {
  const create = await api("payroll", "POST", "/api/payroll/runs", { month, year, notes: `Cleanup Sprint 5 ${year}-${month}` });
  if (create.status === 201) return { run: create.body.data, create };
  const list = await api("payroll", "GET", `/api/payroll/runs?month=${month}&year=${year}`);
  const run = (list.body?.data || [])[0];
  return { run, create, list };
}

async function approveAdjustment(id) {
  const approvals = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await api("hr", "PATCH", `/api/payroll-adjustments/${id}/approve`, { notes: `Sprint 5 approval ${i + 1}` });
    approvals.push({ status: r.status, adjustmentStatus: r.body?.data?.status, message: r.body?.message });
    if (r.status !== 200 || r.body?.data?.status === "approved") break;
  }
  return approvals;
}

function parseSnapshot(slip) {
  try { return typeof slip?.componentsSnapshot === "string" ? JSON.parse(slip.componentsSnapshot) : (slip?.componentsSnapshot || {}); }
  catch { return {}; }
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) await login(role);
    const employeeId = results.logins.employee.employeeId;
    const type = await ensureType();
    const month = 11;
    const year = 2037 + Math.floor(Date.now() % 200);
    const amount = 50;

    const beforePreview = await api("payroll", "GET", `/api/payroll/preview/${employeeId}?month=${month}&year=${year}`);
    const adjustment = await api("payroll", "POST", "/api/payroll-adjustments", {
      employeeId,
      adjustmentTypeId: type.id,
      direction: "add",
      calculationMode: "after_net",
      recurrenceType: "one_time",
      amount,
      effectiveDate: periodDate(year, month, 3),
      payrollMonth: month,
      payrollYear: year,
      titleAr: "إضافة صافي اختبارية",
      titleEn: "Sprint 5 after-net addition",
      reasonEn: "Cleanup Sprint 5 reconciliation",
      status: "pending",
    });
    const adjustmentId = adjustment.body?.data?.id;
    const approvals = adjustmentId ? await approveAdjustment(adjustmentId) : [];
    const approvedDetail = adjustmentId ? await api("payroll", "GET", `/api/payroll-adjustments/${adjustmentId}`) : { status: 0 };
    const afterPreview = await api("payroll", "GET", `/api/payroll/preview/${employeeId}?month=${month}&year=${year}`);
    const { run } = await createRun(month, year);
    const calculate1 = run?.id ? await api("payroll", "POST", `/api/payroll/runs/${run.id}/calculate`, {}) : { status: 0 };
    const slips1 = run?.id ? await api("payroll", "GET", `/api/payroll/runs/${run.id}/payslips`) : { status: 0, body: {} };
    const slip1 = (slips1.body?.data || []).find(s => Number(s.employeeId) === Number(employeeId));
    const snapshot1 = parseSnapshot(slip1);
    const calculate2 = run?.id ? await api("payroll", "POST", `/api/payroll/runs/${run.id}/calculate`, {}) : { status: 0 };
    const slips2 = run?.id ? await api("payroll", "GET", `/api/payroll/runs/${run.id}/payslips`) : { status: 0, body: {} };
    const slip2 = (slips2.body?.data || []).find(s => Number(s.employeeId) === Number(employeeId));
    const snapshot2 = parseSnapshot(slip2);
    const detailAfterRun = adjustmentId ? await api("payroll", "GET", `/api/payroll-adjustments/${adjustmentId}`) : { status: 0 };
    const approveRun = run?.id ? await api("payroll", "POST", `/api/payroll/runs/${run.id}/approve`, {}) : { status: 0 };
    const lockedRecalc = run?.id ? await api("payroll", "POST", `/api/payroll/runs/${run.id}/calculate`, {}) : { status: 0 };

    const previewAdjustment = num(afterPreview.body?.data?.adjustmentAddition);
    const snapshotAdjustment = num(snapshot1.adjustmentAdditionJOD);
    const rerunSnapshotAdjustment = num(snapshot2.adjustmentAdditionJOD);
    const netDeltaPreview = num(afterPreview.body?.data?.netSalary) - num(beforePreview.body?.data?.netSalary);
    const runTotals = calculate2.body?.data || calculate1.body?.data || {};
    const payslipNetTotal = (slips2.body?.data || []).reduce((s, p) => s + num(p.netSalary), 0);
    const payslipGrossTotal = (slips2.body?.data || []).reduce((s, p) => s + num(p.grossSalary), 0);
    const payslipDeductionTotal = (slips2.body?.data || []).reduce((s, p) => s + num(p.totalDeductions), 0);
    const report = await api("payroll", "GET", `/api/reports/payroll-summary?month=${month}&year=${year}`);
    const reportRun = (report.body?.data?.runLevel || []).find(r => Number(r.id) === Number(run.id));

    results.reconciliation = {
      employeeId,
      period: `${year}-${String(month).padStart(2, "0")}`,
      adjustmentId,
      beforeNet: beforePreview.body?.data?.netSalary,
      afterPreviewNet: afterPreview.body?.data?.netSalary,
      netDeltaPreview: money(netDeltaPreview),
      previewAdjustmentAddition: afterPreview.body?.data?.adjustmentAddition,
      payslipId: slip1?.id,
      payslipNet: slip1?.netSalary,
      payslipAdjustmentAddition: snapshot1.adjustmentAdditionJOD,
      payrollImpacts: snapshot1.payrollImpacts || [],
      runTotalNet: runTotals.totalNet,
      payslipNetTotal: money(payslipNetTotal),
      reportTotalNet: reportRun ? money(reportRun.totalNet) : null,
      grossReconciles: money(payslipGrossTotal) === money(runTotals.totalGross),
      deductionsReconcile: money(payslipDeductionTotal) === money(runTotals.totalDeductions),
      netReconciles: money(payslipNetTotal) === money(runTotals.totalNet) && (!reportRun || money(reportRun.totalNet) === money(runTotals.totalNet)),
      passed: previewAdjustment === amount && snapshotAdjustment === amount && Math.round(netDeltaPreview) === amount && money(payslipNetTotal) === money(runTotals.totalNet),
    };

    results.rerunProtection = {
      runId: run?.id,
      firstCalculateStatus: calculate1.status,
      secondCalculateStatus: calculate2.status,
      firstPayslipId: slip1?.id,
      secondPayslipId: slip2?.id,
      firstSnapshotAdjustment: snapshot1.adjustmentAdditionJOD,
      secondSnapshotAdjustment: snapshot2.adjustmentAdditionJOD,
      adjustmentStatusAfterRun: detailAfterRun.body?.data?.status,
      adjustmentPayrollRunId: detailAfterRun.body?.data?.payrollRunId,
      approveRunStatus: approveRun.status,
      lockedRecalculateStatus: lockedRecalc.status,
      duplicatePrevented: calculate2.status === 200 && rerunSnapshotAdjustment === amount && lockedRecalc.status === 409,
    };

    const exports = {};
    for (const format of ["csv", "xlsx", "pdf"]) {
      const r = await api("payroll", "GET", `/api/production/exports/payroll?format=${format}`, undefined, format === "csv" ? "text/csv" : "*/*");
      exports[format] = { status: r.status, contentType: r.contentType, disposition: r.disposition, size: r.size, hasPeriod: format === "csv" ? r.sample.includes(String(year)) || r.size > 100 : r.size > 100 };
    }
    const reportExcel = await api("payroll", "GET", `/api/reports/payroll-summary?month=${month}&year=${year}&format=excel`, undefined, "*/*");
    results.exports = {
      ...exports,
      payrollSummaryExcel: { status: reportExcel.status, contentType: reportExcel.contentType, disposition: reportExcel.disposition, size: reportExcel.size },
      passed: Object.values(exports).every(e => e.status === 200 && e.size > 20) && reportExcel.status === 200 && reportExcel.size > 100,
    };

    const managerMutate = await api("manager", "POST", "/api/payroll/runs", { month: 12, year });
    const employeePreview = await api("employee", "GET", `/api/payroll/preview/${employeeId}?month=${month}&year=${year}`);
    const recruiterExport = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
    const payrollRead = await api("payroll", "GET", `/api/payroll/runs/${run.id}/payslips`);
    results.rbac = {
      managerPayrollMutationStatus: managerMutate.status,
      employeePreviewStatus: employeePreview.status,
      recruiterPayrollExportStatus: recruiterExport.status,
      payrollReadStatus: payrollRead.status,
      passed: managerMutate.status === 403 && employeePreview.status === 403 && recruiterExport.status === 403 && payrollRead.status === 200,
    };

    const sprint2 = await raw("GET", "/api/approvals/pending", undefined, tokens.hr);
    const sprint3 = await raw("GET", "/api/leave/requests", undefined, tokens.hr);
    results.regressions = {
      unifiedApprovalsStatus: sprint2.status,
      leaveCompatibilityStatus: sprint3.status,
      passed: sprint2.status === 200 && sprint3.status === 200,
    };

    results.status = results.health.status === 200 &&
      Object.values(results.logins).every(l => l.status === 200) &&
      results.reconciliation.passed &&
      results.rerunProtection.duplicatePrevented &&
      results.exports.passed &&
      results.rbac.passed &&
      results.regressions.passed ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(reconciliationOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.reconciliation.passed ? "GO" : "NO-GO", ...results.reconciliation }, null, 2));
    fs.writeFileSync(rerunOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.rerunProtection.duplicatePrevented ? "GO" : "NO-GO", ...results.rerunProtection }, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.rbac.passed ? "GO" : "NO-GO", ...results.rbac }, null, 2));
    fs.writeFileSync(exportOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.exports.passed ? "GO" : "NO-GO", ...results.exports }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
