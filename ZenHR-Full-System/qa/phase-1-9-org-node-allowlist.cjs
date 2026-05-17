const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-1-9-org-node-allowlist-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const allowlist = ["nameEn", "nameAr", "parentId", "managerEmployeeId", "managerId", "code", "sortOrder", "isActive"];
const protectedFields = ["companyId", "isDeleted", "createdAt"];

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

function statusIn(result, statuses) {
  return statuses.includes(result?.status);
}

async function nodeSnapshot(pool, nodeId) {
  const result = await pool.query(
    `SELECT id, company_id, parent_id, node_type, name_ar, name_en, code, manager_employee_id,
            is_active, sort_order, created_at, updated_at, is_deleted
       FROM org_nodes
      WHERE id=$1`,
    [nodeId],
  );
  return result.rows[0] || null;
}

async function insertNode(pool, {
  companyId,
  parentId = null,
  nodeType = "department",
  nameEn,
  nameAr = "اختبار",
  code,
  managerEmployeeId = null,
  isDeleted = false,
  sortOrder = 0,
}) {
  const inserted = await pool.query(
    `INSERT INTO org_nodes
      (company_id, parent_id, node_type, name_ar, name_en, code, manager_employee_id, is_active, sort_order, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
     RETURNING id`,
    [companyId, parentId, nodeType, nameAr, nameEn, code, managerEmployeeId, sortOrder, isDeleted],
  );
  return inserted.rows[0].id;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    route: "PUT /api/org-nodes/:id",
    allowlist,
    protectedFields,
    protectedFieldPolicy: "400 Bad Request when protected/internal org node fields are present; unknown non-table fields are ignored",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    before: {},
    after: {},
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

  const companyId = Number(results.logins.hr.user?.companyId);
  const managerEmployeeId = Number(results.logins.manager.user?.employeeId);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const foreign = await pool.query(`SELECT id FROM companies WHERE id <> $1 ORDER BY id LIMIT 1`, [companyId]);
    const parentId = await insertNode(pool, {
      companyId,
      nameEn: `P19 Parent ${runId}`,
      code: `P19P${String(Date.now()).slice(-6)}`,
      sortOrder: 10,
    });
    const targetId = await insertNode(pool, {
      companyId,
      nameEn: `P19 Target ${runId}`,
      code: `P19T${String(Date.now()).slice(-6)}`,
      sortOrder: 20,
    });
    const protectedTargetId = await insertNode(pool, {
      companyId,
      nameEn: `P19 Protected ${runId}`,
      code: `P19X${String(Date.now()).slice(-6)}`,
      sortOrder: 30,
    });
    const softDeletedId = await insertNode(pool, {
      companyId,
      nameEn: `P19 Deleted ${runId}`,
      code: `P19D${String(Date.now()).slice(-6)}`,
      isDeleted: true,
      sortOrder: 40,
    });
    let crossCompanyId = null;
    if (foreign.rows[0]) {
      crossCompanyId = await insertNode(pool, {
        companyId: Number(foreign.rows[0].id),
        nameEn: `P19 Cross ${runId}`,
        code: `P19C${String(Date.now()).slice(-6)}`,
        sortOrder: 50,
      });
    } else {
      results.skipped.push({ test: "crossCompanyOrgNode", reason: "No foreign company fixture exists" });
    }

    results.fixtures = {
      companyId,
      managerEmployeeId,
      parentId,
      targetId,
      protectedTargetId,
      softDeletedId,
      crossCompanyId,
    };

    results.before.target = await nodeSnapshot(pool, targetId);
    const updatedNameEn = `P19 Updated ${runId}`;
    const updatedNameAr = `تحديث ${runId}`;
    results.tests.hrAllowedUpdate = await api("hr", "PUT", `/api/org-nodes/${targetId}`, {
      nameEn: updatedNameEn,
      nameAr: updatedNameAr,
      parentId,
      managerEmployeeId,
      code: `P19U${String(Date.now()).slice(-6)}`,
      sortOrder: 88,
      isActive: false,
      ignoredUnknownField: "ignored",
    });
    results.after.allowedUpdate = await nodeSnapshot(pool, targetId);

    results.before.protectedAttempt = await nodeSnapshot(pool, protectedTargetId);
    results.tests.protectedUpdate = await api("hr", "PUT", `/api/org-nodes/${protectedTargetId}`, {
      companyId: companyId + 999,
      isDeleted: true,
      createdAt: "2000-01-01T00:00:00.000Z",
      nameEn: `Should Not Persist ${runId}`,
    });
    results.after.protectedAttempt = await nodeSnapshot(pool, protectedTargetId);

    if (crossCompanyId) {
      results.tests.crossCompanyUpdate = await api("hr", "PUT", `/api/org-nodes/${crossCompanyId}`, { nameEn: "cross blocked" });
    }
    results.tests.softDeletedUpdate = await api("hr", "PUT", `/api/org-nodes/${softDeletedId}`, { nameEn: "deleted blocked" });
    results.tests.randomUpdate = await api("hr", "PUT", "/api/org-nodes/999999999", { nameEn: "random blocked" });
    results.tests.employeeForbidden = await api("employee", "PUT", `/api/org-nodes/${targetId}`, { nameEn: "employee blocked" });
    results.tests.managerForbidden = await api("manager", "PUT", `/api/org-nodes/${targetId}`, { nameEn: "manager blocked" });
    results.tests.payrollForbidden = await api("payroll", "PUT", `/api/org-nodes/${targetId}`, { nameEn: "payroll blocked" });
    results.tests.recruiterForbidden = await api("recruiter", "PUT", `/api/org-nodes/${targetId}`, { nameEn: "recruiter blocked" });

    const protectedUnchanged = ["company_id", "is_deleted", "created_at", "name_en"]
      .every(key => String(results.before.protectedAttempt?.[key]) === String(results.after.protectedAttempt?.[key]));
    const allowedPersisted = results.after.allowedUpdate?.name_en === updatedNameEn
      && results.after.allowedUpdate?.name_ar === updatedNameAr
      && Number(results.after.allowedUpdate?.parent_id) === Number(parentId)
      && Number(results.after.allowedUpdate?.manager_employee_id) === Number(managerEmployeeId)
      && Number(results.after.allowedUpdate?.sort_order) === 88
      && results.after.allowedUpdate?.is_active === false;

    const assertions = {
      health: results.health.status === 200,
      hrAllowedUpdate: statusIn(results.tests.hrAllowedUpdate, [200]),
      allowedFieldsPersisted: allowedPersisted,
      protectedUpdateRejected: statusIn(results.tests.protectedUpdate, [400]),
      protectedFieldsRemainUnchanged: protectedUnchanged,
      crossCompany404: !crossCompanyId || statusIn(results.tests.crossCompanyUpdate, [404]),
      softDeleted404: statusIn(results.tests.softDeletedUpdate, [404]),
      randomId404: statusIn(results.tests.randomUpdate, [404]),
      employeeForbidden: statusIn(results.tests.employeeForbidden, [403]),
      managerForbidden: statusIn(results.tests.managerForbidden, [403]),
      payrollForbidden: statusIn(results.tests.payrollForbidden, [403]),
      recruiterForbidden: statusIn(results.tests.recruiterForbidden, [403]),
      hierarchyParentUpdateWorks: Number(results.after.allowedUpdate?.parent_id) === Number(parentId),
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
    route: results.route,
    allowlist: results.allowlist,
    protectedFields: results.protectedFields,
    protectedFieldPolicy: results.protectedFieldPolicy,
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
