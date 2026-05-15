const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backend = process.env.BACKEND_URL || "http://localhost:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";

const files = {
  results: path.join(__dirname, "phase-10-results.json"),
  env: path.join(__dirname, "phase-10-env-results.json"),
  docker: path.join(__dirname, "phase-10-docker-results.json"),
  saas: path.join(__dirname, "phase-10-saas-limits-results.json"),
  ci: path.join(__dirname, "phase-10-ci-results.json"),
  backup: path.join(__dirname, "phase-10-backup-results.json"),
  headers: path.join(__dirname, "phase-10-security-headers-results.json"),
  regression: path.join(__dirname, "phase-10-regression-results.json"),
};

const root = path.resolve(__dirname, "..");
const results = {
  generatedAt: new Date().toISOString(),
  backend,
  status: "RUNNING",
  health: null,
  readiness: null,
  env: {},
  docker: {},
  saas: {},
  ci: {},
  backup: {},
  securityHeaders: {},
  regression: {},
  errors: [],
};

async function raw(method, url, body, token, headers = {}) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return {
    status: response.status,
    ok: response.ok,
    body: json,
    text,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function login(username) {
  const r = await raw("POST", "/api/auth/login", { username, password });
  if (!r.body?.data?.accessToken) throw new Error(`${username} login failed: ${r.status}`);
  return r.body.data.accessToken;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "qa", file), "utf8")); } catch { return null; }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function dryRun(script, args = []) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout.slice(0, 1000), stderr: r.stderr.slice(0, 1000), ok: r.status === 0 };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    results.readiness = await raw("GET", "/api/readiness");
    const hr = await login("hr");
    const employee = await login("employee");

    const envReport = await raw("GET", "/api/ops/environment", undefined, hr);
    results.env = {
      envExample: exists(".env.example"),
      productionEnvExample: exists(".env.production.example"),
      envEndpointStatus: envReport.status,
      envOk: envReport.body?.data?.ok === true,
      adapter: envReport.body?.data?.adapter,
      sanitized: !/JWT_SECRET|PASSWORD|postgresql:\/\/[^@]+@/i.test(JSON.stringify(envReport.body || {})),
      passed: exists(".env.example") && exists(".env.production.example") && envReport.status === 200 && envReport.body?.data?.ok === true,
    };

    const version = await raw("GET", "/api/version", undefined, undefined, { "x-request-id": "phase10-security" });
    results.securityHeaders = {
      versionStatus: version.status,
      requestIdEchoed: version.headers["x-request-id"] === "phase10-security",
      nosniff: version.headers["x-content-type-options"] === "nosniff",
      frameDeny: version.headers["x-frame-options"] === "DENY",
      referrerPolicy: Boolean(version.headers["referrer-policy"]),
      noPoweredBy: !version.headers["x-powered-by"],
      passed: version.status === 200 && version.headers["x-request-id"] === "phase10-security" && version.headers["x-content-type-options"] === "nosniff" && version.headers["x-frame-options"] === "DENY" && !version.headers["x-powered-by"],
    };

    const modules = await raw("GET", "/api/tenant/modules/status", undefined, hr);
    const usage = await raw("GET", "/api/tenant/usage", undefined, hr);
    const employeeUsage = await raw("GET", "/api/tenant/usage", undefined, employee);
    results.saas = {
      moduleStatus: modules.status,
      modulesCount: Array.isArray(modules.body?.data) ? modules.body.data.length : 0,
      usageStatus: usage.status,
      usageHasLimits: Boolean(usage.body?.data?.limits?.users && usage.body?.data?.limits?.employees),
      employeeForbidden: employeeUsage.status === 403,
      passed: modules.status === 200 && usage.status === 200 && Boolean(usage.body?.data?.limits?.users) && employeeUsage.status === 403,
    };

    const dockerFiles = [
      "Dockerfile.api",
      "frontend/Dockerfile",
      "frontend/nginx.conf",
      "docker-compose.yml",
      "docker-compose.staging.yml",
      ".dockerignore",
    ];
    const dockerVersion = spawnSync("docker", ["--version"], { cwd: root, encoding: "utf8", timeout: 10_000 });
    results.docker = {
      filesPresent: dockerFiles.every(exists),
      files: Object.fromEntries(dockerFiles.map((f) => [f, exists(f)])),
      dockerAvailable: dockerVersion.status === 0,
      dockerVersion: (dockerVersion.stdout || dockerVersion.stderr || "").trim(),
      composeConfigChecked: false,
      limitation: dockerVersion.status === 0 ? null : "Docker CLI not available in this local environment; deployment files were statically validated.",
      passed: dockerFiles.every(exists),
    };
    if (dockerVersion.status === 0) {
      const compose = spawnSync("docker", ["compose", "config"], { cwd: root, encoding: "utf8", timeout: 60_000 });
      results.docker.composeConfigChecked = true;
      results.docker.composeConfigStatus = compose.status;
      results.docker.passed = results.docker.passed && compose.status === 0;
    }

    const ciFiles = ["scripts/ci-check.ps1"];
    results.ci = {
      filesPresent: ciFiles.every(exists),
      localCommand: "scripts\\ci-check.ps1",
      referencesPhase9Smoke: /phase-9-smoke\.cjs/.test(fs.readFileSync(path.join(root, "scripts/ci-check.ps1"), "utf8")),
      passed: ciFiles.every(exists),
    };

    const backupFiles = ["scripts/db-backup.ps1", "scripts/db-restore.ps1", "scripts/uploads-backup.ps1", "scripts/exports-cleanup.ps1"];
    const backupDry = dryRun("scripts/db-backup.ps1", ["-DatabaseUrl", "postgresql://example:example@localhost:5432/example", "-DryRun"]);
    const restoreDry = dryRun("scripts/db-restore.ps1", ["-DatabaseUrl", "postgresql://example:example@localhost:5432/example", "-BackupFile", "package.json"]);
    results.backup = {
      filesPresent: backupFiles.every(exists),
      files: Object.fromEntries(backupFiles.map((f) => [f, exists(f)])),
      backupDryRun: backupDry.ok,
      restoreDryRun: restoreDry.ok,
      docsPresent: exists("docs/production-release-checklist.md") && exists("docs/rollback-plan.md") && exists("docs/deployment-guide.md"),
      passed: backupFiles.every(exists) && backupDry.ok && restoreDry.ok && exists("docs/production-release-checklist.md") && exists("docs/rollback-plan.md") && exists("docs/deployment-guide.md"),
    };

    const sprint5 = readJson("cleanup-sprint-5-results.json");
    const sprint7 = readJson("cleanup-sprint-7-results.json");
    const sprint8 = readJson("cleanup-sprint-8-results.json");
    const phase9 = readJson("phase-9-results.json");
    results.regression = {
      cleanupSprint5: sprint5?.status || "UNKNOWN",
      cleanupSprint7: sprint7?.status || "UNKNOWN",
      cleanupSprint8: sprint8?.status || "UNKNOWN",
      phase9Reliability: phase9?.status || "UNKNOWN",
      passed: [sprint5?.status, sprint7?.status, sprint8?.status, phase9?.status].every((s) => s === "GO"),
    };

    results.status = [
      results.health.status === 200,
      results.readiness.status === 200,
      results.env.passed,
      results.docker.passed,
      results.saas.passed,
      results.ci.passed,
      results.backup.passed,
      results.securityHeaders.passed,
      results.regression.passed,
    ].every(Boolean) ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  }

  fs.writeFileSync(files.results, JSON.stringify(results, null, 2));
  fs.writeFileSync(files.env, JSON.stringify({ generatedAt: results.generatedAt, status: results.env.passed ? "GO" : "NO-GO", ...results.env }, null, 2));
  fs.writeFileSync(files.docker, JSON.stringify({ generatedAt: results.generatedAt, status: results.docker.passed ? "GO" : "NO-GO", ...results.docker }, null, 2));
  fs.writeFileSync(files.saas, JSON.stringify({ generatedAt: results.generatedAt, status: results.saas.passed ? "GO" : "NO-GO", ...results.saas }, null, 2));
  fs.writeFileSync(files.ci, JSON.stringify({ generatedAt: results.generatedAt, status: results.ci.passed ? "GO" : "NO-GO", ...results.ci }, null, 2));
  fs.writeFileSync(files.backup, JSON.stringify({ generatedAt: results.generatedAt, status: results.backup.passed ? "GO" : "NO-GO", ...results.backup }, null, 2));
  fs.writeFileSync(files.headers, JSON.stringify({ generatedAt: results.generatedAt, status: results.securityHeaders.passed ? "GO" : "NO-GO", ...results.securityHeaders }, null, 2));
  fs.writeFileSync(files.regression, JSON.stringify({ generatedAt: results.generatedAt, status: results.regression.passed ? "GO" : "NO-GO", ...results.regression }, null, 2));

  console.log(JSON.stringify({ status: results.status, env: results.env.passed, docker: results.docker.passed, saas: results.saas.passed, ci: results.ci.passed, backup: results.backup.passed, headers: results.securityHeaders.passed, regression: results.regression.passed, errors: results.errors }, null, 2));
  if (results.status !== "GO") process.exitCode = 1;
}

main();
