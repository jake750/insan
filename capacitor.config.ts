import type { CapacitorConfig } from "@capacitor/cli";

// Android / iOS shell around the static export in .next-native/ (Next 16 writes `output: "export"` into distDir).
// Live reload: CAP_SERVER=http://<your-pc-ip>:3210 npx cap run android  (see README, "Android app").
const live = process.env.CAP_SERVER;

const config: CapacitorConfig = {
  appId: "app.insan.humanizer",
  appName: "Insan",
  webDir: ".next-native",
  backgroundColor: "#f1f3f8",
  ...(live ? { server: { url: live, cleartext: true } } : {}),
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: true, backgroundColor: "#1d2d4e", showSpinner: false, androidScaleType: "CENTER_CROP" },
    StatusBar: { backgroundColor: "#f1f3f8", style: "LIGHT", overlaysWebView: false },
    Keyboard: { resize: "native" },
  },
};

export default config;
