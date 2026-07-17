import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Missing #root element");
}

flushSync(() => {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

void import("./viewerApp").then(({ initViewer }) => initViewer());

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error) => {
      console.warn("Unable to register the service worker", error);
    });
  }, { once: true });
}
