const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const targets = ["frontend/src/app", "frontend/src/assets", "artifacts/api-server/src", "migrations"];
const extensions = new Set([".ts", ".html", ".scss", ".json", ".sql"]);
const patterns = [/Ø/, /Ù/, /Û/, /�/, /â€/, /â€”/, /â€¢/, /â‰/, /ط§/, /ظ„/, /ظ…/, /ظٹ/];

function walk(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, list);
    else if (extensions.has(path.extname(entry.name))) list.push(full);
  }
  return list;
}

const findings = [];
for (const rel of targets) {
  for (const file of walk(path.join(root, rel))) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push({
          file: path.relative(root, file).replace(/\\/g, "/"),
          line: index + 1,
          sample: line.trim().slice(0, 220),
        });
      }
    });
  }
}

const touchedImportant = findings.filter((item) =>
  /attendance|shifts|job-descriptions|layout|settings|dashboard|notifications|leave|payroll|documents|compliance|hr-master-data/.test(item.file)
);

const result = {
  generatedAt: new Date().toISOString(),
  status: findings.length ? "PARTIAL" : "PASS",
  scannedTargets: targets,
  totalFindings: findings.length,
  touchedImportantFindings: touchedImportant.length,
  displayMitigation: "I18nService.cleanArabicText is applied to translation lookups and attendance/local layout rendering; source cleanup remains incremental for older files.",
  topFindings: findings.slice(0, 80),
};

fs.writeFileSync(path.join(__dirname, "enterprise-ui-2-1-arabic-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, totalFindings: result.totalFindings, touchedImportantFindings: result.touchedImportantFindings }, null, 2));
if (touchedImportant.length) process.exitCode = 2;
