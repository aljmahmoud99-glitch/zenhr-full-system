const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const generatedAt = new Date().toISOString();
const runTag = `uat${Date.now()}`;

const out = path.join(__dirname, "full-operational-uat-results.json");
const roleOut = path.join(__dirname, "full-operational-uat-role-matrix.json");
const workflowOut = path.join(__dirname, "full-operational-uat-workflows.json");
const payrollOut = path.join(__dirname, "full-operational-uat-payroll-reconciliation.json");
const rbacOut = path.join(__dirname, "full-operational-uat-rbac-results.json");
const exportOut = path.join(__dirname, "full-operational-uat-export-results.json");
const issuesOut = path.join(__dirname, "full-operational-uat-issues.md");

const tokens = {};
const users = {};
const issues = [];

const results = {
  generatedAt,
  backend,
  runTag,
  status: "RUNNING",
  decision: "PENDING",
  health: null,
  readiness: null,
  version: null,
  roles: {},
  superadmin: {},
  hr: {},
  payroll: {},
  manager: {},
  employee: {},
  recruiter: {},
  workflows: {},
  rbac: {},
  exports: {},
  infra: {},
  priorEvidence: {},
  errors: [],
};

function addIssue(severity, area, expected, actual, affected = {}) {
  issues.push({ severity, area, expected, actual, affected });
}

async function raw(method, url, body, token, accept = "application/json", headers = {}) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
  const requestId = response.headers.get("x-request-id") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  let json = null;
  if (contentType.includes("json")) {
    try { json = JSON.parse(buffer.toString("utf8")); } catch {}
  }
  return {
    status: response.status,
    ok: response.ok,
    contentType,
    disposition,
    requestId,
    size: buffer.length,
    body: json,
    text: buffer.toString("utf8", 0, Math.min(buffer.length, 1200)),
  };
}

async function api(role, method, url, body, accept, headers) {
  return raw(method, url, body, tokens[role], accept, headers);
}

function items(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.data?.items)) return body.data.items;
  if (Array.isArray(body.items)) return body.items;
  return [];
}

function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8")); }
  catch { return null; }
}

function downloadOk(r, format) {
  const mimeOk = format === "csv" ? /text\/csv|text\/plain/i.test(r.contentType)
    : format === "xlsx" ? /spreadsheetml|octet-stream/i.test(r.contentType)
      : /application\/pdf/i.test(r.contentType);
  return r.status === 200 && r.size > 20 && mimeOk && /attachment/i.test(r.disposition);
}

function cleanCsvHeader(text) {
  const first = String(text || "").split(/\r?\n/)[0] || "";
  return !/(ط·آ§|ط·ع¾|ط¸â€‍|ط¸â€¦|ط¸ظ¹|ط·آ±|ط·آµ|ط·آ¯)/.test(first);
}

async function login(role) {
  const r = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = r.body?.data?.accessToken || null;
  users[role] = r.body?.data?.user || {};
  results.roles[role] = {
    loginStatus: r.status,
    role: users[role]?.role,
    companyId: users[role]?.companyId,
    employeeId: users[role]?.employeeId,
  };
}

async function exerciseInfra() {
  results.health = await raw("GET", "/api/healthz");
  results.readiness = await raw("GET", "/api/readiness");
  results.version = await raw("GET", "/api/version", undefined, undefined, "application/json", { "x-request-id": `full-uat-${runTag}` });
  const env = await api("hr", "GET", "/api/ops/environment");
  const metrics = await api("hr", "GET", "/api/ops/metrics");
  const runtime = await api("hr", "GET", "/api/ops/runtime-store");
  const badLogins = [];
  for (let i = 0; i < 10; i += 1) {
    const r = await raw("POST", "/api/auth/login", { username: `uat_bad_${runTag}_${i}`, password: "wrong" });
    badLogins.push(r.status);
  }
  results.infra = {
    healthStatus: results.health.status,
    readinessStatus: results.readiness.status,
    versionStatus: results.version.status,
    requestIdEchoed: results.version.requestId === `full-uat-${runTag}`,
    opsEnvironmentStatus: env.status,
    opsEnvironmentSanitized: env.status === 200 && !/DATABASE_URL|Admin@1234|SECRET|TOKEN/i.test(JSON.stringify(env.body?.data || {})),
    opsMetricsStatus: metrics.status,
    runtimeStatus: runtime.status,
    runtimeMode: runtime.body?.data?.mode,
    rateLimitBlocks: badLogins.includes(429),
    passed: results.health.status === 200
      && results.readiness.status === 200
      && results.version.status === 200
      && results.version.requestId === `full-uat-${runTag}`
      && env.status === 200
      && metrics.status === 200
      && runtime.status === 200
      && badLogins.includes(429),
  };
}

async function exerciseSuperadmin() {
  const modules = await api("admin", "GET", "/api/tenant/modules/status");
  const usage = await api("admin", "GET", "/api/tenant/usage");
  const env = await api("admin", "GET", "/api/ops/environment");
  const metrics = await api("admin", "GET", "/api/ops/metrics");
  const unsafeMutation = await api("admin", "POST", "/api/payroll-adjustments/types", {
    code: `SUPERADMIN_BLOCK_${runTag}`,
    nameEn: "Superadmin should not mutate tenant payroll",
    nameAr: "اختبار منع",
    direction: "add",
  });
  results.superadmin = {
    modulesStatus: modules.status,
    usageStatus: usage.status,
    opsEnvironmentStatus: env.status,
    opsMetricsStatus: metrics.status,
    unsafeTenantMutationStatus: unsafeMutation.status,
    noSensitiveEnvLeak: env.status === 200 && !/DATABASE_URL|Admin@1234|SECRET|TOKEN/i.test(JSON.stringify(env.body?.data || {})),
    passed: [modules.status, usage.status, env.status, metrics.status].every((s) => s === 200)
      && [403, 404].includes(unsafeMutation.status)
      && env.status === 200
      && !/DATABASE_URL|Admin@1234|SECRET|TOKEN/i.test(JSON.stringify(env.body?.data || {})),
  };
  if (![403, 404].includes(unsafeMutation.status)) {
    addIssue("BLOCKER", "superadmin tenant mutation", "Superadmin tenant payroll mutation should be blocked or explicit", `Status ${unsafeMutation.status}`, { api: "/api/payroll-adjustments/types" });
  }
}

async function exerciseHrLifecycle() {
  const employeesBefore = await api("hr", "GET", "/api/employees?page=1&pageSize=10");
  const managerId = Number(users.manager?.employeeId || 7);
  const code = `UAT-${runTag}`;
  const create = await api("hr", "POST", "/api/employees", {
    employeeCode: code,
    firstNameAr: "اختبار",
    lastNameAr: "تشغيلي",
    firstNameEn: "Operational",
    lastNameEn: `UAT ${runTag}`,
    gender: "male",
    dateOfBirth: "1990-01-01",
    nationalId: `NID-${runTag}`,
    nationality: "Jordanian",
    personalEmail: `${code.toLowerCase()}@example.test`,
    workEmail: `${code.toLowerCase()}@zenjo.test`,
    employmentType: "full_time",
    hireDate: "2026-01-01",
    directManagerId: managerId,
    basicSalary: "900.000",
    housingAllowance: "50.000",
    transportAllowance: "25.000",
    employmentStatus: "active",
    contractType: "permanent",
  });
  const employeeId = create.body?.data?.id;
  const edit = employeeId ? await api("hr", "PATCH", `/api/employees/${employeeId}`, { notes: `Full operational UAT ${runTag}`, directManagerId: managerId }) : { status: 0 };
  const profile = employeeId ? await api("hr", "GET", `/api/employees/${employeeId}`) : { status: 0 };

  results.hr.employeeLifecycle = {
    listStatus: employeesBefore.status,
    createStatus: create.status,
    employeeId,
    employeeCode: code,
    editStatus: edit.status,
    profileStatus: profile.status,
    passed: employeesBefore.status === 200 && create.status === 201 && edit.status === 200 && profile.status === 200,
  };
  if (!results.hr.employeeLifecycle.passed) {
    addIssue("BLOCKER", "HR employee lifecycle", "HR can create/edit/open employee profile", JSON.stringify(results.hr.employeeLifecycle), { apis: ["/api/employees"] });
  }
  return employeeId;
}

async function exerciseCompliance(employeeId) {
  const dashboard = await api("hr", "GET", "/api/compliance-contracts/dashboard");
  const types = await api("hr", "GET", "/api/compliance-contracts/types");
  const type = items(types.body)[0];
  let contract = { status: 0, body: null };
  let requiredDoc = { status: 0, body: null };
  let attachment = { status: 0, body: null };
  let detail = { status: 0, body: null };
  if (employeeId && type?.id) {
    contract = await api("hr", "POST", "/api/compliance-contracts/contracts", {
      employeeId,
      contractTypeId: type.id,
      contractNumber: `CTR-${runTag}`,
      titleAr: "عقد اختبار تشغيلي",
      titleEn: `Operational UAT Contract ${runTag}`,
      startDate: "2026-02-01",
      endDate: "2027-02-01",
      salaryAmount: "975.000",
      currency: "JOD",
      contractStatus: "draft",
    });
    const contractId = contract.body?.data?.id;
    if (contractId) {
      requiredDoc = await api("hr", "POST", `/api/compliance-contracts/contracts/${contractId}/required-documents`, {
        documentCode: `UAT_DOC_${runTag}`.slice(0, 40),
        nameAr: "وثيقة اختبار تشغيلية",
        nameEn: "Operational UAT Document",
        isMandatory: true,
      });
      attachment = await api("hr", "POST", `/api/compliance-contracts/contracts/${contractId}/attachments`, {
        fileName: `operational-uat-${runTag}.pdf`,
        filePath: `/uploads/operational-uat-${runTag}.pdf`,
        mimeType: "application/pdf",
        fileSize: 128,
        attachmentType: "contract",
        titleAr: "مرفق عقد اختبار",
        titleEn: "Operational contract attachment",
      });
      detail = await api("hr", "GET", `/api/compliance-contracts/contracts/${contractId}`);
    }
  }
  results.hr.contractsCompliance = {
    dashboardStatus: dashboard.status,
    typesStatus: types.status,
    contractTypeId: type?.id || null,
    createContractStatus: contract.status,
    contractId: contract.body?.data?.id || null,
    requiredDocumentStatus: requiredDoc.status,
    requiredEnterpriseDocumentId: requiredDoc.body?.data?.enterpriseDocumentId || null,
    attachmentStatus: attachment.status,
    attachmentEnterpriseDocumentId: attachment.body?.data?.enterpriseDocumentId || null,
    detailStatus: detail.status,
    passed: dashboard.status === 200 && types.status === 200 && contract.status === 201 && requiredDoc.status === 201 && attachment.status === 201 && detail.status === 200,
  };
  if (!results.hr.contractsCompliance.passed) {
    addIssue("HIGH", "contracts/compliance", "Contract, required doc, attachment, enterprise document linkage should work", JSON.stringify(results.hr.contractsCompliance), { apis: ["/api/compliance-contracts/*"] });
  }
}

async function exerciseLeave(employeeId) {
  const types = await api("hr", "GET", "/api/leave/management/types");
  const leaveTypes = items(types.body);
  const unpaid = leaveTypes.find((t) => /unpaid|غير مدفوعة|deduct/i.test(`${t.code || ""} ${t.nameEn || ""} ${t.nameAr || ""} ${t.payrollImpactType || ""}`)) || leaveTypes[0];
  const year = 2310 + Math.floor(Math.random() * 80);
  const startDate = `${year}-03-04`;
  const endDate = `${year}-03-04`;
  const create = employeeId && unpaid?.id
    ? await api("hr", "POST", "/api/leave/management/requests", {
        employeeId,
        leaveTypeId: unpaid.id,
        startDate,
        endDate,
        durationUnit: "day",
        totalDays: 1,
        reason: `Full operational UAT leave ${runTag}`,
      })
    : { status: 0, body: null };
  const requestId = create.body?.data?.id;
  const managerApprove = requestId ? await api("manager", "POST", `/api/leave/management/requests/${requestId}/approve`, { notes: `Manager UAT ${runTag}` }) : { status: 0 };
  const hrApprove = requestId ? await api("hr", "POST", `/api/leave/management/requests/${requestId}/approve`, { notes: `HR UAT ${runTag}` }) : { status: 0 };
  const detail = requestId ? await api("hr", "GET", `/api/leave/management/requests/${requestId}`) : { status: 0, body: null };
  const audit = await api("hr", "GET", `/api/leave/management/audit?requestId=${requestId || 0}`);
  const payrollImpact = await api("hr", "GET", `/api/leave/management/payroll-impact?employeeId=${employeeId || 0}`);
  const employeeNotifications = await api("employee", "GET", "/api/notifications?pageSize=20");
  const approved = detail.body?.data?.status === "approved";
  const impactRows = items(payrollImpact.body);
  results.hr.leave = {
    typesStatus: types.status,
    leaveTypeId: unpaid?.id || null,
    leaveTypePayrollImpactType: unpaid?.payrollImpactType || unpaid?.payroll_impact_type || null,
    createStatus: create.status,
    requestId,
    managerApproveStatus: managerApprove.status,
    hrApproveStatus: hrApprove.status,
    finalStatus: detail.body?.data?.status,
    detailStatus: detail.status,
    auditStatus: audit.status,
    auditRows: detail.body?.data?.audit?.length ?? items(audit.body).length,
    payrollImpactStatus: payrollImpact.status,
    payrollImpactRows: impactRows.length,
    employeeNotificationsStatus: employeeNotifications.status,
    notificationCount: items(employeeNotifications.body).length,
    passed: types.status === 200 && create.status === 201 && approved && detail.status === 200 && (detail.body?.data?.audit?.length || 0) > 0 && employeeNotifications.status === 200,
  };
  if (!results.hr.leave.passed) {
    addIssue("BLOCKER", "leave workflow", "Create, approve, audit, notify leave request", JSON.stringify(results.hr.leave), { apis: ["/api/leave/management/*"] });
  }
  return { requestId, employeeId, startDate, year, month: 3, approved };
}

async function exercisePayroll(employeeId, leaveContext) {
  const policy = await api("payroll", "GET", "/api/payroll-policies");
  const rules = await api("payroll", "GET", "/api/payroll-policies/employment-types");
  const policyPreview = employeeId ? await api("payroll", "GET", `/api/payroll-policies/preview?employeeId=${employeeId}&month=3&year=${leaveContext?.year || 2310}`) : { status: 0 };
  const preview = employeeId ? await api("payroll", "GET", `/api/payroll/preview/${employeeId}?month=3&year=${leaveContext?.year || 2310}`) : { status: 0, body: null };
  const sprint5 = readJson("cleanup-sprint-5-results.json");
  results.payroll = {
    policyStatus: policy.status,
    employmentRulesStatus: rules.status,
    policyPreviewStatus: policyPreview.status,
    previewStatus: preview.status,
    previewEmployeeId: employeeId,
    previewNetSalary: preview.body?.data?.netSalary ?? preview.body?.data?.net_salary ?? null,
    canonicalReconciliationSource: "qa/cleanup-sprint-5-results.json",
    sprint5Status: sprint5?.status || "MISSING",
    runTotalNet: sprint5?.reconciliation?.runTotalNet || null,
    payslipNetTotal: sprint5?.reconciliation?.payslipNetTotal || null,
    reportTotalNet: sprint5?.reconciliation?.reportTotalNet || null,
    duplicatePrevented: sprint5?.rerunProtection?.duplicatePrevented === true,
    lockedRecalculateStatus: sprint5?.rerunProtection?.lockedRecalculateStatus || null,
    passed: policy.status === 200 && rules.status === 200 && preview.status === 200 && sprint5?.status === "GO" && sprint5?.reconciliation?.passed === true && sprint5?.rerunProtection?.duplicatePrevented === true,
  };
  if (!results.payroll.passed) {
    addIssue("BLOCKER", "payroll truth", "Policy/preview and Sprint 5 payroll reconciliation must pass", JSON.stringify(results.payroll), { apis: ["/api/payroll-policies", "/api/payroll/preview"] });
  }
}

async function exerciseApprovalsNotifications() {
  const pendingHr = await api("hr", "GET", "/api/approvals/pending");
  const historyHr = await api("hr", "GET", "/api/approvals/history");
  const pendingManager = await api("manager", "GET", "/api/approvals/pending");
  const employeeDenied = await api("employee", "GET", "/api/approvals/pending");
  const list = await api("employee", "GET", "/api/notifications?pageSize=20");
  const notification = items(list.body)[0];
  const read = notification?.id ? await api("employee", "PATCH", `/api/notifications/center/${notification.id}/read`) : { status: 0, skipped: true };
  const unread = notification?.id ? await api("employee", "PATCH", `/api/notifications/center/${notification.id}/unread`) : { status: 0, skipped: true };
  const foreignRead = notification?.id ? await api("manager", "PATCH", `/api/notifications/center/${notification.id}/read`) : { status: 0, skipped: true };
  results.workflows.approvalsNotifications = {
    pendingHrStatus: pendingHr.status,
    pendingDomains: [...new Set(items(pendingHr.body).map((x) => x.domain).filter(Boolean))],
    historyHrStatus: historyHr.status,
    pendingManagerStatus: pendingManager.status,
    employeeDeniedStatus: employeeDenied.status,
    notificationListStatus: list.status,
    notificationId: notification?.id || null,
    readStatus: read.status,
    unreadStatus: unread.status,
    foreignReadStatus: foreignRead.status,
    passed: pendingHr.status === 200
      && historyHr.status === 200
      && pendingManager.status === 200
      && employeeDenied.status === 403
      && list.status === 200
      && (!notification || (read.status === 200 && unread.status === 200 && foreignRead.body?.data?.updated === 0)),
  };
  if (!results.workflows.approvalsNotifications.passed) {
    addIssue("BLOCKER", "approvals/notifications", "Unified approvals and notification isolation/read state should work", JSON.stringify(results.workflows.approvalsNotifications), { apis: ["/api/approvals/*", "/api/notifications/*"] });
  }
}

async function exerciseRecruiter() {
  const sprint6 = readJson("cleanup-sprint-6-results.json");
  const list = await api("recruiter", "GET", "/api/recruitment/candidates");
  const payrollDenied = await api("recruiter", "GET", "/api/payroll/runs");
  const payrollExportDenied = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const contractDenied = await api("recruiter", "POST", "/api/compliance-contracts/contracts", {});
  results.recruiter = {
    candidateListStatus: list.status,
    handoffEvidenceSource: "qa/cleanup-sprint-6-results.json",
    sprint6Status: sprint6?.status || "MISSING",
    convertedEmployeeId: sprint6?.recruitment?.employeeId || null,
    contractId: sprint6?.recruitment?.contractId || null,
    enterpriseDocumentIds: sprint6?.recruitment?.enterpriseDocumentIds || [],
    noDuplicateConversion: sprint6?.recruitment?.noDuplicateConversion === true,
    payrollDeniedStatus: payrollDenied.status,
    payrollExportDeniedStatus: payrollExportDenied.status,
    contractMutationDeniedStatus: contractDenied.status,
    passed: list.status === 200
      && sprint6?.status === "GO"
      && sprint6?.recruitment?.noDuplicateConversion === true
      && [403, 404].includes(payrollDenied.status)
      && payrollExportDenied.status === 403
      && [403, 404].includes(contractDenied.status),
  };
  if (!results.recruiter.passed) {
    addIssue("BLOCKER", "recruitment handoff/RBAC", "Recruiter handoff evidence and forbidden payroll/contract probes should pass", JSON.stringify(results.recruiter), { apis: ["/api/recruitment/*"] });
  }
}

async function exerciseManagerEmployeeSecurity(employeeId) {
  const ownEmployee = await api("employee", "GET", `/api/employees/${users.employee.employeeId}`);
  const otherEmployee = await api("employee", "GET", `/api/employees/${employeeId || Number(users.employee.employeeId) + 1}`);
  const employeePayroll = await api("employee", "GET", `/api/payroll/preview/${employeeId || users.employee.employeeId}?month=3&year=2310`);
  const employeeExports = await api("employee", "GET", "/api/production/exports/employees?format=csv", undefined, "text/csv");
  const employeeContracts = await api("employee", "GET", "/api/compliance-contracts/contracts");
  const managerTeam = await api("manager", "GET", "/api/employees?page=1&pageSize=50");
  const unrelatedEmployeeId = Number(users.hr?.employeeId || 2);
  const managerOtherProfile = await api("manager", "GET", `/api/employees/${unrelatedEmployeeId}`);
  const managerPayrollExport = await api("manager", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const managerContractMutation = await api("manager", "POST", "/api/compliance-contracts/contracts", {});
  const payrollRecruitmentMutation = await api("payroll", "POST", "/api/recruitment/candidates", { fullNameEn: `Forbidden ${runTag}`, email: `forbidden-${runTag}@example.test` });
  const payrollHrDocument = await api("payroll", "POST", "/api/files", { employeeId, fileName: `forbidden-${runTag}.pdf` });
  results.employee = {
    ownProfileStatus: ownEmployee.status,
    otherProfileStatus: otherEmployee.status,
    payrollPreviewDeniedStatus: employeePayroll.status,
    exportsDeniedStatus: employeeExports.status,
    contractsDeniedStatus: employeeContracts.status,
    passed: ownEmployee.status === 200
      && [403, 404].includes(otherEmployee.status)
      && [403, 404].includes(employeePayroll.status)
      && [403, 404].includes(employeeExports.status)
      && [403, 404].includes(employeeContracts.status),
  };
  results.manager = {
    teamListStatus: managerTeam.status,
    otherProfileStatus: managerOtherProfile.status,
    unrelatedEmployeeId,
    payrollExportDeniedStatus: managerPayrollExport.status,
    contractMutationDeniedStatus: managerContractMutation.status,
    passed: managerTeam.status === 200
      && [403, 404].includes(managerOtherProfile.status)
      && managerPayrollExport.status === 403
      && [403, 404].includes(managerContractMutation.status),
  };
  results.rbac.payrollSeparation = {
    payrollRecruitmentMutationStatus: payrollRecruitmentMutation.status,
    payrollHrDocumentStatus: payrollHrDocument.status,
    passed: [403, 404].includes(payrollRecruitmentMutation.status) && [403, 404].includes(payrollHrDocument.status),
  };
  results.rbac.passed = results.employee.passed && results.manager.passed && results.rbac.payrollSeparation.passed;
  if (!results.rbac.passed) {
    addIssue("BLOCKER", "RBAC/security", "Employee/manager/payroll forbidden probes should be denied", JSON.stringify(results.rbac), { apis: ["multiple direct probes"] });
  }
}

async function exerciseExports() {
  const datasets = [
    ["employees", "hr"],
    ["attendance", "hr"],
    ["payroll", "payroll"],
    ["recruitment", "recruiter"],
    ["evaluations", "hr"],
    ["workflows", "hr"],
    ["reports", "hr"],
    ["documents", "hr"],
  ];
  const matrix = {};
  for (const [dataset, role] of datasets) {
    matrix[dataset] = {};
    for (const format of ["csv", "xlsx", "pdf"]) {
      const r = await api(role, "GET", `/api/production/exports/${dataset}?format=${format}`, undefined, format === "csv" ? "text/csv" : "*/*");
      matrix[dataset][format] = {
        role,
        status: r.status,
        contentType: r.contentType,
        disposition: r.disposition,
        size: r.size,
        downloadable: downloadOk(r, format),
        cleanCsvHeader: format === "csv" ? cleanCsvHeader(r.text) : true,
        supported: r.status !== 400 && r.status !== 404,
      };
    }
  }
  const employeePayroll = await api("employee", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const managerPayroll = await api("manager", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const recruiterPayroll = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
  const supportedDatasets = Object.entries(matrix).filter(([, formats]) => Object.values(formats).some((r) => r.supported));
  results.exports = {
    datasets: matrix,
    denied: {
      employeePayrollStatus: employeePayroll.status,
      managerPayrollStatus: managerPayroll.status,
      recruiterPayrollStatus: recruiterPayroll.status,
    },
    passed: supportedDatasets.every(([, formats]) => Object.values(formats).every((r) => r.downloadable && r.cleanCsvHeader))
      && employeePayroll.status === 403
      && managerPayroll.status === 403
      && recruiterPayroll.status === 403,
  };
  if (!results.exports.passed) {
    addIssue("HIGH", "exports/reports", "Authorized exports should download and unauthorized payroll exports should be blocked", JSON.stringify(results.exports.denied), { api: "/api/production/exports/:dataset" });
  }
  if (matrix.documents && Object.values(matrix.documents).some((r) => !r.supported)) {
    addIssue("MEDIUM", "document exports", "Documents export should be supported if advertised", "Documents dataset returned unsupported status for at least one format", { api: "/api/production/exports/documents" });
  }
}

function derivePriorEvidence() {
  const names = [
    "cleanup-sprint-2-results.json",
    "cleanup-sprint-3-results.json",
    "cleanup-sprint-5-results.json",
    "cleanup-sprint-6-results.json",
    "cleanup-sprint-7-results.json",
    "cleanup-sprint-8-results.json",
    "phase-9-results.json",
    "phase-10-results.json",
    "phase-11-results.json",
  ];
  for (const name of names) {
    const json = readJson(name);
    results.priorEvidence[name.replace(".json", "")] = json?.status || "MISSING";
  }
  const sprint5 = readJson("cleanup-sprint-5-results.json");
  const sprint6 = readJson("cleanup-sprint-6-results.json");
  const sprint8 = readJson("cleanup-sprint-8-results.json");
  results.workflows.crossDomain = {
    leavePayroll: {
      source: "Direct leave request plus payroll preview; Sprint 3/Sprint 5 regression evidence",
      directLeavePassed: results.hr.leave?.passed === true,
      payrollPassed: results.payroll?.passed === true,
    },
    attendancePayroll: {
      source: "qa/cleanup-sprint-5-results.json and Sprint 8 regression",
      status: sprint5?.status === "GO" && sprint8?.status === "GO" ? "CONFIRMED_WORKING_BY_REGRESSION" : "NEEDS_ATTENTION",
    },
    recruitmentContractDocuments: {
      source: "qa/cleanup-sprint-6-results.json",
      status: sprint6?.status === "GO" ? "CONFIRMED_WORKING" : "NEEDS_ATTENTION",
      employeeId: sprint6?.recruitment?.employeeId,
      contractId: sprint6?.recruitment?.contractId,
      enterpriseDocumentIds: sprint6?.recruitment?.enterpriseDocumentIds || [],
    },
    performanceEmployeeActionPayroll: {
      source: "Cleanup Sprint 1/5/8 regression artifacts",
      status: results.priorEvidence["cleanup-sprint-8-results"] === "GO" ? "CONFIRMED_BY_REGRESSION" : "NEEDS_ATTENTION",
    },
    payrollAdjustmentPayroll: {
      source: "qa/cleanup-sprint-5-results.json",
      status: sprint5?.status === "GO" && sprint5?.rerunProtection?.duplicatePrevented === true ? "CONFIRMED_WORKING" : "NEEDS_ATTENTION",
    },
  };
}

function decide() {
  const blockers = issues.filter((i) => i.severity === "BLOCKER");
  const high = issues.filter((i) => i.severity === "HIGH");
  const corePass = results.health?.status === 200
    && Object.values(results.roles).every((r) => r.loginStatus === 200)
    && results.infra.passed
    && results.hr.employeeLifecycle?.passed
    && results.hr.leave?.passed
    && results.payroll.passed
    && results.recruiter.passed
    && results.rbac.passed
    && results.exports.passed
    && results.workflows.approvalsNotifications?.passed;
  if (blockers.length) {
    results.status = "NO-GO";
    results.decision = "FULL-UAT NO-GO";
  } else if (corePass && high.length === 0) {
    results.status = "GO";
    results.decision = "FULL-UAT GO";
  } else if (corePass) {
    results.status = "CONDITIONAL-GO";
    results.decision = "FULL-UAT CONDITIONAL GO";
  } else {
    results.status = "NO-GO";
    results.decision = "FULL-UAT NO-GO";
  }
}

function writeIssues() {
  const lines = [
    "# Full Operational UAT Issues",
    "",
    `Generated: ${generatedAt}`,
    "",
    issues.length ? "" : "No issues were recorded by the API UAT harness. Review browser results separately.",
  ];
  for (const issue of issues) {
    lines.push(`## ${issue.severity}: ${issue.area}`);
    lines.push("");
    lines.push(`- Expected: ${issue.expected}`);
    lines.push(`- Actual: ${issue.actual}`);
    lines.push(`- Affected: ${JSON.stringify(issue.affected)}`);
    lines.push("- Recommended fix: investigate the affected API/screen and rerun this UAT harness after patching.");
    lines.push("");
  }
  fs.writeFileSync(issuesOut, `${lines.join("\n")}\n`);
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    results.readiness = await raw("GET", "/api/readiness");
    results.version = await raw("GET", "/api/version");
    for (const role of ["admin", "hr", "payroll", "manager", "employee", "recruiter"]) await login(role);
    const employeeId = await exerciseHrLifecycle();
    await exerciseCompliance(employeeId);
    const leaveContext = await exerciseLeave(employeeId);
    await exercisePayroll(employeeId, leaveContext);
    await exerciseApprovalsNotifications();
    await exerciseRecruiter();
    await exerciseManagerEmployeeSecurity(employeeId);
    await exerciseExports();
    await exerciseSuperadmin();
    await exerciseInfra();
    derivePriorEvidence();
    decide();
  } catch (error) {
    results.status = "NO-GO";
    results.decision = "FULL-UAT NO-GO";
    results.errors.push(error?.stack || String(error));
    addIssue("BLOCKER", "UAT harness execution", "Harness should complete all checks", error?.stack || String(error), { script: "qa/full-operational-uat.cjs" });
  } finally {
    writeIssues();
    fs.writeFileSync(out, JSON.stringify({ ...results, issues }, null, 2));
    fs.writeFileSync(roleOut, JSON.stringify({ generatedAt, status: results.status, roles: results.roles, superadmin: results.superadmin, hr: results.hr, payroll: results.payroll, manager: results.manager, employee: results.employee, recruiter: results.recruiter }, null, 2));
    fs.writeFileSync(workflowOut, JSON.stringify({ generatedAt, status: results.status, workflows: results.workflows, leave: results.hr.leave, approvalsNotifications: results.workflows.approvalsNotifications }, null, 2));
    fs.writeFileSync(payrollOut, JSON.stringify({ generatedAt, status: results.payroll?.passed ? "GO" : "NO-GO", payroll: results.payroll }, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt, status: results.rbac?.passed ? "GO" : "NO-GO", rbac: results.rbac, manager: results.manager, employee: results.employee, recruiter: results.recruiter, superadmin: results.superadmin }, null, 2));
    fs.writeFileSync(exportOut, JSON.stringify({ generatedAt, status: results.exports?.passed ? "GO" : "NO-GO", exports: results.exports }, null, 2));
    console.log(JSON.stringify({ status: results.status, decision: results.decision, issues: issues.map((i) => ({ severity: i.severity, area: i.area })), errors: results.errors }, null, 2));
    if (results.status === "NO-GO") process.exitCode = 1;
  }
}

main();
