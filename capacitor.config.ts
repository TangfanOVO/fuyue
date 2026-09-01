import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "love.fuyue.phone",
  appName: "赴约",
  webDir: "apps/web/dist",
  server: { androidScheme: "https" },
  android: {
    allowMixedContent: false,
    backgroundColor: "#fbfcfa",
  },
};

export default config;
