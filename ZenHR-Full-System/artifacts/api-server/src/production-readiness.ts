import fs from "fs";
import path from "path";

export type RuntimeStoreAdapter = "memory" | "redis";

export type EnvironmentValidationIssue = {
  key: string;
  severity: "error" | "warning";
  message: string;
};

export type EnvironmentValidationReport = {
  environment: string;
  adapter: RuntimeStoreAdapter;
  ok: boolean;
  issues: EnvironmentValidationIssue[];
  paths: {
    uploadsDir: string;
    exportsDir: string;
  };
  corsOrigins: string[];
  production: boolean;
};

const DEFAULT_JWT_SECRET = "ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!";

export const SaaSModules = [
  "payroll",
  "attendance",
  "biometric_attendance",
  "leave",
  "recruitment",
  "performance",
  "documents",
  "compliance",
  "approvals",
  "reports",
] as const;

export type SaaSModuleKey = typeof SaaSModules[number];

export const modulePathRules: Array<{ module: SaaSModuleKey; patterns: RegExp[] }> = [
  { module: "payroll", patterns: [/^\/api\/payroll(\/|$)/, /^\/api\/payroll-adjustments(\/|$)/, /^\/api\/payroll-policies(\/|$)/, /^\/api\/production\/exports\/payroll/i] },
  { module: "attendance", patterns: [/^\/api\/attendance(\/|$)/, /^\/api\/shifts(\/|$)/, /^\/api\/overtime(\/|$)/, /^\/api\/production\/exports\/attendance/i] },
  { module: "biometric_attendance", patterns: [/^\/api\/biometric-attendance(\/|$)/, /^\/api\/webauthn(\/|$)/] },
  { module: "leave", patterns: [/^\/api\/leave(\/|$)/] },
  { module: "recruitment", patterns: [/^\/api\/recruitment(\/|$)/, /^\/api\/production\/exports\/recruitment/i] },
  { module: "performance", patterns: [/^\/api\/performance(\/|$)/, /^\/api\/production\/exports\/evaluations/i] },
  { module: "documents", patterns: [/^\/api\/documents(\/|$)/, /^\/api\/enterprise-documents(\/|$)/, /^\/api\/forms(\/|$)/, /^\/api\/files(\/|$)/] },
  { module: "compliance", patterns: [/^\/api\/compliance(\/|$)/, /^\/api\/compliance-contracts(\/|$)/, /^\/api\/contracts(\/|$)/] },
  { module: "approvals", patterns: [/^\/api\/approvals(\/|$)/, /^\/api\/workflow(\/|$)/] },
  { module: "reports", patterns: [/^\/api\/reports(\/|$)/, /^\/api\/production\/exports(\/|$)/] },
];

export function moduleForApiPath(pathName: string): SaaSModuleKey | null {
  for (const rule of modulePathRules) {
    if (rule.patterns.some((pattern) => pattern.test(pathName))) return rule.module;
  }
  return null;
}

function splitCsv(value?: string) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function isAbsoluteSafePath(value: string) {
  const resolved = path.resolve(value);
  return path.isAbsolute(resolved) && !resolved.match(/^[A-Z]:\\$/i);
}

export function validateEnvironment(env: NodeJS.ProcessEnv, cwd = process.cwd()): EnvironmentValidationReport {
  const issues: EnvironmentValidationIssue[] = [];
  const environment = env["NODE_ENV"] || "development";
  const production = environment === "production";
  const adapter = (env["RUNTIME_STORE_ADAPTER"] || "memory").toLowerCase() === "redis" ? "redis" : "memory";
  const uploadsDir = path.resolve(cwd, env["UPLOADS_DIR"] || "uploads");
  const exportsDir = path.resolve(cwd, env["EXPORTS_DIR"] || "exports");
  const corsOrigins = splitCsv(env["CORS_ORIGINS"]);

  const requireInProduction = (key: string, message: string) => {
    if (production && !env[key]) issues.push({ key, severity: "error", message });
  };

  requireInProduction("DATABASE_URL", "DATABASE_URL is required in production.");
  requireInProduction("JWT_SECRET", "JWT_SECRET is required in production.");
  requireInProduction("CORS_ORIGINS", "CORS_ORIGINS must be explicit in production.");
  requireInProduction("APP_VERSION", "APP_VERSION should be set for release traceability.");

  if (production && env["JWT_SECRET"] === DEFAULT_JWT_SECRET) {
    issues.push({ key: "JWT_SECRET", severity: "error", message: "Default JWT secret is forbidden in production." });
  }
  if (env["DATABASE_URL"] && !/^postgres(ql)?:\/\//i.test(env["DATABASE_URL"])) {
    issues.push({ key: "DATABASE_URL", severity: "error", message: "DATABASE_URL must be a PostgreSQL connection string." });
  }
  if (production && env["TRUST_PROXY"] !== "true") {
    issues.push({ key: "TRUST_PROXY", severity: "warning", message: "TRUST_PROXY=true is recommended behind a production proxy/load balancer." });
  }
  if (production && corsOrigins.some((origin) => origin === "*" || origin.startsWith("http://"))) {
    issues.push({ key: "CORS_ORIGINS", severity: "error", message: "Production CORS origins must be explicit HTTPS origins." });
  }
  if (adapter === "redis" && !env["REDIS_URL"]) {
    issues.push({ key: "REDIS_URL", severity: "warning", message: "Redis adapter was selected but REDIS_URL is not configured; runtime will stay in memory mode until Redis is wired." });
  }
  if (!isAbsoluteSafePath(uploadsDir)) {
    issues.push({ key: "UPLOADS_DIR", severity: "error", message: "UPLOADS_DIR must resolve to a safe absolute directory." });
  }
  if (!isAbsoluteSafePath(exportsDir)) {
    issues.push({ key: "EXPORTS_DIR", severity: "error", message: "EXPORTS_DIR must resolve to a safe absolute directory." });
  }

  for (const [key, dir] of [["UPLOADS_DIR", uploadsDir], ["EXPORTS_DIR", exportsDir]] as const) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      issues.push({ key, severity: "error", message: `Unable to create or access ${dir}: ${(error as Error).message}` });
    }
  }

  return {
    environment,
    adapter,
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    paths: { uploadsDir, exportsDir },
    corsOrigins,
    production,
  };
}

export function sanitizedEnvironmentSummary(report: EnvironmentValidationReport) {
  return {
    environment: report.environment,
    adapter: report.adapter,
    ok: report.ok,
    production: report.production,
    corsOriginsConfigured: report.corsOrigins.length,
    uploadsDir: report.paths.uploadsDir,
    exportsDir: report.paths.exportsDir,
    issues: report.issues,
  };
}

export function productionSecurityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(self)",
    "cross-origin-resource-policy": "same-site",
  };
}
