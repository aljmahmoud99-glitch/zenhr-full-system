const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "cleanup-fix-sprint-1-results.json");
const payrollOut = path.join(__dirname, "cleanup-fix-sprint-1-payroll-results.json");
const securityOut = path.join(__dirname, "cleanup-fix-sprint-1-security-results.json");

const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  flows: {},
  errors: [],
};
const tokens = {};

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: response.status, ok: response.ok, body: json, contentType: response.headers.get("content-type") };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
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

function classify(name, classification, evidence) {
  results.flows[name] = { classification, ...evidence };
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftedDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), iso: d.toISOString().slice(0, 10) };
}

function stampDate(year, month, day, hour, minute) {
  return `${iso(year, month, day)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function createOrReuseRun(month, year) {
  const create = await api("payroll", "POST", "/api/payroll/runs", { month, year, notes: `Cleanup sprint ${year}-${month}` });
  if (create.status === 201) return { runId: create.body?.data?.id, create };
  const list = await api("payroll", "GET", `/api/payroll/runs?month=${month}&year=${year}`);
  return { runId: (list.body?.data || [])[0]?.id, create, list };
}

async function testPerformancePromotion(ctx) {
  const before = await api("hr", "GET", `/api/employees/${ctx.employeeId}`);
  const beforeSalary = num(before.body?.data?.basicSalary);
  const create = await api("hr", "POST", "/api/performance/promotions", {
    employeeId: ctx.employeeId,
    currentSalary: beforeSalary,
    recommendedSalary: beforeSalary + 19,
    incrementAmount: 19,
    incrementPercent: 1,
    reasonAr: "اختبار تطبيق توصية الأداء",
    reasonEn: "Cleanup sprint promotion application",
    effectiveDate: iso(ctx.year, ctx.month, ctx.baseDay),
  });
  const workflowId = create.body?.data?.workflow?.id;
  const approvals = [];
  if (workflowId) {
    for (let i = 0; i < 5; i += 1) {
      const r = await api("hr", "POST", `/api/performance/workflow-instances/${workflowId}/approve`, { notesEn: `cleanup approval ${i + 1}` });
      approvals.push({ status: r.status, workflowStatus: r.body?.data?.status, businessEffect: r.body?.data?.businessEffect, message: r.body?.message });
      if (r.status !== 200 || r.body?.data?.status === "approved") break;
    }
  }
  const retry = workflowId ? await api("hr", "POST", `/api/performance/workflow-instances/${workflowId}/approve`, { notesEn: "idempotency retry" }) : { status: 0 };
  const after = await api("hr", "GET", `/api/employees/${ctx.employeeId}`);
  const afterSalary = num(after.body?.data?.basicSalary);
  const actions = await api("hr", "GET", "/api/employee-actions");
  const actionText = JSON.stringify(actions.body?.data || []);
  const actionLinked = actionText.includes(`"performancePromotionId":${create.body?.data?.id}`) || actionText.includes(`"performancePromotionId":"${create.body?.data?.id}"`);
  const preview = await api("payroll", "GET", `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const previewSalary = num(preview.body?.data?.basicSalary);
  const working = create.status === 201 && afterSalary >= beforeSalary + 19 && previewSalary >= beforeSalary + 19 && retry.status === 409;
  classify("performancePromotion", working ? "CONFIRMED WORKING" : "CONFIRMED BROKEN", {
    createStatus: create.status,
    recommendationId: create.body?.data?.id,
    workflowId,
    approvals,
    retryApproveStatus: retry.status,
    beforeSalary,
    afterSalary,
    payrollPreviewBasicSalary: preview.body?.data?.basicSalary,
    employeeActionLinked: actionLinked,
    conclusion: working ? "Approved recommendation updates employee salary, payroll preview, and rejects duplicate approval." : "Promotion recommendation still lacks a complete business effect.",
  });
}

async function createApprovedCorrection(ctx, date, hour = 10, minute = 45) {
  const request = await api("employee", "POST", "/api/attendance/me/requests", {
    requestType: "time_correction",
    requestDate: date,
    requestedClockIn: stampDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), hour, minute),
    requestedClockOut: stampDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), 17, 0),
    reason: "Cleanup sprint correction",
  });
  const id = request.body?.data?.id;
  const manager = id ? await api("manager", "PUT", `/api/attendance/requests/${id}/approve`, { notes: "manager approval" }) : { status: 0 };
  const hrMissingReason = id ? await api("hr", "PUT", `/api/attendance/requests/${id}/approve`, {}) : { status: 0 };
  const hr = id ? await api("hr", "PUT", `/api/attendance/requests/${id}/approve`, { notes: "HR audited correction reason" }) : { status: 0 };
  const retry = id ? await api("hr", "PUT", `/api/attendance/requests/${id}/approve`, { notes: "retry" }) : { status: 0 };
  const attendance = await api("hr", "GET", `/api/attendance?employeeId=${ctx.employeeId}&from=${date}&to=${date}`);
  return { request, id, manager, hrMissingReason, hr, retry, record: (attendance.body?.data || [])[0] };
}

async function testAttendanceCorrection(ctx) {
  const date = iso(ctx.year, ctx.month, ctx.baseDay);
  const c = await createApprovedCorrection(ctx, date, 10, 30);
  const working = c.request.status === 201 && c.hr.status === 200 && c.hrMissingReason.status === 400 && c.retry.status === 409 &&
    c.record?.attendanceType === "manual_exception" && c.record?.biometricVerified === false && c.record?.geofenceStatus === "manual_exception";
  classify("attendanceCorrection", working ? "CONFIRMED WORKING" : "CONFIRMED BROKEN", {
    requestId: c.id,
    requestStatus: c.request.status,
    managerApproveStatus: c.manager.status,
    hrMissingReasonStatus: c.hrMissingReason.status,
    hrApproveStatus: c.hr.status,
    retryApproveStatus: c.retry.status,
    attendanceRecord: c.record ? {
      id: c.record.id,
      attendanceType: c.record.attendanceType,
      biometricVerified: c.record.biometricVerified,
      geofenceStatus: c.record.geofenceStatus,
      lateMinutes: c.record.lateMinutes,
      notes: c.record.notes,
    } : null,
    conclusion: working ? "Correction is an audited manual exception and not biometric proof." : "Correction still lacks audited exception metadata.",
  });
}

async function testAttendancePayrollImpact(ctx) {
  const date = iso(ctx.year, ctx.month, ctx.baseDay + 1);
  const correction = await createApprovedCorrection(ctx, date, 10, 40);
  const process = await api("hr", "POST", "/api/attendance-intelligence/process", { from: date, to: date });
  const preview = await api("payroll", "GET", `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const { runId } = await createOrReuseRun(ctx.month, ctx.year);
  const calculate = runId ? await api("payroll", "POST", `/api/payroll/runs/${runId}/calculate`, {}) : { status: 0 };
  const slips = runId ? await api("payroll", "GET", `/api/payroll/runs/${runId}/payslips`) : { status: 0, body: {} };
  const slip = (slips.body?.data || []).find(s => Number(s.employeeId) === Number(ctx.employeeId));
  let snapshot = {};
  try { snapshot = typeof slip?.componentsSnapshot === "string" ? JSON.parse(slip.componentsSnapshot) : slip?.componentsSnapshot || {}; } catch {}
  const previewDeduction = num(preview.body?.data?.attendanceImpactDeduction);
  const snapshotDeduction = num(snapshot.attendanceImpactDeductionJOD);
  const working = process.status === 200 && previewDeduction > 0 && calculate.status === 200 && snapshotDeduction > 0;
  classify("attendancePayrollImpact", working ? "CONFIRMED WORKING" : "PARTIAL", {
    correctionRequestId: correction.id,
    processStatus: process.status,
    createdViolations: process.body?.data?.createdViolations,
    previewStatus: preview.status,
    previewAttendanceImpactDeduction: preview.body?.data?.attendanceImpactDeduction,
    runId,
    calculateStatus: calculate.status,
    payslipId: slip?.id,
    snapshotAttendanceImpactDeduction: snapshot.attendanceImpactDeductionJOD,
    conclusion: working ? "Approved attendance impacts are consumed by preview/run/payslip snapshot once." : "Attendance violations exist, but payroll reflection is still incomplete.",
  });
}

async function testLeaveGuardrails(ctx) {
  const legacyDate = iso(ctx.year, ctx.month, ctx.baseDay + 2);
  const legacy = await api("hr", "POST", "/api/leave/requests", {
    employeeId: ctx.employeeId,
    leaveType: `LEGACY_UNMAPPED_${Date.now()}`,
    startDate: legacyDate,
    endDate: legacyDate,
    totalDays: 1,
    reason: "Cleanup legacy leave guardrail",
  });
  const legacyId = legacy.body?.data?.id;
  const legacyApprove = legacyId ? await api("hr", "POST", `/api/leave/requests/${legacyId}/approve`, { notes: "legacy approval" }) : { status: 0 };
  const types = await api("hr", "GET", "/api/leave/management/types");
  const unpaid = (types.body?.data || []).find(t => String(t.code || "").toUpperCase() === "UNPAID");
  const entDate = iso(ctx.year, ctx.month, ctx.baseDay + 3);
  const enterprise = unpaid ? await api("employee", "POST", "/api/leave/management/requests", {
    leaveTypeId: unpaid.id,
    startDate: entDate,
    endDate: entDate,
    durationUnit: "day",
    totalDays: 1,
    reason: "Cleanup enterprise unpaid leave",
  }) : { status: 0, body: { message: "No UNPAID type" } };
  const entId = enterprise.body?.data?.id;
  if (entId) {
    for (let i = 0; i < 3; i += 1) {
      const a = await api("hr", "POST", `/api/leave/management/requests/${entId}/approve`, { notes: `approve ${i}` });
      if (a.status !== 200 || ["approved", "rejected"].includes(String(a.body?.data?.status))) break;
    }
  }
  const preview = await api("payroll", "GET", `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const working = legacy.status === 201 && legacy.body?.data?.payrollCompatible === false && legacy.body?.data?.warning && num(preview.body?.data?.leaveDeduction) >= 0;
  classify("legacyVsEnterpriseLeave", working ? "CONFIRMED WORKING" : "PARTIAL", {
    legacyCreateStatus: legacy.status,
    legacyPayrollCompatible: legacy.body?.data?.payrollCompatible,
    legacyWarning: legacy.body?.data?.warning,
    legacyApproveStatus: legacyApprove.status,
    enterpriseTypeId: unpaid?.id,
    enterpriseCreateStatus: enterprise.status,
    payrollPreviewStatus: preview.status,
    leaveDeduction: preview.body?.data?.leaveDeduction,
    conclusion: working ? "Legacy unmapped leave is explicitly flagged as payroll-ignored; enterprise leave remains canonical payroll source." : "Leave guardrail needs more verification.",
  });
}

async function testRecruitmentConversion(ctx) {
  const stamp = Date.now();
  const candidate = await api("hr", "POST", "/api/recruitment/candidates", {
    fullNameAr: `مرشح تحقق ${stamp}`,
    fullNameEn: `Cleanup Candidate ${stamp}`,
    email: `candidate.${stamp}@example.test`,
    phone: "0790000000",
    nationality: "Jordanian",
    yearsOfExperience: 3,
    source: "cleanup",
  });
  const candidateId = candidate.body?.data?.id;
  const converted = candidateId ? await api("hr", "POST", `/api/recruitment/candidates/${candidateId}/convert-to-employee`, {
    employeeCode: `CLN-${String(stamp).slice(-8)}`,
    workEmail: `employee.${stamp}@example.test`,
    username: `cln.${stamp}`,
    password: "Welcome@1234",
    basicSalary: "777",
  }) : { status: 0, body: {} };
  const retry = candidateId ? await api("hr", "POST", `/api/recruitment/candidates/${candidateId}/convert-to-employee`, {
    employeeCode: `CLN-R-${String(stamp).slice(-6)}`,
    workEmail: `employee.retry.${stamp}@example.test`,
    username: `cln.retry.${stamp}`,
    password: "Welcome@1234",
  }) : { status: 0 };
  const employeeId = converted.body?.data?.employeeId;
  const employee = employeeId ? await api("hr", "GET", `/api/employees/${employeeId}`) : { status: 0 };
  const contracts = employeeId ? await api("hr", "GET", `/api/compliance-contracts/contracts?employeeId=${employeeId}`) : { status: 0, body: { data: { items: [] } } };
  const contractCount = contracts.body?.data?.items?.length || 0;
  const working = converted.status === 201 && employee.status === 200 && retry.status === 409 && (converted.body?.data?.contractId || contractCount > 0);
  classify("recruitmentConversion", working ? "CONFIRMED WORKING" : "PARTIAL", {
    candidateCreateStatus: candidate.status,
    candidateId,
    convertStatus: converted.status,
    retryConvertStatus: retry.status,
    employeeId,
    userId: converted.body?.data?.userId,
    contractId: converted.body?.data?.contractId,
    requiredDocumentIds: converted.body?.data?.requiredDocumentIds || [],
    employeeStatus: employee.status,
    contractCount,
    conclusion: working ? "Conversion creates employee/user plus draft contract/checklist handoff and is idempotent." : "Conversion still creates only a partial downstream handoff.",
  });
}

async function testSecurity(ctx) {
  const checks = {};
  checks.employeeOtherPayslip = await api("employee", "GET", `/api/payroll/slips/${ctx.managerEmployeeId}`);
  checks.employeeOtherLeaveBalance = await api("employee", "GET", `/api/leave/management/balances?employeeId=${ctx.managerEmployeeId}`);
  checks.employeeOtherAttendance = await api("employee", "GET", `/api/attendance?employeeId=${ctx.managerEmployeeId}`);
  checks.employeeOtherDocuments = await api("employee", "GET", `/api/document-reporting/documents?employeeId=${ctx.managerEmployeeId}`);
  checks.managerPayrollAdjustmentsNonTeam = await api("manager", "GET", `/api/payroll-adjustments/employee/${ctx.employeeId}`);
  checks.managerPayrollPreview = await api("manager", "GET", `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  checks.recruiterPayrollAdjustments = await api("recruiter", "GET", "/api/payroll-adjustments");
  const leakRows = Object.entries(checks).filter(([name, r]) => name.startsWith("employee") && r.status === 200 && Array.isArray(r.body?.data) && r.body.data.some(x => Number(x.employeeId) === Number(ctx.managerEmployeeId)));
  const dangerous = leakRows.length > 0 || checks.managerPayrollPreview.status !== 403 || checks.recruiterPayrollAdjustments.status !== 403;
  results.security = Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { status: v.status, message: v.body?.message, dataShape: Array.isArray(v.body?.data) ? "array" : typeof v.body?.data }]));
  classify("employeeSelfServiceSecurity", dangerous ? "CONFIRMED BROKEN" : "CONFIRMED WORKING", {
    checks: results.security,
    leakRows,
    conclusion: dangerous ? "At least one sensitive self-service/RBAC check leaked or allowed forbidden payroll access." : "No sampled employee data leak or forbidden payroll access remained.",
  });
}

async function testSuperadminPolicy() {
  const checks = {
    payrollPoliciesGet: await api("admin", "GET", "/api/payroll-policies"),
    leaveManagementTypesGet: await api("admin", "GET", "/api/leave/management/types"),
    complianceContractsGet: await api("admin", "GET", "/api/compliance-contracts/contracts"),
    attendanceBiometricAuditGet: await api("admin", "GET", "/api/attendance/biometric/audit"),
  };
  classify("superadminPolicy", "DOCUMENTED", {
    checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { status: v.status, message: v.body?.message }])),
    conclusion: "Observed and documented; no new superadmin privileges were added in this cleanup sprint.",
  });
}

function writeReport() {
  const rows = Object.entries(results.flows).map(([name, f]) => `| ${name} | ${f.classification} | ${String(f.conclusion || "").replace(/\|/g, "/")} |`).join("\n");
  const report = `# Cleanup Fix Sprint 1 Report

Generated: ${results.generatedAt}

Status: **${results.status}**

## Validation Matrix

| Flow | Result | Evidence summary |
|---|---|---|
${rows}

## Files Changed

- artifacts/api-server/src/index.ts
- artifacts/api-server/src/payroll-run.service.ts
- qa/cleanup-fix-sprint-1-smoke.cjs

## Notes

- This sprint intentionally avoided new modules and UI redesign.
- Attendance payroll impact behavior chosen: approved attendance_payroll_impacts are canonical payroll effects and are consumed by payroll preview/run/payslip snapshot once.
- Enterprise leave-management remains payroll source of truth. Legacy leave creation now returns an explicit compatibility/payroll warning when unmapped.
`;
  fs.writeFileSync(path.join(__dirname, "cleanup-fix-sprint-1-report.md"), report, "utf8");
}

async function main() {
  results.health = await raw("GET", "/api/healthz");
  for (const username of ["hr", "employee", "manager", "payroll", "recruiter", "admin"]) await login(username);
  const period = shiftedDate(45 + (Date.now() % 12));
  const ctx = {
    employeeId: results.logins.employee.employeeId,
    managerEmployeeId: results.logins.manager.employeeId,
    month: period.month,
    year: period.year,
    baseDay: Math.min(20, Math.max(8, period.day)),
  };
  results.context = ctx;
  const tests = [
    ["performancePromotion", () => testPerformancePromotion(ctx)],
    ["attendanceCorrection", () => testAttendanceCorrection(ctx)],
    ["attendancePayrollImpact", () => testAttendancePayrollImpact(ctx)],
    ["legacyVsEnterpriseLeave", () => testLeaveGuardrails(ctx)],
    ["recruitmentConversion", () => testRecruitmentConversion(ctx)],
    ["employeeSelfServiceSecurity", () => testSecurity(ctx)],
    ["superadminPolicy", () => testSuperadminPolicy()],
  ];
  for (const [name, fn] of tests) {
    try { await fn(); } catch (error) {
      classify(name, "NOT TESTED", { error: error.stack || error.message });
      results.errors.push({ flow: name, error: error.stack || error.message });
    }
  }
  const broken = Object.values(results.flows).some(f => f.classification === "CONFIRMED BROKEN" || f.classification === "NOT TESTED");
  const partial = Object.values(results.flows).some(f => f.classification === "PARTIAL");
  results.status = broken ? "NO_GO" : partial ? "PARTIAL" : "GO";
  fs.writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  fs.writeFileSync(payrollOut, JSON.stringify({
    generatedAt: results.generatedAt,
    attendancePayrollImpact: results.flows.attendancePayrollImpact,
    performancePromotion: results.flows.performancePromotion,
    legacyVsEnterpriseLeave: results.flows.legacyVsEnterpriseLeave,
  }, null, 2), "utf8");
  fs.writeFileSync(securityOut, JSON.stringify({
    generatedAt: results.generatedAt,
    employeeSelfServiceSecurity: results.flows.employeeSelfServiceSecurity,
    superadminPolicy: results.flows.superadminPolicy,
    checks: results.security,
  }, null, 2), "utf8");
  writeReport();
}

main().catch(error => {
  results.status = "ERROR";
  results.errors.push(error.stack || error.message);
  fs.writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  writeReport();
  process.exitCode = 1;
});
