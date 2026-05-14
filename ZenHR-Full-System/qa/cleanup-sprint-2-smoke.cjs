const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "cleanup-sprint-2-results.json");
const rbacOut = path.join(__dirname, "cleanup-sprint-2-rbac-results.json");
const notifOut = path.join(__dirname, "cleanup-sprint-2-notifications-results.json");

const roles = ["hr", "payroll", "manager", "employee", "recruiter", "admin"];
const tokens = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  approvals: {},
  notifications: {},
  rbac: {},
  errors: [],
};

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: response.status, ok: response.ok, body: json };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
}

async function login(role) {
  const r = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = r.body?.data?.accessToken || null;
  results.logins[role] = {
    status: r.status,
    role: r.body?.data?.user?.role,
    companyId: r.body?.data?.user?.companyId,
    employeeId: r.body?.data?.user?.employeeId,
  };
}

async function exerciseNotificationCenter() {
  const beforeCenter = await api("hr", "GET", "/api/notifications/center?pageSize=10");
  const beforeLegacy = await api("hr", "GET", "/api/notifications?limit=10");
  const unreadCenter = await api("hr", "GET", "/api/notifications/center/unread-count");
  const unreadLegacy = await api("hr", "GET", "/api/notifications/unread-count");
  const test1 = await api("hr", "POST", "/api/notifications/center/test", {});
  const test2 = await api("hr", "POST", "/api/notifications/center/test", {});
  const after = await api("hr", "GET", "/api/notifications/center?pageSize=20");
  const items = after.body?.data?.items || [];
  const testItems = items.filter(n => n.notificationType === "phase_d_test");
  const firstId = items[0]?.id;
  const read = firstId ? await api("hr", "PATCH", `/api/notifications/center/${firstId}/read`, {}) : { status: 0 };
  const unread = firstId ? await api("hr", "PATCH", `/api/notifications/${firstId}/unread`, {}) : { status: 0 };
  const readAll = await api("hr", "PATCH", "/api/notifications/read-all", {});
  const prefsGet = await api("hr", "GET", "/api/notifications/center/preferences");
  const prefsPatch = await api("hr", "PATCH", "/api/notifications/center/preferences", { notificationType: "leave_request_approved", inAppEnabled: true, emailEnabled: false });
  results.notifications = {
    beforeCenterStatus: beforeCenter.status,
    beforeLegacyStatus: beforeLegacy.status,
    unreadCenterStatus: unreadCenter.status,
    unreadLegacyStatus: unreadLegacy.status,
    unreadCountsMatch: unreadCenter.body?.data?.count === unreadLegacy.body?.data?.count,
    testStatuses: [test1.status, test2.status],
    dedupeCheck: { phaseDTestRowsInLatestPage: testItems.length, note: "Duplicate prevention is enforced for unread rows with same recipient/type/entity." },
    readStatus: read.status,
    unreadLegacyWrapperStatus: unread.status,
    readAllLegacyWrapperStatus: readAll.status,
    preferences: { getStatus: prefsGet.status, patchStatus: prefsPatch.status },
  };
}

async function exerciseApprovals() {
  const employeeId = results.logins.employee.employeeId;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const employeeBefore = employeeId ? await api("hr", "GET", `/api/employees/${employeeId}`) : { status: 0, body: {} };
  const currentSalary = Number(employeeBefore.body?.data?.basicSalary || 500);
  const employeeAction = employeeId ? await api("hr", "POST", "/api/workflow/requests", {
    employeeId,
    actionType: "salary_change",
    effectiveDate: tomorrow,
    basicSalary: currentSalary + 0.001,
    notes: "Cleanup Sprint 2 unified approval projection smoke",
  }) : { status: 0 };
  const attendanceCorrection = await api("employee", "POST", "/api/attendance/me/requests", {
    requestType: "time_correction",
    requestDate: yesterday,
    requestedClockIn: `${yesterday}T10:15:00.000Z`,
    requestedClockOut: `${yesterday}T17:00:00.000Z`,
    reason: "Cleanup Sprint 2 unified approval projection smoke",
  });

  for (const role of roles) {
    const pending = await api(role, "GET", "/api/approvals/pending");
    results.approvals[role] = {
      pendingStatus: pending.status,
      total: pending.body?.data?.total,
      domains: [...new Set((pending.body?.data?.items || []).map(i => i.domain))],
      sample: (pending.body?.data?.items || [])[0] || null,
    };
  }
  results.approvals.seededProjectionRecords = {
    employeeActionStatus: employeeAction.status,
    employeeActionId: employeeAction.body?.data?.id,
    attendanceCorrectionStatus: attendanceCorrection.status,
    attendanceCorrectionId: attendanceCorrection.body?.data?.id,
  };
  results.rbac.employeeCannotAccessApprovals = results.approvals.employee.pendingStatus === 403;

  const types = await api("hr", "GET", "/api/payroll-adjustments/types");
  const typeId = (types.body?.data || [])[0]?.id;
  const create = typeId && employeeId ? await api("hr", "POST", "/api/payroll-adjustments", {
    employeeId,
    adjustmentTypeId: typeId,
    direction: "add",
    calculationMode: "after_net",
    recurrenceType: "one_time",
    amount: 1,
    status: "pending",
    titleAr: "اختبار اعتماد موحد",
    titleEn: "Unified approval smoke",
    reasonEn: "Cleanup Sprint 2 unified approval action smoke",
  }) : { status: 0, body: { message: "Missing type or employee" } };
  const createdId = create.body?.data?.id;
  const pendingAfterCreate = await api("hr", "GET", "/api/approvals/pending?domain=payroll_adjustment");
  const found = (pendingAfterCreate.body?.data?.items || []).find(i => Number(i.entityId) === Number(createdId));
  const action = found ? await api("hr", "POST", `/api/approvals/payroll_adjustment/${createdId}/action`, { action: "approve", notes: "Unified approvals smoke" }) : { status: 0, body: { message: "Created adjustment not found in unified inbox" } };
  const detail = createdId ? await api("hr", "GET", `/api/payroll-adjustments/${createdId}`) : { status: 0 };
  results.approvals.actionSmoke = {
    typeStatus: types.status,
    createStatus: create.status,
    createdId,
    appearedInUnifiedInbox: Boolean(found),
    actionStatus: action.status,
    resultingStatus: detail.body?.data?.status,
    currentApprovalStep: detail.body?.data?.approvalStep,
  };
  const hrDomains = new Set(results.approvals.hr.domains || []);
  results.approvals.domainVisibility = {
    expected: ["employee_action", "leave", "payroll_adjustment", "attendance_correction", "recruitment", "performance", "compliance_contract"],
    observedForHr: [...hrDomains],
    missingForHr: ["employee_action", "leave", "payroll_adjustment", "attendance_correction", "recruitment", "performance", "compliance_contract"].filter(domain => !hrDomains.has(domain)),
  };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of roles) await login(role);
    await exerciseApprovals();
    await exerciseNotificationCenter();
    const approvalOk = results.rbac.employeeCannotAccessApprovals && results.approvals.actionSmoke.actionStatus === 200 && results.approvals.domainVisibility.missingForHr.length === 0;
    const notificationOk = results.notifications.beforeCenterStatus === 200 &&
      results.notifications.beforeLegacyStatus === 200 &&
      results.notifications.unreadCountsMatch &&
      results.notifications.readStatus === 200 &&
      results.notifications.unreadLegacyWrapperStatus === 200 &&
      results.notifications.readAllLegacyWrapperStatus === 200 &&
      results.notifications.preferences.patchStatus === 200;
    results.status = results.health.ok && roles.every(r => results.logins[r].status === 200) && approvalOk && notificationOk ? "GO" : "NO-GO";
  } catch (e) {
    results.status = "NO-GO";
    results.errors.push(e?.stack || String(e));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, rbac: results.rbac, approvals: results.approvals }, null, 2));
    fs.writeFileSync(notifOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, notifications: results.notifications }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
