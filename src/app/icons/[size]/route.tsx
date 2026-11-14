// PNG app icons for the PWA manifest, rendered at build time (no external assets).
import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export function generateStaticParams() {
  return ["180", "192", "512", "maskable"].map((size) => ({ size }));
}

const BARS = [
  [7, 14],
  [11.5, 6],
  [16, 18],
  [20.5, 10],
  [25, 15],
];

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const maskable = size === "maskable";
  const px = maskable ? 512 : Math.min(1024, Math.max(16, Number(size) || 192));
  const scale = px / 32;
  const inset = maskable ? 0.16 : 0; // maskable icons need a safe zone
  const s = scale * (1 - inset * 2);
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", background: "#0d5c50", borderRadius: maskable ? 0 : px * 0.22, position: "relative" }}>
        {BARS.map(([x, h], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px * inset + (x - 1.5) * s,
              top: px * inset + (25 - h) * s,
              width: 3 * s,
              height: h * s,
              borderRadius: 1.5 * s,
              background: "#ffffff",
            }}
          />
        ))}
      </div>
    ),
    { width: px, height: px },
  );
}
