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
