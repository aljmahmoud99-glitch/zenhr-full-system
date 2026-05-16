const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "phase-1-4-leave-approval-tenant-isolation-results.json");
const tokens = {};
const runDayOffset = 1800 + Math.floor(Date.now() / 1000) % 20000;

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json, text: text.slice(0, 500) };
}

async function login(key, username = key) {
  const response = await raw("POST", "/api/auth/login", { username, password });
  tokens[key] = response.body?.data?.accessToken;
  return { status: response.status, user: response.body?.data?.user || null };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
}

function dataItems(result) {
  const data = result?.body?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function statusIn(result, statuses) {
  return statuses.includes(result?.status);
}

function dateRange(offset) {
  const start = new Date(Date.UTC(2098, 0, 1 + runDayOffset + offset));
  const end = new Date(Date.UTC(2098, 0, 1 + runDayOffset + offset));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function activeLeaveTypeId() {
  const types = await api("hr", "GET", "/api/leave/management/types");
  return dataItems(types).find((type) => type.isActive !== false)?.id || dataItems(types)[0]?.id || null;
}

async function createLeave(employeeId, leaveTypeId, label, offset) {
  if (!employeeId || !leaveTypeId) return { status: 0, body: { message: "missing fixture" } };
  return api("hr", "POST", "/api/leave/management/requests", {
    employeeId,
    leaveTypeId,
    ...dateRange(offset),
    durationUnit: "day",
    totalDays: 1,
    reason: `Phase 1.4 leave tenant isolation ${label} ${Date.now()}`,
  });
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    duplicateRouteFindings: {
      target: "POST /api/leave/requests/:id/approve",
      activeRegistration: "First compatibility wrapper in artifacts/api-server/src/index.ts forwards to /api/leave/management/requests/:id/approve.",
      duplicateRegistration: "Later legacy direct handler with the same method/path remains in index.ts but is shadowed by the earlier wrapper in Express registration order.",
      securedHandlers: [
        "leave-notifications.service.ts /api/leave/management/requests/:id/approve",
        "index.ts later duplicate legacy /api/leave/requests/:id/approve"
      ]
    },
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    setup: {},
    tests: {},
    skipped: [],
    errors: [],
  };

  for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) {
    results.logins[role] = await login(role);
  }
  const requiredLoginOk = ["hr", "payroll", "manager", "employee", "recruiter", "admin"]
    .every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!requiredLoginOk) {
    results.status = "ERROR";
    results.errors.push({ area: "login", logins: results.logins });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const [hrEmployees, managerEmployees] = await Promise.all([
    api("hr", "GET", "/api/employees?pageSize=200"),
    api("manager", "GET", "/api/employees?pageSize=200"),
  ]);
  const hrList = dataItems(hrEmployees);
  const managerList = dataItems(managerEmployees);
  const managerEmployeeId = Number(results.logins.manager.user?.employeeId);
  const employeeEmployeeId = Number(results.logins.employee.user?.employeeId);
  const directReport = managerList.find((employee) => Number(employee.id) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.directManagerId) === managerEmployeeId);
  const unrelated = hrList.find((employee) =>
    Number(employee.id) !== managerEmployeeId
    && Number(employee.id) !== Number(directReport?.id)
    && Number(employee.directManagerId) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.id) !== managerEmployeeId && Number(employee.id) !== Number(directReport?.id));
  const leaveTypeId = await activeLeaveTypeId();

  results.fixtures = {
    hrEmployeeCount: hrList.length,
    managerEmployeeCount: managerList.length,
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id || null,
    unrelatedEmployeeId: unrelated?.id || null,
    leaveTypeId,
    crossCompanyLeaveId: Number(process.env.CROSS_COMPANY_LEAVE_ID || 0) || null,
    deletedLeaveId: Number(process.env.DELETED_LEAVE_ID || 0) || null,
  };

  results.setup.hrRequest = await createLeave(employeeEmployeeId, leaveTypeId, "hr-same-company", 1);
  results.setup.managerDirectRequest = await createLeave(results.fixtures.directReportId, leaveTypeId, "manager-direct-report", 3);
  results.setup.managerUnrelatedRequest = await createLeave(results.fixtures.unrelatedEmployeeId, leaveTypeId, "manager-unrelated", 5);
  results.setup.employeeForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "employee-forbidden", 7);
  results.setup.payrollForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "payroll-forbidden", 9);
  results.setup.recruiterForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "recruiter-forbidden", 11);
  results.setup.alreadyApprovedRequest = await createLeave(employeeEmployeeId, leaveTypeId, "already-approved", 13);

  const ids = Object.fromEntries(Object.entries(results.setup).map(([key, value]) => [key, value?.body?.data?.id || null]));

  if (ids.hrRequest) results.tests.hrSameCompanyApprove = await api("hr", "POST", `/api/leave/requests/${ids.hrRequest}/approve`, { notes: "Phase 1.4 HR approval" });
  else results.skipped.push({ test: "hrSameCompanyApprove", reason: "failed to create HR leave fixture" });

  if (ids.managerDirectRequest) results.tests.managerDirectReportApprove = await api("manager", "POST", `/api/leave/requests/${ids.managerDirectRequest}/approve`, { notes: "Phase 1.4 manager approval" });
  else results.skipped.push({ test: "managerDirectReportApprove", reason: "no direct-report leave fixture available" });

  if (ids.managerUnrelatedRequest) results.tests.managerUnrelatedApprove = await api("manager", "POST", `/api/leave/requests/${ids.managerUnrelatedRequest}/approve`, { notes: "Phase 1.4 manager unrelated" });
  else results.skipped.push({ test: "managerUnrelatedApprove", reason: "no unrelated employee leave fixture available" });

  if (ids.employeeForbiddenRequest) results.tests.employeeForbidden = await api("employee", "POST", `/api/leave/requests/${ids.employeeForbiddenRequest}/approve`, {});
  if (ids.payrollForbiddenRequest) results.tests.payrollForbidden = await api("payroll", "POST", `/api/leave/requests/${ids.payrollForbiddenRequest}/approve`, {});
  if (ids.recruiterForbiddenRequest) results.tests.recruiterForbidden = await api("recruiter", "POST", `/api/leave/requests/${ids.recruiterForbiddenRequest}/approve`, {});

  if (ids.alreadyApprovedRequest) {
    results.setup.alreadyApprovedFirst = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "first approval" });
    results.setup.alreadyApprovedSecond = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "second approval completes workflow when a second approval step exists" });
    results.tests.alreadyApprovedThird = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "third approval should not reapply" });
  } else {
    results.skipped.push({ test: "alreadyApprovedThird", reason: "failed to create already-approved fixture" });
  }

  if (results.fixtures.crossCompanyLeaveId) {
    results.tests.crossCompanyApprove = await api("hr", "POST", `/api/leave/requests/${results.fixtures.crossCompanyLeaveId}/approve`, {});
  } else {
    results.skipped.push({ test: "crossCompanyApprove", reason: "CROSS_COMPANY_LEAVE_ID not provided" });
  }
  if (results.fixtures.deletedLeaveId) {
    results.tests.deletedApprove = await api("hr", "POST", `/api/leave/requests/${results.fixtures.deletedLeaveId}/approve`, {});
  } else {
    results.skipped.push({ test: "deletedApprove", reason: "DELETED_LEAVE_ID not provided" });
  }

  results.tests.randomId = await api("hr", "POST", "/api/leave/requests/999999999/approve", {});

  const assertions = {
    health: results.health.status === 200,
    hrSameCompanyApprove: !ids.hrRequest || statusIn(results.tests.hrSameCompanyApprove, [200]),
    crossCompanyApprove404: !results.fixtures.crossCompanyLeaveId || statusIn(results.tests.crossCompanyApprove, [404]),
    managerDirectReportApprove: !ids.managerDirectRequest || statusIn(results.tests.managerDirectReportApprove, [200]),
    managerUnrelatedForbidden: !ids.managerUnrelatedRequest || statusIn(results.tests.managerUnrelatedApprove, [403, 404]),
    employeeForbidden: !ids.employeeForbiddenRequest || statusIn(results.tests.employeeForbidden, [403]),
    payrollForbidden: !ids.payrollForbiddenRequest || statusIn(results.tests.payrollForbidden, [403]),
    recruiterForbidden: !ids.recruiterForbiddenRequest || statusIn(results.tests.recruiterForbidden, [403]),
    deletedApprove404: !results.fixtures.deletedLeaveId || statusIn(results.tests.deletedApprove, [404]),
    randomId404: statusIn(results.tests.randomId, [404]),
    alreadyApprovedProtected: !ids.alreadyApprovedRequest || statusIn(results.tests.alreadyApprovedThird, [400, 409]),
  };

  results.assertions = assertions;
  results.createdIds = ids;
  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length) results.errors.push({ area: "assertions", failed });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
    duplicateRouteFindings: results.duplicateRouteFindings,
    fixtures: results.fixtures,
    assertions,
    statuses: Object.fromEntries(Object.entries(results.tests).map(([key, value]) => [key, value?.status])),
    skipped: results.skipped,
  }, null, 2));
  if (results.status !== "GO") process.exit(1);
}

main().catch((error) => {
  const result = { generatedAt: new Date().toISOString(), status: "ERROR", message: error?.message, stack: error?.stack };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
