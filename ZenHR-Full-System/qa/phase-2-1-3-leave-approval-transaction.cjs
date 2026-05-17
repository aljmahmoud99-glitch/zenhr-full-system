const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-2-1-3-leave-approval-transaction-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const runDayOffset = 39000 + Math.floor(Date.now() / 1000) % 20000;

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
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
  return new Date(Date.UTC(2110, 0, 1 + runDayOffset + offset)).toISOString().slice(0, 10);
}

async function activeLeaveType(pool, companyId) {
  const result = await pool.query(
    `SELECT id, code FROM enterprise_leave_types
      WHERE company_id=$1 AND is_deleted=false AND is_active=true
      ORDER BY id LIMIT 1`,
    [companyId],
  );
  return result.rows[0] || null;
}

async function ensureLegacyPolicy(pool, companyId, leaveType) {
  const existing = await pool.query(
    `SELECT id FROM leave_policies WHERE company_id=$1 AND leave_type=$2 AND is_deleted=false ORDER BY id LIMIT 1`,
    [companyId, leaveType.code],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO leave_policies (company_id, leave_type, name_ar, name_en, days_per_year)
     VALUES ($1,$2,'اختبار','Phase 2.1.3 Policy',30)
     RETURNING id`,
    [companyId, leaveType.code],
  );
  return inserted.rows[0].id;
}

async function balanceSnapshot(pool, employeeId, policyId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(used_days),0)::float AS used_days,
            COALESCE(SUM(pending_days),0)::float AS pending_days
       FROM leave_balances
      WHERE employee_id=$1 AND leave_policy_id=$2`,
    [employeeId, policyId],
  );
  return {
    usedDays: Number(result.rows[0]?.used_days || 0),
    pendingDays: Number(result.rows[0]?.pending_days || 0),
  };
}

async function insertLeave(pool, {
  companyId,
  employeeId,
  leaveTypeId,
  status = "pending",
  isDeleted = false,
  offset = 1,
  days = 2,
  approverRole = "hradmin",
  createdBy = null,
}) {
  const inserted = await pool.query(
    `INSERT INTO leave_requests
      (company_id, employee_id, leave_type, start_date, end_date, total_days, total_hours,
       duration_unit, reason, status, current_approval_step, payroll_impact_type, created_by, updated_by, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'day',$8,$9,$10,'none',$11,$11,$12)
     RETURNING id`,
    [
      companyId,
      employeeId,
      String(leaveTypeId),
      day(offset),
      day(offset + Math.max(0, Math.trunc(days) - 1)),
      days,
      days * 8,
      `Phase 2.1.3 approval transaction ${runId}`,
      status,
      approverRole,
      createdBy,
      isDeleted,
    ],
  );
  const id = inserted.rows[0].id;
  await pool.query(
    `INSERT INTO leave_request_approval_steps
      (company_id, leave_request_id, step_order, approver_role, decision)
     VALUES ($1,$2,1,$3,$4)`,
    [companyId, id, approverRole, status === "approved" ? "approved" : "pending"],
  );
  return id;
}

async function ensureForeignLeave(pool, companyId, leaveTypeId) {
  const employee = await pool.query(`SELECT id, company_id FROM employees WHERE company_id<>$1 AND is_deleted=false ORDER BY id LIMIT 1`, [companyId]);
  if (!employee.rows[0]) return null;
  return insertLeave(pool, {
    companyId: employee.rows[0].company_id,
    employeeId: employee.rows[0].id,
    leaveTypeId,
    offset: 80,
  });
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    route: "POST /api/leave/management/requests/:id/approve",
    compatibilityRoute: "POST /api/leave/requests/:id/approve forwards unchanged",
    transactionStrategy: "single PostgreSQL transaction on one pool client with BEGIN/COMMIT/ROLLBACK",
    concurrencyProtection: "SELECT leave_requests ... FOR UPDATE plus locked pending approval step before status/balance mutation",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    balance: {},
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

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const companyId = Number(results.logins.hr.user.companyId);
    const employeeId = Number(results.logins.employee.user.employeeId);
    const hrUserId = Number(results.logins.hr.user.id);
    const managerEmployeeId = Number(results.logins.manager.user.employeeId);
    const [hrEmployees, managerEmployees] = await Promise.all([
      api("hr", "GET", "/api/employees?pageSize=200"),
      api("manager", "GET", "/api/employees?pageSize=200"),
    ]);
    const hrList = dataItems(hrEmployees);
    const managerList = dataItems(managerEmployees);
    const directReport = managerList.find((employee) => Number(employee.id) !== managerEmployeeId)
      || hrList.find((employee) => Number(employee.directManagerId) === managerEmployeeId);
    const unrelated = hrList.find((employee) =>
      Number(employee.id) !== managerEmployeeId
      && Number(employee.id) !== employeeId
      && Number(employee.id) !== Number(directReport?.id)
      && Number(employee.directManagerId) !== managerEmployeeId);
    const leaveType = await activeLeaveType(pool, companyId);
    if (!leaveType || !employeeId || !unrelated?.id) {
      results.status = "NO-GO";
      results.errors.push({ area: "fixtures", message: "Missing leave type, employee, or unrelated employee fixture" });
      fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
      process.exit(1);
    }
    const policyId = await ensureLegacyPolicy(pool, companyId, leaveType);

    const normalId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, offset: 1, days: 1, createdBy: hrUserId });
    const concurrentId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, offset: 5, days: 2, createdBy: hrUserId });
    const alreadyApprovedId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, status: "approved", offset: 10, days: 1, createdBy: hrUserId });
    const deletedId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, isDeleted: true, offset: 12, days: 1, createdBy: hrUserId });
    const managerUnrelatedId = await insertLeave(pool, { companyId, employeeId: unrelated.id, leaveTypeId: leaveType.id, approverRole: "manager", offset: 14, days: 1, createdBy: hrUserId });
    const employeeForbiddenId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, offset: 16, days: 1, createdBy: hrUserId });
    const payrollForbiddenId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, offset: 18, days: 1, createdBy: hrUserId });
    const recruiterForbiddenId = await insertLeave(pool, { companyId, employeeId, leaveTypeId: leaveType.id, offset: 20, days: 1, createdBy: hrUserId });
    const crossCompanyId = await ensureForeignLeave(pool, companyId, leaveType.id);

    results.fixtures = {
      companyId,
      employeeId,
      leaveTypeId: leaveType.id,
      leaveTypeCode: leaveType.code,
      policyId,
      normalId,
      concurrentId,
      alreadyApprovedId,
      deletedId,
      managerUnrelatedId,
      employeeForbiddenId,
      payrollForbiddenId,
      recruiterForbiddenId,
      crossCompanyId,
    };

    results.tests.normalApproval = await api("hr", "POST", `/api/leave/requests/${normalId}/approve`, { notes: "normal approval" });

    results.balance.beforeConcurrent = await balanceSnapshot(pool, employeeId, policyId);
    const concurrentResults = await Promise.all([
      api("hr", "POST", `/api/leave/requests/${concurrentId}/approve`, { notes: "concurrent A" }),
      api("hr", "POST", `/api/leave/requests/${concurrentId}/approve`, { notes: "concurrent B" }),
    ]);
    results.tests.concurrentA = concurrentResults[0];
    results.tests.concurrentB = concurrentResults[1];
    results.balance.afterConcurrent = await balanceSnapshot(pool, employeeId, policyId);

    if (crossCompanyId) results.tests.crossCompany = await api("hr", "POST", `/api/leave/requests/${crossCompanyId}/approve`, {});
    else results.skipped.push({ test: "crossCompany", reason: "No foreign-company employee fixture available" });
    results.tests.deleted = await api("hr", "POST", `/api/leave/requests/${deletedId}/approve`, {});
    results.tests.alreadyApproved = await api("hr", "POST", `/api/leave/requests/${alreadyApprovedId}/approve`, {});
    results.tests.managerUnrelated = await api("manager", "POST", `/api/leave/requests/${managerUnrelatedId}/approve`, {});
    results.tests.employeeForbidden = await api("employee", "POST", `/api/leave/requests/${employeeForbiddenId}/approve`, {});
    results.tests.payrollForbidden = await api("payroll", "POST", `/api/leave/requests/${payrollForbiddenId}/approve`, {});
    results.tests.recruiterForbidden = await api("recruiter", "POST", `/api/leave/requests/${recruiterForbiddenId}/approve`, {});

    const concurrentStatuses = concurrentResults.map((result) => result.status).sort((a, b) => a - b);
    const usedDelta = Math.round((results.balance.afterConcurrent.usedDays - results.balance.beforeConcurrent.usedDays) * 100) / 100;
    const assertions = {
      health: results.health.status === 200,
      normalApprovalSucceeds: statusIn(results.tests.normalApproval, [200]),
      concurrentOneSucceeds: concurrentStatuses.filter((status) => status === 200).length === 1,
      concurrentDuplicateFailsSafely: concurrentStatuses.filter((status) => [400, 409].includes(status)).length === 1,
      balanceChangedExactlyOnce: usedDelta === 2,
      crossCompanyBlocked: !crossCompanyId || statusIn(results.tests.crossCompany, [404]),
      softDeletedBlocked: statusIn(results.tests.deleted, [404]),
      alreadyApprovedConflict: statusIn(results.tests.alreadyApproved, [409]),
      managerUnrelatedBlocked: statusIn(results.tests.managerUnrelated, [403, 404]),
      employeeForbidden: statusIn(results.tests.employeeForbidden, [403]),
      payrollForbidden: statusIn(results.tests.payrollForbidden, [403]),
      recruiterForbidden: statusIn(results.tests.recruiterForbidden, [403]),
    };

    results.assertions = assertions;
    results.evidence = { concurrentStatuses, usedDelta };
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
    evidence: results.evidence,
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
