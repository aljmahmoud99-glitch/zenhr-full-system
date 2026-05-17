const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const out = path.join(__dirname, "phase-1-8-employee-patch-allowlist-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const allowlist = [
  "firstNameEn", "lastNameEn", "firstNameAr", "lastNameAr", "middleNameEn", "middleNameAr",
  "personalPhone", "workPhone", "phone", "personalEmail", "addressAr", "address", "city",
  "nationality", "religion", "maritalStatus", "numberOfDependents", "dateOfBirth", "birthDate",
  "gender", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
  "passportNumber", "passportExpiry", "workPermitNumber", "workPermitExpiry", "residencyNumber",
  "residencyExpiry", "profilePhoto", "profileImage", "notes",
];
const protectedFields = ["isDeleted", "companyId", "employmentStatus", "directManagerId", "employeeCode"];

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

async function employeeSnapshot(pool, employeeId) {
  const result = await pool.query(
    `SELECT id, company_id, employee_code, employment_status, direct_manager_id, is_deleted,
            personal_phone, personal_email, notes
       FROM employees
      WHERE id=$1`,
    [employeeId],
  );
  return result.rows[0] || null;
}

async function insertSoftDeletedEmployee(pool, companyId) {
  const code = `P18DEL${String(Date.now()).slice(-8)}`;
  const inserted = await pool.query(
    `INSERT INTO employees
      (company_id, employee_code, first_name_ar, last_name_ar, first_name_en, last_name_en,
       gender, date_of_birth, hire_date, basic_salary, is_deleted)
     VALUES ($1,$2,'اختبار','محذوف','Deleted','Employee','male','1990-01-01','2020-01-01',1,true)
     RETURNING id`,
    [companyId, code],
  );
  return inserted.rows[0].id;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    route: "PATCH /api/employees/:id",
    allowlist,
    protectedFields,
    protectedFieldPolicy: "400 Bad Request when protected/internal fields are present; unknown non-table fields are ignored",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    fixtures: {},
    before: {},
    after: {},
    tests: {},
    skipped: [],
    errors: [],
  };

  for (const role of ["hr", "employee", "admin"]) {
    results.logins[role] = await login(role);
  }
  const requiredLoginOk = ["hr", "employee", "admin"].every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!requiredLoginOk) {
    results.status = "ERROR";
    results.errors.push({ area: "login", logins: results.logins });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const employees = await api("hr", "GET", "/api/employees?pageSize=200");
  const hrList = dataItems(employees);
  const employeeEmployeeId = Number(results.logins.employee.user?.employeeId);
  const target = hrList.find(employee => Number(employee.id) === employeeEmployeeId)
    || hrList.find(employee => Number(employee.id) !== Number(results.logins.hr.user?.employeeId));
  const targetId = Number(target?.id);
  const companyId = Number(results.logins.hr.user?.companyId);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const foreign = await pool.query(
      `SELECT id FROM employees WHERE company_id <> $1 AND COALESCE(is_deleted,false)=false ORDER BY id LIMIT 1`,
      [companyId],
    );
    const softDeletedId = await insertSoftDeletedEmployee(pool, companyId);
    results.fixtures = {
      companyId,
      targetId,
      employeeEmployeeId,
      crossCompanyEmployeeId: foreign.rows[0]?.id || null,
      softDeletedEmployeeId: softDeletedId,
    };

    if (!targetId) {
      results.status = "ERROR";
      results.errors.push({ area: "fixtures", message: "No same-company target employee fixture found" });
      fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
      process.exit(1);
    }

    results.before.target = await employeeSnapshot(pool, targetId);

    const allowedPhone = `P18-${String(Date.now()).slice(-6)}`;
    const allowedEmail = `phase18-${runId}@example.test`;
    const allowedNotes = `Phase 1.8 allowed update ${runId}`;
    results.tests.hrAllowedPatch = await api("hr", "PATCH", `/api/employees/${targetId}`, {
      personalPhone: allowedPhone,
      personalEmail: allowedEmail,
      notes: allowedNotes,
      unknownFieldShouldBeIgnored: "ignored",
    });
    results.after.allowedPatch = await employeeSnapshot(pool, targetId);

    results.before.protectedAttempt = await employeeSnapshot(pool, targetId);
    results.tests.protectedPatch = await api("hr", "PATCH", `/api/employees/${targetId}`, {
      isDeleted: true,
      companyId: companyId + 999,
      employmentStatus: "terminated",
      directManagerId: 999999,
      employeeCode: `PWN-${runId}`,
      notes: `should-not-write-${runId}`,
    });
    results.after.protectedAttempt = await employeeSnapshot(pool, targetId);

    results.tests.employeeSelfServicePatch = await api("employee", "PATCH", `/api/employees/${employeeEmployeeId}`, {
      personalPhone: `SELF-${String(Date.now()).slice(-6)}`,
      notes: `Phase 1.8 employee self-service attempt ${runId}`,
    });
    if (results.tests.employeeSelfServicePatch.status === 403) {
      results.skipped.push({ test: "employeeSelfServiceAllowedFieldsPersist", reason: "Employee PATCH self-service is not supported by the existing route policy" });
    }

    if (results.fixtures.crossCompanyEmployeeId) {
      results.tests.crossCompanyPatch = await api("hr", "PATCH", `/api/employees/${results.fixtures.crossCompanyEmployeeId}`, { notes: "cross-company blocked" });
    } else {
      results.skipped.push({ test: "crossCompanyPatch", reason: "No foreign-company employee fixture exists" });
    }
    results.tests.softDeletedPatch = await api("hr", "PATCH", `/api/employees/${softDeletedId}`, { notes: "soft-deleted blocked" });
    results.tests.randomPatch = await api("hr", "PATCH", "/api/employees/999999999", { notes: "random blocked" });

    const protectedUnchanged = ["company_id", "employee_code", "employment_status", "direct_manager_id", "is_deleted"]
      .every(key => String(results.before.protectedAttempt?.[key]) === String(results.after.protectedAttempt?.[key]));

    const assertions = {
      health: results.health.status === 200,
      hrAllowedPatch: statusIn(results.tests.hrAllowedPatch, [200]),
      allowedFieldsPersisted: results.after.allowedPatch?.personal_phone === allowedPhone
        && results.after.allowedPatch?.personal_email === allowedEmail
        && results.after.allowedPatch?.notes === allowedNotes,
      employeeSelfServiceBehaviorPreserved: statusIn(results.tests.employeeSelfServicePatch, [200, 403]),
      protectedPatchRejected: statusIn(results.tests.protectedPatch, [400]),
      protectedFieldsRemainUnchanged: protectedUnchanged,
      crossCompany404: !results.fixtures.crossCompanyEmployeeId || statusIn(results.tests.crossCompanyPatch, [404]),
      softDeleted404: statusIn(results.tests.softDeletedPatch, [404]),
      randomId404: statusIn(results.tests.randomPatch, [404]),
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
