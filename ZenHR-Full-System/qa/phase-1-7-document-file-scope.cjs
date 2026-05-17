const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:123@127.0.0.1:5432/zenhr";
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "..", "artifacts", "api-server", "uploads");
const out = path.join(__dirname, "phase-1-7-document-file-scope-results.json");
const tokens = {};
const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

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
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: json,
    text: text.slice(0, 500),
  };
}

async function download(role, fileId) {
  const response = await fetch(`${backend}/api/files/${fileId}/download`, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${tokens[role]}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: json,
    text: text.slice(0, 500),
  };
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

async function insertFile(pool, { companyId, employeeId, storageKey, originalName, isDeleted = false }) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, storageKey), `phase-1-7 ${storageKey}\n`, "utf8");
  const inserted = await pool.query(
    `INSERT INTO file_objects
      (company_id, employee_id, owner_user_id, linked_entity_type, storage_provider, storage_key,
       original_file_name, mime_type, size_bytes, visibility, created_by_user_id, is_deleted)
     VALUES ($1,$2,NULL,'document','local',$3,$4,'text/plain',32,'private',NULL,$5)
     RETURNING id`,
    [companyId, employeeId, storageKey, originalName, isDeleted],
  );
  return inserted.rows[0].id;
}

async function createDocument(role, employeeId, documentTypeId, documentNumber, fileId) {
  return api(role, "POST", "/api/documents", {
    employeeId,
    documentTypeId,
    documentNumber,
    issuedBy: "Phase 1.7 QA",
    issuedDate: "2099-01-01",
    expiryDate: "2099-12-31",
    fileName: `${documentNumber}.txt`,
    fileUrl: `/api/files/${fileId}/download`,
    notes: `Phase 1.7 document scope ${documentNumber}`,
  });
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    policyDecision: {
      manager: "direct-report employee-scoped documents/files only; company-wide/null-employee files are blocked",
      payrolladmin: "blocked for generic document/file download and document export unless a separate payroll-domain endpoint grants access",
      recruiter: "blocked for generic document/file download and document export unless a separate recruitment-domain endpoint grants access",
      superadmin: "same-company document/file access only using the authenticated tenant context",
    },
    routes: ["GET /api/files/:id/download", "GET /api/documents/export"],
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

  const [hrEmployees, managerEmployees, docTypes] = await Promise.all([
    api("hr", "GET", "/api/employees?pageSize=200"),
    api("manager", "GET", "/api/employees?pageSize=200"),
    raw("GET", "/api/lookups/document-types"),
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
  const documentTypeId = dataItems(docTypes)[0]?.id;
  const companyId = Number(results.logins.hr.user?.companyId);

  results.fixtures = {
    companyId,
    managerEmployeeId,
    employeeEmployeeId,
    directReportId: directReport?.id || null,
    unrelatedEmployeeId: unrelated?.id || null,
    documentTypeId: documentTypeId || null,
  };

  if (!results.fixtures.directReportId || !results.fixtures.unrelatedEmployeeId || !documentTypeId) {
    results.status = "ERROR";
    results.errors.push({ area: "fixtures", message: "Missing employee or document-type fixtures" });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const foreign = await pool.query(
      `SELECT id, company_id FROM employees WHERE company_id <> $1 AND is_deleted=false ORDER BY id LIMIT 1`,
      [companyId],
    );
    const fileIds = {
      own: await insertFile(pool, { companyId, employeeId: employeeEmployeeId, storageKey: `phase-1-7-own-${runId}.txt`, originalName: `own-${runId}.txt` }),
      direct: await insertFile(pool, { companyId, employeeId: results.fixtures.directReportId, storageKey: `phase-1-7-direct-${runId}.txt`, originalName: `direct-${runId}.txt` }),
      unrelated: await insertFile(pool, { companyId, employeeId: results.fixtures.unrelatedEmployeeId, storageKey: `phase-1-7-unrelated-${runId}.txt`, originalName: `unrelated-${runId}.txt` }),
      companyWide: await insertFile(pool, { companyId, employeeId: null, storageKey: `phase-1-7-company-${runId}.txt`, originalName: `company-${runId}.txt` }),
      deleted: await insertFile(pool, { companyId, employeeId: employeeEmployeeId, storageKey: `phase-1-7-deleted-${runId}.txt`, originalName: `deleted-${runId}.txt`, isDeleted: true }),
      crossCompany: null,
    };
    if (foreign.rows[0]) {
      fileIds.crossCompany = await insertFile(pool, {
        companyId: foreign.rows[0].company_id,
        employeeId: foreign.rows[0].id,
        storageKey: `phase-1-7-cross-${runId}.txt`,
        originalName: `cross-${runId}.txt`,
      });
    } else {
      results.skipped.push({ test: "crossCompanyFile", reason: "No foreign-company employee fixture exists" });
    }
    results.fixtures.fileIds = fileIds;
  } finally {
    await pool.end();
  }

  const directDocNumber = `P17-DIRECT-${runId}`;
  const unrelatedDocNumber = `P17-UNRELATED-${runId}`;
  const ownDocNumber = `P17-OWN-${runId}`;
  results.setup.directDocument = await createDocument("hr", results.fixtures.directReportId, documentTypeId, directDocNumber, results.fixtures.fileIds.direct);
  results.setup.unrelatedDocument = await createDocument("hr", results.fixtures.unrelatedEmployeeId, documentTypeId, unrelatedDocNumber, results.fixtures.fileIds.unrelated);
  results.setup.ownDocument = await createDocument("hr", employeeEmployeeId, documentTypeId, ownDocNumber, results.fixtures.fileIds.own);

  results.tests.hrDownloadSameCompany = await download("hr", results.fixtures.fileIds.own);
  results.tests.hrExport = await api("hr", "GET", "/api/documents/export");
  results.tests.employeeDownloadOwn = await download("employee", results.fixtures.fileIds.own);
  results.tests.employeeDownloadOther = await download("employee", results.fixtures.fileIds.unrelated);
  results.tests.managerDownloadDirect = await download("manager", results.fixtures.fileIds.direct);
  results.tests.managerDownloadUnrelated = await download("manager", results.fixtures.fileIds.unrelated);
  results.tests.managerDownloadCompanyWide = await download("manager", results.fixtures.fileIds.companyWide);
  results.tests.managerExport = await api("manager", "GET", "/api/documents/export");
  results.tests.payrollDownload = await download("payroll", results.fixtures.fileIds.own);
  results.tests.payrollExport = await api("payroll", "GET", "/api/documents/export");
  results.tests.recruiterDownload = await download("recruiter", results.fixtures.fileIds.own);
  results.tests.recruiterExport = await api("recruiter", "GET", "/api/documents/export");
  if (results.fixtures.fileIds.crossCompany) results.tests.crossCompanyDownload = await download("hr", results.fixtures.fileIds.crossCompany);
  results.tests.deletedDownload = await download("hr", results.fixtures.fileIds.deleted);
  results.tests.randomDownload = await download("hr", 999999999);

  const managerExportItems = dataItems(results.tests.managerExport);
  const hrExportItems = dataItems(results.tests.hrExport);
  const managerExportDocNumbers = managerExportItems.map(item => String(item.documentNumber || ""));
  const hrExportDocNumbers = hrExportItems.map(item => String(item.documentNumber || ""));

  const assertions = {
    health: results.health.status === 200,
    setupDocumentsCreated: [results.setup.directDocument, results.setup.unrelatedDocument, results.setup.ownDocument].every(result => result.status === 201),
    hrDownloadSameCompany: statusIn(results.tests.hrDownloadSameCompany, [200]),
    hrExportSameCompany: statusIn(results.tests.hrExport, [200]) && hrExportDocNumbers.includes(directDocNumber) && hrExportDocNumbers.includes(unrelatedDocNumber),
    employeeDownloadOwn: statusIn(results.tests.employeeDownloadOwn, [200]),
    employeeDownloadOtherBlocked: statusIn(results.tests.employeeDownloadOther, [403, 404]),
    managerDownloadDirect: statusIn(results.tests.managerDownloadDirect, [200]),
    managerDownloadUnrelatedBlocked: statusIn(results.tests.managerDownloadUnrelated, [403, 404]),
    managerCompanyWideBlocked: statusIn(results.tests.managerDownloadCompanyWide, [403, 404]),
    payrollDownloadBlocked: statusIn(results.tests.payrollDownload, [403]),
    payrollExportBlocked: statusIn(results.tests.payrollExport, [403]),
    recruiterDownloadBlocked: statusIn(results.tests.recruiterDownload, [403]),
    recruiterExportBlocked: statusIn(results.tests.recruiterExport, [403]),
    crossCompany404: !results.fixtures.fileIds.crossCompany || statusIn(results.tests.crossCompanyDownload, [404]),
    softDeleted404: statusIn(results.tests.deletedDownload, [404]),
    randomId404: statusIn(results.tests.randomDownload, [404]),
    managerExportDirectOnly: statusIn(results.tests.managerExport, [200])
      && managerExportDocNumbers.includes(directDocNumber)
      && !managerExportDocNumbers.includes(unrelatedDocNumber),
  };

  results.exportEvidence = {
    directDocNumber,
    unrelatedDocNumber,
    ownDocNumber,
    managerExportContainsDirect: managerExportDocNumbers.includes(directDocNumber),
    managerExportContainsUnrelated: managerExportDocNumbers.includes(unrelatedDocNumber),
    managerExportCount: managerExportItems.length,
    hrExportContainsDirect: hrExportDocNumbers.includes(directDocNumber),
    hrExportContainsUnrelated: hrExportDocNumbers.includes(unrelatedDocNumber),
    hrExportCount: hrExportItems.length,
  };
  results.assertions = assertions;
  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length) results.errors.push({ area: "assertions", failed });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
    policyDecision: results.policyDecision,
    assertions,
    statuses: Object.fromEntries(Object.entries(results.tests).map(([key, value]) => [key, value?.status])),
    exportEvidence: results.exportEvidence,
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
