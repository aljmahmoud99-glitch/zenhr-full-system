const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-1-6-resignation-manager-scope-results.json");
const tokens = {};
const runDayOffset = 5000 + Math.floor(Date.now() / 1000) % 20000;

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

function testDate(offset) {
  return new Date(Date.UTC(2098, 0, 1 + runDayOffset + offset)).toISOString().slice(0, 10);
}

async function insertResignation(pool, {
  companyId,
  employeeId,
  createdByUserId = null,
  status = "pending",
  currentApprovalStep = 1,
  isDeleted = false,
  offset = 1,
  reason = "Phase 1.6 resignation manager-scope fixture",
}) {
  const resignationDate = testDate(offset);
  const lastWorkingDay = testDate(offset + 30);
  const inserted = await pool.query(
    `INSERT INTO resignations
      (company_id, employee_id, resignation_date, last_working_day, notice_period_days, notice_timer_start,
       notice_timer_end, reason, status, current_approval_step, created_by_user_id, is_deleted)
     VALUES ($1, $2, $3, $4, 30, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [companyId, employeeId, resignationDate, lastWorkingDay, reason, status, currentApprovalStep, createdByUserId, isDeleted],
  );
  const resignationId = inserted.rows[0].id;
  for (const step of [1, 2, 3]) {
    const role = step === 1 ? "hradmin" : step === 2 ? "manager" : "hradmin";
    const decision = currentApprovalStep && step < currentApprovalStep ? "approved" : "pending";
    await pool.query(
      `INSERT INTO resignation_approvals
        (company_id, resignation_id, approval_step, step_label, approver_role, decision)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, resignationId, step, `Phase 1.6 step ${step}`, role, decision],
    );
  }
  return resignationId;
}

async function createFixtures(base) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const foreign = await pool.query(
      `SELECT id, company_id FROM employees WHERE company_id <> $1 AND is_deleted=false ORDER BY id LIMIT 1`,
      [base.companyId],
    );
    const ids = {};
    ids.managerDirectApprove = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.directReportId,
      createdByUserId: base.hrUserId,
      status: "hr_approved",
      currentApprovalStep: 2,
      offset: 1,
      reason: "Phase 1.6 manager direct approve",
    });
    ids.managerUnrelatedApprove = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.unrelatedEmployeeId,
      createdByUserId: base.hrUserId,
      status: "hr_approved",
      currentApprovalStep: 2,
      offset: 3,
      reason: "Phase 1.6 manager unrelated approve blocked",
    });
    ids.managerUnrelatedReject = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.unrelatedEmployeeId,
      createdByUserId: base.hrUserId,
      status: "hr_approved",
      currentApprovalStep: 2,
      offset: 5,
      reason: "Phase 1.6 manager unrelated reject blocked",
    });
    ids.hrApprove = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "pending",
      currentApprovalStep: 1,
      offset: 7,
      reason: "Phase 1.6 hr approve",
    });
    ids.superadminApprove = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "pending",
      currentApprovalStep: 1,
      offset: 9,
      reason: "Phase 1.6 superadmin approve",
    });
    ids.employeeForbidden = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "pending",
      currentApprovalStep: 1,
      offset: 11,
      reason: "Phase 1.6 employee forbidden",
    });
    ids.payrollForbidden = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "manager_approved",
      currentApprovalStep: 3,
      offset: 13,
      reason: "Phase 1.6 payroll forbidden",
    });
    ids.recruiterForbidden = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "pending",
      currentApprovalStep: 1,
      offset: 15,
      reason: "Phase 1.6 recruiter forbidden",
    });
    ids.deleted = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "pending",
      currentApprovalStep: 1,
      isDeleted: true,
      offset: 17,
      reason: "Phase 1.6 deleted blocked",
    });
    ids.alreadyRejected = await insertResignation(pool, {
      companyId: base.companyId,
      employeeId: base.employeeEmployeeId,
      createdByUserId: base.hrUserId,
      status: "rejected",
      currentApprovalStep: null,
      offset: 19,
      reason: "Phase 1.6 terminal rejected guard",
    });
    if (foreign.rows[0]) {
      ids.crossCompany = await insertResignation(pool, {
        companyId: foreign.rows[0].company_id,
        employeeId: foreign.rows[0].id,
        createdByUserId: null,
        status: "pending",
        currentApprovalStep: 1,
        offset: 21,
        reason: "Phase 1.6 cross-company blocked",
      });
    }
    return ids;
  } finally {
    await pool.end();
  }
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    route: "PUT /api/resignations/:id/approve",
    relatedRoute: "PUT /api/resignations/:id/reject",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
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

  results.fixtures = {
    companyId: Number(results.logins.hr.user?.companyId),
    hrUserId: Number(results.logins.hr.user?.id),
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id || null,
    unrelatedEmployeeId: unrelated?.id || null,
  };

  if (!results.fixtures.directReportId || !results.fixtures.unrelatedEmployeeId) {
    results.status = "ERROR";
    results.errors.push({ area: "fixtures", message: "Missing direct report or unrelated employee fixture" });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  results.fixtureIds = await createFixtures(results.fixtures);
  const ids = results.fixtureIds;

  results.tests.managerDirectApprove = await api("manager", "PUT", `/api/resignations/${ids.managerDirectApprove}/approve`, { notes: "Phase 1.6 manager direct approve" });
  results.tests.managerUnrelatedApprove = await api("manager", "PUT", `/api/resignations/${ids.managerUnrelatedApprove}/approve`, { notes: "Phase 1.6 manager unrelated blocked" });
  results.tests.managerUnrelatedReject = await api("manager", "PUT", `/api/resignations/${ids.managerUnrelatedReject}/reject`, { notes: "Phase 1.6 manager unrelated reject blocked" });
  results.tests.hrApprove = await api("hr", "PUT", `/api/resignations/${ids.hrApprove}/approve`, { notes: "Phase 1.6 HR approve" });
  results.tests.superadminApprove = await api("admin", "PUT", `/api/resignations/${ids.superadminApprove}/approve`, { notes: "Phase 1.6 superadmin approve" });
  results.tests.employeeForbidden = await api("employee", "PUT", `/api/resignations/${ids.employeeForbidden}/approve`, { notes: "employee forbidden" });
  results.tests.payrollForbidden = await api("payroll", "PUT", `/api/resignations/${ids.payrollForbidden}/approve`, { notes: "payroll forbidden" });
  results.tests.recruiterForbidden = await api("recruiter", "PUT", `/api/resignations/${ids.recruiterForbidden}/approve`, { notes: "recruiter forbidden" });
  if (ids.crossCompany) {
    results.tests.crossCompany = await api("hr", "PUT", `/api/resignations/${ids.crossCompany}/approve`, { notes: "cross-company blocked" });
  } else {
    results.skipped.push({ test: "crossCompany", reason: "No foreign-company employee fixture exists" });
  }
  results.tests.deleted = await api("hr", "PUT", `/api/resignations/${ids.deleted}/approve`, { notes: "deleted blocked" });
  results.tests.random = await api("hr", "PUT", "/api/resignations/999999999/approve", { notes: "random blocked" });
  results.tests.alreadyRejected = await api("hr", "PUT", `/api/resignations/${ids.alreadyRejected}/approve`, { notes: "terminal guard" });

  const assertions = {
    health: results.health.status === 200,
    managerDirectApprove: statusIn(results.tests.managerDirectApprove, [200]),
    managerUnrelatedApproveBlocked: statusIn(results.tests.managerUnrelatedApprove, [403, 404]),
    managerUnrelatedRejectBlocked: statusIn(results.tests.managerUnrelatedReject, [403, 404]),
    hrApprove: statusIn(results.tests.hrApprove, [200]),
    crossCompanyBlocked: !ids.crossCompany || statusIn(results.tests.crossCompany, [404]),
    superadminApprove: statusIn(results.tests.superadminApprove, [200]),
    employeeForbidden: statusIn(results.tests.employeeForbidden, [403]),
    payrollForbidden: statusIn(results.tests.payrollForbidden, [403]),
    recruiterForbidden: statusIn(results.tests.recruiterForbidden, [403]),
    deletedBlocked: statusIn(results.tests.deleted, [404]),
    randomId404: statusIn(results.tests.random, [404]),
    alreadyRejectedGuard: statusIn(results.tests.alreadyRejected, [409]),
  };

  results.assertions = assertions;
  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length) results.errors.push({ area: "assertions", failed });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
    route: results.route,
    relatedRoute: results.relatedRoute,
    fixtureIds: results.fixtureIds,
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
