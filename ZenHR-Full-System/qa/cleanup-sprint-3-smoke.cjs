const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const out = path.join(__dirname, "cleanup-sprint-3-results.json");
const leaveOut = path.join(__dirname, "cleanup-sprint-3-leave-results.json");
const payrollOut = path.join(__dirname, "cleanup-sprint-3-payroll-results.json");
const rbacOut = path.join(__dirname, "cleanup-sprint-3-rbac-results.json");

const roles = ["hr", "payroll", "manager", "employee", "recruiter", "admin"];
const tokens = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  leave: {},
  payroll: {},
  rbac: {},
  notifications: {},
  approvals: {},
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

function futureDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function approveUntilFinal(id) {
  const first = await api("hr", "POST", `/api/leave/requests/${id}/approve`, { notes: "Cleanup Sprint 3 legacy wrapper approval 1" });
  const detail1 = await api("hr", "GET", `/api/leave/requests/${id}`);
  let second = { status: 0, body: null };
  if (detail1.body?.data?.status !== "approved") {
    second = await api("hr", "POST", `/api/leave/requests/${id}/approve`, { notes: "Cleanup Sprint 3 legacy wrapper approval 2" });
  }
  const detail2 = await api("hr", "GET", `/api/leave/requests/${id}`);
  return { first, second, detail1, detail2 };
}

async function exerciseLeaveConsolidation() {
  const employeeId = results.logins.employee.employeeId;
  const types = await api("hr", "GET", "/api/leave/types");
  const enterpriseTypes = await api("hr", "GET", "/api/leave/management/types");
  const policies = await api("hr", "GET", "/api/leave/policies");
  const legacyBalances = await api("employee", "GET", "/api/leave/me/balances");
  const enterpriseBalances = await api("employee", "GET", "/api/leave/management/balances");
  const availableTypes = types.body?.data || [];
  const unpaid = availableTypes.find(t => String(t.code || "").toLowerCase().includes("unpaid") || t.isPaid === false) || availableTypes[0];
  const startDate = futureDate(1800 + Math.floor(Math.random() * 900));
  const endDate = startDate;
  const beforePreview = await api("payroll", "GET", `/api/payroll/preview/${employeeId}?month=${Number(startDate.slice(5, 7))}&year=${startDate.slice(0, 4)}`);
  const create = unpaid ? await api("employee", "POST", "/api/leave/me/requests", {
    leaveTypeId: unpaid.id,
    startDate,
    endDate,
    reason: "Cleanup Sprint 3 legacy compatibility request",
  }) : { status: 0, body: { message: "No leave types" } };
  const id = create.body?.data?.id;
  const afterCreateDetail = id ? await api("employee", "GET", `/api/leave/requests/${id}`) : { status: 0, body: {} };
  const pending = await api("hr", "GET", "/api/approvals/pending?domain=leave");
  const foundInApprovals = (pending.body?.data?.items || []).some(item => Number(item.entityId) === Number(id));
  const approval = id ? await approveUntilFinal(id) : null;
  const finalDetail = id ? await api("hr", "GET", `/api/leave/management/requests/${id}`) : { status: 0, body: {} };
  const audit = id ? await api("hr", "GET", `/api/leave/management/audit?leaveRequestId=${id}`) : { status: 0, body: {} };
  const payrollImpact = await api("payroll", "GET", "/api/leave/management/payroll-impact");
  const impactRow = (payrollImpact.body?.data || []).find(row => Number(row.leaveRequestId) === Number(id));
  const afterPreview = await api("payroll", "GET", `/api/payroll/preview/${employeeId}?month=${Number(startDate.slice(5, 7))}&year=${startDate.slice(0, 4)}`);
  const notificationCenter = await api("employee", "GET", "/api/notifications/center?pageSize=20");
  const legacyList = await api("employee", "GET", "/api/leave/me/requests");
  const enterpriseList = await api("employee", "GET", "/api/leave/management/requests");
  const invalid = await api("employee", "POST", "/api/leave/me/requests", {
    leaveTypeId: "UNMAPPED_LEGACY_TYPE_FOR_SPRINT_3",
    startDate: futureDate(80),
    endDate: futureDate(80),
    reason: "Should fail safely",
  });

  results.leave = {
    legacyTypesStatus: types.status,
    enterpriseTypesStatus: enterpriseTypes.status,
    legacyPoliciesStatus: policies.status,
    legacyBalancesStatus: legacyBalances.status,
    enterpriseBalancesStatus: enterpriseBalances.status,
    selectedType: unpaid || null,
    createLegacyWrapperStatus: create.status,
    createdRequestId: id,
    createdViaEnterpriseShape: Boolean(afterCreateDetail.body?.data?.approvalSteps),
    foundInUnifiedApprovals: foundInApprovals,
    approvalStatuses: approval ? [approval.first.status, approval.second.status || null] : [],
    finalStatus: finalDetail.body?.data?.status,
    auditStatus: audit.status,
    auditRows: audit.body?.data?.length || 0,
    payrollImpactStatus: payrollImpact.status,
    payrollImpactCreated: Boolean(impactRow) || unpaid?.isPaid !== false,
    legacyListStatus: legacyList.status,
    enterpriseListStatus: enterpriseList.status,
    legacyAndEnterpriseSeeRequest: Boolean((legacyList.body?.data || []).some(row => Number(row.id) === Number(id))) &&
      Boolean(((enterpriseList.body?.data?.items || enterpriseList.body?.data || [])).some(row => Number(row.id) === Number(id))),
    unmappedLegacyFailsSafely: invalid.status === 400,
  };

  results.payroll = {
    beforePreviewStatus: beforePreview.status,
    afterPreviewStatus: afterPreview.status,
    beforeLeaveDeduction: beforePreview.body?.data?.leaveDeduction,
    afterLeaveDeduction: afterPreview.body?.data?.leaveDeduction,
    leaveImpactInPolicySnapshot: afterPreview.body?.data?.payrollPolicy?.leaveImpact || null,
    enterpriseUnpaidLeaveIsPayrollSource: afterPreview.status === 200 && Number(afterPreview.body?.data?.payrollPolicy?.leaveImpact?.days || 0) >= 1,
  };

  results.notifications.employeeCenterStatus = notificationCenter.status;
  results.notifications.leaveNotificationPresent = (notificationCenter.body?.data?.items || []).some(n => String(n.entityType) === "leave_request" && Number(n.entityId) === Number(id));
  results.approvals.pendingStatus = pending.status;
}

async function exerciseRbac() {
  const recruiterCreate = await api("recruiter", "POST", "/api/leave/requests", {
    employeeId: results.logins.employee.employeeId,
    leaveTypeId: 1,
    startDate: futureDate(90),
    endDate: futureDate(90),
    reason: "Forbidden smoke",
  });
  const employeePayrollImpact = await api("employee", "GET", "/api/leave/management/payroll-impact");
  const employeeApprovals = await api("employee", "GET", "/api/approvals/pending");
  const payrollPoliciesMutation = await api("payroll", "PUT", "/api/leave/policies", []);
  results.rbac = {
    recruiterCreateStatus: recruiterCreate.status,
    employeePayrollImpactStatus: employeePayrollImpact.status,
    employeeApprovalsStatus: employeeApprovals.status,
    payrollCanUpdateCompatibilityPoliciesStatus: payrollPoliciesMutation.status,
    recruiterForbidden: recruiterCreate.status === 403,
    employeeCannotReadPayrollImpact: employeePayrollImpact.status === 403,
    employeeCannotAccessApprovals: employeeApprovals.status === 403,
  };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of roles) await login(role);
    await exerciseLeaveConsolidation();
    await exerciseRbac();
    const loginsOk = roles.every(role => results.logins[role].status === 200);
    const leaveOk = results.leave.createLegacyWrapperStatus === 201 &&
      results.leave.createdViaEnterpriseShape &&
      results.leave.foundInUnifiedApprovals &&
      results.leave.finalStatus === "approved" &&
      results.leave.auditRows > 0 &&
      results.leave.legacyAndEnterpriseSeeRequest &&
      results.leave.unmappedLegacyFailsSafely;
    const payrollOk = results.payroll.afterPreviewStatus === 200 && results.payroll.enterpriseUnpaidLeaveIsPayrollSource;
    const rbacOk = results.rbac.recruiterForbidden && results.rbac.employeeCannotReadPayrollImpact && results.rbac.employeeCannotAccessApprovals;
    results.status = results.health.ok && loginsOk && leaveOk && payrollOk && rbacOk ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(leaveOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, leave: results.leave, notifications: results.notifications, approvals: results.approvals }, null, 2));
    fs.writeFileSync(payrollOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, payroll: results.payroll }, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, rbac: results.rbac }, null, 2));
    if (results.status !== "GO") process.exitCode = 1;
  }
}

main();
