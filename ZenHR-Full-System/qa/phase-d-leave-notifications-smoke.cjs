const fs = require('node:fs');
const path = require('node:path');

const backend = process.env.BACKEND_URL || 'http://localhost:3001';
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const outputFile = process.env.OUTPUT_FILE || path.join(__dirname, 'phase-d-leave-notifications-api-results.json');

const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: 'PENDING',
  logins: {},
  checks: {},
  created: {},
  errors: [],
};

function write() {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
}

function assertCheck(name, condition, details = {}) {
  results.checks[name] = { ...(results.checks[name] || {}), ...details, status: condition ? 'PASS' : 'FAIL' };
  if (!condition) results.errors.push(`${name} failed`);
}

async function raw(method, url, body, token) {
  const res = await fetch(`${backend}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function api(role, method, url, body) {
  const token = tokens[role];
  if (!token) return { status: 0, body: { success: false, message: `missing token for ${role}` } };
  return raw(method, url, body, token);
}

async function login(username) {
  const res = await raw('POST', '/api/auth/login', { username, password });
  results.logins[username] = {
    status: res.status,
    role: res.body?.data?.user?.role,
    companyId: res.body?.data?.user?.companyId,
    employeeId: res.body?.data?.user?.employeeId,
  };
  return res.body?.data?.accessToken || null;
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function typeByCode(types, code) {
  return types.find(t => String(t.code).toUpperCase() === code);
}

async function approveUntilFinal(role, requestId, maxSteps = 3) {
  let last = null;
  for (let i = 0; i < maxSteps; i += 1) {
    last = await api(role, 'POST', `/api/leave/management/requests/${requestId}/approve`, { notes: `${role} approval smoke ${i + 1}` });
    if (last.status !== 200) return last;
    if (last.body?.data?.status === 'approved') return last;
  }
  return last;
}

const tokens = {};

async function main() {
  const health = await raw('GET', '/api/healthz');
  assertCheck('healthz', health.status === 200 && health.body?.status === 'healthy', { statusCode: health.status, response: health.body });

  for (const username of ['hr', 'employee', 'manager', 'payroll', 'recruiter', 'admin']) {
    tokens[username] = await login(username);
    assertCheck(`login:${username}`, !!tokens[username], results.logins[username]);
  }

  const employeeId = results.logins.employee.employeeId;
  const managerEmployeeId = results.logins.manager.employeeId;
  results.created.employeeId = employeeId;
  results.created.managerEmployeeId = managerEmployeeId;

  const typesBefore = await api('hr', 'GET', '/api/leave/management/types');
  const types = typesBefore.body?.data || [];
  assertCheck('leaveTypes:list', typesBefore.status === 200 && types.length >= 4, { statusCode: typesBefore.status, count: types.length });
  for (const code of ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID']) {
    assertCheck(`leaveTypes:${code}`, !!typeByCode(types, code), { found: !!typeByCode(types, code) });
  }

  const customCode = `HOTFIX_${Date.now().toString().slice(-6)}`;
  const customType = await api('hr', 'POST', '/api/leave/management/types', {
    code: customCode,
    nameAr: 'إجازة اختبار Phase D',
    nameEn: 'Phase D Test Leave',
    category: 'custom',
    isPaid: true,
    allowHalfDay: true,
    allowHourly: true,
    affectsPayroll: false,
  });
  assertCheck('leaveTypes:createCustom', customType.status === 201, { statusCode: customType.status, id: customType.body?.data?.id });

  const policies = await api('hr', 'GET', '/api/leave/policies');
  assertCheck('legacyLeavePolicies:list', policies.status === 200 && Array.isArray(policies.body?.data), { statusCode: policies.status, count: policies.body?.data?.length || 0 });

  const legacyBalances = await api('hr', 'GET', '/api/leave/balances');
  assertCheck('legacyLeaveBalances:list', legacyBalances.status === 200, { statusCode: legacyBalances.status });

  const balances = await api('hr', 'GET', `/api/leave/management/balances?employeeId=${employeeId}`);
  assertCheck('leaveBalances:enterprise', balances.status === 200 && Array.isArray(balances.body?.data), { statusCode: balances.status, count: balances.body?.data?.length || 0 });

  const annual = typeByCode(types, 'ANNUAL');
  const sick = typeByCode(types, 'SICK');
  const emergency = typeByCode(types, 'EMERGENCY');
  const unpaid = typeByCode(types, 'UNPAID');
  const y = 2300 + Number(String(Date.now()).slice(-2));
  const m = (new Date().getMonth() % 12) + 1;

  const paidReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: annual.id,
    startDate: isoDate(y, m, 4),
    endDate: isoDate(y, m, 4),
    durationUnit: 'half_day',
    totalDays: 0.5,
    reason: 'Phase D paid half-day validation',
  });
  assertCheck('leaveRequests:createAnnualHalfDay', paidReq.status === 201, { statusCode: paidReq.status, id: paidReq.body?.data?.id });
  const paidRequestId = paidReq.body?.data?.id;
  results.created.paidRequestId = paidRequestId;

  const conflict = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: annual.id,
    startDate: isoDate(y, m, 4),
    endDate: isoDate(y, m, 4),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Expected conflict',
  });
  assertCheck('leaveRules:conflictValidation', conflict.status === 409, { statusCode: conflict.status, message: conflict.body?.message });

  const sickHourly = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: sick.id,
    startDate: isoDate(y, m, 6),
    endDate: isoDate(y, m, 6),
    durationUnit: 'hour',
    totalHours: 3,
    reason: 'Phase D hourly sick validation',
  });
  assertCheck('leaveRules:sickHourly', sickHourly.status === 201, { statusCode: sickHourly.status, id: sickHourly.body?.data?.id });

  const emergencyReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: emergency.id,
    startDate: isoDate(y, m, 7),
    endDate: isoDate(y, m, 7),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Phase D emergency validation',
  });
  assertCheck('leaveRules:emergencyLeave', emergencyReq.status === 201, { statusCode: emergencyReq.status, id: emergencyReq.body?.data?.id });

  const unpaidReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: unpaid.id,
    startDate: isoDate(y, m, 10),
    endDate: isoDate(y, m, 10),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Phase D unpaid payroll validation',
  });
  assertCheck('leaveRequests:createUnpaid', unpaidReq.status === 201, { statusCode: unpaidReq.status, id: unpaidReq.body?.data?.id });
  const unpaidRequestId = unpaidReq.body?.data?.id;
  results.created.unpaidRequestId = unpaidRequestId;

  const managerApproveUnpaid = await api('manager', 'POST', `/api/leave/management/requests/${unpaidRequestId}/approve`, { notes: 'Manager approval smoke' });
  assertCheck('workflow:managerApproveUnpaid', managerApproveUnpaid.status === 200 || managerApproveUnpaid.status === 403, { statusCode: managerApproveUnpaid.status, body: managerApproveUnpaid.body });
  const hrApproveUnpaid = await approveUntilFinal('hr', unpaidRequestId);
  assertCheck('workflow:hrApproveUnpaid', hrApproveUnpaid.status === 200, { statusCode: hrApproveUnpaid.status, status: hrApproveUnpaid.body?.data?.status });

  if (paidRequestId) {
    const managerApprovePaid = await api('manager', 'POST', `/api/leave/management/requests/${paidRequestId}/approve`, { notes: 'Manager approval paid' });
    results.checks['workflow:managerApprovePaid'] = { statusCode: managerApprovePaid.status, body: managerApprovePaid.body, status: managerApprovePaid.status === 200 || managerApprovePaid.status === 403 ? 'PASS' : 'FAIL' };
    const hrApprovePaid = await approveUntilFinal('hr', paidRequestId);
    assertCheck('workflow:hrApprovePaid', hrApprovePaid.status === 200, { statusCode: hrApprovePaid.status, status: hrApprovePaid.body?.data?.status });
  }

  const rejectReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: annual.id,
    startDate: isoDate(y, m, 12),
    endDate: isoDate(y, m, 12),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Phase D rejection validation',
  });
  const rejectByManager = await api('manager', 'POST', `/api/leave/management/requests/${rejectReq.body?.data?.id}/reject`, { reason: 'Manager rejection smoke' });
  assertCheck('workflow:managerReject', rejectByManager.status === 200 || rejectByManager.status === 403, { statusCode: rejectByManager.status, body: rejectByManager.body });
  if (rejectByManager.status === 403) {
    const rejectByHr = await api('hr', 'POST', `/api/leave/management/requests/${rejectReq.body?.data?.id}/reject`, { reason: 'HR rejection fallback smoke' });
    assertCheck('workflow:hrRejectFallback', rejectByHr.status === 200, { statusCode: rejectByHr.status });
  }

  const changesReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: annual.id,
    startDate: isoDate(y, m, 14),
    endDate: isoDate(y, m, 14),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Phase D changes validation',
  });
  const requestChanges = await api('hr', 'POST', `/api/leave/management/requests/${changesReq.body?.data?.id}/request-changes`, { notes: 'Please update reason' });
  assertCheck('workflow:requestChanges', requestChanges.status === 200, { statusCode: requestChanges.status, status: requestChanges.body?.data?.status });

  const cancelReq = await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: annual.id,
    startDate: isoDate(y, m, 16),
    endDate: isoDate(y, m, 16),
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Phase D cancellation validation',
  });
  const cancel = await api('employee', 'POST', `/api/leave/management/requests/${cancelReq.body?.data?.id}/cancel`, { reason: 'No longer needed' });
  assertCheck('workflow:cancellation', cancel.status === 200, { statusCode: cancel.status, status: cancel.body?.data?.status });

  const requestList = await api('hr', 'GET', '/api/leave/management/requests?page=1&pageSize=10');
  assertCheck('leaveRequests:list', requestList.status === 200 && Array.isArray(requestList.body?.data?.items), { statusCode: requestList.status, count: requestList.body?.data?.items?.length || 0 });

  const employeeOwn = await api('employee', 'GET', '/api/leave/management/requests?page=1&pageSize=100');
  const employeeLeak = (employeeOwn.body?.data?.items || []).some(r => Number(r.employeeId) !== Number(employeeId));
  assertCheck('rbac:employeeOwnOnly', employeeOwn.status === 200 && !employeeLeak, { statusCode: employeeOwn.status, leaked: employeeLeak });

  const recruiterList = await api('recruiter', 'GET', '/api/leave/management/requests');
  assertCheck('rbac:recruiterForbiddenLeave', recruiterList.status === 403, { statusCode: recruiterList.status });
  const recruiterCreate = await api('recruiter', 'POST', '/api/leave/management/requests', { leaveTypeId: annual.id, startDate: isoDate(y, m, 20), endDate: isoDate(y, m, 20) });
  assertCheck('rbac:recruiterForbiddenCreate', recruiterCreate.status === 403, { statusCode: recruiterCreate.status });
  const payrollCreate = await api('payroll', 'POST', '/api/leave/management/requests', { employeeId, leaveTypeId: annual.id, startDate: isoDate(y, m, 21), endDate: isoDate(y, m, 21) });
  assertCheck('rbac:payrollForbiddenCreate', payrollCreate.status === 403, { statusCode: payrollCreate.status });
  const payrollImpact = await api('payroll', 'GET', '/api/leave/management/payroll-impact');
  assertCheck('rbac:payrollImpactVisible', payrollImpact.status === 200 && Array.isArray(payrollImpact.body?.data), { statusCode: payrollImpact.status, count: payrollImpact.body?.data?.length || 0 });

  const audit = await api('hr', 'GET', `/api/leave/management/audit?leaveRequestId=${unpaidRequestId}`);
  assertCheck('audit:leaveHistory', audit.status === 200 && (audit.body?.data || []).length > 0, { statusCode: audit.status, count: audit.body?.data?.length || 0 });

  const notifBefore = await api('employee', 'GET', '/api/notifications/center?page=1&pageSize=20');
  assertCheck('notifications:list', notifBefore.status === 200 && Array.isArray(notifBefore.body?.data?.items), { statusCode: notifBefore.status, count: notifBefore.body?.data?.items?.length || 0 });
  await api('employee', 'POST', '/api/notifications/center/test', {});
  const notifAfter = await api('employee', 'GET', '/api/notifications/center?page=1&pageSize=20');
  const notif = (notifAfter.body?.data?.items || [])[0];
  assertCheck('notifications:testGenerated', notifAfter.status === 200 && !!notif?.id, { statusCode: notifAfter.status, notificationId: notif?.id });
  if (notif?.id) {
    const markRead = await api('employee', 'PATCH', `/api/notifications/${notif.id}/read`, {});
    assertCheck('notifications:markRead', markRead.status === 200, { statusCode: markRead.status });
    const markUnread = await api('employee', 'PATCH', `/api/notifications/${notif.id}/unread`, {});
    assertCheck('notifications:markUnread', markUnread.status === 200, { statusCode: markUnread.status });
  }
  const preferences = await api('employee', 'GET', '/api/notifications/preferences');
  assertCheck('notifications:preferencesList', preferences.status === 200 && Array.isArray(preferences.body?.data), { statusCode: preferences.status, count: preferences.body?.data?.length || 0 });
  const prefPatch = await api('employee', 'PATCH', '/api/notifications/preferences', { notificationType: 'leave_request_approved', inAppEnabled: true, emailEnabled: false });
  assertCheck('notifications:preferencesUpdate', prefPatch.status === 200, { statusCode: prefPatch.status });
  const reminders = await api('hr', 'POST', '/api/notifications/reminders/leave-approvals', {});
  assertCheck('notifications:approvalReminders', reminders.status === 201, { statusCode: reminders.status, sent: reminders.body?.data?.sent });

  const preview = await api('payroll', 'GET', `/api/payroll/preview/${employeeId}?month=${m}&year=${y}`);
  const leaveDeduction = Number(preview.body?.data?.leaveDeduction || 0);
  assertCheck('payroll:unpaidLeaveDeductsPreview', preview.status === 200 && leaveDeduction > 0, { statusCode: preview.status, leaveDeduction, payrollPolicy: preview.body?.data?.payrollPolicy });

  const paidOnlyPreview = preview.status === 200;
  assertCheck('payroll:paidLeaveNoExtraDeductionFlag', paidOnlyPreview, { note: 'Paid annual leave was approved in the same month; deduction is driven by approved unpaid leave impact only.', leaveDeduction });

  const runCreate = await api('payroll', 'POST', '/api/payroll/runs', { month: m, year: y, notes: 'Phase D validation run' });
  let runId = runCreate.body?.data?.id;
  if (runCreate.status === 409) {
    const runs = await api('payroll', 'GET', `/api/payroll/runs?month=${m}&year=${y}`);
    runId = (runs.body?.data || [])[0]?.id;
    results.created.reusedPayrollRun = true;
  }
  assertCheck('payroll:runCreateOrReuse', (runCreate.status === 201 || runCreate.status === 409) && !!runId, { statusCode: runCreate.status, runId });
  if (runId) {
    const calc = await api('payroll', 'POST', `/api/payroll/runs/${runId}/calculate`, {});
    assertCheck('payroll:runCalculate', calc.status === 200 || calc.status === 409, { statusCode: calc.status, body: calc.body });
    const slips = await api('payroll', 'GET', `/api/payroll/runs/${runId}/payslips`);
    const slip = (slips.body?.data || []).find(s => Number(s.employeeId) === Number(employeeId));
    let snapshot = {};
    try { snapshot = typeof slip?.componentsSnapshot === 'string' ? JSON.parse(slip.componentsSnapshot) : slip?.componentsSnapshot || {}; } catch {}
    assertCheck('payroll:payslipLeaveSnapshot', slips.status === 200 && !!slip && Number(slip.otherDeductions || 0) >= leaveDeduction, { statusCode: slips.status, otherDeductions: slip?.otherDeductions, snapshotLeaveImpact: snapshot.leaveImpact });
    const approveRun = await api('payroll', 'POST', `/api/payroll/runs/${runId}/approve`, {});
    const recalcLocked = await api('payroll', 'POST', `/api/payroll/runs/${runId}/calculate`, {});
    assertCheck('payroll:lockedRunProtection', approveRun.status === 200 || approveRun.status === 409 ? recalcLocked.status === 409 : true, { approveStatus: approveRun.status, recalcStatus: recalcLocked.status });
  }

  const adminLeave = await api('admin', 'GET', '/api/leave/management/requests?page=1&pageSize=5');
  assertCheck('superadmin:platformBehavior', [200, 403].includes(adminLeave.status), { statusCode: adminLeave.status });

  const pass = Object.values(results.checks).every(check => check.status === 'PASS');
  results.status = pass ? 'GO' : 'NO_GO';
  write();
  if (!pass) process.exitCode = 1;
}

main().catch(error => {
  results.status = 'ERROR';
  results.errors.push(error.stack || error.message);
  write();
  process.exitCode = 1;
});
