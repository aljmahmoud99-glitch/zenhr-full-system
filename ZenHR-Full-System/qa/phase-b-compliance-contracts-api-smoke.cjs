const fs = require('node:fs');

const baseUrl = process.env.API_BASE || 'http://localhost:3001';
const password = process.env.ZENJO_PASSWORD || 'Admin@1234';
const roles = ['admin', 'hr', 'payroll', 'manager', 'employee', 'recruiter'];

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function login(username) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return {
    username,
    status: result.status,
    role: result.body?.data?.user?.role,
    token: result.body?.data?.accessToken || null,
    user: result.body?.data?.user || null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const startedAt = new Date().toISOString();
  const log = { startedAt, baseUrl, logins: {}, checks: {}, created: {}, errors: [] };

  try {
    const health = await request('/api/healthz');
    log.checks.health = { status: health.status, body: health.body };
    assert(health.status === 200, 'health failed');

    for (const username of roles) {
      const session = await login(username);
      log.logins[username] = { status: session.status, role: session.role, user: session.user };
      assert(session.token, `${username} login failed`);
      log.logins[username].token = session.token;
    }

    const hrToken = log.logins.hr.token;
    const adminToken = log.logins.admin.token;

    const dashboard = await request('/api/compliance-contracts/dashboard', { token: hrToken });
    log.checks.dashboard = { status: dashboard.status, body: dashboard.body };
    assert(dashboard.status === 200, 'dashboard failed');

    const initialTypes = await request('/api/compliance-contracts/types', { token: hrToken });
    log.checks.typesList = { status: initialTypes.status, count: initialTypes.body?.data?.length || 0 };
    assert(initialTypes.status === 200, 'types list failed');

    const employees = await request('/api/employees?pageSize=20', { token: hrToken });
    const employeeList = Array.isArray(employees.body?.data) ? employees.body.data : (employees.body?.data?.items || []);
    log.checks.employees = { status: employees.status, count: employeeList.length };
    assert(employees.status === 200 && employeeList[0], 'employees list failed');

    const unique = Date.now();
    const typePayload = {
      code: `PHASEB_${unique}`,
      nameAr: 'عقد اختبار امتثال',
      nameEn: 'Compliance Test Contract',
      descriptionAr: 'نوع عقد لاختبار محرك العقود.',
      descriptionEn: 'Contract type used for compliance engine smoke testing.',
      defaultDurationMonths: 12,
      defaultProbationDays: 90,
      renewalNoticeDays: 45,
      requiresAttachment: true,
      isActive: true,
    };
    const createdType = await request('/api/compliance-contracts/types', {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify(typePayload),
    });
    log.checks.createType = { status: createdType.status, body: createdType.body };
    assert(createdType.status === 201, 'contract type create failed');
    const typeId = createdType.body.data.id;
    log.created.contractTypeId = typeId;

    const employee = employeeList[0];
    const contractPayload = {
      employeeId: employee.id,
      contractTypeId: typeId,
      contractNumber: `PHB-${unique}`,
      titleAr: 'عقد عمل اختبار',
      titleEn: 'Smoke Test Employment Contract',
      startDate: '2026-05-12',
      endDate: '2027-05-11',
      probationEndDate: '2026-08-10',
      renewalStatus: 'pending_review',
      contractStatus: 'active',
      complianceStatus: 'pending_review',
      salaryAmount: 1200.5,
      currency: 'JOD',
      notesAr: 'تم إنشاؤه من اختبار الدخان.',
      notesEn: 'Created by smoke test.',
    };
    const createdContract = await request('/api/compliance-contracts/contracts', {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify(contractPayload),
    });
    log.checks.createContract = { status: createdContract.status, body: createdContract.body };
    assert(createdContract.status === 201, 'contract create failed');
    const contractId = createdContract.body.data.id;
    log.created.contractId = contractId;

    const list = await request('/api/compliance-contracts/contracts?page=1&pageSize=5&q=Smoke', { token: hrToken });
    log.checks.listSearch = { status: list.status, total: list.body?.data?.total };
    assert(list.status === 200 && list.body?.data?.items?.some((item) => item.id === contractId), 'contract search/list failed');

    const detail = await request(`/api/compliance-contracts/contracts/${contractId}`, { token: hrToken });
    log.checks.detail = { status: detail.status, hasHistory: !!detail.body?.data?.history?.length };
    assert(detail.status === 200 && detail.body?.data?.id === contractId, 'detail failed');

    const requiredDoc = await request(`/api/compliance-contracts/contracts/${contractId}/required-documents`, {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify({
        documentCode: `REQ_${unique}`,
        nameAr: 'صورة الهوية',
        nameEn: 'ID copy',
        isMandatory: true,
        expires: true,
        warningDays: 30,
      }),
    });
    log.checks.requiredDocument = { status: requiredDoc.status, body: requiredDoc.body };
    assert(requiredDoc.status === 201, 'required document create failed');
    log.created.requiredDocumentId = requiredDoc.body.data.id;

    const detailWithRequired = await request(`/api/compliance-contracts/contracts/${contractId}`, { token: hrToken });
    log.checks.requiredDocumentsDetail = {
      status: detailWithRequired.status,
      count: detailWithRequired.body?.data?.requiredDocuments?.length || 0,
    };
    assert(detailWithRequired.status === 200 && detailWithRequired.body?.data?.requiredDocuments?.some((item) => item.id === log.created.requiredDocumentId), 'required document did not appear in detail');

    const update = await request(`/api/compliance-contracts/contracts/${contractId}`, {
      method: 'PATCH',
      token: hrToken,
      body: JSON.stringify({ complianceStatus: 'compliant', renewalStatus: 'renewed', notesEn: 'Updated by smoke test.' }),
    });
    log.checks.updateContract = { status: update.status, complianceStatus: update.body?.data?.complianceStatus, renewalStatus: update.body?.data?.renewalStatus };
    assert(update.status === 200 && update.body?.data?.complianceStatus === 'compliant', 'contract update failed');

    const attachment = await request(`/api/compliance-contracts/contracts/${contractId}/attachments`, {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify({ fileName: 'contract-smoke.pdf', filePath: '/uploads/contracts/contract-smoke.pdf', mimeType: 'application/pdf', fileSize: 2048 }),
    });
    log.checks.attachment = { status: attachment.status, body: attachment.body };
    assert(attachment.status === 201, 'attachment metadata failed');

    const history = await request(`/api/compliance-contracts/employees/${employee.id}/history`, { token: hrToken });
    log.checks.employeeHistory = { status: history.status, count: history.body?.data?.length || 0 };
    assert(history.status === 200 && history.body?.data?.some((item) => item.id === contractId), 'employee history failed');

    for (const username of ['payroll', 'manager', 'employee', 'recruiter']) {
      const denial = await request('/api/compliance-contracts/contracts', {
        method: 'POST',
        token: log.logins[username].token,
        body: JSON.stringify(contractPayload),
      });
      log.checks[`rbac_${username}_mutate`] = { status: denial.status };
      assert(denial.status === 403, `${username} mutation was not forbidden`);
    }

    const invalidEmployeeTenant = await request('/api/compliance-contracts/contracts', {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify({ ...contractPayload, contractNumber: `BAD-EMP-${unique}`, employeeId: 99999999 }),
    });
    log.checks.tenantInvalidEmployee = { status: invalidEmployeeTenant.status, message: invalidEmployeeTenant.body?.message };
    assert(invalidEmployeeTenant.status === 400, 'invalid/cross-company employee reference was not rejected');

    const invalidTypeTenant = await request('/api/compliance-contracts/contracts', {
      method: 'POST',
      token: hrToken,
      body: JSON.stringify({ ...contractPayload, contractNumber: `BAD-TYPE-${unique}`, contractTypeId: 99999999 }),
    });
    log.checks.tenantInvalidType = { status: invalidTypeTenant.status, message: invalidTypeTenant.body?.message };
    assert(invalidTypeTenant.status === 400, 'invalid/cross-company contract type reference was not rejected');

    const adminDashboard = await request('/api/compliance-contracts/dashboard', { token: adminToken });
    log.checks.adminRead = { status: adminDashboard.status };
    assert(adminDashboard.status === 200, 'admin/superadmin read failed');

    const deleteResult = await request(`/api/compliance-contracts/contracts/${contractId}`, {
      method: 'DELETE',
      token: hrToken,
    });
    log.checks.deleteContract = { status: deleteResult.status };
    assert(deleteResult.status === 200, 'soft delete failed');

    const afterDelete = await request(`/api/compliance-contracts/contracts/${contractId}`, { token: hrToken });
    log.checks.afterDeleteDetail = { status: afterDelete.status };
    assert(afterDelete.status === 404, 'deleted contract still visible by detail');

    log.status = 'PASS';
  } catch (error) {
    log.status = 'FAIL';
    log.errors.push(String(error?.stack || error));
    process.exitCode = 1;
  } finally {
    for (const value of Object.values(log.logins || {})) {
      if (value && typeof value === 'object' && value.token) value.token = '[redacted]';
    }
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync('qa/phase-b-compliance-contracts-api-results.json', JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ status: log.status, errors: log.errors, checks: log.checks }, null, 2));
  }
})();
