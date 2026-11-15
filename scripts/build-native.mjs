// Static export for the Capacitor app into .next-native/, then sync the native projects.
// CAP=1 switches next.config.ts to output: "export"; the web-only proxy (route.web.ts) is left out,
// because the app calls providers and detectors through native HTTP instead.
// Usage: node scripts/build-native.mjs [--no-sync]
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

rmSync(".next-native", { recursive: true, force: true });
run("npx next build", { CAP: "1" });
if (!process.argv.includes("--no-sync")) run("npx cap sync");
