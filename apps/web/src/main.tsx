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

/* Remove splash as soon as React mounts */
const splash = document.getElementById("splash");
if (splash) {
  splash.style.transition = "opacity 0.3s";
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 300);
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}