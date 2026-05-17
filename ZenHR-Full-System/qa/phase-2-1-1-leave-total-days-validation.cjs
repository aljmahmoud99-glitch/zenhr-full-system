const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-2-1-1-leave-total-days-validation-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const runDayOffset = 25000 + Math.floor(Date.now() / 1000) % 20000;

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
  const start = new Date(Date.UTC(2105, 0, 1 + runDayOffset + offset));
  const end = new Date(Date.UTC(2105, 0, 1 + runDayOffset + offset));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function activeLeaveTypeId() {
  const types = await api("hr", "GET", "/api/leave/management/types");
  return dataItems(types).find((type) => type.isActive !== false)?.id || dataItems(types)[0]?.id || null;
}

async function balanceSnapshot(pool, companyId, employeeId, leaveTypeId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(lb.used_days),0)::float AS used_days,
            COALESCE(SUM(lb.pending_days),0)::float AS pending_days
       FROM leave_balances lb
       JOIN leave_policies lp ON lp.id=lb.leave_policy_id
      WHERE lp.company_id=$1
        AND lb.employee_id=$2
        AND lp.leave_type=(SELECT code FROM enterprise_leave_types WHERE company_id=$1 AND id=$3)`,
    [companyId, employeeId, leaveTypeId],
  );
  return {
    usedDays: Number(result.rows[0]?.used_days || 0),
    pendingDays: Number(result.rows[0]?.pending_days || 0),
  };
}

async function insertInvalidLeave(pool, { companyId, employeeId, leaveTypeId, createdBy }) {
  const dates = dateRange(60);
  const inserted = await pool.query(
    `INSERT INTO leave_requests
      (company_id, employee_id, leave_type, start_date, end_date, total_days, total_hours,
       duration_unit, reason, status, current_approval_step, payroll_impact_type, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,-3,0,'day',$6,'pending','hradmin','none',$7,$7)
     RETURNING id`,
    [companyId, employeeId, String(leaveTypeId), dates.startDate, dates.endDate, `Phase 2.1.1 invalid legacy ${runId}`, createdBy],
  );
  const id = inserted.rows[0].id;
  await pool.query(
    `INSERT INTO leave_request_approval_steps (company_id, leave_request_id, step_order, approver_role)
     VALUES ($1,$2,1,'hradmin')
     ON CONFLICT DO NOTHING`,
    [companyId, id],
  );
  return id;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    routes: [
      "POST /api/leave/requests",
      "POST /api/leave/management/requests",
      "POST /api/leave/requests/:id/approve",
      "POST /api/leave/management/requests/:id/approve",
    ],
    validationRules: {
      totalDays: "finite positive number > 0 and <= 365",
      rejected: ["0", "negative", "NaN/non-numeric", "Infinity", "extremely large values"],
      approvalGuard: "approval rejects persisted leave_requests with invalid total_days before balance mutation",
    },
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    balance: {},
    tests: {},
    skipped: [],
    errors: [],
  };

  for (const role of ["hr", "employee"]) results.logins[role] = await login(role);
  const requiredLoginOk = ["hr", "employee"].every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!requiredLoginOk) {
    results.status = "ERROR";
    results.errors.push({ area: "login", logins: results.logins });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const employees = await api("hr", "GET", "/api/employees?pageSize=200");
  const employeeId = Number(results.logins.employee.user?.employeeId) || Number(dataItems(employees)[0]?.id);
  const companyId = Number(results.logins.hr.user?.companyId);
  const leaveTypeId = await activeLeaveTypeId();
  results.fixtures = { companyId, employeeId, leaveTypeId };

  if (!employeeId || !leaveTypeId) {
    results.status = "NO-GO";
    results.errors.push({ area: "fixtures", message: "Missing employee or active enterprise leave type fixture" });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const baseBody = (offset, totalDays) => ({
      employeeId,
      leaveTypeId,
      ...dateRange(offset),
      durationUnit: "day",
      totalDays,
      reason: `Phase 2.1.1 totalDays validation ${runId}`,
    });

    results.tests.validPositive = await api("hr", "POST", "/api/leave/requests", baseBody(1, 1));

    results.balance.beforeInvalidCreates = await balanceSnapshot(pool, companyId, employeeId, leaveTypeId);
    results.tests.zeroTotalDays = await api("hr", "POST", "/api/leave/requests", baseBody(3, 0));
    results.tests.negativeTotalDays = await api("hr", "POST", "/api/leave/requests", baseBody(5, -1));
    results.tests.nonNumericTotalDays = await api("hr", "POST", "/api/leave/requests", baseBody(7, "1abc"));
    results.tests.infinityTotalDays = await api("hr", "POST", "/api/leave/requests", baseBody(9, "Infinity"));
    results.tests.extremelyLargeTotalDays = await api("hr", "POST", "/api/leave/requests", baseBody(11, 366));
    results.balance.afterInvalidCreates = await balanceSnapshot(pool, companyId, employeeId, leaveTypeId);

    const invalidLegacyId = await insertInvalidLeave(pool, {
      companyId,
      employeeId,
      leaveTypeId,
      createdBy: Number(results.logins.hr.user?.id || results.logins.hr.user?.userId || 2),
    });
    results.fixtures.invalidLegacyId = invalidLegacyId;
    results.balance.beforeInvalidApproval = await balanceSnapshot(pool, companyId, employeeId, leaveTypeId);
    results.tests.invalidLegacyApprove = await api("hr", "POST", `/api/leave/requests/${invalidLegacyId}/approve`, { notes: "must be blocked" });
    results.balance.afterInvalidApproval = await balanceSnapshot(pool, companyId, employeeId, leaveTypeId);

    const balanceUnchangedAfterInvalidCreates =
      results.balance.beforeInvalidCreates.usedDays === results.balance.afterInvalidCreates.usedDays
      && results.balance.beforeInvalidCreates.pendingDays === results.balance.afterInvalidCreates.pendingDays;
    const balanceUnchangedAfterInvalidApproval =
      results.balance.beforeInvalidApproval.usedDays === results.balance.afterInvalidApproval.usedDays
      && results.balance.beforeInvalidApproval.pendingDays === results.balance.afterInvalidApproval.pendingDays;

    const assertions = {
      health: results.health.status === 200,
      validPositiveTotalDaysCreated: statusIn(results.tests.validPositive, [201]),
      zeroTotalDaysRejected: statusIn(results.tests.zeroTotalDays, [400]),
      negativeTotalDaysRejected: statusIn(results.tests.negativeTotalDays, [400]),
      nonNumericTotalDaysRejected: statusIn(results.tests.nonNumericTotalDays, [400]),
      infinityTotalDaysRejected: statusIn(results.tests.infinityTotalDays, [400]),
      extremelyLargeTotalDaysRejected: statusIn(results.tests.extremelyLargeTotalDays, [400]),
      invalidLegacyApprovalBlocked: statusIn(results.tests.invalidLegacyApprove, [400]),
      leaveBalanceDoesNotIncreaseAfterInvalidCreates: balanceUnchangedAfterInvalidCreates,
      leaveBalanceDoesNotIncreaseAfterInvalidApproval: balanceUnchangedAfterInvalidApproval,
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
    balance: results.balance,
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
