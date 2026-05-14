const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const outputs = {
  results: path.join(__dirname, "cleanup-sprint-7-results.json"),
  tenant: path.join(__dirname, "cleanup-sprint-7-tenant-results.json"),
  rbac: path.join(__dirname, "cleanup-sprint-7-rbac-results.json"),
  exports: path.join(__dirname, "cleanup-sprint-7-export-security-results.json"),
  notifications: path.join(__dirname, "cleanup-sprint-7-notification-results.json"),
};

const tokens = {};
const users = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  fixtures: {},
  tenant: {},
  rbac: {},
  exportSecurity: {},
  notifications: {},
  legacyRoutes: {},
  errors: [],
};

async function raw(method, url, body, token, accept = "application/json") {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
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
    size: buffer.length,
    body: json,
    sample: buffer.slice(0, 160).toString("utf8"),
  };
}

async function api(role, method, url, body, accept) {
  return raw(method, url, body, tokens[role], accept);
}

function data(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.data?.items)) return body.data.items;
  if (Array.isArray(body.items)) return body.items;
  return [];
}

async function login(username) {
  const r = await raw("POST", "/api/auth/login", { username, password });
  const payload = r.body?.data || {};
  tokens[username] = payload.accessToken || null;
  users[username] = payload.user || {};
  results.logins[username] = {
    status: r.status,
    role: payload.user?.role,
    companyId: payload.user?.companyId,
    employeeId: payload.user?.employeeId,
  };
}

function forbiddenOrHidden(response) {
  return [403, 404].includes(Number(response?.status));
}

function isDownload(response, typePattern) {
  return response.status === 200
    && response.size > 20
    && (typePattern ? typePattern.test(response.contentType) : true)
    && !/application\/json/i.test(response.contentType);
}

function unique(arr) {
  return [...new Set(arr.filter((v) => v !== null && v !== undefined))];
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) {
      await login(role);
    }

    const employeeId = Number(users.employee?.employeeId);
    const managerEmployeeId = Number(users.manager?.employeeId);
    const employeeList = await api("hr", "GET", "/api/employees?page=1&pageSize=100");
    const employees = data(employeeList.body);
    const ownEmployee = employees.find((e) => Number(e.id) === employeeId) || {};
    const otherEmployee = employees.find((e) => Number(e.id) !== employeeId) || {};
    const managerNonTeam = employees.find((e) => Number(e.id) !== managerEmployeeId && Number(e.directManagerId || e.direct_manager_id || 0) !== managerEmployeeId) || otherEmployee;
    const managerTeamIds = employees
      .filter((e) => Number(e.directManagerId || e.direct_manager_id || 0) === managerEmployeeId)
      .map((e) => Number(e.id));

    results.fixtures = {
      employeeListStatus: employeeList.status,
      employeeId,
      ownEmployeeId: ownEmployee.id || null,
      otherEmployeeId: otherEmployee.id || null,
      managerEmployeeId,
      managerTeamIds,
      managerNonTeamId: managerNonTeam.id || null,
    };

    const employeeOwnProfile = await api("employee", "GET", `/api/employees/${employeeId}`);
    const employeeOtherProfile = otherEmployee.id ? await api("employee", "GET", `/api/employees/${otherEmployee.id}`) : { status: 0 };
    const employeeOtherDocuments = otherEmployee.id ? await api("employee", "GET", `/api/employees/${otherEmployee.id}/documents`) : { status: 0 };
    const employeeOtherLeaveBalances = otherEmployee.id ? await api("employee", "GET", `/api/employees/${otherEmployee.id}/leave-balances`) : { status: 0 };
    const employeeApprovals = await api("employee", "GET", "/api/approvals/pending");
    const employeePayrollPreview = await api("employee", "GET", `/api/payroll/preview/${employeeId}?month=1&year=2041`);
    const employeePayrollExport = await api("employee", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");

    const managerNonTeamProfile = managerNonTeam.id ? await api("manager", "GET", `/api/employees/${managerNonTeam.id}`) : { status: 0 };
    const managerPayrollExport = await api("manager", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
    const managerApprovals = await api("manager", "GET", "/api/approvals/pending");

    const recruiterPayrollExport = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");
    const recruiterRecruitmentExport = await api("recruiter", "GET", "/api/production/exports/recruitment?format=csv", undefined, "text/csv");
    const recruiterPayrollAdjustments = await api("recruiter", "GET", "/api/payroll-adjustments");
    const payrollRecruitmentMutation = await api("payroll", "POST", "/api/recruitment/candidates", {
      fullNameAr: "اختبار مرفوض",
      fullNameEn: "Forbidden Candidate",
      email: `forbidden.${Date.now()}@example.test`,
    });
    const payrollHrDocument = await api("payroll", "POST", "/api/document-reporting/documents", {
      sourceModule: "hr",
      titleAr: "مستند موارد بشرية مرفوض",
      titleEn: "Forbidden HR Document",
    });
    const recruiterPayrollDocument = await api("recruiter", "POST", "/api/document-reporting/documents", {
      sourceModule: "payroll",
      titleAr: "مستند رواتب مرفوض",
      titleEn: "Forbidden Payroll Document",
    });
    const crossEmployeeDoc = await api("hr", "POST", "/api/document-reporting/documents", {
      sourceModule: "hr",
      employeeId: 99999999,
      titleAr: "مستند خارج النطاق",
      titleEn: "Out-of-scope Employee Document",
    });

    const hrFiles = await api("hr", "GET", "/api/files");
    const employeeFiles = await api("employee", "GET", "/api/files");
    const managerFiles = await api("manager", "GET", "/api/files");
    const payrollFiles = await api("payroll", "GET", "/api/files");
    const recruiterFiles = await api("recruiter", "GET", "/api/files");
    const hrFileRows = data(hrFiles.body);
    const foreignFile = hrFileRows.find((f) => Number(f.employee_id || f.employeeId || 0) && Number(f.employee_id || f.employeeId) !== employeeId);
    const employeeForeignFileDownload = foreignFile ? await api("employee", "GET", `/api/files/${foreignFile.id}/download`, undefined, "*/*") : { status: 0, skipped: true };
    const employeeFileIds = data(employeeFiles.body).map((f) => Number(f.employee_id || f.employeeId || 0));
    const managerFileIds = data(managerFiles.body).map((f) => Number(f.employee_id || f.employeeId || 0)).filter(Boolean);
    const payrollFileCount = data(payrollFiles.body).length;
    const recruiterFileCount = data(recruiterFiles.body).length;

    const notificationCreate = await api("hr", "POST", "/api/notifications/test", {
      title: `Sprint 7 HR notification ${Date.now()}`,
      message: "Security isolation test",
      type: "info",
    });
    const hrNotifications = await api("hr", "GET", "/api/notifications/center");
    const notificationId = data(hrNotifications.body).find((n) => String(n.title || "").includes("Sprint 7 HR notification"))?.id || data(hrNotifications.body)[0]?.id;
    const employeeReadForeignNotification = notificationId ? await api("employee", "PATCH", `/api/notifications/center/${notificationId}/read`, {}) : { status: 0 };
    const employeeNotifications = await api("employee", "GET", "/api/notifications/center");
    const employeeUnread = await api("employee", "GET", "/api/notifications/center/unread-count");
    const legacyNotifications = await api("employee", "GET", "/api/notifications");

    results.rbac = {
      employeeOwnProfileStatus: employeeOwnProfile.status,
      employeeOtherProfileStatus: employeeOtherProfile.status,
      employeeOtherDocumentsStatus: employeeOtherDocuments.status,
      employeeOtherLeaveBalancesStatus: employeeOtherLeaveBalances.status,
      employeeApprovalsStatus: employeeApprovals.status,
      employeePayrollPreviewStatus: employeePayrollPreview.status,
      managerNonTeamProfileStatus: managerNonTeamProfile.status,
      managerApprovalsStatus: managerApprovals.status,
      recruiterPayrollAdjustmentsStatus: recruiterPayrollAdjustments.status,
      payrollRecruitmentMutationStatus: payrollRecruitmentMutation.status,
      payrollHrDocumentStatus: payrollHrDocument.status,
      recruiterPayrollDocumentStatus: recruiterPayrollDocument.status,
      passed: employeeOwnProfile.status === 200
        && forbiddenOrHidden(employeeOtherProfile)
        && forbiddenOrHidden(employeeOtherDocuments)
        && forbiddenOrHidden(employeeOtherLeaveBalances)
        && forbiddenOrHidden(employeeApprovals)
        && forbiddenOrHidden(employeePayrollPreview)
        && (!managerNonTeam.id || forbiddenOrHidden(managerNonTeamProfile))
        && managerApprovals.status === 200
        && forbiddenOrHidden(recruiterPayrollAdjustments)
        && forbiddenOrHidden(payrollRecruitmentMutation)
        && forbiddenOrHidden(payrollHrDocument)
        && forbiddenOrHidden(recruiterPayrollDocument),
    };

    results.exportSecurity = {
      employeePayrollExportStatus: employeePayrollExport.status,
      managerPayrollExportStatus: managerPayrollExport.status,
      recruiterPayrollExportStatus: recruiterPayrollExport.status,
      recruiterRecruitmentExportStatus: recruiterRecruitmentExport.status,
      recruiterRecruitmentExportDownload: isDownload(recruiterRecruitmentExport, /csv|octet-stream|text\/plain/i),
      employeeForeignFileDownloadStatus: employeeForeignFileDownload.status,
      employeeForeignFileFixture: foreignFile ? { id: foreignFile.id, employeeId: Number(foreignFile.employee_id || foreignFile.employeeId) } : null,
      employeeFilesScopedOwn: employeeFileIds.every((id) => !id || id === employeeId),
      managerFilesScopedTeam: managerFileIds.every((id) => managerTeamIds.includes(id)),
      payrollGenericFilesHidden: payrollFiles.status === 200 && payrollFileCount === 0,
      recruiterGenericFilesHidden: recruiterFiles.status === 200 && recruiterFileCount === 0,
      passed: forbiddenOrHidden(employeePayrollExport)
        && forbiddenOrHidden(managerPayrollExport)
        && forbiddenOrHidden(recruiterPayrollExport)
        && isDownload(recruiterRecruitmentExport, /csv|octet-stream|text\/plain/i)
        && (!foreignFile || forbiddenOrHidden(employeeForeignFileDownload))
        && employeeFileIds.every((id) => !id || id === employeeId)
        && managerFileIds.every((id) => managerTeamIds.includes(id))
        && payrollFiles.status === 200 && payrollFileCount === 0
        && recruiterFiles.status === 200 && recruiterFileCount === 0,
    };

    const employeeNotificationIds = data(employeeNotifications.body).map((n) => Number(n.id));
    results.notifications = {
      createStatus: notificationCreate.status,
      hrNotificationId: notificationId || null,
      employeeReadForeignStatus: employeeReadForeignNotification.status,
      employeeOwnNotificationIds: unique(employeeNotificationIds).slice(0, 10),
      employeeUnreadStatus: employeeUnread.status,
      legacyNotificationsStatus: legacyNotifications.status,
      legacyMatchesCenterShape: Array.isArray(legacyNotifications.body?.data),
      foreignNotificationNotVisible: notificationId ? !employeeNotificationIds.includes(Number(notificationId)) : true,
      passed: notificationCreate.status === 201
        && notificationId
        && employeeReadForeignNotification.status === 200
        && employeeReadForeignNotification.body?.data?.updated === 0
        && employeeUnread.status === 200
        && legacyNotifications.status === 200
        && (notificationId ? !employeeNotificationIds.includes(Number(notificationId)) : true),
    };

    results.tenant = {
      crossCompanyEmployeeDocumentStatus: crossEmployeeDoc.status,
      employeeOtherProfileStatus: employeeOtherProfile.status,
      employeeOtherDocumentsStatus: employeeOtherDocuments.status,
      employeeOtherLeaveBalancesStatus: employeeOtherLeaveBalances.status,
      fileDownloadCrossEmployeeStatus: employeeForeignFileDownload.status,
      fileDownloadCrossEmployeeTested: !!foreignFile,
      passed: crossEmployeeDoc.status === 400
        && forbiddenOrHidden(employeeOtherProfile)
        && forbiddenOrHidden(employeeOtherDocuments)
        && forbiddenOrHidden(employeeOtherLeaveBalances)
        && (!foreignFile || forbiddenOrHidden(employeeForeignFileDownload)),
    };

    results.legacyRoutes = {
      employeeLegacyDocumentsStatus: employeeOtherDocuments.status,
      employeeLegacyLeaveBalancesStatus: employeeOtherLeaveBalances.status,
      genericFilesEmployeeStatus: employeeFiles.status,
      genericFilesManagerStatus: managerFiles.status,
      genericFilesPayrollStatus: payrollFiles.status,
      genericFilesRecruiterStatus: recruiterFiles.status,
      legacyNotificationsStatus: legacyNotifications.status,
      passed: forbiddenOrHidden(employeeOtherDocuments)
        && forbiddenOrHidden(employeeOtherLeaveBalances)
        && employeeFiles.status === 200
        && managerFiles.status === 200
        && payrollFiles.status === 200
        && recruiterFiles.status === 200
        && legacyNotifications.status === 200,
    };

    results.status = results.health.status === 200
      && Object.values(results.logins).every((l) => l.status === 200)
      && results.rbac.passed
      && results.tenant.passed
      && results.exportSecurity.passed
      && results.notifications.passed
      && results.legacyRoutes.passed
      ? "GO"
      : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(outputs.results, JSON.stringify(results, null, 2));
    fs.writeFileSync(outputs.tenant, JSON.stringify({ generatedAt: results.generatedAt, status: results.tenant.passed ? "GO" : "NO-GO", tenant: results.tenant, fixtures: results.fixtures }, null, 2));
    fs.writeFileSync(outputs.rbac, JSON.stringify({ generatedAt: results.generatedAt, status: results.rbac.passed ? "GO" : "NO-GO", rbac: results.rbac, fixtures: results.fixtures }, null, 2));
    fs.writeFileSync(outputs.exports, JSON.stringify({ generatedAt: results.generatedAt, status: results.exportSecurity.passed ? "GO" : "NO-GO", exportSecurity: results.exportSecurity }, null, 2));
    fs.writeFileSync(outputs.notifications, JSON.stringify({ generatedAt: results.generatedAt, status: results.notifications.passed ? "GO" : "NO-GO", notifications: results.notifications }, null, 2));
    console.log(JSON.stringify({
      status: results.status,
      rbac: results.rbac.passed,
      tenant: results.tenant.passed,
      exportSecurity: results.exportSecurity.passed,
      notifications: results.notifications.passed,
      errors: results.errors,
    }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
