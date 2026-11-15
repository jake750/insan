// WCAG contrast check for the colour tokens in src/app/globals.css (light and dark).
// Usage: node scripts/contrast-check.mjs        → exits 1 if any pair fails AA
//        node scripts/contrast-check.mjs --hex  → also prints sRGB hex for every token
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const block = (sel) => {
  const i = css.indexOf(sel);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*oklch\(([^)]+)\)/g)].map((m) => [m[1], m[2]]));
};
const themes = { light: block(":root {"), dark: block(':root[data-theme="dark"]') };

function oklchToRgb(str) {
  const [l, c, h, , a] = str.replace("/", " / ").split(/\s+/).filter(Boolean).map((x) => (x === "/" ? x : parseFloat(x)));
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((x) => Math.max(0, Math.min(1, x)));
  return { lin, alpha: Number.isFinite(a) ? a : 1 };
}
const enc = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const dec = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const hex = (lin) => "#" + lin.map((x) => Math.round(enc(x) * 255).toString(16).padStart(2, "0")).join("");
const lum = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
/** composite a translucent colour over a background, in sRGB space like browsers do */
const over = (fg, bg) => fg.lin.map((x, i) => dec(enc(x) * fg.alpha + enc(bg.lin[i]) * (1 - fg.alpha)));
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [text token, background token, minimum ratio]
const PAIRS = [
  ["ink", "paper", 4.5], ["ink", "sheet", 4.5], ["ink", "sheet-2", 4.5],
  ["ink-2", "sheet", 4.5], ["ink-2", "paper", 4.5], ["ink-2", "sheet-2", 4.5],
  ["ink-3", "sheet", 4.5], ["ink-3", "paper", 4.5], ["ink-3", "sheet-2", 4.5],
  ["brand-ink", "brand", 4.5], ["brand-ink", "brand-hover", 4.5],
  ["brand-text", "sheet", 4.5], ["brand-text", "brand-soft", 4.5], ["ink", "brand-soft", 4.5],
  ["del", "sheet", 4.5], ["warn", "sheet", 4.5], ["accent", "sheet", 3],
  ["score-low-text", "sheet", 4.5], ["score-mid-text", "sheet", 4.5], ["score-high-text", "sheet", 4.5],
  ["ink", "accent-soft", 4.5], ["ink", "del-soft", 4.5], ["ink", "warn-soft", 4.5],
  ["brand", "sheet", 3], ["score-low", "sheet", 3], ["score-high", "sheet", 3], ["line-2", "sheet", 1.3],
];

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [fgName, bgName, min] of PAIRS) {
    const bg = oklchToRgb(t[bgName]);
    const bgLin = bg.alpha < 1 ? over(bg, oklchToRgb(t.sheet)) : bg.lin;
    const fg = oklchToRgb(t[fgName]);
    const fgLin = fg.alpha < 1 ? over(fg, { lin: bgLin }) : fg.lin;
    const r = ratio(fgLin, bgLin);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "pass" : "FAIL"}  ${fgName.padEnd(16)} on ${bgName.padEnd(12)} ${r.toFixed(2)}:1 (min ${min})`);
  }
  if (process.argv.includes("--hex")) for (const [k, v] of Object.entries(t)) console.log(`  --${k}: ${hex(oklchToRgb(v).lin)}`);
}
console.log(failed ? `\n${failed} pair(s) below AA` : "\nAll pairs pass WCAG AA");
process.exit(failed ? 1 : 0);
