import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { SPLASH } from "./splash";

export const metadata: Metadata = {
  title: "Insan — humanize your writing",
  description: "Rewrite stiff or AI-sounding text into natural writing, with the meaning intact. Private by design.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/180.png" },
  appleWebApp: {
    capable: true,
    title: "Insan",
    statusBarStyle: "default",
    // iPhone splash screens (portrait, device pixels ÷ pixel ratio = CSS size)
    startupImage: SPLASH.map((s) => {
      const [w, h] = s.split("x").map(Number);
      const r = w >= 1242 ? 3 : w === 828 || w === 750 ? 2 : 3;
      return { url: `/icons/splash-${s}.png`, media: `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r})` };
    }),
  },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use the notch / gesture-bar safe areas
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e18" },
  ],
};

// Applies the saved theme and interface direction before first paint (no flash).
const boot = `try{var s=JSON.parse(localStorage.getItem("insan.settings")||"null");if(s){if(s.theme&&s.theme!=="system")document.documentElement.setAttribute("data-theme",s.theme);if(s.uiLang){document.documentElement.lang=s.uiLang;document.documentElement.dir=s.uiLang==="ar"?"rtl":"ltr"}}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="boot" strategy="beforeInteractive">{boot}</Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
