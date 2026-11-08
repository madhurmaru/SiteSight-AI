import { existsSync, copyFileSync, closeSync, openSync } from "node:fs";
import { spawnSync } from "node:child_process";
if (!existsSync(".env")) copyFileSync(".env.example", ".env");
if (!existsSync("prisma/demo.db")) closeSync(openSync("prisma/demo.db", "a"));
for (const args of [
  ["prisma", "migrate", "deploy"],
  ["tsx", "--env-file=.env", "prisma/seed.ts"],
]) {
  const r = spawnSync("npx", args, { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}
