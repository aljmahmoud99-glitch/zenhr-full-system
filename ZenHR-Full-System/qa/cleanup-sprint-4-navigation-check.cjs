const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "src", "app", "core", "services", "role-access.service.ts"), "utf8");
const output = path.join(__dirname, "cleanup-sprint-4-navigation-results.json");
const rbacOutput = path.join(__dirname, "cleanup-sprint-4-rbac-results.json");
const uxOutput = path.join(__dirname, "cleanup-sprint-4-ux-results.json");

const visibleRouteMatches = [...source.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1]);
const navSection = source.slice(source.indexOf("const PLATFORM_NAV"), source.indexOf("export const NAV_MAP"));
const visibleNavRoutes = [...navSection.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1]);
const visibleLabels = [...navSection.matchAll(/labelEn:\s*'([^']+)'/g)].map(match => match[1]);

const hiddenLegacy = ["/app/leave", "/app/documents", "/app/forms", "/app/reports", "/app/workflows"]
  .every(route => !visibleNavRoutes.includes(route));
const canonicalRoutes = [
  "/app/leave-management",
  "/app/approvals",
  "/app/payroll/runs",
  "/app/payroll-attendance",
  "/app/attendance",
  "/app/compliance-contracts",
  "/app/documents-reporting",
  "/app/job-descriptions",
].every(route => visibleNavRoutes.includes(route));
const standardizedLabels = {
  jobProfiles: visibleLabels.includes("Job Profiles") && !visibleLabels.includes("Job Titles"),
  payrollOperations: visibleLabels.includes("Payroll Operations") && !visibleLabels.includes("Payroll & Attendance Core"),
  documentsReporting: visibleLabels.includes("Documents & Reporting") && !visibleLabels.includes("Documents & Reporting Center"),
  approvals: visibleLabels.includes("Approvals"),
};

const results = {
  generatedAt: new Date().toISOString(),
  status: hiddenLegacy && canonicalRoutes && Object.values(standardizedLabels).every(Boolean) ? "GO" : "NO-GO",
  hiddenLegacy,
  canonicalRoutes,
  standardizedLabels,
  visibleNavRoutes: [...new Set(visibleNavRoutes)].sort(),
  compatibilityRoutesStillInAccessMap: ["/app/leave", "/app/documents", "/app/forms", "/app/reports", "/app/workflows"]
    .filter(route => source.includes(`'${route}':`)),
};

const rbac = {
  generatedAt: results.generatedAt,
  status: results.status,
  checks: {
    employeeHasLeaveManagement: /const EMPLOYEE_NAV[\s\S]*\/app\/leave-management/.test(source),
    recruiterHasApprovals: /const RECRUITER_NAV[\s\S]*\/app\/approvals/.test(source),
    payrollHasPayrollOperations: /const PAYROLLADMIN_NAV[\s\S]*\/app\/payroll-attendance/.test(source),
    legacyRoutesRemainAccessible: results.compatibilityRoutesStillInAccessMap.length >= 5,
  },
};
rbac.status = Object.values(rbac.checks).every(Boolean) ? "GO" : "NO-GO";

const ux = {
  generatedAt: results.generatedAt,
  status: results.status,
  checks: {
    duplicateLegacyNavRemoved: hiddenLegacy,
    canonicalModulesObvious: canonicalRoutes,
    routeNamesStandardized: Object.values(standardizedLabels).every(Boolean),
  },
};

fs.writeFileSync(output, JSON.stringify(results, null, 2));
fs.writeFileSync(rbacOutput, JSON.stringify(rbac, null, 2));
fs.writeFileSync(uxOutput, JSON.stringify(ux, null, 2));

if (results.status !== "GO" || rbac.status !== "GO") process.exitCode = 1;
