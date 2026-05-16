const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--apply");
const statusOnly = args.has("--status");
const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = path.join(root, "migrations");
const statusFile = path.join(root, "qa", "phase-11-migration-results.json");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function psql(sql) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migration execution/status.");
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  return result.stdout;
}

function psqlFile(file) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migration execution.");
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file], { cwd: root, encoding: "utf8", timeout: 300000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  return result.stdout;
}

const files = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, path: path.join(migrationsDir, name), checksum: sha256(path.join(migrationsDir, name)) }));

const result = {
  generatedAt: new Date().toISOString(),
  status: "RUNNING",
  dryRun,
  statusOnly,
  migrationCount: files.length,
  planned: files.map(({ name, checksum }) => ({ name, checksum })),
  applied: [],
  skipped: [],
  errors: [],
  limitation: null,
};

try {
  if (!databaseUrl) {
    result.status = dryRun ? "GO" : "NO-GO";
    result.limitation = "DATABASE_URL not set; dry-run ordering/checksum validation only.";
  } else {
    psql(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const rowsText = psql("SELECT name || ' ' || checksum FROM schema_migrations ORDER BY name");
    const applied = new Map(rowsText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith(")")).map(() => []));
    const rawRows = rowsText.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[^ ]+\.sql /.test(line));
    for (const row of rawRows) {
      const [name, checksum] = row.split(/\s+/);
      applied.set(name, checksum);
    }
    if (!dryRun && !statusOnly) psql("SELECT pg_advisory_lock(9112026)");
    try {
      for (const migration of files) {
        const existing = applied.get(migration.name);
        if (existing) {
          if (existing !== migration.checksum) throw new Error(`Checksum mismatch for ${migration.name}`);
          result.skipped.push(migration.name);
          continue;
        }
        if (dryRun || statusOnly) {
          result.planned.find((m) => m.name === migration.name).pending = true;
          continue;
        }
        psqlFile(migration.path);
        psql(`INSERT INTO schema_migrations (name, checksum) VALUES ('${migration.name.replace(/'/g, "''")}', '${migration.checksum}')`);
        result.applied.push(migration.name);
      }
    } finally {
      if (!dryRun && !statusOnly) psql("SELECT pg_advisory_unlock(9112026)");
    }
    result.status = "GO";
  }
} catch (error) {
  result.status = "NO-GO";
  result.errors.push(error.stack || String(error));
}

fs.writeFileSync(statusFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, dryRun: result.dryRun, migrationCount: result.migrationCount, applied: result.applied.length, skipped: result.skipped.length, errors: result.errors }, null, 2));
if (result.status !== "GO") process.exitCode = 1;
