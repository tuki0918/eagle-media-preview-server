import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.useRealTimers());

test("startup failure remains visible without the application bundle and can recover after a slow startup", async () => {
  vi.useFakeTimers();
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("./bootstrap.js", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" });
  try {
    dom.window.setTimeout = setTimeout as unknown as typeof dom.window.setTimeout;
    dom.window.clearTimeout = clearTimeout;
    dom.window.eval(script);
    const style = dom.window.document.createElement("style");
    style.textContent = await readFile(new URL("../src/startup.css", import.meta.url), "utf8");
    dom.window.document.head.append(style);
    const display = (selector: string) => dom.window.getComputedStyle(dom.window.document.querySelector(selector)!).display;
    expect(dom.window.document.body.dataset.appState).toBe("starting");
    expect(display(".startup-loading")).toBe("grid");
    expect(display(".startup-symbol")).toBe("none");
    expect(display(".startup-retry")).toBe("none");
    await vi.advanceTimersByTimeAsync(8000);
    expect(dom.window.document.body.dataset.appState).toBe("failed");
    expect(display(".startup-loading")).toBe("none");
    expect(display(".startup-symbol")).toBe("grid");
    expect(display(".startup-retry")).toBe("inline-block");
    expect(dom.window.document.querySelector("#startupFallback")?.getAttribute("aria-busy")).toBe("false");
    expect(dom.window.document.querySelector("#startupTitle")?.textContent).toBe("Media Library is offline");
    expect(dom.window.document.querySelector("#startupMessage")?.textContent).toContain("Eagle");
    expect(dom.window.document.querySelector(".startup-retry")?.getAttribute("href")).toBe("");
    dom.window.dispatchEvent(new dom.window.Event("media-library-ready"));
    expect(dom.window.document.body.dataset.appState).toBe("ready");
    dom.window.dispatchEvent(new dom.window.Event("offline"));
    expect(dom.window.document.body.dataset.appState).toBe("ready");
  } finally { dom.window.close(); }
});

test("reports module errors immediately and preserves a ready state set before the bootstrap script loaded", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("./bootstrap.js", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  try {
    dom.window.eval(script);
    dom.window.dispatchEvent(new dom.window.Event("media-library-startup-error"));
    expect(dom.window.document.body.dataset.appState).toBe("failed");
    dom.window.document.body.dataset.appState = "ready";
    dom.window.eval(script);
    dom.window.dispatchEvent(new dom.window.Event("error"));
    expect(dom.window.document.body.dataset.appState).toBe("ready");
  } finally { dom.window.close(); }
});
