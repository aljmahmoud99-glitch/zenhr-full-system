const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const out = path.join(__dirname, "cleanup-sprint-6-results.json");
const documentsOut = path.join(__dirname, "cleanup-sprint-6-documents-results.json");
const complianceOut = path.join(__dirname, "cleanup-sprint-6-compliance-results.json");
const recruitmentOut = path.join(__dirname, "cleanup-sprint-6-recruitment-results.json");
const rbacOut = path.join(__dirname, "cleanup-sprint-6-rbac-results.json");
const tenantOut = path.join(__dirname, "cleanup-sprint-6-tenant-results.json");

const tokens = {};
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  logins: {},
  recruitment: {},
  compliance: {},
  documents: {},
  rbac: {},
  tenant: {},
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
  return { status: response.status, ok: response.ok, body: json, contentType, disposition, size: buffer.length, sample: buffer.slice(0, 120).toString("utf8") };
}

async function api(role, method, url, body, accept) {
  return raw(method, url, body, tokens[role], accept);
}

async function login(username) {
  const r = await raw("POST", "/api/auth/login", { username, password });
  tokens[username] = r.body?.data?.accessToken || null;
  results.logins[username] = {
    status: r.status,
    role: r.body?.data?.user?.role,
    companyId: r.body?.data?.user?.companyId,
    employeeId: r.body?.data?.user?.employeeId,
  };
}

function stamp() {
  return `s6-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function items(body) {
  return body?.data?.items || body?.data || [];
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) await login(role);

    const marker = stamp();
    const candidate = await api("hr", "POST", "/api/recruitment/candidates", {
      fullNameAr: `مرشح ${marker}`,
      fullNameEn: `Candidate ${marker}`,
      email: `candidate.${marker}@example.test`,
      phone: "+962790000000",
      source: "cleanup-sprint-6",
    });
    const candidateId = candidate.body?.data?.id;
    const candidateDocument = candidateId ? await api("hr", "POST", `/api/recruitment/candidates/${candidateId}/documents`, {
      documentType: "resume",
      fileName: `resume-${marker}.pdf`,
      fileUrl: `/virtual/recruitment/${marker}.pdf`,
      notes: "Cleanup Sprint 6 candidate document linkage",
    }) : { status: 0 };
    const candidateEnterpriseDocumentId = candidateDocument.body?.data?.enterpriseDocumentId || null;

    const converted = candidateId ? await api("hr", "POST", `/api/recruitment/candidates/${candidateId}/convert-to-employee`, {
      employeeCode: `S6-${Date.now().toString(36).toUpperCase()}`,
      workEmail: `employee.${marker}@example.test`,
      username: `s6.${marker}`.replace(/[^a-zA-Z0-9._-]/g, ".").toLowerCase(),
      password: "Welcome@1234",
      basicSalary: "650",
      contractType: "PERMANENT",
      hireDate: "2039-01-15",
    }) : { status: 0 };
    const employeeId = converted.body?.data?.employeeId;
    const contractId = converted.body?.data?.contractId;
    const enterpriseDocumentIds = converted.body?.data?.enterpriseDocumentIds || [];
    const convertedAgain = candidateId ? await api("hr", "POST", `/api/recruitment/candidates/${candidateId}/convert-to-employee`, {}) : { status: 0 };

    const contractDetail = contractId ? await api("hr", "GET", `/api/compliance-contracts/contracts/${contractId}`) : { status: 0, body: {} };
    const requiredDocs = contractDetail.body?.data?.requiredDocuments || [];
    const contractEnterpriseDoc = await api("hr", "GET", `/api/document-reporting/documents?q=${encodeURIComponent("Hiring contract draft")}`);

    const attachment = contractId ? await api("hr", "POST", `/api/compliance-contracts/contracts/${contractId}/attachments`, {
      fileName: `contract-${marker}.pdf`,
      filePath: `/virtual/contracts/${marker}.pdf`,
      mimeType: "application/pdf",
      fileSize: 1200,
      attachmentType: "signed_contract",
      titleAr: "مرفق عقد",
      titleEn: `Contract Attachment ${marker}`,
    }) : { status: 0 };
    const attachmentEnterpriseDocumentId = attachment.body?.data?.enterpriseDocumentId || null;
    const contractDetailAfterAttachment = contractId ? await api("hr", "GET", `/api/compliance-contracts/contracts/${contractId}`) : { status: 0, body: {} };
    const attachmentVisibleInDocs = attachmentEnterpriseDocumentId ? await api("hr", "GET", `/api/document-reporting/documents?q=${encodeURIComponent(`Contract Attachment ${marker}`)}`) : { status: 0, body: {} };

    const employeeDocs = await api("employee", "GET", "/api/document-reporting/documents");
    const employeeSeesOnlyOwn = items(employeeDocs.body).every((doc) => !doc.employeeId || Number(doc.employeeId) === Number(results.logins.employee.employeeId));
    const managerDocs = await api("manager", "GET", "/api/document-reporting/documents");
    const managerSeesScopedOnly = items(managerDocs.body).every((doc) => Number.isFinite(Number(doc.employeeId)));
    const recruiterPayrollDocCreate = await api("recruiter", "POST", "/api/document-reporting/documents", {
      sourceModule: "payroll",
      titleAr: "وثيقة رواتب ممنوعة",
      titleEn: "Forbidden Payroll Document",
    });
    const payrollHrDocCreate = await api("payroll", "POST", "/api/document-reporting/documents", {
      sourceModule: "hr",
      titleAr: "وثيقة موارد بشرية ممنوعة",
      titleEn: "Forbidden HR Document",
    });
    const crossCompanyEmployeeDoc = await api("hr", "POST", "/api/document-reporting/documents", {
      sourceModule: "hr",
      employeeId: 99999999,
      titleAr: "وثيقة خارج النطاق",
      titleEn: "Out of scope employee document",
    });
    const recruiterRecruitmentExport = await api("recruiter", "GET", "/api/production/exports/recruitment?format=csv", undefined, "text/csv");
    const recruiterPayrollExport = await api("recruiter", "GET", "/api/production/exports/payroll?format=csv", undefined, "text/csv");

    results.recruitment = {
      candidateCreateStatus: candidate.status,
      candidateId,
      candidateDocumentStatus: candidateDocument.status,
      candidateEnterpriseDocumentId,
      convertStatus: converted.status,
      employeeId,
      contractId,
      requiredDocumentIds: converted.body?.data?.requiredDocumentIds || [],
      enterpriseDocumentIds,
      secondConvertStatus: convertedAgain.status,
      secondConvertAlreadyConverted: convertedAgain.body?.data?.alreadyConverted === true,
      noDuplicateConversion: convertedAgain.status === 200 && convertedAgain.body?.data?.alreadyConverted === true && Number(convertedAgain.body?.data?.employeeId) === Number(employeeId),
    };

    const convertedRequiredIds = new Set((converted.body?.data?.requiredDocumentIds || []).map((id) => Number(id)));
    const convertedRequiredDocs = requiredDocs.filter((doc) => convertedRequiredIds.has(Number(doc.id)));
    results.compliance = {
      contractDetailStatus: contractDetail.status,
      requiredDocumentsCount: requiredDocs.length,
      convertedRequiredDocumentsCount: convertedRequiredDocs.length,
      requiredDocsHaveEnterpriseDocuments: convertedRequiredDocs.length === convertedRequiredIds.size && convertedRequiredDocs.every((doc) => Number(doc.enterpriseDocumentId) > 0),
      contractEnterpriseDocumentFound: items(contractEnterpriseDoc.body).some((doc) => Number(doc.employeeId) === Number(employeeId) && doc.entityType === "employee_contract"),
      attachmentCreateStatus: attachment.status,
      attachmentEnterpriseDocumentId,
      contractAttachmentLinkedInDetail: (contractDetailAfterAttachment.body?.data?.attachments || []).some((att) => Number(att.enterpriseDocumentId) === Number(attachmentEnterpriseDocumentId)),
    };

    results.documents = {
      attachmentVisibleInDocuments: items(attachmentVisibleInDocs.body).some((doc) => Number(doc.id) === Number(attachmentEnterpriseDocumentId)),
      candidateDocVisibleInDocuments: !!candidateEnterpriseDocumentId,
      employeeDocumentListStatus: employeeDocs.status,
      managerDocumentListStatus: managerDocs.status,
      employeeSeesOnlyOwn,
      managerSeesScopedOnly,
    };

    results.rbac = {
      recruiterPayrollDocCreateStatus: recruiterPayrollDocCreate.status,
      payrollHrDocCreateStatus: payrollHrDocCreate.status,
      recruiterRecruitmentExportStatus: recruiterRecruitmentExport.status,
      recruiterPayrollExportStatus: recruiterPayrollExport.status,
      passed: recruiterPayrollDocCreate.status === 403
        && payrollHrDocCreate.status === 403
        && recruiterRecruitmentExport.status === 200
        && recruiterPayrollExport.status === 403
        && employeeSeesOnlyOwn
        && managerSeesScopedOnly,
    };

    results.tenant = {
      crossCompanyEmployeeDocumentStatus: crossCompanyEmployeeDoc.status,
      passed: crossCompanyEmployeeDoc.status === 400,
    };

    const passed = results.health.status === 200
      && candidate.status === 201
      && candidateDocument.status === 201
      && Number(candidateEnterpriseDocumentId) > 0
      && converted.status === 201
      && Number(employeeId) > 0
      && Number(contractId) > 0
      && enterpriseDocumentIds.length >= 3
      && results.recruitment.noDuplicateConversion
      && results.compliance.requiredDocsHaveEnterpriseDocuments
      && results.compliance.contractEnterpriseDocumentFound
      && attachment.status === 201
      && Number(attachmentEnterpriseDocumentId) > 0
      && results.compliance.contractAttachmentLinkedInDetail
      && results.documents.attachmentVisibleInDocuments
      && results.rbac.passed
      && results.tenant.passed;
    results.status = passed ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  } finally {
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    fs.writeFileSync(documentsOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, ...results.documents }, null, 2));
    fs.writeFileSync(complianceOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, ...results.compliance }, null, 2));
    fs.writeFileSync(recruitmentOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.status, ...results.recruitment }, null, 2));
    fs.writeFileSync(rbacOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.rbac.passed ? "GO" : "NO-GO", ...results.rbac }, null, 2));
    fs.writeFileSync(tenantOut, JSON.stringify({ generatedAt: results.generatedAt, status: results.tenant.passed ? "GO" : "NO-GO", ...results.tenant }, null, 2));
    console.log(JSON.stringify({ status: results.status, errors: results.errors, recruitment: results.recruitment, compliance: results.compliance, rbac: results.rbac, tenant: results.tenant }, null, 2));
  }
}

main();
