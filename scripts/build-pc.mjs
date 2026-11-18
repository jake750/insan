// Builds the Windows setup: a self-contained copy of Insan that needs no Node.js, npm or internet to install.
//
//   dist-pc/Insan/           everything the setup installs
//     InsanServer.exe        the official Node.js runtime for Windows (renamed, so the setup can stop it safely)
//     app/                   Next.js standalone server + static files + public/
//     launch.ps1, stop.ps1   open / stop Insan (the Start-menu and Desktop shortcuts call these)
//     insan.ico
//   dist-pc/Insan-Setup-X.Y.Z.exe   when Inno Setup (iscc) is available (CI installs it)
//
// Usage: node scripts/build-pc.mjs [--node path\to\node.exe] [--no-setup]
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NODE_LINE = "latest-v22.x"; // LTS line bundled with the app
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const out = join("dist-pc", "Insan");

// 1. standalone build
rmSync("dist-pc", { recursive: true, force: true });
run("npx next build", { STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" });

// 2. app files: the standalone server needs .next/static and public/ next to it
mkdirSync(out, { recursive: true });
cpSync(join(".next", "standalone"), join(out, "app"), { recursive: true });
cpSync(join(".next", "static"), join(out, "app", ".next", "static"), { recursive: true });
cpSync("public", join(out, "app", "public"), { recursive: true });
cpSync(join("installer", "pc"), out, { recursive: true });

// 3. Node.js runtime: a local file (--node) or the official build, checked against nodejs.org's SHA-256 list
const exe = join(out, "InsanServer.exe");
const local = opt("--node");
if (local) cpSync(local, exe);
else {
  const base = `https://nodejs.org/dist/${NODE_LINE}`;
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const want = sums.split("\n").find((l) => l.trim().endsWith("win-x64/node.exe"))?.split(/\s+/)[0];
  const bin = Buffer.from(await (await fetch(`${base}/win-x64/node.exe`)).arrayBuffer());
  const got = createHash("sha256").update(bin).digest("hex");
  if (!want || got !== want) throw new Error(`node.exe checksum mismatch (want ${want}, got ${got})`);
  writeFileSync(exe, bin);
  console.log(`node.exe from ${base} (sha256 ${got.slice(0, 12)}…)`);
}

// 4. icon: an .ico may hold PNG images directly; use the app's prerendered 256/48 px icons
const png = (size) => readFileSync(join(".next", "server", "app", "icons", `${size}.png.body`));
const images = [256, 48].filter((s) => existsSync(join(".next", "server", "app", "icons", `${s}.png.body`))).map((s) => ({ s, data: png(s) }));
if (!images.length) images.push({ s: 192, data: png(192) });
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach(({ s, data }, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s >= 256 ? 0 : s, e);
  head.writeUInt8(s >= 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(data.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
writeFileSync(join(out, "insan.ico"), Buffer.concat([head, ...images.map((x) => x.data)]));

// 5. the setup .exe (Inno Setup 6)
if (args.includes("--no-setup")) process.exit(0);
const where = () => {
  try {
    return execSync("where iscc", { encoding: "utf8" }).split(/\r?\n/)[0].trim();
  } catch {
    return "";
  }
};
const iscc = ["C:/Program Files (x86)/Inno Setup 6/ISCC.exe", "C:/Program Files/Inno Setup 6/ISCC.exe"].find((p) => existsSync(p)) ?? where();
if (!iscc) {
  console.log("Inno Setup not found: dist-pc/Insan is ready, but no setup .exe was made.");
  process.exit(0);
}
run(`"${iscc}" /Q /DAppVersion=${version} /DSourceDir="${join(process.cwd(), out)}" /DOutputDir="${join(process.cwd(), "dist-pc")}" installer\\insan.iss`);
console.log(`dist-pc/Insan-Setup-${version}.exe`);
