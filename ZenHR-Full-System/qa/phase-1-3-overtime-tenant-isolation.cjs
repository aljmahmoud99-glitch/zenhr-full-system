const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "phase-1-3-overtime-tenant-isolation-results.json");
const tokens = {};

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

function statusIn(result, allowed) {
  return allowed.includes(result?.status);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createPayload(employeeId, label) {
  return {
    employeeId,
    date: todayDate(),
    hours: 1,
    reason: `Phase 1.3 overtime tenant isolation ${label} ${Date.now()}`,
  };
}

function dataArray(result) {
  return Array.isArray(result?.body?.data) ? result.body.data : [];
}

async function createOvertimeFor(employeeId, label) {
  if (!employeeId) return { status: 0, body: { message: "missing employee fixture" } };
  return api("hr", "POST", "/api/overtime", createPayload(employeeId, label));
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
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
  const hrList = dataArray(hrEmployees);
  const managerList = dataArray(managerEmployees);
  const managerEmployeeId = Number(results.logins.manager.user?.employeeId);
  const employeeEmployeeId = Number(results.logins.employee.user?.employeeId);
  const directReport = managerList.find((employee) => Number(employee.id) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.directManagerId) === managerEmployeeId);
  const unrelated = hrList.find((employee) =>
    Number(employee.id) !== managerEmployeeId
    && Number(employee.id) !== Number(directReport?.id)
    && Number(employee.directManagerId) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.id) !== managerEmployeeId && Number(employee.id) !== Number(directReport?.id));

  results.fixtures = {
    hrEmployeeCount: hrList.length,
    managerEmployeeCount: managerList.length,
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id || null,
    unrelatedEmployeeId: unrelated?.id || null,
    crossCompanyOvertimeId: Number(process.env.CROSS_COMPANY_OVERTIME_ID || 0) || null,
    deletedOvertimeId: Number(process.env.DELETED_OVERTIME_ID || 0) || null,
  };

  results.setup.hrRequest = await createOvertimeFor(employeeEmployeeId, "hr-same-company");
  results.setup.managerDirectRequest = await createOvertimeFor(results.fixtures.directReportId, "manager-direct-report");
  results.setup.managerUnrelatedRequest = await createOvertimeFor(results.fixtures.unrelatedEmployeeId, "manager-unrelated");
  results.setup.employeeForbiddenRequest = await createOvertimeFor(employeeEmployeeId, "employee-forbidden");
  results.setup.payrollForbiddenRequest = await createOvertimeFor(employeeEmployeeId, "payroll-forbidden");
  results.setup.recruiterForbiddenRequest = await createOvertimeFor(employeeEmployeeId, "recruiter-forbidden");

  const hrRequestId = results.setup.hrRequest.body?.data?.id;
  const managerDirectRequestId = results.setup.managerDirectRequest.body?.data?.id;
  const managerUnrelatedRequestId = results.setup.managerUnrelatedRequest.body?.data?.id;
  const employeeForbiddenRequestId = results.setup.employeeForbiddenRequest.body?.data?.id;
  const payrollForbiddenRequestId = results.setup.payrollForbiddenRequest.body?.data?.id;
  const recruiterForbiddenRequestId = results.setup.recruiterForbiddenRequest.body?.data?.id;

  if (hrRequestId) results.tests.hrSameCompanyApprove = await api("hr", "PUT", `/api/overtime/requests/${hrRequestId}/approve`, {});
  else results.skipped.push({ test: "hrSameCompanyApprove", reason: "failed to create same-company overtime fixture" });

  if (managerDirectRequestId) results.tests.managerDirectReportApprove = await api("manager", "PUT", `/api/overtime/requests/${managerDirectRequestId}/approve`, {});
  else results.skipped.push({ test: "managerDirectReportApprove", reason: "no direct-report overtime fixture available" });

  if (managerUnrelatedRequestId) results.tests.managerUnrelatedApprove = await api("manager", "PUT", `/api/overtime/requests/${managerUnrelatedRequestId}/approve`, {});
  else results.skipped.push({ test: "managerUnrelatedApprove", reason: "no unrelated employee overtime fixture available" });

  if (employeeForbiddenRequestId) results.tests.employeeForbidden = await api("employee", "PUT", `/api/overtime/requests/${employeeForbiddenRequestId}/approve`, {});
  if (payrollForbiddenRequestId) results.tests.payrollForbidden = await api("payroll", "PUT", `/api/overtime/requests/${payrollForbiddenRequestId}/approve`, {});
  if (recruiterForbiddenRequestId) results.tests.recruiterForbidden = await api("recruiter", "PUT", `/api/overtime/requests/${recruiterForbiddenRequestId}/approve`, {});

  if (results.fixtures.crossCompanyOvertimeId) {
    results.tests.crossCompanyApprove = await api("hr", "PUT", `/api/overtime/requests/${results.fixtures.crossCompanyOvertimeId}/approve`, {});
  } else {
    results.skipped.push({ test: "crossCompanyApprove", reason: "CROSS_COMPANY_OVERTIME_ID not provided" });
  }

  if (results.fixtures.deletedOvertimeId) {
    results.tests.deletedApprove = await api("hr", "PUT", `/api/overtime/requests/${results.fixtures.deletedOvertimeId}/approve`, {});
  } else {
    results.skipped.push({ test: "deletedApprove", reason: "DELETED_OVERTIME_ID not provided" });
  }

  results.tests.randomId = await api("hr", "PUT", "/api/overtime/requests/999999999/approve", {});

  const assertions = {
    health: results.health.status === 200,
    hrSameCompanyApprove: !hrRequestId || statusIn(results.tests.hrSameCompanyApprove, [200]),
    crossCompanyApprove404: !results.fixtures.crossCompanyOvertimeId || statusIn(results.tests.crossCompanyApprove, [404]),
    managerDirectReportApprove: !managerDirectRequestId || statusIn(results.tests.managerDirectReportApprove, [200]),
    managerUnrelatedForbidden: !managerUnrelatedRequestId || statusIn(results.tests.managerUnrelatedApprove, [403, 404]),
    employeeForbidden: !employeeForbiddenRequestId || statusIn(results.tests.employeeForbidden, [403]),
    payrollForbidden: !payrollForbiddenRequestId || statusIn(results.tests.payrollForbidden, [403]),
    recruiterForbidden: !recruiterForbiddenRequestId || statusIn(results.tests.recruiterForbidden, [403]),
    deletedApprove404: !results.fixtures.deletedOvertimeId || statusIn(results.tests.deletedApprove, [404]),
    randomId404: statusIn(results.tests.randomId, [404]),
  };

  results.assertions = assertions;
  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length) results.errors.push({ area: "assertions", failed });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
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
