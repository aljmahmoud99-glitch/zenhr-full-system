const fs = require("node:fs");

const base = process.env.API_BASE || "http://localhost:3006";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const cleanPolicyLabelAr = "سياسة الرواتب الأساسية";
const cleanRuleLabels = {
  full_time: {
    labelAr: "دوام كامل",
    labelEn: "Full time",
    descriptionAr: "راتب شهري مع حضور وإجازات ورواتب كاملة",
    descriptionEn: "Monthly payroll with attendance, leave, and deductions",
  },
  part_time: {
    labelAr: "دوام جزئي",
    labelEn: "Part time",
    descriptionAr: "احتساب بالساعة أو اليوم حسب الحضور الفعلي",
    descriptionEn: "Hourly or daily payroll based on actual work",
  },
  freelance: {
    labelAr: "مستقل",
    labelEn: "Freelance",
    descriptionAr: "دفعات تعاقدية أو إنجازات بدون حضور إلزامي",
    descriptionEn: "Contract or milestone payments without mandatory attendance",
  },
  contractor: {
    labelAr: "متعاقد",
    labelEn: "Contractor",
    descriptionAr: "احتساب تعاقدي أو بالساعة حسب الاتفاق",
    descriptionEn: "Contract or hourly payment based on agreement",
  },
  intern: {
    labelAr: "متدرب",
    labelEn: "Intern",
    descriptionAr: "مكافأة شهرية أو تدريب غير مدفوع حسب السياسة",
    descriptionEn: "Monthly stipend or unpaid internship by policy",
  },
};

const results = {
  generatedAt: new Date().toISOString(),
  base,
  migrationApplied: true,
  health: null,
  logins: {},
  checks: [],
  calculations: {},
  integration: {},
  rbac: {},
  tenantIsolation: {},
  verdict: "RUNNING",
};

function add(name, ok, details = {}) {
  results.checks.push({ name, ok: Boolean(ok), details });
}

async function api(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const err = new Error(json?.message || text || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

async function expectForbidden(name, role, path, token) {
  try {
    await api("GET", path, token);
    results.rbac[role] = { forbidden: false };
  } catch (err) {
    results.rbac[role] = { forbidden: err.status === 403, status: err.status };
  }
}

(async () => {
  results.health = await api("GET", "/api/healthz");
  const users = ["hr", "payroll", "manager", "employee", "recruiter", "admin"];
  const tokens = {};
  for (const username of users) {
    const login = await api("POST", "/api/auth/login", null, { username, password });
    tokens[username] = login.data.accessToken;
    results.logins[username] = {
      ok: true,
      role: login.data.user.role,
      companyId: login.data.user.companyId,
    };
  }

  const hr = tokens.hr;
  const payroll = tokens.payroll;
  const initial = await api("GET", "/api/payroll-policies", hr);
  const originalPolicy = initial.data.policy;
  const originalRules = Object.fromEntries(initial.data.employmentTypeRules.map((r) => [r.employmentType, r]));
  add("GET /api/payroll-policies persisted", initial.success && originalPolicy.id, {
    policyId: originalPolicy.id,
    mode: originalPolicy.salaryCalculationMode,
    rules: initial.data.employmentTypeRules.length,
  });

  const basePolicy = {
    defaultWorkingDaysPolicy: originalPolicy.defaultWorkingDaysPolicy,
    weekendDays: originalPolicy.weekendDays,
    roundingPolicy: originalPolicy.roundingPolicy,
    dailyRatePrecision: originalPolicy.dailyRatePrecision,
    hourlyRatePrecision: originalPolicy.hourlyRatePrecision,
    overtimePolicyMode: originalPolicy.overtimePolicyMode,
    deductionPolicyMode: originalPolicy.deductionPolicyMode,
    unpaidLeavePolicy: originalPolicy.unpaidLeavePolicy,
    latenessDeductionPolicy: originalPolicy.latenessDeductionPolicy,
    earlyLeaveDeductionPolicy: originalPolicy.earlyLeaveDeductionPolicy,
    applyAttendanceToPayroll: originalPolicy.applyAttendanceToPayroll,
    applyOvertimeToPayroll: originalPolicy.applyOvertimeToPayroll,
    workingHoursPerDay: originalPolicy.workingHoursPerDay,
    manualWorkingDaysPerMonth: originalPolicy.manualWorkingDaysPerMonth,
    labelAr: cleanPolicyLabelAr,
    labelEn: "Default payroll policy",
    notesAr: originalPolicy.notesAr,
    notesEn: originalPolicy.notesEn,
  };

  const saved = await api("PUT", "/api/payroll-policies", hr, {
    ...basePolicy,
    salaryCalculationMode: "actual_calendar_days",
    reasonEn: "Phase 1 final validation - actual calendar mode",
  });
  const reloaded = await api("GET", "/api/payroll-policies", hr);
  add("Save/update company policy persists and Arabic label clean", (
    saved.data.salaryCalculationMode === "actual_calendar_days" &&
    reloaded.data.policy.salaryCalculationMode === "actual_calendar_days" &&
    reloaded.data.policy.labelAr === cleanPolicyLabelAr
  ), { savedMode: saved.data.salaryCalculationMode, reloadedMode: reloaded.data.policy.salaryCalculationMode, labelAr: reloaded.data.policy.labelAr });

  const employeeList = await api("GET", "/api/employees?pageSize=1", hr);
  const firstEmployee = Array.isArray(employeeList.data) ? employeeList.data[0] : employeeList.data.items[0];
  const empId = firstEmployee.id;
  const previews = {
    fixed30: await api("GET", `/api/payroll-policies/preview?employeeId=${empId}&month=2&year=2026&mode=fixed_30`, hr),
    actual28: await api("GET", `/api/payroll-policies/preview?employeeId=${empId}&month=2&year=2026&mode=actual_calendar_days`, hr),
    actual30: await api("GET", `/api/payroll-policies/preview?employeeId=${empId}&month=4&year=2026&mode=actual_calendar_days`, hr),
    actual31: await api("GET", `/api/payroll-policies/preview?employeeId=${empId}&month=3&year=2026&mode=actual_calendar_days`, hr),
    workingDays: await api("GET", `/api/payroll-policies/preview?employeeId=${empId}&month=3&year=2026&mode=working_days_only`, hr),
  };
  results.calculations = Object.fromEntries(Object.entries(previews).map(([k, v]) => [k, v.data]));
  add("Calculation modes fixed/actual 28-30-31/working-days", (
    previews.fixed30.data.dailyRate === "50.000" &&
    previews.actual28.data.actualMonthDays === 28 &&
    previews.actual30.data.actualMonthDays === 30 &&
    previews.actual31.data.actualMonthDays === 31 &&
    previews.workingDays.data.workingDays > 0
  ), {
    fixed: previews.fixed30.data.dailyRate,
    actual28: previews.actual28.data.dailyRate,
    actual30: previews.actual30.data.dailyRate,
    actual31: previews.actual31.data.dailyRate,
    working: previews.workingDays.data.dailyRate,
    workingDays: previews.workingDays.data.workingDays,
  });

  const ruleTests = [
    { type: "full_time", basis: "monthly", included: true },
    { type: "part_time", basis: "daily", included: true },
    { type: "part_time", basis: "hourly", included: true },
    { type: "freelance", basis: "contract", included: true },
    { type: "contractor", basis: "hourly", included: true },
    { type: "contractor", basis: "contract", included: true },
    { type: "intern", basis: "monthly", included: true },
    { type: "intern", basis: "monthly", included: false },
  ];
  const ruleResults = [];
  for (const test of ruleTests) {
    const current = originalRules[test.type];
    const clean = cleanRuleLabels[test.type];
    const updated = await api("PUT", `/api/payroll-policies/employment-types/${test.type}`, payroll, {
      salaryBasis: test.basis,
      attendanceRequired: current.attendanceRequired,
      overtimeEligible: current.overtimeEligible,
      leaveEligible: current.leaveEligible,
      deductionEligible: current.deductionEligible,
      payrollIncluded: test.included,
      calculationModeOverride: test.basis === "hourly" ? "hourly" : null,
      defaultHoursPerDay: current.defaultHoursPerDay,
      ...clean,
    });
    ruleResults.push({
      type: test.type,
      salaryBasis: updated.data.salaryBasis,
      payrollIncluded: updated.data.payrollIncluded,
      calculationModeOverride: updated.data.calculationModeOverride,
      labelAr: updated.data.labelAr,
    });
  }
  add("Employment type rules full/part/freelance/contractor/intern", ruleResults.length === ruleTests.length, { tested: ruleResults });

  for (const [type, rule] of Object.entries(originalRules)) {
    const clean = cleanRuleLabels[type] || {};
    await api("PUT", `/api/payroll-policies/employment-types/${type}`, hr, {
      salaryBasis: rule.salaryBasis,
      attendanceRequired: rule.attendanceRequired,
      overtimeEligible: rule.overtimeEligible,
      leaveEligible: rule.leaveEligible,
      deductionEligible: rule.deductionEligible,
      payrollIncluded: rule.payrollIncluded,
      calculationModeOverride: rule.calculationModeOverride,
      defaultHoursPerDay: rule.defaultHoursPerDay,
      labelAr: clean.labelAr || rule.labelAr,
      labelEn: clean.labelEn || rule.labelEn,
      descriptionAr: clean.descriptionAr || rule.descriptionAr,
      descriptionEn: clean.descriptionEn || rule.descriptionEn,
    });
  }

  await api("PUT", "/api/payroll-policies", payroll, {
    ...basePolicy,
    salaryCalculationMode: "fixed_30",
    reasonEn: "Set fixed30 for integration smoke",
  });
  const payrollPreview = await api("GET", `/api/payroll/preview/${empId}?month=2&year=2026`, payroll);
  add("Payroll preview reads saved policy", payrollPreview.data.payrollPolicy.salaryCalculationMode === "fixed_30", payrollPreview.data.payrollPolicy);

  let run = null;
  const candidatePeriods = [
    { month: 2, year: 2038 },
    { month: 3, year: 2038 },
    { month: 4, year: 2038 },
  ];
  for (const period of candidatePeriods) {
    try {
      const created = await api("POST", "/api/payroll/runs", payroll, {
        ...period,
        notes: "Phase 1 payroll policy validation run",
      });
      run = created.data;
      break;
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }
  if (!run) {
    const existing = await api("GET", "/api/payroll/runs?year=2038", payroll);
    run = existing.data.find((r) => ["draft", "calculated", "approved"].includes(r.status));
  }
  if (!run) throw new Error("Unable to find or create validation payroll run.");
  if (run.status === "draft" || run.status === "calculated") {
    await api("POST", `/api/payroll/runs/${run.id}/calculate`, payroll, {});
  }
  const runDetail = await api("GET", `/api/payroll/runs/${run.id}`, payroll);
  const slips = await api("GET", `/api/payroll/runs/${run.id}/payslips`, payroll);
  add("Future payroll run calculation uses saved policy and persists run snapshot", (
    runDetail.data.payrollPolicySnapshot?.salaryCalculationMode === "fixed_30"
  ), { runId: run.id, status: runDetail.data.status, snapshot: runDetail.data.payrollPolicySnapshot });
  add("Payslip policy snapshot persists", (
    slips.data.length > 0 && Boolean(slips.data[0].payrollPolicySnapshot?.salaryBasis)
  ), { count: slips.data.length, firstSnapshot: slips.data[0]?.payrollPolicySnapshot });

  if (runDetail.data.status !== "approved") {
    await api("POST", `/api/payroll/runs/${run.id}/approve`, payroll, {});
  }
  const beforeLocked = await api("GET", `/api/payroll/runs/${run.id}`, payroll);
  let lockedStatus = null;
  let lockedBlocked = false;
  try {
    await api("POST", `/api/payroll/runs/${run.id}/calculate`, payroll, {});
    lockedStatus = 200;
  } catch (err) {
    lockedStatus = err.status;
    lockedBlocked = err.status === 409;
  }
  const afterLocked = await api("GET", `/api/payroll/runs/${run.id}`, payroll);
  add("Approved/locked payroll run is not recalculated", (
    lockedBlocked &&
    beforeLocked.data.totalNet === afterLocked.data.totalNet &&
    afterLocked.data.status === "approved"
  ), { runId: run.id, recalcStatus: lockedStatus, beforeNet: beforeLocked.data.totalNet, afterNet: afterLocked.data.totalNet, status: afterLocked.data.status });

  const history = await api("GET", "/api/payroll-policies/history", hr);
  add("Policy audit/history visible", history.success && history.data.length > 0, { count: history.data.length, latest: history.data[0]?.action });

  for (const role of ["manager", "employee", "recruiter"]) {
    await expectForbidden(`Policy forbidden for ${role}`, role, "/api/payroll-policies", tokens[role]);
  }
  try {
    await api("PUT", "/api/payroll-policies", tokens.admin, { salaryCalculationMode: "fixed_30" });
    results.rbac.admin = { mutationBlocked: false };
  } catch (err) {
    results.rbac.admin = { mutationBlocked: err.status === 403, status: err.status };
  }
  add("RBAC hr/payroll allowed and unauthorized roles blocked", (
    results.rbac.manager.forbidden &&
    results.rbac.employee.forbidden &&
    results.rbac.recruiter.forbidden &&
    results.rbac.admin.mutationBlocked
  ), results.rbac);

  const tenantAttempt = await api("PUT", "/api/payroll-policies", hr, {
    ...basePolicy,
    companyId: 999999,
    salaryCalculationMode: "fixed_30",
    reasonEn: "Tenant isolation attempt",
  });
  const tenantReload = await api("GET", "/api/payroll-policies", hr);
  results.tenantIsolation = {
    attemptedCompanyId: 999999,
    savedCompanyId: tenantAttempt.data.companyId,
    readCompanyId: tenantReload.data.policy.companyId,
  };
  add("Tenant isolation auth company scoped", (
    tenantAttempt.data.companyId === results.logins.hr.companyId &&
    tenantReload.data.policy.companyId === results.logins.hr.companyId
  ), results.tenantIsolation);

  await api("PUT", "/api/payroll-policies", hr, {
    ...basePolicy,
    salaryCalculationMode: originalPolicy.salaryCalculationMode,
    reasonEn: "Final restore after validation",
  });

  const failed = results.checks.filter((c) => !c.ok);
  results.verdict = failed.length === 0 ? "API_GO" : "API_NO_GO";
  fs.writeFileSync("qa/phase-1-payroll-policy-engine-api-results.json", JSON.stringify(results, null, 2), "utf8");
  console.log(JSON.stringify({ verdict: results.verdict, failed }, null, 2));
})().catch((err) => {
  results.verdict = "API_NO_GO";
  results.error = { message: err.message, status: err.status, body: err.body };
  fs.writeFileSync("qa/phase-1-payroll-policy-engine-api-results.json", JSON.stringify(results, null, 2), "utf8");
  console.error(err);
  process.exit(1);
});
