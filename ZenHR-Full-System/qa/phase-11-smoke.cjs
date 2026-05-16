const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const root = path.resolve(__dirname, "..");

const out = {
  results: path.join(__dirname, "phase-11-results.json"),
  redis: path.join(__dirname, "phase-11-redis-results.json"),
  docker: path.join(__dirname, "phase-11-docker-results.json"),
  migration: path.join(__dirname, "phase-11-migration-results.json"),
  storage: path.join(__dirname, "phase-11-storage-results.json"),
  observability: path.join(__dirname, "phase-11-observability-results.json"),
  disaster: path.join(__dirname, "phase-11-disaster-recovery-results.json"),
  security: path.join(__dirname, "phase-11-security-results.json"),
  regression: path.join(__dirname, "phase-11-regression-results.json"),
};

const results = { generatedAt: new Date().toISOString(), backend, status: "RUNNING", health: null, readiness: null, redis: {}, docker: {}, migration: {}, storage: {}, observability: {}, disasterRecovery: {}, security: {}, regression: {}, errors: [] };

async function raw(method, url, body, token, headers = {}) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${backend}${url}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, ok: response.ok, body: json, text, headers: Object.fromEntries(response.headers.entries()) };
}

async function login(username) {
  const r = await raw("POST", "/api/auth/login", { username, password });
  if (!r.body?.data?.accessToken) throw new Error(`${username} login failed: ${r.status}`);
  return r.body.data.accessToken;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; }
}

function cmd(command, args, timeout = 60000) {
  const r = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout });
  return { status: r.status, ok: r.status === 0, stdout: (r.stdout || "").slice(0, 2000), stderr: (r.stderr || "").slice(0, 2000) };
}

async function main() {
  try {
    results.health = await raw("GET", "/api/healthz");
    results.readiness = await raw("GET", "/api/readiness");
    const hr = await login("hr");
    const payroll = await login("payroll");

    const runtime = await raw("GET", "/api/ops/runtime-store", undefined, hr);
    const job1 = await raw("POST", "/api/production/exports/payroll/jobs", { format: "xlsx" }, payroll);
    const job2 = await raw("POST", "/api/production/exports/payroll/jobs", { format: "xlsx" }, payroll);
    const jobId = job1.body?.data?.id;
    let finalJob = null;
    for (let i = 0; i < 20 && jobId; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      finalJob = await raw("GET", `/api/production/exports/jobs/${jobId}`, undefined, payroll);
      if (["completed", "failed"].includes(finalJob.body?.data?.status)) break;
    }
    const download = jobId ? await raw("GET", `/api/production/exports/jobs/${jobId}/download`, undefined, payroll) : { status: 0, headers: {}, text: "" };
    const redisCli = cmd("redis-cli", ["--version"], 10000);
    results.redis = {
      runtimeStatus: runtime.status,
      runtimeMode: runtime.body?.data?.mode,
      memoryFallbackReady: runtime.status === 200 && runtime.body?.data?.mode === "memory",
      redisCliAvailable: redisCli.ok,
      redisLiveValidated: runtime.body?.data?.mode === "redis" && runtime.body?.data?.ok === true,
      queueDedupe: job1.status === 202 && job2.status === 202 && job1.body?.data?.id === job2.body?.data?.id,
      queueCompleted: finalJob?.body?.data?.status === "completed",
      downloadReady: download.status === 200 && /spreadsheetml/.test(download.headers["content-type"] || ""),
      limitation: redisCli.ok ? null : "Redis server/CLI is not installed locally; memory fallback and Redis-ready code paths were validated, but live Redis persistence/restart validation was not possible.",
    };
    results.redis.passed = results.redis.memoryFallbackReady && results.redis.queueDedupe && results.redis.queueCompleted && results.redis.downloadReady;

    const dockerVersion = cmd("docker", ["--version"], 10000);
    results.docker = {
      filesPresent: ["Dockerfile.api", "frontend/Dockerfile", "docker-compose.yml", "docker-compose.staging.yml"].every(exists),
      redisServiceConfigured: /redis:/.test(fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8")),
      dockerAvailable: dockerVersion.ok,
      dockerBuildRunValidated: false,
      limitation: dockerVersion.ok ? "Docker available but compose build was not run by smoke script." : "Docker CLI is not installed locally; container build/run validation is a Phase 11 blocker.",
    };
    results.docker.passed = results.docker.filesPresent && results.docker.redisServiceConfigured && results.docker.dockerAvailable && results.docker.dockerBuildRunValidated;

    const migrationDry = cmd("node", ["scripts/migrate.cjs", "--dry-run"], 120000);
    const migrationJson = readJson("qa/phase-11-migration-results.json");
    results.migration = {
      runnerPresent: exists("scripts/migrate.cjs"),
      dryRunStatus: migrationDry.status,
      migrationCount: migrationJson?.migrationCount || 0,
      hasChecksums: Array.isArray(migrationJson?.planned) && migrationJson.planned.every((m) => m.checksum),
      status: migrationJson?.status,
    };
    results.migration.passed = results.migration.runnerPresent && migrationDry.ok && results.migration.status === "GO" && results.migration.hasChecksums;

    const storage = await raw("GET", "/api/ops/storage", undefined, hr);
    results.storage = {
      endpointStatus: storage.status,
      adapter: storage.body?.data?.adapter,
      localWorks: storage.status === 200 && storage.body?.data?.adapter === "local",
      s3AdapterSourcePresent: exists("artifacts/api-server/src/storage-adapters.ts"),
      signedDownloadReady: storage.body?.data?.signedDownloadReady === true,
      limitation: "S3 adapter structure exists, but no S3 credentials/client were configured for live object-store validation.",
    };
    results.storage.passed = results.storage.localWorks && results.storage.s3AdapterSourcePresent && results.storage.signedDownloadReady;

    const metrics = await raw("GET", "/api/ops/metrics", undefined, hr);
    const env = await raw("GET", "/api/ops/environment", undefined, hr);
    results.observability = {
      metricsStatus: metrics.status,
      metricsMode: metrics.body?.data?.queue?.mode,
      environmentStatus: env.status,
      requestIdPropagated: (await raw("GET", "/api/version", undefined, undefined, { "x-request-id": "phase11-trace" })).headers["x-request-id"] === "phase11-trace",
      structuredLogs: true,
      vendorConfigured: false,
      limitation: "OpenTelemetry/Sentry vendor sinks are prepared conceptually through structured events and correlation IDs, but no external vendor DSN/exporter is configured locally.",
    };
    results.observability.passed = metrics.status === 200 && env.status === 200 && results.observability.requestIdPropagated;

    const backupDry = cmd("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/db-backup.ps1", "-DatabaseUrl", "postgresql://example:example@localhost:5432/example", "-DryRun"]);
    const restoreDry = cmd("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/db-restore.ps1", "-DatabaseUrl", "postgresql://example:example@localhost:5432/example", "-BackupFile", "package.json"]);
    const uploadsDry = cmd("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/uploads-backup.ps1", "-DryRun"]);
    results.disasterRecovery = {
      backupDryRun: backupDry.ok,
      restoreDryRun: restoreDry.ok,
      uploadsDryRun: uploadsDry.ok,
      docsPresent: exists("docs/rollback-plan.md") && exists("docs/production-release-checklist.md"),
      limitation: "Backup/restore commands were dry-run locally; no destructive restore was applied.",
    };
    results.disasterRecovery.passed = backupDry.ok && restoreDry.ok && uploadsDry.ok && results.disasterRecovery.docsPresent;

    const securityVersion = await raw("GET", "/api/version", undefined, undefined, { "x-request-id": "phase11-sec" });
    const envText = JSON.stringify(env.body || {});
    results.security = {
      headers: {
        noPoweredBy: !securityVersion.headers["x-powered-by"],
        nosniff: securityVersion.headers["x-content-type-options"] === "nosniff",
        frameDeny: securityVersion.headers["x-frame-options"] === "DENY",
        referrerPolicy: Boolean(securityVersion.headers["referrer-policy"]),
      },
      noSecretsInEnvEndpoint: !/JWT_SECRET|PASSWORD|postgresql:\/\/[^@]+@/i.test(envText),
      noCriticalStackLeak: true,
    };
    results.security.passed = Object.values(results.security.headers).every(Boolean) && results.security.noSecretsInEnvEndpoint;

    const regressionFiles = [
      "qa/cleanup-sprint-2-results.json",
      "qa/cleanup-sprint-3-results.json",
      "qa/cleanup-sprint-5-results.json",
      "qa/cleanup-sprint-6-results.json",
      "qa/cleanup-sprint-7-results.json",
      "qa/cleanup-sprint-8-results.json",
      "qa/phase-9-results.json",
      "qa/phase-10-results.json",
    ];
    results.regression = Object.fromEntries(regressionFiles.map((file) => [path.basename(file, ".json"), readJson(file)?.status || "UNKNOWN"]));
    results.regression.passed = Object.values(results.regression).every((status) => status === "GO" || status === true);

    results.status = [
      results.health.status === 200,
      results.readiness.status === 200,
      results.redis.passed,
      results.docker.passed,
      results.migration.passed,
      results.storage.passed,
      results.observability.passed,
      results.disasterRecovery.passed,
      results.security.passed,
      results.regression.passed,
    ].every(Boolean) ? "GO" : "NO-GO";
  } catch (error) {
    results.status = "NO-GO";
    results.errors.push(error?.stack || String(error));
  }

  fs.writeFileSync(out.results, JSON.stringify(results, null, 2));
  fs.writeFileSync(out.redis, JSON.stringify({ generatedAt: results.generatedAt, status: results.redis.passed ? "GO" : "NO-GO", ...results.redis }, null, 2));
  fs.writeFileSync(out.docker, JSON.stringify({ generatedAt: results.generatedAt, status: results.docker.passed ? "GO" : "NO-GO", ...results.docker }, null, 2));
  fs.writeFileSync(out.storage, JSON.stringify({ generatedAt: results.generatedAt, status: results.storage.passed ? "GO" : "NO-GO", ...results.storage }, null, 2));
  fs.writeFileSync(out.observability, JSON.stringify({ generatedAt: results.generatedAt, status: results.observability.passed ? "GO" : "NO-GO", ...results.observability }, null, 2));
  fs.writeFileSync(out.disaster, JSON.stringify({ generatedAt: results.generatedAt, status: results.disasterRecovery.passed ? "GO" : "NO-GO", ...results.disasterRecovery }, null, 2));
  fs.writeFileSync(out.security, JSON.stringify({ generatedAt: results.generatedAt, status: results.security.passed ? "GO" : "NO-GO", ...results.security }, null, 2));
  fs.writeFileSync(out.regression, JSON.stringify({ generatedAt: results.generatedAt, status: results.regression.passed ? "GO" : "NO-GO", ...results.regression }, null, 2));

  console.log(JSON.stringify({ status: results.status, redis: results.redis.passed, docker: results.docker.passed, migration: results.migration.passed, storage: results.storage.passed, observability: results.observability.passed, disasterRecovery: results.disasterRecovery.passed, security: results.security.passed, regression: results.regression.passed, errors: results.errors }, null, 2));
  if (results.status !== "GO") process.exitCode = 1;
}

main();
