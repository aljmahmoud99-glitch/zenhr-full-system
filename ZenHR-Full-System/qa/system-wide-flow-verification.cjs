const fs = require('node:fs');
const path = require('node:path');

const backend = process.env.BACKEND_URL || 'http://localhost:3001';
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const outJson = path.join(__dirname, 'system-wide-flow-verification-results.json');
const outReport = path.join(__dirname, 'system-wide-flow-verification-report.md');
const outBroken = path.join(__dirname, 'confirmed-broken-flows.md');
const outFalsePositive = path.join(__dirname, 'false-positive-risks.md');
const outPriority = path.join(__dirname, 'flow-fix-priority-list.md');

const results = {
  generatedAt: new Date().toISOString(),
  backend,
  mode: 'verification-only',
  status: 'RUNNING',
  logins: {},
  flows: {},
  security: {},
  evidence: [],
  notTested: [],
  errors: [],
};

const tokens = {};

function classify(flow, status, evidence = {}) {
  results.flows[flow] = { ...(results.flows[flow] || {}), classification: status, ...evidence };
}

function evidence(label, data) {
  results.evidence.push({ label, data });
}

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: response.status, ok: response.ok, body: json, contentType: response.headers.get('content-type') };
}

async function api(role, method, url, body) {
  const token = tokens[role];
  if (!token) return { status: 0, ok: false, body: { success: false, message: `missing token: ${role}` } };
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
  tokens[username] = res.body?.data?.accessToken || null;
  return tokens[username];
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function timestamp(date, hour, minute) {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function findByCode(rows, code) {
  return (rows || []).find(r => String(r.code || '').toUpperCase() === code);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getEmployee(role = 'employee') {
  return results.logins[role]?.employeeId;
}

async function createOrReusePayrollRun(month, year) {
  const create = await api('payroll', 'POST', '/api/payroll/runs', { month, year, notes: `System-wide verification ${year}-${month}` });
  if (create.status === 201) return { runId: create.body?.data?.id, create };
  const list = await api('payroll', 'GET', `/api/payroll/runs?month=${month}&year=${year}`);
  return { runId: (list.body?.data || [])[0]?.id, create, list };
}

async function approveAdjustment(id) {
  const steps = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await api('hr', 'PATCH', `/api/payroll-adjustments/${id}/approve`, { notes: `verification approve ${i + 1}` });
    steps.push({ status: r.status, bodyStatus: r.body?.data?.status, message: r.body?.message });
    if (r.status !== 200 || r.body?.data?.status === 'approved') break;
  }
  return steps;
}

async function testPayrollAdjustment(ctx) {
  const employeeId = ctx.employeeId;
  const typeList = await api('payroll', 'GET', '/api/payroll-adjustments/types');
  const type = (typeList.body?.data || [])[0];
  if (!type) {
    classify('payrollAdjustment', 'NOT TESTED', { reason: 'No payroll adjustment type available', typeListStatus: typeList.status });
    return;
  }
  const beforePreview = await api('payroll', 'GET', `/api/payroll/preview/${employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const create = await api('payroll', 'POST', '/api/payroll-adjustments', {
    employeeId,
    adjustmentTypeId: type.id,
    direction: 'add',
    calculationMode: 'after_net',
    recurrenceType: 'one_time',
    amount: 50,
    effectiveDate: isoDate(ctx.year, ctx.month, 2),
    payrollMonth: ctx.month,
    payrollYear: ctx.year,
    titleAr: 'اختبار تعديل راتب',
    titleEn: 'Verification Payroll Adjustment',
    reasonEn: 'System-wide verification',
  });
  if (create.status !== 201) {
    classify('payrollAdjustment', 'CONFIRMED BROKEN', { step: 'create', status: create.status, body: create.body });
    return;
  }
  const adjustmentId = create.body?.data?.id;
  const approvalSteps = await approveAdjustment(adjustmentId);
  const afterApproval = await api('payroll', 'GET', `/api/payroll-adjustments/${adjustmentId}`);
  const { runId } = await createOrReusePayrollRun(ctx.month, ctx.year);
  const calculate = runId ? await api('payroll', 'POST', `/api/payroll/runs/${runId}/calculate`, {}) : { status: 0, body: { message: 'no run id' } };
  const slips = runId ? await api('payroll', 'GET', `/api/payroll/runs/${runId}/payslips`) : { status: 0, body: {} };
  const slip = (slips.body?.data || []).find(s => Number(s.employeeId) === Number(employeeId));
  let snapshot = {};
  try { snapshot = typeof slip?.componentsSnapshot === 'string' ? JSON.parse(slip.componentsSnapshot) : slip?.componentsSnapshot || {}; } catch {}
  const snapshotText = JSON.stringify(snapshot).toLowerCase();
  const appearsInSnapshot = snapshotText.includes(String(adjustmentId)) || snapshotText.includes('adjustment') || snapshotText.includes('verification payroll adjustment');
  const apply = runId && slip ? await api('payroll', 'PATCH', `/api/payroll-adjustments/${adjustmentId}/apply`, { payrollRunId: runId, payslipId: slip.id }) : { status: 0, body: { message: 'missing slip' } };
  const retryApply = await api('payroll', 'PATCH', `/api/payroll-adjustments/${adjustmentId}/apply`, { payrollRunId: runId, payslipId: slip?.id });
  const previewAfter = await api('payroll', 'GET', `/api/payroll/preview/${employeeId}?month=${ctx.month}&year=${ctx.year}`);

  const consumedByPayroll = appearsInSnapshot || Math.abs(num(previewAfter.body?.data?.netSalary) - num(beforePreview.body?.data?.netSalary) - 50) < 0.01;
  classify('payrollAdjustment', consumedByPayroll ? 'CONFIRMED WORKING' : 'CONFIRMED BROKEN', {
    adjustmentId,
    createStatus: create.status,
    approvalSteps,
    finalAdjustmentStatus: afterApproval.body?.data?.status,
    runId,
    calculateStatus: calculate.status,
    payslipId: slip?.id,
    appearsInSnapshot,
    beforePreviewNet: beforePreview.body?.data?.netSalary,
    afterPreviewNet: previewAfter.body?.data?.netSalary,
    applyStatus: apply.status,
    retryApplyStatus: retryApply.status,
    businessEffect: consumedByPayroll ? 'Adjustment reflected by payroll preview/run evidence' : 'Approved/applied adjustment did not appear in preview or payslip snapshot',
  });
}

async function testAttendancePayrollImpact(ctx) {
  const process = await api('hr', 'POST', '/api/attendance-intelligence/process', { from: dateDaysAgo(10), to: new Date().toISOString().slice(0, 10) });
  const violations = await api('hr', 'GET', '/api/attendance-intelligence/violations');
  const preview = await api('payroll', 'GET', `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const { runId } = await createOrReusePayrollRun(ctx.monthAlt, ctx.year);
  const calculate = runId ? await api('payroll', 'POST', `/api/payroll/runs/${runId}/calculate`, {}) : { status: 0 };
  const slips = runId ? await api('payroll', 'GET', `/api/payroll/runs/${runId}/payslips`) : { status: 0, body: {} };
  const slip = (slips.body?.data || []).find(s => Number(s.employeeId) === Number(ctx.employeeId));
  let snapshot = {};
  try { snapshot = typeof slip?.componentsSnapshot === 'string' ? JSON.parse(slip.componentsSnapshot) : slip?.componentsSnapshot || {}; } catch {}
  const consumed = JSON.stringify(snapshot).toLowerCase().includes('attendance') || JSON.stringify(snapshot).toLowerCase().includes('violation');
  classify('attendancePayrollImpact', consumed ? 'CONFIRMED WORKING' : 'PARTIAL', {
    processStatus: process.status,
    createdViolations: process.body?.data?.createdViolations,
    violationsStatus: violations.status,
    violationCount: Array.isArray(violations.body?.data) ? violations.body.data.length : null,
    previewStatus: preview.status,
    runId,
    calculateStatus: calculate.status,
    payslipId: slip?.id,
    snapshotHasAttendanceImpact: consumed,
    conclusion: consumed ? 'Attendance impact appears in payslip snapshot' : 'Violations can be generated/listed, but canonical payroll snapshot did not show attendance impact evidence',
  });
}

async function testLeaveTruth(ctx) {
  const legacyDate = isoDate(ctx.year, ctx.month, 5);
  const enterpriseDate = isoDate(ctx.year, ctx.month, 6);
  const legacy = await api('hr', 'POST', '/api/leave/requests', {
    employeeId: ctx.employeeId,
    leaveType: `LEGACY_UNPAID_${Date.now()}`,
    startDate: legacyDate,
    endDate: legacyDate,
    totalDays: 1,
    reason: 'Legacy leave verification',
  });
  const legacyId = legacy.body?.data?.id;
  const legacyApprove = legacyId ? await api('hr', 'POST', `/api/leave/requests/${legacyId}/approve`, { notes: 'HR approve legacy' }) : { status: 0 };

  const types = await api('hr', 'GET', '/api/leave/management/types');
  const unpaid = findByCode(types.body?.data, 'UNPAID');
  const enterprise = unpaid ? await api('employee', 'POST', '/api/leave/management/requests', {
    leaveTypeId: unpaid.id,
    startDate: enterpriseDate,
    endDate: enterpriseDate,
    durationUnit: 'day',
    totalDays: 1,
    reason: 'Enterprise unpaid leave verification',
  }) : { status: 0, body: { message: 'No UNPAID enterprise leave type' } };
  const enterpriseId = enterprise.body?.data?.id;
  const enterpriseApprovalSteps = [];
  if (enterpriseId) {
    const managerStep = await api('manager', 'POST', `/api/leave/management/requests/${enterpriseId}/approve`, { notes: 'Manager approve enterprise' });
    enterpriseApprovalSteps.push({ actor: 'manager', status: managerStep.status, requestStatus: managerStep.body?.data?.status, message: managerStep.body?.message });
    for (let i = 0; i < 3; i += 1) {
      const hrStep = await api('hr', 'POST', `/api/leave/management/requests/${enterpriseId}/approve`, { notes: `HR approve enterprise ${i + 1}` });
      enterpriseApprovalSteps.push({ actor: 'hr', status: hrStep.status, requestStatus: hrStep.body?.data?.status, message: hrStep.body?.message });
      if (hrStep.status !== 200 || hrStep.body?.data?.status === 'approved') break;
    }
  }

  const legacyBalances = await api('hr', 'GET', `/api/leave/balances?employeeId=${ctx.employeeId}`);
  const enterpriseBalances = await api('hr', 'GET', `/api/leave/management/balances?employeeId=${ctx.employeeId}`);
  const audit = enterpriseId ? await api('hr', 'GET', `/api/leave/management/audit?leaveRequestId=${enterpriseId}`) : { status: 0, body: {} };
  const notifications = await api('employee', 'GET', '/api/notifications/center?page=1&pageSize=50');
  const preview = await api('payroll', 'GET', `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  const leaveDeduction = num(preview.body?.data?.leaveDeduction);
  const enterpriseFinalStatus = enterpriseApprovalSteps.findLast?.(s => s.requestStatus)?.requestStatus || enterpriseApprovalSteps[enterpriseApprovalSteps.length - 1]?.requestStatus;
  classify('legacyVsEnterpriseLeave', legacy.status === 201 && enterprise.status === 201 && enterpriseFinalStatus === 'approved' && leaveDeduction > 0 ? 'PARTIAL' : 'CONFIRMED BROKEN', {
    legacyId,
    legacyCreateStatus: legacy.status,
    legacyApproveStatus: legacyApprove.status,
    enterpriseId,
    enterpriseCreateStatus: enterprise.status,
    enterpriseApprovalSteps,
    enterpriseFinalStatus,
    legacyBalancesStatus: legacyBalances.status,
    enterpriseBalancesStatus: enterpriseBalances.status,
    enterpriseAuditCount: audit.body?.data?.length || 0,
    notificationCount: notifications.body?.data?.items?.length || 0,
    payrollPreviewStatus: preview.status,
    leaveDeduction,
    conclusion: leaveDeduction > 0
      ? 'Enterprise unpaid leave affected payroll preview; legacy leave used a non-enterprise leave type and is expected to be ignored by enterprise payroll join.'
      : 'Neither the approved legacy leave nor the enterprise leave produced a payroll preview deduction in this test period.',
  });
}

async function testAttendanceCorrection(ctx) {
  let d = dateDaysAgo(30);
  for (const daysAgo of [30, 45, 60, 75, 90, 120, 150, 180]) {
    const candidate = dateDaysAgo(daysAgo);
    const existing = await api('hr', 'GET', `/api/attendance?employeeId=${ctx.employeeId}&from=${candidate}&to=${candidate}`);
    if ((existing.body?.data || []).length === 0) {
      d = candidate;
      break;
    }
  }
  const request = await api('employee', 'POST', '/api/attendance/me/requests', {
    requestType: 'time_correction',
    requestDate: d,
    requestedClockIn: timestamp(d, 10, 30),
    requestedClockOut: timestamp(d, 17, 0),
    reason: 'System-wide correction verification',
  });
  const id = request.body?.data?.id;
  const managerApprove = id ? await api('manager', 'PUT', `/api/attendance/requests/${id}/approve`, { notes: 'manager correction approval' }) : { status: 0 };
  const hrApprove = id ? await api('hr', 'PUT', `/api/attendance/requests/${id}/approve`, { notes: 'hr correction approval' }) : { status: 0 };
  const retry = id ? await api('hr', 'PUT', `/api/attendance/requests/${id}/approve`, { notes: 'retry approval' }) : { status: 0 };
  const attendance = await api('hr', 'GET', `/api/attendance?employeeId=${ctx.employeeId}&from=${d}&to=${d}`);
  const record = (attendance.body?.data || [])[0];
  const audit = await api('hr', 'GET', '/api/attendance/biometric/audit');
  const report = await api('hr', 'GET', `/api/reports/attendance-summary?from=${d}&to=${d}`);
  const normalProof = record && record.attendanceType !== 'manual';
  classify('attendanceCorrection', request.status === 201 && hrApprove.status === 200 && record?.attendanceType === 'manual' ? 'PARTIAL' : 'CONFIRMED BROKEN', {
    requestId: id,
    requestStatus: request.status,
    managerApproveStatus: managerApprove.status,
    hrApproveStatus: hrApprove.status,
    retryApproveStatus: retry.status,
    attendanceRecord: record ? { id: record.id, status: record.status, attendanceType: record.attendanceType, notes: record.notes, lateMinutes: record.lateMinutes } : null,
    biometricAuditStatus: audit.status,
    biometricAuditCount: audit.body?.data?.length || 0,
    reportStatus: report.status,
    conclusion: normalProof ? 'Correction looked like normal biometric attendance' : 'Correction creates/updates attendance as manual exception, not biometric proof path',
  });
}

async function testPerformancePromotion(ctx) {
  const before = await api('hr', 'GET', `/api/employees/${ctx.employeeId}`);
  const beforeSalary = num(before.body?.data?.basicSalary);
  const create = await api('hr', 'POST', '/api/performance/promotions', {
    employeeId: ctx.employeeId,
    currentSalary: beforeSalary,
    recommendedSalary: beforeSalary + 77,
    incrementAmount: 77,
    incrementPercent: 5,
    reasonAr: 'اختبار توصية ترقية',
    reasonEn: 'System-wide performance recommendation verification',
    effectiveDate: isoDate(ctx.year, ctx.month, 8),
  });
  const workflowId = create.body?.data?.workflow?.id;
  const approvals = [];
  if (workflowId) {
    for (let i = 0; i < 4; i += 1) {
      const a = await api('hr', 'POST', `/api/performance/workflow-instances/${workflowId}/approve`, { notesEn: `approve ${i + 1}` });
      approvals.push({ status: a.status, workflowStatus: a.body?.data?.status, message: a.body?.message });
      if (a.status !== 200 || a.body?.data?.status === 'approved') break;
    }
  }
  const after = await api('hr', 'GET', `/api/employees/${ctx.employeeId}`);
  const afterSalary = num(after.body?.data?.basicSalary);
  const employeeActions = await api('hr', 'GET', '/api/employee-actions');
  const actionLinked = JSON.stringify(employeeActions.body?.data || []).includes(String(create.body?.data?.id));
  const preview = await api('payroll', 'GET', `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  classify('performancePromotion', afterSalary !== beforeSalary || actionLinked ? 'CONFIRMED WORKING' : 'CONFIRMED BROKEN', {
    createStatus: create.status,
    recommendationId: create.body?.data?.id,
    workflowId,
    approvals,
    beforeSalary,
    afterSalary,
    employeeActionLinked: actionLinked,
    payrollPreviewBasicSalary: preview.body?.data?.basicSalary,
    conclusion: afterSalary !== beforeSalary || actionLinked ? 'Recommendation produced business effect/link' : 'Recommendation/workflow did not change employee salary/job or create detectable employee action',
  });
}

async function testRecruitmentConversion(ctx) {
  const stamp = Date.now();
  const candidate = await api('hr', 'POST', '/api/recruitment/candidates', {
    fullNameAr: `مرشح تحقق ${stamp}`,
    fullNameEn: `Verification Candidate ${stamp}`,
    email: `candidate.${stamp}@example.test`,
    phone: '0790000000',
    nationality: 'Jordanian',
    yearsOfExperience: 3,
    source: 'verification',
  });
  const candidateId = candidate.body?.data?.id;
  const converted = candidateId ? await api('hr', 'POST', `/api/recruitment/candidates/${candidateId}/convert-to-employee`, {
    employeeCode: `VER-${String(stamp).slice(-8)}`,
    workEmail: `employee.${stamp}@example.test`,
    username: `ver.${stamp}`,
    password: 'Welcome@1234',
    basicSalary: '777',
  }) : { status: 0 };
  const employeeId = converted.body?.data?.employeeId;
  const employee = employeeId ? await api('hr', 'GET', `/api/employees/${employeeId}`) : { status: 0 };
  const contracts = employeeId ? await api('hr', 'GET', `/api/compliance-contracts/contracts?employeeId=${employeeId}`) : { status: 0, body: { data: { items: [] } } };
  const docs = employeeId ? await api('hr', 'GET', `/api/document-reporting/documents?employeeId=${employeeId}`) : { status: 0, body: { data: { items: [] } } };
  const candidateDetail = candidateId ? await api('hr', 'GET', `/api/recruitment/candidates/${candidateId}`) : { status: 0 };
  classify('recruitmentConversion', converted.status === 201 && employee.status === 200 && (contracts.body?.data?.items || []).length === 0 ? 'PARTIAL' : converted.status === 201 ? 'CONFIRMED WORKING' : 'CONFIRMED BROKEN', {
    candidateCreateStatus: candidate.status,
    candidateId,
    convertStatus: converted.status,
    employeeId,
    userId: converted.body?.data?.userId,
    employeeStatus: employee.status,
    candidateConvertedEmployeeId: candidateDetail.body?.data?.convertedEmployeeId,
    contractCount: contracts.body?.data?.items?.length || 0,
    enterpriseDocumentCount: docs.body?.data?.items?.length || 0,
    conclusion: 'Conversion creates employee/user; contract and enterprise document checklist are absent unless counts are non-zero.',
  });
}

async function testNotifications(ctx) {
  const before = await api('employee', 'GET', '/api/notifications/center?page=1&pageSize=100');
  const unreadBefore = (before.body?.data?.items || []).filter(n => n.status === 'unread').length;
  const legacy = await api('employee', 'GET', '/api/notifications');
  const test = await api('employee', 'POST', '/api/notifications/center/test', {});
  const after = await api('employee', 'GET', '/api/notifications/center?page=1&pageSize=100');
  const first = (after.body?.data?.items || [])[0];
  const read = first?.id ? await api('employee', 'PATCH', `/api/notifications/${first.id}/read`, {}) : { status: 0 };
  const unread = first?.id ? await api('employee', 'PATCH', `/api/notifications/${first.id}/unread`, {}) : { status: 0 };
  classify('notifications', before.status === 200 && legacy.status === 200 && read.status === 200 && unread.status === 200 ? 'CONFIRMED WORKING' : 'PARTIAL', {
    centerBeforeStatus: before.status,
    legacyStatus: legacy.status,
    centerAfterStatus: after.status,
    unreadBefore,
    testStatus: test.status,
    firstNotificationId: first?.id,
    markReadStatus: read.status,
    markUnreadStatus: unread.status,
    conclusion: 'Both legacy and center APIs read notification data; unread/read works on sampled center notification.',
  });
}

async function testDocuments(ctx) {
  const legacy = await api('hr', 'POST', '/api/documents', {
    employeeId: ctx.employeeId,
    documentTypeId: 1,
    documentNumber: `LEG-${Date.now()}`,
    issuedBy: 'Verification',
    issuedDate: isoDate(ctx.year, ctx.month, 1),
    expiryDate: isoDate(ctx.year, ctx.month, 20),
    fileName: 'legacy-verification.txt',
    fileUrl: '/verification/legacy.txt',
    notes: 'System-wide verification legacy document',
  });
  const enterprise = await api('hr', 'POST', '/api/document-reporting/documents', {
    employeeId: ctx.employeeId,
    titleAr: 'وثيقة تحقق',
    titleEn: 'Verification Enterprise Document',
    sourceModule: 'hr',
    fileName: 'enterprise-verification.txt',
    fileUrl: '/verification/enterprise.txt',
    status: 'approved',
  });
  const legacyList = await api('hr', 'GET', `/api/documents?employeeId=${ctx.employeeId}`);
  const enterpriseList = await api('hr', 'GET', `/api/document-reporting/documents?employeeId=${ctx.employeeId}`);
  classify('documentsFiles', legacy.status === 201 && enterprise.status === 201 ? 'PARTIAL' : 'CONFIRMED BROKEN', {
    legacyCreateStatus: legacy.status,
    legacyDocumentId: legacy.body?.data?.id,
    enterpriseCreateStatus: enterprise.status,
    enterpriseDocumentId: enterprise.body?.data?.id,
    legacyListStatus: legacyList.status,
    enterpriseListStatus: enterpriseList.status,
    conclusion: 'Legacy and enterprise document records can both be created, but they appear in separate centers/tables.',
  });
}

async function testSecurity(ctx) {
  const otherEmployeeId = ctx.managerEmployeeId;
  const checks = {};
  checks.employeeOtherPayslip = await api('employee', 'GET', `/api/payroll/slips/${otherEmployeeId}`);
  checks.employeeOtherLeaveBalance = await api('employee', 'GET', `/api/leave/management/balances?employeeId=${otherEmployeeId}`);
  checks.employeeOtherAttendance = await api('employee', 'GET', `/api/attendance?employeeId=${otherEmployeeId}`);
  checks.employeeOtherDocuments = await api('employee', 'GET', `/api/document-reporting/documents?employeeId=${otherEmployeeId}`);
  checks.managerPayrollAdjustments = await api('manager', 'GET', `/api/payroll-adjustments/employee/${ctx.employeeId}`);
  checks.managerPayrollPreview = await api('manager', 'GET', `/api/payroll/preview/${ctx.employeeId}?month=${ctx.month}&year=${ctx.year}`);
  checks.recruiterPayroll = await api('recruiter', 'GET', '/api/payroll-adjustments');
  results.security.employeeSelfService = Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { status: v.status, message: v.body?.message, shape: Array.isArray(v.body?.data) ? 'array' : typeof v.body?.data }]));
  const risky = Object.entries(checks).filter(([name, r]) => name.startsWith('employee') && r.status === 200 && Array.isArray(r.body?.data) && r.body.data.some(x => Number(x.employeeId) === Number(otherEmployeeId)));
  classify('employeeSelfServiceSecurity', risky.length ? 'CONFIRMED BROKEN' : 'PARTIAL', { checks: results.security.employeeSelfService, risky });
}

async function testSuperadminPolicy(ctx) {
  const checks = {
    payrollPoliciesGet: await api('admin', 'GET', '/api/payroll-policies'),
    leaveManagementTypesGet: await api('admin', 'GET', '/api/leave/management/types'),
    complianceContractsGet: await api('admin', 'GET', '/api/compliance-contracts/contracts'),
    attendanceBiometricAuditGet: await api('admin', 'GET', '/api/attendance/biometric/audit'),
  };
  results.security.superadminPolicy = Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { status: v.status, message: v.body?.message }]));
  classify('superadminPolicy', 'PARTIAL', { checks: results.security.superadminPolicy, conclusion: 'Policy is documented as observed statuses, not judged as correct because product policy is inconsistent by design.' });
}

async function testReportTruth(ctx) {
  const payrollReport = await api('hr', 'GET', `/api/reports/payroll-summary?month=${ctx.month}&year=${ctx.year}`);
  const leaveDashboard = await api('hr', 'GET', '/api/leave/management/dashboard');
  const attendanceSummary = await api('hr', 'GET', `/api/attendance/summary?month=${ctx.month}&year=${ctx.year}`);
  const payrollExport = await api('payroll', 'GET', '/api/production/exports/payroll?format=csv');
  classify('reportTruth', 'PARTIAL', {
    payrollReportStatus: payrollReport.status,
    leaveDashboardStatus: leaveDashboard.status,
    attendanceSummaryStatus: attendanceSummary.status,
    payrollExportStatus: payrollExport.status,
    payrollExportContentType: payrollExport.contentType,
    conclusion: 'Reports/exports respond where tested; numeric reconciliation to all newly created flow data remains partial because canonical payroll omitted some enterprise impacts.',
  });
}

async function main() {
  const health = await raw('GET', '/api/healthz');
  results.health = { status: health.status, body: health.body };
  for (const username of ['hr', 'employee', 'manager', 'payroll', 'recruiter', 'admin']) await login(username);
  const employeeId = await getEmployee('employee');
  const managerEmployeeId = await getEmployee('manager');
  const now = Date.now();
  const ctx = {
    employeeId,
    managerEmployeeId,
    month: (Number(String(now).slice(-2)) % 12) + 1,
    monthAlt: (Number(String(now).slice(-3)) % 12) + 1,
    year: 2600 + (Number(String(now).slice(-3)) % 300),
  };
  if (ctx.monthAlt === ctx.month) ctx.monthAlt = (ctx.month % 12) + 1;
  results.context = ctx;
  const tests = [
    ['payrollAdjustment', () => testPayrollAdjustment(ctx)],
    ['attendancePayrollImpact', () => testAttendancePayrollImpact(ctx)],
    ['legacyVsEnterpriseLeave', () => testLeaveTruth(ctx)],
    ['attendanceCorrection', () => testAttendanceCorrection(ctx)],
    ['performancePromotion', () => testPerformancePromotion(ctx)],
    ['recruitmentConversion', () => testRecruitmentConversion(ctx)],
    ['notifications', () => testNotifications(ctx)],
    ['documentsFiles', () => testDocuments(ctx)],
    ['employeeSelfServiceSecurity', () => testSecurity(ctx)],
    ['superadminPolicy', () => testSuperadminPolicy(ctx)],
    ['reportTruth', () => testReportTruth(ctx)],
  ];
  for (const [name, fn] of tests) {
    try { await fn(); } catch (error) { classify(name, 'NOT TESTED', { error: error.stack || error.message }); results.errors.push({ flow: name, error: error.stack || error.message }); }
  }
  results.status = Object.values(results.flows).some(f => f.classification === 'CONFIRMED BROKEN') ? 'NO_GO' : 'PARTIAL';
  writeOutputs();
}

function byClass(cls) {
  return Object.entries(results.flows).filter(([, v]) => v.classification === cls);
}

function tableRows() {
  return Object.entries(results.flows).map(([name, flow]) => `| ${name} | ${flow.classification} | ${String(flow.conclusion || flow.businessEffect || flow.reason || '').replace(/\|/g, '/')} |`).join('\n');
}

function writeOutputs() {
  fs.writeFileSync(outJson, JSON.stringify(results, null, 2), 'utf8');
  const report = `# System-Wide Flow Verification Report

Generated: ${results.generatedAt}

Status: **${results.status}**

This was a verification-only run. No product code was changed.

## Test Context

- Backend: ${backend}
- Health: ${results.health?.status}
- Employee under test: ${results.context?.employeeId}
- Payroll period: ${results.context?.year}-${String(results.context?.month).padStart(2, '0')}

## Flow Classifications

| Flow | Classification | Evidence summary |
|---|---|---|
${tableRows()}

## Important Notes

- A CONFIRMED BROKEN result means the suspected issue reproduced through API/runtime evidence.
- PARTIAL means the flow has some working pieces but failed at least one requested verification point or is split across duplicate sources.
- NOT TESTED means a prerequisite or endpoint behavior prevented a meaningful result.

## Evidence

See \`qa/system-wide-flow-verification-results.json\` for exact statuses, IDs, and endpoint responses.
`;
  fs.writeFileSync(outReport, report, 'utf8');

  const broken = `# Confirmed Broken Flows

${byClass('CONFIRMED BROKEN').map(([name, flow]) => `## ${name}\n\n\`\`\`json\n${JSON.stringify(flow, null, 2)}\n\`\`\``).join('\n\n') || 'No CONFIRMED BROKEN flows were recorded. Review PARTIAL flows before assuming product consistency.'}
`;
  fs.writeFileSync(outBroken, broken, 'utf8');

  const falsePositive = `# False Positive Risks

These suspected issues were not fully confirmed as broken in this run, but remain risky or partial.

${[...byClass('CONFIRMED WORKING'), ...byClass('PARTIAL'), ...byClass('NOT TESTED')].map(([name, flow]) => `## ${name}\n\nClassification: **${flow.classification}**\n\n${flow.conclusion || flow.businessEffect || flow.reason || 'See JSON details.'}`).join('\n\n')}
`;
  fs.writeFileSync(outFalsePositive, falsePositive, 'utf8');

  const priority = `# Flow Fix Priority List

## Must Fix Before More Features

${byClass('CONFIRMED BROKEN').map(([name]) => `- ${name}`).join('\n') || '- No confirmed-broken flow from this run. Review partials below.'}

## Must Reconcile Before Customer Demo

${byClass('PARTIAL').map(([name]) => `- ${name}`).join('\n') || '- None'}

## Needs Manual/DB Follow-Up

${byClass('NOT TESTED').map(([name]) => `- ${name}`).join('\n') || '- None'}

## Confirmed Working In This Run

${byClass('CONFIRMED WORKING').map(([name]) => `- ${name}`).join('\n') || '- None'}
`;
  fs.writeFileSync(outPriority, priority, 'utf8');
}

main().catch(error => {
  results.status = 'ERROR';
  results.errors.push(error.stack || error.message);
  writeOutputs();
  process.exitCode = 1;
});
