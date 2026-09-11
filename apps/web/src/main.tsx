import React from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "./store";
import App from "./App";
import "./index.css";

useApp.getState().init();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* Hide splash after 10 seconds (or when app is ready, whichever is later) */
const hideSplash = () => {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.style.transition = "opacity 0.5s";
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 500);
  }
};
const elapsed = Date.now() - ((window as any).__splashStart ?? 0);
const remaining = Math.max(0, 10_000 - elapsed);
setTimeout(hideSplash, remaining + 50);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}