// Dev server reachable from a phone on the same Wi-Fi: binds to all interfaces and prints the LAN URL + a QR code.
// Usage: npm run dev:phone   (then scan the QR with the phone's camera)
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import qrcode from "qrcode-terminal";

const port = process.env.PORT || "3210";
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254"))
  .map((a) => a.address);

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", port], { stdio: "inherit" });
setTimeout(() => {
  if (!ips.length) return console.log("\nNo Wi-Fi/LAN address found. Is this computer on a network?\n");
  const url = `http://${ips[0]}:${port}`;
  console.log(`\n  Open on your phone: ${url}${ips.length > 1 ? `   (other addresses: ${ips.slice(1).join(", ")})` : ""}\n`);
  qrcode.generate(url, { small: true });
  console.log("  If it doesn't load, allow Node.js through the firewall for private networks.\n");
}, 2500);
process.on("SIGINT", () => server.kill());
