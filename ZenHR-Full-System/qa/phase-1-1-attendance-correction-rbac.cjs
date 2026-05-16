const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "phase-1-1-attendance-correction-rbac-results.json");
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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function correctionPayload(employeeId, label) {
  const date = todayDate();
  return {
    employeeId,
    requestType: "time_correction",
    requestDate: date,
    requestedClockIn: `${date}T06:30:00.000Z`,
    requestedClockOut: `${date}T14:30:00.000Z`,
    reason: `Phase 1.1 attendance correction RBAC ${label} ${Date.now()}`,
  };
}

function meCorrectionPayload(label) {
  const { employeeId: _unused, ...payload } = correctionPayload(undefined, label);
  return payload;
}

function statusIn(result, allowed) {
  return allowed.includes(result?.status);
}

function pickFixture(logins, hrEmployees, managerEmployees) {
  const managerEmployeeId = logins.manager.user?.employeeId;
  const employeeEmployeeId = logins.employee.user?.employeeId;
  const directReport =
    managerEmployees.find((employee) => Number(employee.id) !== Number(managerEmployeeId))
    || hrEmployees.find((employee) => Number(employee.directManagerId) === Number(managerEmployeeId));
  const unrelated =
    hrEmployees.find((employee) =>
      Number(employee.id) !== Number(managerEmployeeId)
      && Number(employee.id) !== Number(directReport?.id)
      && Number(employee.directManagerId) !== Number(managerEmployeeId))
    || hrEmployees.find((employee) => Number(employee.id) !== Number(managerEmployeeId) && Number(employee.id) !== Number(directReport?.id));

  return {
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id ?? employeeEmployeeId,
    unrelatedEmployeeId: unrelated?.id ?? logins.hr.user?.employeeId,
  };
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    tests: {},
    skipped: [],
    errors: [],
  };

  results.logins.hr = await login("hr");
  results.logins.payroll = await login("payroll");
  results.logins.manager = await login("manager");
  results.logins.employee = await login("employee");
  results.logins.recruiter = await login("recruiter");
  results.logins.admin = await login("admin");

  const requiredLoginOk = ["hr", "payroll", "manager", "employee", "recruiter", "admin"]
    .every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!requiredLoginOk) {
    results.status = "ERROR";
    results.errors.push({ area: "login", logins: results.logins });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const [hrList, managerList] = await Promise.all([
    api("hr", "GET", "/api/employees?pageSize=200"),
    api("manager", "GET", "/api/employees?pageSize=200"),
  ]);
  const hrEmployees = Array.isArray(hrList.body?.data) ? hrList.body.data : [];
  const managerEmployees = Array.isArray(managerList.body?.data) ? managerList.body.data : [];
  results.fixtures = {
    hrEmployeeCount: hrEmployees.length,
    managerEmployeeCount: managerEmployees.length,
    ...pickFixture(results.logins, hrEmployees, managerEmployees),
  };

  const ownEmployeeId = results.logins.employee.user.employeeId;
  const directReportId = results.fixtures.directReportId;
  const unrelatedEmployeeId = results.fixtures.unrelatedEmployeeId;
  const sameCompanyEmployeeId = ownEmployeeId || directReportId || results.logins.hr.user.employeeId;
  const nonexistentEmployeeId = 999999999;

  if (!ownEmployeeId) results.skipped.push({ test: "employee-own", reason: "employee fixture has no employeeId" });
  if (!directReportId) results.skipped.push({ test: "manager-direct-report", reason: "no direct-report fixture found" });
  if (!unrelatedEmployeeId) results.skipped.push({ test: "manager-unrelated", reason: "no unrelated employee fixture found" });

  if (ownEmployeeId) {
    results.tests.employeeOwnViaMe = await api("employee", "POST", "/api/attendance/me/requests", meCorrectionPayload("employee-own-me"));
    results.tests.employeeOtherViaGeneric = await api("employee", "POST", "/api/attendance/requests", correctionPayload(unrelatedEmployeeId || directReportId || nonexistentEmployeeId, "employee-other-generic"));
  }
  if (directReportId) {
    results.tests.managerDirectReport = await api("manager", "POST", "/api/attendance/requests", correctionPayload(directReportId, "manager-direct-report"));
  }
  if (unrelatedEmployeeId) {
    results.tests.managerUnrelated = await api("manager", "POST", "/api/attendance/requests", correctionPayload(unrelatedEmployeeId, "manager-unrelated"));
  }
  if (sameCompanyEmployeeId) {
    results.tests.hrSameCompany = await api("hr", "POST", "/api/attendance/requests", correctionPayload(sameCompanyEmployeeId, "hr-same-company"));
    results.tests.superadminSameCompany = await api("admin", "POST", "/api/attendance/requests", correctionPayload(sameCompanyEmployeeId, "superadmin-same-company"));
    results.tests.payrollForbidden = await api("payroll", "POST", "/api/attendance/requests", correctionPayload(sameCompanyEmployeeId, "payroll-forbidden"));
    results.tests.recruiterForbidden = await api("recruiter", "POST", "/api/attendance/requests", correctionPayload(sameCompanyEmployeeId, "recruiter-forbidden"));
  }
  results.tests.missingEmployeeId = await api("hr", "POST", "/api/attendance/requests", meCorrectionPayload("missing-employee-id"));
  results.tests.invalidEmployeeId = await api("hr", "POST", "/api/attendance/requests", correctionPayload("not-a-number", "invalid-employee-id"));
  results.tests.nonexistentEmployeeId = await api("hr", "POST", "/api/attendance/requests", correctionPayload(nonexistentEmployeeId, "nonexistent-employee-id"));

  const assertions = {
    health: results.health.status === 200,
    employeeOwnViaMe: !ownEmployeeId || statusIn(results.tests.employeeOwnViaMe, [201]),
    employeeOtherViaGeneric: !ownEmployeeId || statusIn(results.tests.employeeOtherViaGeneric, [403, 404]),
    managerDirectReport: !directReportId || statusIn(results.tests.managerDirectReport, [201]),
    managerUnrelated: !unrelatedEmployeeId || statusIn(results.tests.managerUnrelated, [403, 404]),
    hrSameCompany: !sameCompanyEmployeeId || statusIn(results.tests.hrSameCompany, [201]),
    superadminSameCompany: !sameCompanyEmployeeId || statusIn(results.tests.superadminSameCompany, [201]),
    payrollForbidden: !sameCompanyEmployeeId || statusIn(results.tests.payrollForbidden, [403]),
    recruiterForbidden: !sameCompanyEmployeeId || statusIn(results.tests.recruiterForbidden, [403]),
    missingEmployeeId: statusIn(results.tests.missingEmployeeId, [400, 404]),
    invalidEmployeeId: statusIn(results.tests.invalidEmployeeId, [400, 404]),
    nonexistentEmployeeId: statusIn(results.tests.nonexistentEmployeeId, [403, 404]),
  };

  results.assertions = assertions;
  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length > 0) results.errors.push({ area: "assertions", failed });

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
