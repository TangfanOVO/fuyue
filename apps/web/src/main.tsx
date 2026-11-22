import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";

import { App } from "./app";
import { AppErrorBoundary } from "./app-error-boundary";
import "@fuyue/kaomoji-drawer/styles.css";
import "@fuyue/ui/styles.css";
import "@fuyue/travel-ui/styles.css";
import "./styles.css";
import "./ui-refinement.css";
import "./navigation-feedback.css";
import { installNavigationFeedback } from "./navigation-feedback";

const removeNavigationFeedback = installNavigationFeedback(document, ".segment-control,.archive-state-tabs,.memory-library-controls nav,.room-district-grid,.fy-kaomoji > nav,.fy-kaomoji-segments");
if (import.meta.hot) import.meta.hot.dispose(removeNavigationFeedback);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    if (Capacitor.isNativePlatform()) {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("fuyue-shell-")).map((key) => caches.delete(key)));
        }
      })().catch(() => { /* The bundled Android assets remain available without a service worker. */ });
      return;
    }
    void navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: "./" }).catch(() => { /* LocalData remains usable when this host disallows service workers. */ });
  });
}
