import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insan — humanize your writing",
  description: "Rewrite stiff or AI-sounding text into natural writing, with the meaning intact. Private by design.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/180" },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ede8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1412" },
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
