// PNG app icons and iOS splash screens, rendered at build time (no external assets).
// Colours are the sRGB values of the theme tokens (--brand, --paper); see scripts/contrast-check.mjs --hex.
import { ImageResponse } from "next/og";
import { SPLASH } from "../../splash";

export const dynamic = "force-static";

const BRAND = "#1d2d4e";
const BRAND_INK = "#fafcff";
const SAFFRON = "#eea82f";
const PAPER = "#f1f3f8";

// "ios" = full-bleed 1024 app icon for Xcode (iOS rounds the corners itself); "ios-splash" = 2732² launch image.
const ICONS = ["48", "72", "96", "144", "180", "192", "512", "1024", "maskable", "ios", "ios-splash"];

export function generateStaticParams() {
  return [...ICONS.map((s) => `${s}.png`), ...SPLASH.map((s) => `splash-${s}.png`)].map((size) => ({ size }));
}

/** The living line (same path as public/icon.svg and the Logo component), on the 32-unit grid. */
const LINE = "M5 18H9C11 18 11 11 13 11C15 11 15 23 17.5 23C20 23 20 14 22 14C24 14 24 18 27 18";

function Mark({ px, inset }: { px: number; inset: number }) {
  const s = px * (1 - inset * 2);
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" style={{ position: "absolute", left: px * inset, top: px * inset }}>
      <path d={LINE} fill="none" stroke={BRAND_INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={5} cy={18} r={1.9} fill={SAFFRON} />
    </svg>
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
            <Mark px={icon} inset={0} />
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
        <Mark px={px} inset={maskable ? 0.16 : 0} />
      </div>
    ),
    { width: px, height: px },
  );
}
