const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const generatedAt = new Date().toISOString();

const out = path.join(__dirname, "phase-11-1-results.json");
const rbacOut = path.join(__dirname, "phase-11-1-rbac-results.json");
const regressionOut = path.join(__dirname, "phase-11-1-regression-results.json");

const tokens = {};
const users = {};

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let json = null;
  if (contentType.includes("json")) {
    try { json = JSON.parse(text); } catch {}
  }
  return { status: response.status, ok: response.ok, contentType, body: json, text: text.slice(0, 1000) };
}

async function login(role) {
  const response = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = response.body?.data?.accessToken || null;
  users[role] = response.body?.data?.user || {};
  return {
    role,
    status: response.status,
    employeeId: users[role]?.employeeId,
    companyId: users[role]?.companyId,
    ok: response.status === 200 && Boolean(tokens[role]),
  };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
}

function items(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.data?.items)) return body.data.items;
  if (Array.isArray(body.items)) return body.items;
  return [];
}

function forbidden(status) {
  return status === 403 || status === 404;
}

async function ensureDirectReport(managerId, excludedEmployeeIds = []) {
  const list = await api("hr", "GET", "/api/employees?page=1&pageSize=300");
  const employees = items(list.body);
  const excluded = new Set(excludedEmployeeIds.map((id) => Number(id)).filter(Boolean));
  const existing = employees.find((employee) => Number(employee.directManagerId ?? employee.direct_manager_id) === Number(managerId)
    && Number(employee.id) !== Number(managerId)
    && !excluded.has(Number(employee.id))
    && String(employee.email || "").toLowerCase() !== "hr@zenjo.local");
  if (existing) return { employee: existing, created: false };

  const stamp = Date.now();
  const created = await api("hr", "POST", "/api/employees", {
    employeeCode: `MGRSCOPE-${stamp}`,
    firstNameEn: "Manager",
    lastNameEn: "Scope Probe",
    firstNameAr: "اختبار",
    lastNameAr: "النطاق",
    email: `manager.scope.${stamp}@example.test`,
    hireDate: new Date().toISOString().slice(0, 10),
    employmentStatus: "active",
    directManagerId: managerId,
  });
  return { employee: created.body?.data || {}, created: true, createStatus: created.status };
}

async function main() {
  const results = {
    generatedAt,
    backend,
    status: "RUNNING",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    ids: {},
    profileAccess: {},
    relatedScope: {},
    regression: {},
    issues: [],
  };

  for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) {
    results.logins[role] = await login(role);
  }

  const managerId = Number(users.manager?.employeeId);
  const employeeId = Number(users.employee?.employeeId);
  const hrEmployeeId = Number(users.hr?.employeeId);
  const direct = await ensureDirectReport(managerId, [hrEmployeeId, employeeId]);
  const directReportId = Number(direct.employee?.id);
  results.ids = {
    managerId,
    employeeId,
    hrEmployeeId,
    directReportId,
    directReportCreated: direct.created,
    directReportCreateStatus: direct.createStatus,
  };

  const managerOwn = await api("manager", "GET", `/api/employees/${managerId}`);
  const managerDirect = await api("manager", "GET", `/api/employees/${directReportId}`);
  const managerUnrelated = await api("manager", "GET", `/api/employees/${hrEmployeeId}`);
  const hrUnrelated = await api("hr", "GET", `/api/employees/${hrEmployeeId}`);
  const employeeOwn = await api("employee", "GET", `/api/employees/${employeeId}`);
  const employeeOther = await api("employee", "GET", `/api/employees/${hrEmployeeId}`);
  const payrollRead = await api("payroll", "GET", `/api/employees/${hrEmployeeId}`);
  const recruiterRead = await api("recruiter", "GET", `/api/employees/${hrEmployeeId}`);

  results.profileAccess = {
    managerOwnStatus: managerOwn.status,
    managerDirectReportStatus: managerDirect.status,
    managerUnrelatedStatus: managerUnrelated.status,
    managerUnrelatedForbidden: forbidden(managerUnrelated.status),
    managerUnrelatedLeakedName: /hr admin|hradmin|hr@/i.test(managerUnrelated.text),
    hrCompanyEmployeeStatus: hrUnrelated.status,
    employeeOwnStatus: employeeOwn.status,
    employeeOtherStatus: employeeOther.status,
    employeeOtherForbidden: forbidden(employeeOther.status),
    payrollReadStatus: payrollRead.status,
    recruiterReadStatus: recruiterRead.status,
    recruiterForbidden: forbidden(recruiterRead.status),
  };

  const managerQualifications = await api("manager", "GET", `/api/employees/${hrEmployeeId}/qualifications`);
  const managerDocuments = await api("manager", "GET", `/api/employees/${hrEmployeeId}/documents`);
  const managerLeaveBalances = await api("manager", "GET", `/api/employees/${hrEmployeeId}/leave-balances`);
  const managerEnterpriseBalance = await api("manager", "GET", `/api/leave/management/balances?employeeId=${hrEmployeeId}`);
  const managerAttendance = await api("manager", "GET", `/api/attendance?employeeId=${hrEmployeeId}`);
  const enterpriseBalanceRows = items(managerEnterpriseBalance.body);
  const attendanceRows = items(managerAttendance.body);
  const enterpriseBalanceContainsUnrelated = enterpriseBalanceRows.some((row) => Number(row.employeeId ?? row.employee_id) === Number(hrEmployeeId));
  const attendanceContainsUnrelated = attendanceRows.some((row) => Number(row.employeeId ?? row.employee_id) === Number(hrEmployeeId));

  results.relatedScope = {
    unrelatedQualificationsStatus: managerQualifications.status,
    unrelatedDocumentsStatus: managerDocuments.status,
    unrelatedLeaveBalancesStatus: managerLeaveBalances.status,
    unrelatedEnterpriseLeaveBalanceStatus: managerEnterpriseBalance.status,
    unrelatedAttendanceQueryStatus: managerAttendance.status,
    unrelatedEnterpriseLeaveBalanceRows: enterpriseBalanceRows.length,
    unrelatedAttendanceRows: attendanceRows.length,
    enterpriseBalanceContainsUnrelated,
    attendanceContainsUnrelated,
    qualificationsBlocked: forbidden(managerQualifications.status),
    documentsBlocked: forbidden(managerDocuments.status),
    leaveBalancesBlocked: forbidden(managerLeaveBalances.status),
    enterpriseLeaveBalanceBlocked: forbidden(managerEnterpriseBalance.status) || (managerEnterpriseBalance.status === 200 && !enterpriseBalanceContainsUnrelated),
    attendanceBlockedOrScopedEmpty: forbidden(managerAttendance.status) || (managerAttendance.status === 200 && !attendanceContainsUnrelated),
  };

  results.regression = {
    healthOk: results.health.status === 200,
    loginsOk: Object.values(results.logins).every((entry) => entry.ok),
    hrProfileStillWorks: hrUnrelated.status === 200,
    payrollProfileReadUnchanged: payrollRead.status === 200,
    employeeOwnStillWorks: employeeOwn.status === 200,
    managerDirectStillWorks: managerDirect.status === 200,
  };

  const profilePass = managerOwn.status === 200
    && managerDirect.status === 200
    && forbidden(managerUnrelated.status)
    && hrUnrelated.status === 200
    && employeeOwn.status === 200
    && forbidden(employeeOther.status)
    && payrollRead.status === 200
    && forbidden(recruiterRead.status)
    && !results.profileAccess.managerUnrelatedLeakedName;

  const relatedPass = results.relatedScope.qualificationsBlocked
    && results.relatedScope.documentsBlocked
    && results.relatedScope.leaveBalancesBlocked
    && results.relatedScope.enterpriseLeaveBalanceBlocked
    && results.relatedScope.attendanceBlockedOrScopedEmpty;

  results.status = profilePass && relatedPass && Object.values(results.regression).every(Boolean) ? "PASS" : "FAIL";
  if (!profilePass) results.issues.push({ severity: "BLOCKER", area: "employee-profile-scope", evidence: results.profileAccess });
  if (!relatedPass) results.issues.push({ severity: "HIGH", area: "related-employee-scope", evidence: results.relatedScope });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(rbacOut, `${JSON.stringify({
    generatedAt,
    status: profilePass && relatedPass ? "PASS" : "FAIL",
    profileAccess: results.profileAccess,
    relatedScope: results.relatedScope,
  }, null, 2)}\n`);
  fs.writeFileSync(regressionOut, `${JSON.stringify({
    generatedAt,
    status: Object.values(results.regression).every(Boolean) ? "PASS" : "FAIL",
    regression: results.regression,
  }, null, 2)}\n`);

  if (results.status !== "PASS") {
    console.error(JSON.stringify(results.issues, null, 2));
    process.exit(1);
  }
  console.log(`Phase 11.1 smoke PASS. Manager unrelated profile status ${managerUnrelated.status}.`);
}

main().catch((error) => {
  const failure = { generatedAt, backend, status: "ERROR", message: error?.message, stack: error?.stack };
  fs.writeFileSync(out, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
