import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "0.0.0.0", port: 4173 },
  build: {
    rollupOptions: {
      output: {
        banner: "/*! Third-party license notices: ./THIRD_PARTY_NOTICES.txt */",
        manualChunks(id) {
          if (id.includes("node_modules/@phosphor-icons/")) return "icons";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "react";
        },
      },
    },
  },
});
