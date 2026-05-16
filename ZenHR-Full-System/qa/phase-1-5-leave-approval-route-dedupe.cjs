const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-1-5-leave-approval-route-dedupe-results.json");
const indexPath = path.join(__dirname, "..", "artifacts", "api-server", "src", "index.ts");
const servicePath = path.join(__dirname, "..", "artifacts", "api-server", "src", "leave-notifications.service.ts");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const tokens = {};
const runDayOffset = 3200 + Math.floor(Date.now() / 1000) % 20000;

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
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: start.toISOString().slice(0, 10),
  };
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function sourceCheck() {
  const indexSource = fs.readFileSync(indexPath, "utf8");
  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const legacyNeedle = `app.post("/api/leave/requests/:id/approve"`;
  const canonicalNeedle = `app.post("/api/leave/management/requests/:id/approve"`;
  const legacyForwarderNeedle = `forwardEnterpriseLeave(req, res, "POST", \`/api/leave/management/requests/`;
  return {
    legacyApproveRegistrationsInIndex: countOccurrences(indexSource, legacyNeedle),
    canonicalApproveRegistrationsInService: countOccurrences(serviceSource, canonicalNeedle),
    legacyForwarderPresent: indexSource.includes(legacyForwarderNeedle),
    independentLegacyBusinessMarkersRemaining: countOccurrences(indexSource, legacyNeedle) > 1,
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
    reason: `Phase 1.5 leave route dedupe ${label} ${Date.now()}`,
  });
}

async function insertBlockedFixtures(companyId, leaveTypeId) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const foreignEmployee = await pool.query(
      `SELECT id, company_id FROM employees WHERE company_id <> $1 AND is_deleted=false ORDER BY id LIMIT 1`,
      [companyId],
    );
    const sameCompanyEmployee = await pool.query(
      `SELECT id FROM employees WHERE company_id=$1 AND is_deleted=false ORDER BY id LIMIT 1`,
      [companyId],
    );
    const created = { crossCompanyLeaveId: null, deletedLeaveId: null };

    if (foreignEmployee.rows[0]) {
      const dates = dateRange(200);
      const inserted = await pool.query(
        `INSERT INTO leave_requests
          (company_id, employee_id, leave_type, start_date, end_date, total_days, reason, status, created_by, updated_by, is_deleted)
         VALUES ($1, $2, $3, $4, $5, 1, $6, 'pending', NULL, NULL, false)
         RETURNING id`,
        [
          foreignEmployee.rows[0].company_id,
          foreignEmployee.rows[0].id,
          String(leaveTypeId),
          dates.startDate,
          dates.endDate,
          `Phase 1.5 cross-company blocked fixture ${Date.now()}`,
        ],
      );
      created.crossCompanyLeaveId = inserted.rows[0]?.id || null;
    }

    if (sameCompanyEmployee.rows[0]) {
      const dates = dateRange(202);
      const inserted = await pool.query(
        `INSERT INTO leave_requests
          (company_id, employee_id, leave_type, start_date, end_date, total_days, reason, status, created_by, updated_by, is_deleted)
         VALUES ($1, $2, $3, $4, $5, 1, $6, 'pending', NULL, NULL, true)
         RETURNING id`,
        [
          companyId,
          sameCompanyEmployee.rows[0].id,
          String(leaveTypeId),
          dates.startDate,
          dates.endDate,
          `Phase 1.5 deleted blocked fixture ${Date.now()}`,
        ],
      );
      created.deletedLeaveId = inserted.rows[0]?.id || null;
    }

    return created;
  } finally {
    await pool.end();
  }
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    health: await raw("GET", "/api/healthz"),
    routeRegistrations: sourceCheck(),
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
  let blockedFixtures = {};
  try {
    blockedFixtures = await insertBlockedFixtures(Number(results.logins.hr.user?.companyId), leaveTypeId);
  } catch (error) {
    results.skipped.push({ test: "databaseBlockedFixtures", reason: error?.message || "database fixture setup failed" });
  }

  results.fixtures = {
    hrEmployeeCount: hrList.length,
    managerEmployeeCount: managerList.length,
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id || null,
    unrelatedEmployeeId: unrelated?.id || null,
    leaveTypeId,
    ...blockedFixtures,
  };

  results.setup.legacyValidRequest = await createLeave(employeeEmployeeId, leaveTypeId, "legacy-valid", 1);
  results.setup.managementValidRequest = await createLeave(employeeEmployeeId, leaveTypeId, "management-valid", 3);
  results.setup.managerUnrelatedRequest = await createLeave(results.fixtures.unrelatedEmployeeId, leaveTypeId, "manager-unrelated", 5);
  results.setup.employeeForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "employee-forbidden", 7);
  results.setup.payrollForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "payroll-forbidden", 9);
  results.setup.recruiterForbiddenRequest = await createLeave(employeeEmployeeId, leaveTypeId, "recruiter-forbidden", 11);
  results.setup.alreadyApprovedRequest = await createLeave(employeeEmployeeId, leaveTypeId, "already-approved", 13);

  const ids = Object.fromEntries(Object.entries(results.setup).map(([key, value]) => [key, value?.body?.data?.id || null]));

  if (ids.legacyValidRequest) results.tests.legacyApprove = await api("hr", "POST", `/api/leave/requests/${ids.legacyValidRequest}/approve`, { notes: "Phase 1.5 legacy approval" });
  else results.skipped.push({ test: "legacyApprove", reason: "failed to create legacy-route fixture" });

  if (ids.managementValidRequest) results.tests.managementApprove = await api("hr", "POST", `/api/leave/management/requests/${ids.managementValidRequest}/approve`, { notes: "Phase 1.5 management approval" });
  else results.skipped.push({ test: "managementApprove", reason: "failed to create management-route fixture" });

  if (ids.managerUnrelatedRequest) results.tests.managerUnrelatedApprove = await api("manager", "POST", `/api/leave/requests/${ids.managerUnrelatedRequest}/approve`, { notes: "Phase 1.5 manager unrelated" });
  else results.skipped.push({ test: "managerUnrelatedApprove", reason: "no unrelated employee fixture available" });

  if (ids.employeeForbiddenRequest) results.tests.employeeForbidden = await api("employee", "POST", `/api/leave/requests/${ids.employeeForbiddenRequest}/approve`, {});
  if (ids.payrollForbiddenRequest) results.tests.payrollForbidden = await api("payroll", "POST", `/api/leave/requests/${ids.payrollForbiddenRequest}/approve`, {});
  if (ids.recruiterForbiddenRequest) results.tests.recruiterForbidden = await api("recruiter", "POST", `/api/leave/requests/${ids.recruiterForbiddenRequest}/approve`, {});

  if (ids.alreadyApprovedRequest) {
    results.setup.alreadyApprovedFirst = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "first approval" });
    results.setup.alreadyApprovedSecond = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "second approval completes workflow when needed" });
    results.tests.alreadyApprovedThird = await api("hr", "POST", `/api/leave/requests/${ids.alreadyApprovedRequest}/approve`, { notes: "third approval should not reapply" });
  } else {
    results.skipped.push({ test: "alreadyApprovedThird", reason: "failed to create already-approved fixture" });
  }

  if (results.fixtures.crossCompanyLeaveId) results.tests.crossCompanyApprove = await api("hr", "POST", `/api/leave/requests/${results.fixtures.crossCompanyLeaveId}/approve`, {});
  else results.skipped.push({ test: "crossCompanyApprove", reason: "no cross-company DB fixture available" });

  if (results.fixtures.deletedLeaveId) results.tests.deletedApprove = await api("hr", "POST", `/api/leave/requests/${results.fixtures.deletedLeaveId}/approve`, {});
  else results.skipped.push({ test: "deletedApprove", reason: "no soft-deleted DB fixture available" });

  const assertions = {
    health: results.health.status === 200,
    staticLegacyRouteSingleForwarder: results.routeRegistrations.legacyApproveRegistrationsInIndex === 1
      && results.routeRegistrations.legacyForwarderPresent
      && !results.routeRegistrations.independentLegacyBusinessMarkersRemaining,
    staticCanonicalRoutePresent: results.routeRegistrations.canonicalApproveRegistrationsInService === 1,
    legacyApproveWorks: !ids.legacyValidRequest || statusIn(results.tests.legacyApprove, [200]),
    managementApproveWorks: !ids.managementValidRequest || statusIn(results.tests.managementApprove, [200]),
    crossCompanyBlocked: !!results.fixtures.crossCompanyLeaveId && statusIn(results.tests.crossCompanyApprove, [404]),
    managerUnrelatedForbidden: !ids.managerUnrelatedRequest || statusIn(results.tests.managerUnrelatedApprove, [403, 404]),
    employeeForbidden: !ids.employeeForbiddenRequest || statusIn(results.tests.employeeForbidden, [403]),
    payrollForbidden: !ids.payrollForbiddenRequest || statusIn(results.tests.payrollForbidden, [403]),
    recruiterForbidden: !ids.recruiterForbiddenRequest || statusIn(results.tests.recruiterForbidden, [403]),
    deletedBlocked: !!results.fixtures.deletedLeaveId && statusIn(results.tests.deletedApprove, [404]),
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
    routeRegistrations: results.routeRegistrations,
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
