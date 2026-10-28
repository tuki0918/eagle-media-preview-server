import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initializeItemActionsVisible } from "./viewer/itemActionsVisibilityState";
import { initializeSubfoldersVisible } from "./viewer/subfolderVisibilityState";
import { getLoginConnectState } from "./viewer/loginConnectState";
import "./styles.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Missing #root element");
}

initializeSubfoldersVisible();
initializeItemActionsVisible();

flushSync(() => {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

void import("./viewerApp")
  .then(({ initViewer }) => initViewer())
  .then(() => reportStartup(getLoginConnectState().serverStatus !== "error"))
  .catch(() => reportStartup(false));

function reportStartup(ready: boolean) {
  document.body.dataset.appState = ready ? "ready" : "failed";
  window.dispatchEvent(new window.Event(ready ? "media-library-ready" : "media-library-startup-error"));
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error) => {
      console.warn("Unable to register the service worker", error);
    });
  }, { once: true });
}
