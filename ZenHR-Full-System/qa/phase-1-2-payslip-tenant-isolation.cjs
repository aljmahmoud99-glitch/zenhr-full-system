const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "phase-1-2-payslip-tenant-isolation-results.json");
const tokens = {};

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

function dataArray(result) {
  return Array.isArray(result?.body?.data) ? result.body.data : [];
}

function statusIn(result, allowed) {
  return allowed.includes(result?.status);
}

async function listDoesNotLeak(role, list) {
  const leaked = [];
  for (const slip of dataArray(list)) {
    const employeeId = Number(slip.employeeId);
    if (!Number.isFinite(employeeId)) {
      leaked.push({ slipId: slip.id, employeeId: slip.employeeId, reason: "missing employee id" });
      continue;
    }
    const employee = await api(role, "GET", `/api/employees/${employeeId}`);
    if (employee.status !== 200) {
      leaked.push({ slipId: slip.id, employeeId, employeeStatus: employee.status });
    }
  }
  return { leaked, passed: leaked.length === 0 };
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    backend,
    health: await raw("GET", "/api/healthz"),
    logins: {},
    tests: {},
    leakChecks: {},
    skipped: [],
    errors: [],
  };

  for (const role of ["hr", "payroll", "employee", "recruiter", "manager", "admin"]) {
    results.logins[role] = await login(role);
  }

  const requiredLoginOk = ["hr", "payroll", "employee", "recruiter"]
    .every((role) => results.logins[role].status === 200 && tokens[role]);
  if (!requiredLoginOk) {
    results.status = "ERROR";
    results.errors.push({ area: "login", logins: results.logins });
    fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.exit(1);
  }

  results.tests.payrollList = await api("payroll", "GET", "/api/payroll/slips");
  results.tests.hrList = await api("hr", "GET", "/api/payroll/slips");
  results.tests.employeeList = await api("employee", "GET", "/api/payroll/slips");
  results.tests.employeeMyList = await api("employee", "GET", "/api/payroll/slips/my");
  results.tests.recruiterList = await api("recruiter", "GET", "/api/payroll/slips");
  results.tests.managerList = await api("manager", "GET", "/api/payroll/slips");
  results.tests.randomId = await api("payroll", "GET", "/api/payroll/slips/999999999");

  results.leakChecks.payrollList = await listDoesNotLeak("payroll", results.tests.payrollList);
  results.leakChecks.hrList = await listDoesNotLeak("hr", results.tests.hrList);

  const employeeId = Number(results.logins.employee.user?.employeeId);
  const employeeSlips = dataArray(results.tests.employeeList);
  const hrSlips = dataArray(results.tests.hrList);
  const ownSlip = employeeSlips.find((slip) => Number(slip.employeeId) === employeeId);
  const otherSlip = hrSlips.find((slip) => Number(slip.employeeId) !== employeeId);
  if (ownSlip) {
    results.tests.employeeOwnDetail = await api("employee", "GET", `/api/payroll/slips/${ownSlip.id}`);
  } else {
    results.skipped.push({ test: "employeeOwnDetail", reason: "employee has no published own payslip in current fixtures" });
  }
  if (otherSlip) {
    results.tests.employeeOtherDetail = await api("employee", "GET", `/api/payroll/slips/${otherSlip.id}`);
  } else {
    results.skipped.push({ test: "employeeOtherDetail", reason: "no other same-company payslip available in current fixtures" });
  }

  const crossCompanyPayslipId = Number(process.env.CROSS_COMPANY_PAYSLIP_ID || 0);
  if (crossCompanyPayslipId > 0) {
    results.tests.crossCompanyDetail = await api("payroll", "GET", `/api/payroll/slips/${crossCompanyPayslipId}`);
  } else {
    results.skipped.push({
      test: "crossCompanyDetail",
      reason: "No CROSS_COMPANY_PAYSLIP_ID provided and no safe API exposes foreign tenant fixture ids after containment.",
    });
  }

  const assertions = {
    health: results.health.status === 200,
    payrollListAllowed: results.tests.payrollList.status === 200,
    hrListAllowed: results.tests.hrList.status === 200,
    employeeListAllowedOwnOnly: results.tests.employeeList.status === 200
      && employeeSlips.every((slip) => Number(slip.employeeId) === employeeId),
    employeeMyListStillWorks: results.tests.employeeMyList.status === 200,
    employeeCannotFetchOther: !otherSlip || statusIn(results.tests.employeeOtherDetail, [403, 404]),
    crossCompanyPayslip404: !crossCompanyPayslipId || statusIn(results.tests.crossCompanyDetail, [404]),
    recruiterForbidden: statusIn(results.tests.recruiterList, [403]),
    randomId404: statusIn(results.tests.randomId, [404]),
    payrollListNoForeignEmployees: results.leakChecks.payrollList.passed,
    hrListNoForeignEmployees: results.leakChecks.hrList.passed,
    managerForbidden: statusIn(results.tests.managerList, [403]),
  };

  results.assertions = assertions;
  results.counts = {
    payrollList: dataArray(results.tests.payrollList).length,
    hrList: dataArray(results.tests.hrList).length,
    employeeList: employeeSlips.length,
    employeeMyList: dataArray(results.tests.employeeMyList).length,
  };
  results.sampleIds = {
    ownSlipId: ownSlip?.id ?? null,
    otherSlipId: otherSlip?.id ?? null,
    crossCompanyPayslipId: crossCompanyPayslipId || null,
  };

  const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([name]) => name);
  results.status = failed.length === 0 ? "GO" : "NO-GO";
  if (failed.length) results.errors.push({ area: "assertions", failed });

  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: results.status,
    assertions,
    counts: results.counts,
    statuses: Object.fromEntries(Object.entries(results.tests).map(([key, value]) => [key, value?.status])),
    sampleIds: results.sampleIds,
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
