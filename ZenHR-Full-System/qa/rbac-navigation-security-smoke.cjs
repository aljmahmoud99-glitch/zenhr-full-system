const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const out = path.join(__dirname, "rbac-navigation-security-results.json");
const tokens = {};

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let json = null;
  const text = await response.text();
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json, text: text.slice(0, 500) };
}

async function login(role) {
  const response = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = response.body?.data?.accessToken;
  return { status: response.status, user: response.body?.data?.user };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
}

function allowed(map, screen, action) {
  return map?.body?.data?.screens?.[screen]?.[action] === true;
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    permissions: {},
    endpoints: {},
    routePolicy: {},
    issues: [],
  };

  for (const role of ["hr", "payroll", "manager", "employee", "recruiter", "admin"]) {
    results.logins[role] = await login(role);
  }

  const managerPerms = await api("manager", "GET", "/api/permissions/my");
  const employeePerms = await api("employee", "GET", "/api/permissions/my");
  const payrollPerms = await api("payroll", "GET", "/api/permissions/my");
  results.permissions = {
    managerDisciplinaryCreate: allowed(managerPerms, "disciplinary", "create"),
    managerDisciplinaryUpdate: allowed(managerPerms, "disciplinary", "update"),
    managerDisciplinaryView: allowed(managerPerms, "disciplinary", "view"),
    employeeEmployeesView: allowed(employeePerms, "employees", "view"),
    employeeReportsView: allowed(employeePerms, "reports", "view"),
    payrollRecruitmentView: allowed(payrollPerms, "recruitment", "view"),
    payrollComplianceView: allowed(payrollPerms, "compliance", "view"),
  };

  const managerDisciplinaryList = await api("manager", "GET", "/api/disciplinary");
  const managerDisciplinaryCreate = await api("manager", "POST", "/api/disciplinary", {
    employeeId: results.logins.employee.user?.employeeId,
    violationTypeId: 1,
    violationDate: new Date().toISOString().slice(0, 10),
    violationDescription: "manager should not create official case",
  });
  const employeeDisciplinaryList = await api("employee", "GET", "/api/disciplinary");
  const hrDisciplinaryList = await api("hr", "GET", "/api/disciplinary");
  const recruiterPayrollRuns = await api("recruiter", "GET", "/api/payroll/runs");
  const employeePayrollPolicy = await api("employee", "GET", "/api/payroll-policies");
  results.endpoints = {
    managerDisciplinaryListStatus: managerDisciplinaryList.status,
    managerDisciplinaryCreateStatus: managerDisciplinaryCreate.status,
    employeeDisciplinaryListStatus: employeeDisciplinaryList.status,
    hrDisciplinaryListStatus: hrDisciplinaryList.status,
    recruiterPayrollRunsStatus: recruiterPayrollRuns.status,
    employeePayrollPolicyStatus: employeePayrollPolicy.status,
  };

  results.routePolicy = {
    employeeHiddenRoutes: ["/app/payroll-attendance", "/app/documents-reporting", "/app/performance-workflows"],
    managerHiddenRoutes: ["/app/disciplinary", "/app/employee-actions/career-movements", "/app/employee-actions/status-changes"],
    payrollHiddenRoutes: ["/app/recruitment", "/app/performance-workflows"],
    accessDeniedRoute: "/access-denied",
  };

  const pass = results.health.status === 200
    && Object.values(results.logins).every((entry) => entry.status === 200)
    && results.permissions.managerDisciplinaryCreate === false
    && results.permissions.managerDisciplinaryUpdate === false
    && results.permissions.managerDisciplinaryView === false
    && results.permissions.employeeEmployeesView === false
    && results.permissions.employeeReportsView === false
    && results.permissions.payrollRecruitmentView === false
    && results.permissions.payrollComplianceView === false
    && [403, 404].includes(results.endpoints.managerDisciplinaryListStatus)
    && [403, 404].includes(results.endpoints.managerDisciplinaryCreateStatus)
    && results.endpoints.hrDisciplinaryListStatus === 200
    && [403, 404].includes(results.endpoints.recruiterPayrollRunsStatus)
    && [403, 404].includes(results.endpoints.employeePayrollPolicyStatus);

  if (employeeDisciplinaryList.status === 200) {
    results.issues.push({
      severity: "INFO",
      area: "employee-disciplinary-self-view",
      note: "Backend still permits employee self-view of own disciplinary cases, but route navigation is hidden/denied. This may be retained for notification compatibility.",
    });
  }
  if (!pass) {
    results.issues.push({ severity: "HIGH", area: "rbac-navigation-security", permissions: results.permissions, endpoints: results.endpoints });
  }

  results.status = pass ? "PASS" : "FAIL";
  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ status: results.status, permissions: results.permissions, endpoints: results.endpoints, issues: results.issues }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((error) => {
  const result = { generatedAt: new Date().toISOString(), status: "ERROR", message: error?.message, stack: error?.stack };
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
