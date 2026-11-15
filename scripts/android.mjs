// Android helpers.
//   node scripts/android.mjs dev    live reload: runs the dev server on your LAN and the app on a device/emulator
//   node scripts/android.mjs build  signed release APK + AAB (needs android/keystore.properties)
// Needs JDK 21+ (JAVA_HOME) and the Android SDK (ANDROID_HOME). See README "Android app".
import { execSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";

const mode = process.argv[2];
const win = process.platform === "win32";

function env() {
  const e = { ...process.env };
  // pick up a JDK 21+ that Android Studio or a manual install left in ~/.jdks when JAVA_HOME is older
  if (!e.JAVA_HOME || !/(2[1-9]|[3-9]\d)/.test(e.JAVA_HOME)) {
    const dir = join(homedir(), ".jdks");
    const jdk = existsSync(dir) && readdirSync(dir).filter((d) => /(^|-)(2[1-9]|[3-9]\d)/.test(d)).sort().pop();
    if (jdk) e.JAVA_HOME = join(dir, jdk);
  }
  if (!e.ANDROID_HOME) {
    const sdk = win ? join(homedir(), "AppData", "Local", "Android", "Sdk") : join(homedir(), process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk");
    if (existsSync(sdk)) e.ANDROID_HOME = sdk;
  }
  return e;
}
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", env: env(), ...opts });

function lanIp() {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254")) return a.address;
  return "localhost";
}

if (mode === "dev") {
  const url = `http://${lanIp()}:3210`;
  console.log(`\nLive reload from ${url} (phone and PC must be on the same Wi-Fi)\n`);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", "3210"], { stdio: "inherit", env: env() });
  try {
    run("npx cap sync android", { env: { ...env(), CAP_SERVER: url } });
    run("npx cap run android", { env: { ...env(), CAP_SERVER: url } });
  } catch {
    server.kill();
    process.exit(1);
  }
  process.on("SIGINT", () => server.kill());
} else if (mode === "build") {
  if (!existsSync("android/keystore.properties")) console.warn("\n! android/keystore.properties not found: the release will be UNSIGNED. See README → Android app → Signing.\n");
  run("node scripts/build-native.mjs --no-sync");
  run("npx cap sync android");
  run(win ? `"${resolve("android", "gradlew.bat")}"` + " assembleRelease bundleRelease" : "./gradlew assembleRelease bundleRelease", { cwd: "android" });
  console.log("\nAPK: android/app/build/outputs/apk/release/\nAAB: android/app/build/outputs/bundle/release/\n");
} else {
  console.log("usage: node scripts/android.mjs dev|build");
  process.exit(1);
}
