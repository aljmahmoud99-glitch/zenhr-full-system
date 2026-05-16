const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", ".pnpm", "tsx@4.21.0", "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "artifacts", "api-server", "src", "index.ts"),
  ],
  {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:123@localhost:5432/zenhr",
    },
  },
);

child.unref();
console.log(JSON.stringify({ pid: child.pid, cwd: root }));
