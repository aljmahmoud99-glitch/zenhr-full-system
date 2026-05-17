const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-2-1-2-leave-overlap-scope-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const runDayOffset = 32000 + Math.floor(Date.now() / 1000) % 20000;

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

function day(offset) {
  return new Date(Date.UTC(2108, 0, 1 + runDayOffset + offset)).toISOString().slice(0, 10);
}

function leaveBody(employeeId, leaveTypeId, startOffset, endOffset, label, totalDays = 1) {
  return {
    employeeId,
    leaveTypeId,
    startDate: day(startOffset),
    endDate: day(endOffset),
    durationUnit: "day",
    totalDays,
    reason: `Phase 2.1.2 ${label} ${runId}`,
  };
}

async function activeLeaveTypeId() {
  const types = await api("hr", "GET", "/api/leave/management/types");
  return dataItems(types).find((type) => type.isActive !== false)?.id || dataItems(types)[0]?.id || null;
}

async function insertEmployee(pool, companyId, { directManagerId = null, isDeleted = false, suffix = "fixture" } = {}) {
  const code = `P212-${String(Date.now()).slice(-8)}-${Math.floor(Math.random() * 10000)}`;
  const inserted = await pool.query(
    `INSERT INTO employees
      (company_id, employee_code, first_name_ar, last_name_ar, first_name_en, last_name_en,
       gender, date_of_birth, direct_manager_id, employment_type, hire_date, contract_type,
       employment_status, basic_salary, is_deleted)
     VALUES ($1,$2,'اختبار','نطاق',$3,'Leave','male','1990-01-01',$4,'fulltime','2020-01-01','permanent','active',500,$5)
     RETURNING id`,
    [companyId, code, `Phase212 ${suffix}`, directManagerId, isDeleted],
  );
  return inserted.rows[0].id;
}

async function ensureForeignEmployee(pool, companyId) {
  const existing = await pool.query(
    `SELECT id FROM employees WHERE company_id<>$1 AND is_deleted=false ORDER BY id LIMIT 1`,
    [companyId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const company = await pool.query(
    `INSERT INTO companies (name_ar, name_en, email)
     VALUES ('شركة اختبار', $1, $2)
     RETURNING id`,
    [`Phase 2.1.2 Foreign ${runId}`, `phase212-${runId}@example.test`],
  );
  return insertEmployee(pool, company.rows[0].id, { suffix: "foreign" });
}

async function insertHistoricalLeave(pool, { companyId, employeeId, leaveTypeId, startOffset, endOffset, status, isDeleted = false }) {
  const inserted = await pool.query(
    `INSERT INTO leave_requests
      (company_id, employee_id, leave_type, start_date, end_date, total_days, total_hours,
       duration_unit, reason, status, current_approval_step, payroll_impact_type, is_deleted)
     VALUES ($1,$2,$3,$4,$5,1,8,'day',$6,$7,'manager','none',$8)
     RETURNING id`,
    [companyId, employeeId, String(leaveTypeId), day(startOffset), day(endOffset), `Phase 2.1.2 historical ${status} ${runId}`, status, isDeleted],
  );
  return inserted.rows[0].id;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    route: "POST /api/leave/requests -> POST /api/leave/management/requests",
    overlapLogic: "inclusive date overlap blocks pending, approved, and manager_approved; rejected, cancelled, and deleted requests do not block",
    scopeRules: {
      employee: "self only",
      manager: "self or direct reports only",
      hradmin: "same-company employees",
      superadmin: "same-company employees",
      payrolladmin: "forbidden",
      recruiter: "forbidden",
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
  const loginOk = ["hr", "payroll", "manager", "employee", "recruiter", "admin"].every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!loginOk) {
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
  const companyId = Number(results.logins.hr.user?.companyId);
  const managerEmployeeId = Number(results.logins.manager.user?.employeeId);
  const employeeEmployeeId = Number(results.logins.employee.user?.employeeId);
  const directReport = managerList.find((employee) => Number(employee.id) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.directManagerId) === managerEmployeeId);
  const unrelated = hrList.find((employee) =>
    Number(employee.id) !== managerEmployeeId
    && Number(employee.id) !== employeeEmployeeId
    && Number(employee.id) !== Number(directReport?.id)
    && Number(employee.directManagerId) !== managerEmployeeId)
    || hrList.find((employee) => Number(employee.id) !== managerEmployeeId && Number(employee.id) !== Number(directReport?.id));
  const leaveTypeId = await activeLeaveTypeId();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const deletedEmployeeId = await insertEmployee(pool, companyId, { isDeleted: true, suffix: "deleted" });
    const foreignEmployeeId = await ensureForeignEmployee(pool, companyId);
    results.fixtures = {
      companyId,
      leaveTypeId,
      employeeEmployeeId,
      managerEmployeeId,
      directReportId: directReport?.id || null,
      unrelatedEmployeeId: unrelated?.id || null,
      foreignEmployeeId,
      deletedEmployeeId,
    };

    if (!leaveTypeId || !employeeEmployeeId || !directReport?.id || !unrelated?.id) {
      results.status = "NO-GO";
      results.errors.push({ area: "fixtures", message: "Missing required employee/direct-report/unrelated/leave type fixtures", fixtures: results.fixtures });
      fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
      process.exit(1);
    }

    results.tests.employeeSelfCreate = await api("employee", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 1, 1, "employee-self"));
    results.tests.employeeOtherCreate = await api("employee", "POST", "/api/leave/requests", leaveBody(unrelated.id, leaveTypeId, 3, 3, "employee-other"));
    results.tests.managerDirectCreate = await api("manager", "POST", "/api/leave/requests", leaveBody(directReport.id, leaveTypeId, 5, 5, "manager-direct"));
    results.tests.managerUnrelatedCreate = await api("manager", "POST", "/api/leave/requests", leaveBody(unrelated.id, leaveTypeId, 7, 7, "manager-unrelated"));
    results.tests.hrSameCompanyCreate = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 9, 9, "hr-same-company"));
    results.tests.payrollForbidden = await api("payroll", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 11, 11, "payroll-forbidden"));
    results.tests.recruiterForbidden = await api("recruiter", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 13, 13, "recruiter-forbidden"));
    results.tests.crossCompanyEmployee = await api("hr", "POST", "/api/leave/requests", leaveBody(foreignEmployeeId, leaveTypeId, 15, 15, "cross-company"));
    results.tests.deletedEmployee = await api("hr", "POST", "/api/leave/requests", leaveBody(deletedEmployeeId, leaveTypeId, 17, 17, "deleted-employee"));

    results.setup.basePending = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 30, 34, "base-pending", 5));
    results.tests.exactOverlap = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 30, 34, "exact-overlap", 5));
    results.tests.partialOverlap = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 28, 31, "partial-overlap", 4));
    results.tests.containedOverlap = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 31, 32, "contained-overlap", 2));
    results.tests.adjacentTouchingOverlap = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 34, 36, "adjacent-touching-overlap", 3));
    results.tests.nonOverlapping = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 35, 36, "non-overlapping", 2));

    results.setup.rejectedHistoricalId = await insertHistoricalLeave(pool, {
      companyId,
      employeeId: employeeEmployeeId,
      leaveTypeId,
      startOffset: 80,
      endOffset: 82,
      status: "rejected",
    });
    results.tests.rejectedHistoricalDoesNotBlock = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 80, 82, "rejected-history-not-blocking", 3));

    results.setup.deletedHistoricalId = await insertHistoricalLeave(pool, {
      companyId,
      employeeId: employeeEmployeeId,
      leaveTypeId,
      startOffset: 90,
      endOffset: 92,
      status: "pending",
      isDeleted: true,
    });
    results.tests.deletedHistoricalDoesNotBlock = await api("hr", "POST", "/api/leave/requests", leaveBody(employeeEmployeeId, leaveTypeId, 90, 92, "deleted-history-not-blocking", 3));

    const assertions = {
      health: results.health.status === 200,
      employeeSelfCreateSucceeds: statusIn(results.tests.employeeSelfCreate, [201]),
      employeeOtherForbidden: statusIn(results.tests.employeeOtherCreate, [403]),
      managerDirectReportCreateSucceeds: statusIn(results.tests.managerDirectCreate, [201]),
      managerUnrelatedForbidden: statusIn(results.tests.managerUnrelatedCreate, [403]),
      hrSameCompanyCreateSucceeds: statusIn(results.tests.hrSameCompanyCreate, [201]),
      payrollForbidden: statusIn(results.tests.payrollForbidden, [403]),
      recruiterForbidden: statusIn(results.tests.recruiterForbidden, [403]),
      crossCompanyEmployee404: statusIn(results.tests.crossCompanyEmployee, [404]),
      deletedEmployee404: statusIn(results.tests.deletedEmployee, [404]),
      exactOverlapRejected: statusIn(results.tests.exactOverlap, [409]),
      partialOverlapRejected: statusIn(results.tests.partialOverlap, [409]),
      containedOverlapRejected: statusIn(results.tests.containedOverlap, [409]),
      adjacentTouchingOverlapRejected: statusIn(results.tests.adjacentTouchingOverlap, [409]),
      rejectedHistoricalDoesNotBlock: statusIn(results.tests.rejectedHistoricalDoesNotBlock, [201]),
      deletedHistoricalDoesNotBlock: statusIn(results.tests.deletedHistoricalDoesNotBlock, [201]),
      nonOverlappingSucceeds: statusIn(results.tests.nonOverlapping, [201]),
    };

    results.assertions = assertions;
    const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
    results.status = failed.length === 0 ? "GO" : "NO-GO";
    if (failed.length) results.errors.push({ area: "assertions", failed });
  } finally {
    await pool.end();
  }

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
    fixtures: results.fixtures,
    assertions: results.assertions,
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
