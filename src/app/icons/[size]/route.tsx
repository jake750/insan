// PNG app icons and iOS splash screens, rendered at build time (no external assets).
// Colours are the sRGB values of the theme tokens (--brand, --paper); see scripts/contrast-check.mjs --hex.
import { ImageResponse } from "next/og";
import { SPLASH } from "../../splash";

export const dynamic = "force-static";

const BRAND = "#8047e1";
const BRAND_INK = "#fcfbff";
const PAPER = "#f2f2f8";

// "ios" = full-bleed 1024 app icon for Xcode (iOS rounds the corners itself); "ios-splash" = 2732² launch image.
const ICONS = ["48", "72", "96", "144", "180", "192", "512", "1024", "maskable", "ios", "ios-splash"];


export function generateStaticParams() {
  return [...ICONS.map((s) => `${s}.png`), ...SPLASH.map((s) => `splash-${s}.png`)].map((size) => ({ size }));
}

const BARS = [
  [7, 14],
  [11.5, 6],
  [16, 18],
  [20.5, 10],
  [25, 15],
];

function Bars({ px, inset }: { px: number; inset: number }) {
  const s = (px / 32) * (1 - inset * 2);
  return (
    <>
      {BARS.map(([x, h], i) => (
        <div
          key={i}
          style={{ position: "absolute", left: px * inset + (x - 1.5) * s, top: px * inset + (25 - h) * s, width: 3 * s, height: h * s, borderRadius: 1.5 * s, background: BRAND_INK }}
        />
      ))}
    </>
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const name = size.replace(/\.png$/, "");
  if (name.startsWith("splash-") || name === "ios-splash") {
    const [w, h] = name === "ios-splash" ? [2732, 2732] : name.slice(7).split("x").map(Number);
    const icon = Math.round(Math.min(w, h) * 0.28);
    return new ImageResponse(
      (
        <div style={{ width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center", background: PAPER }}>
          <div style={{ width: icon, height: icon, display: "flex", position: "relative", background: BRAND, borderRadius: icon * 0.22 }}>
            <Bars px={icon} inset={0} />
          </div>
        </div>
      ),
      { width: w, height: h },
    );
  }
  const maskable = name === "maskable" || name === "ios";
  const px = name === "ios" ? 1024 : maskable ? 512 : Math.min(1024, Math.max(16, Number(name) || 192));
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", background: BRAND, borderRadius: maskable ? 0 : px * 0.22, position: "relative" }}>
        <Bars px={px} inset={maskable ? 0.16 : 0} />
      </div>
    ),
    { width: px, height: px },
  );
}
