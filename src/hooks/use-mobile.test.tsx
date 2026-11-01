import { act } from "react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

let dom: JSDOM;
let root: import("react-dom/client").Root;
let container: HTMLElement;
let desktopMatches: boolean;
let listeners: Set<() => void>;

function Probe() {
  return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
}

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://library.local/" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  // react-dom reads navigator once window exists; Node 20 (CI) has no global one.
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  desktopMatches = true;
  listeners = new Set();
  // Only Tailwind's `md:` query is answered; the hook must agree with it, not with innerWidth.
  dom.window.matchMedia = ((query: string) => ({
    get matches() { return query === "(min-width: 768px)" && desktopMatches; },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof dom.window.matchMedia;
  const { createRoot } = await import("react-dom/client");
  container = dom.window.document.querySelector<HTMLElement>("#root")!;
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  vi.unstubAllGlobals();
});

function setViewport({ desktop, innerWidth }: { desktop: boolean; innerWidth: number }) {
  desktopMatches = desktop;
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: innerWidth });
}

test("follows the CSS breakpoint when innerWidth still reports the pre-rotation width", async () => {
  setViewport({ desktop: true, innerWidth: 1024 });
  await act(async () => { root.render(<Probe />); });
  expect(container.textContent).toBe("desktop");

  // iOS standalone PWAs can fire the media query change before innerWidth catches up.
  setViewport({ desktop: false, innerWidth: 1024 });
  await act(async () => { listeners.forEach((listener) => listener()); });
  expect(container.textContent).toBe("mobile");
});

test("treats a fractional width just under the breakpoint as mobile", async () => {
  // A 767.5px viewport rounds innerWidth up to 768, yet `md:` (min-width: 768px) does not match,
  // so the desktop sidebar is hidden and the mobile Sheet must be used.
  setViewport({ desktop: false, innerWidth: 768 });
  await act(async () => { root.render(<Probe />); });
  expect(container.textContent).toBe("mobile");
});
