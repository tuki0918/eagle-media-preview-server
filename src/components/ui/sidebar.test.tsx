// @vitest-environment jsdom
// Radix portals decide at import time whether a DOM exists, so the Sheet needs one from the start.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "./sidebar";
import { sidebarSwipeIntent, sidebarSwipeSettlesOpen } from "./sidebar-swipe";

describe("sidebarSwipeIntent", () => {
  test("waits until the finger has moved far enough to tell", () => {
    expect(sidebarSwipeIntent({ startX: 250, startY: 300, x: 244, y: 302 })).toBeNull();
  });

  test("drags closed leftwards only", () => {
    expect(sidebarSwipeIntent({ startX: 250, startY: 300, x: 220, y: 295 })).toBe("drag");
    expect(sidebarSwipeIntent({ startX: 250, startY: 300, x: 280, y: 300 })).toBe("ignore");
  });

  test("leaves mostly vertical movement to scrolling", () => {
    expect(sidebarSwipeIntent({ startX: 250, startY: 300, x: 230, y: 340 })).toBe("ignore");
  });
});

describe("sidebarSwipeSettlesOpen", () => {
  test("settles on whichever side of halfway the sidebar was released", () => {
    expect(sidebarSwipeSettlesOpen(0.6, 0)).toBe(true);
    expect(sidebarSwipeSettlesOpen(0.4, 0)).toBe(false);
  });

  test("lets a flick win over the position", () => {
    expect(sidebarSwipeSettlesOpen(0.2, 0.8)).toBe(true);
    expect(sidebarSwipeSettlesOpen(0.9, -0.8)).toBe(false);
  });
});

describe("mobile sidebar swipe", () => {
  let root: Root;
  let container: HTMLElement;

  function Probe() {
    const { openMobile } = useSidebar();
    return <span id="state">{openMobile ? "open" : "closed"}</span>;
  }

  function Shell() {
    return (
      <SidebarProvider>
        <Sidebar><nav>menu</nav></Sidebar>
        <SidebarTrigger />
        <Probe />
      </SidebarProvider>
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Phone width: Tailwind's `md:` query does not match.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root.render(<Shell />); });
  });
  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function touchEvent(type: string, x: number, y: number, timeStamp?: number) {
    const point = { clientX: x, clientY: y };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === "touchend" ? [] : [point] },
      changedTouches: { value: [point] },
    });
    if (timeStamp !== undefined) Object.defineProperty(event, "timeStamp", { value: timeStamp });
    return event;
  }

  async function touch(type: string, x: number, y: number, target: EventTarget = container) {
    await act(async () => { target.dispatchEvent(touchEvent(type, x, y)); });
  }

  // Past the fallback; jsdom runs no CSS transitions, so `transitionend` never fires on its own.
  async function settle() {
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  }

  const state = () => container.querySelector("#state")!.textContent;
  const sheet = () => document.querySelector<HTMLElement>("[data-mobile=true]");
  const icon = () => container.querySelector("[data-slot=sidebar-trigger] svg")!.getAttribute("class");

  async function openWithTrigger() {
    await act(async () => { container.querySelector<HTMLElement>("[data-slot=sidebar-trigger]")!.click(); });
    expect(state()).toBe("open");
  }

  test("an edge swipe does not open it, leaving the edge to the browser's back gesture", async () => {
    await touch("touchstart", 8, 300);
    await touch("touchmove", 40, 302);
    await touch("touchmove", 200, 304);
    await touch("touchend", 200, 304);
    await settle();
    expect(state()).toBe("closed");
    expect(sheet()).toBeNull();
  });

  test("the sheet follows the finger while dragging closed, then settles closed", async () => {
    await openWithTrigger();
    expect(icon()).toContain("lucide-panel-left-close");

    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 200, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -40px, 0px))");
    expect(sheet()!.style.transition).toBe("none");
    await touch("touchmove", 60, 300, sheet()!);

    await touch("touchend", 60, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -100%, 0px))");
    await settle();
    expect(state()).toBe("closed");
    expect(sheet()).toBeNull();
    expect(icon()).toContain("lucide-menu");
  });

  test("a sheet let go past halfway slides back open instead of stopping there", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 200, 300, sheet()!);
    vi.spyOn(sheet()!, "getBoundingClientRect").mockReturnValue({ right: 240, width: 280 } as DOMRect);

    await touch("touchend", 200, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, 0px, 0px))");
    await settle();
    expect(state()).toBe("open");
    expect(sheet()!.style.transform).toBe("");
  });

  test("still settles when the touched element is removed mid-drag", async () => {
    await openWithTrigger();
    // Touch events keep going to the first-touched element even after a re-render detaches it.
    const item = document.createElement("div");
    sheet()!.append(item);
    await touch("touchstart", 240, 300, item);
    await touch("touchmove", 200, 300, item);
    await touch("touchmove", 40, 300, item);
    item.remove();

    await touch("touchend", 40, 300, item);
    await settle();
    expect(state()).toBe("closed");
  });

  test("restores the open position when a second finger interrupts a drag", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 200, 300, sheet()!);
    expect(sheet()!.style.transition).toBe("none");

    const secondFinger = new Event("touchstart", { bubbles: true });
    Object.defineProperty(secondFinger, "touches", {
      value: [{ clientX: 200, clientY: 300 }, { clientX: 210, clientY: 320 }],
    });
    await act(async () => { sheet()!.dispatchEvent(secondFinger); });
    await touch("touchend", 210, 320, sheet()!);
    await touch("touchend", 200, 300, sheet()!);
    await settle();

    expect(state()).toBe("open");
    expect(sheet()!.style.transform).toBe("");
    expect(sheet()!.style.transition).toBe("");
    // The next one-finger drag still works after cancellation.
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 40, 300, sheet()!);
    await touch("touchend", 40, 300, sheet()!);
    await settle();
    expect(state()).toBe("closed");
  });

  test.each([
    { releasedAt: 140, expected: "closed" },
    { releasedAt: 1120, expected: "open" },
  ])("uses only recent flick velocity when released at $releasedAt", async ({ releasedAt, expected }) => {
    await openWithTrigger();
    await act(async () => { sheet()!.dispatchEvent(touchEvent("touchstart", 240, 300, 100)); });
    await act(async () => { sheet()!.dispatchEvent(touchEvent("touchmove", 200, 300, 120)); });
    vi.spyOn(sheet()!, "getBoundingClientRect").mockReturnValue({ right: 240, width: 280 } as DOMRect);

    await act(async () => { sheet()!.dispatchEvent(touchEvent("touchend", 200, 300, releasedAt)); });
    await settle();

    expect(state()).toBe(expected);
    if (expected === "open") expect(sheet()!.style.transform).toBe("");
    else expect(sheet()).toBeNull();
  });

  // jsdom has no layout, so give an element the scroll metrics a browser would report.
  function scroller(scrollWidth: number, clientWidth: number) {
    const el = document.createElement("div");
    // jsdom does not expand the `overflow` shorthand; a browser computes both from `overflow-y: auto`.
    el.style.overflowX = "auto";
    el.style.overflowY = "auto";
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth });
    Object.defineProperty(el, "clientWidth", { value: clientWidth });
    const item = document.createElement("button");
    el.append(item);
    sheet()!.append(el);
    return item;
  }

  async function dragClosed(target: EventTarget) {
    await touch("touchstart", 240, 300, target);
    await touch("touchmove", 200, 300, target);
    await touch("touchmove", 40, 300, target);
    await touch("touchend", 40, 300, target);
    await settle();
  }

  test("closes from the vertical folder list even with a sub-pixel width overflow", async () => {
    await openWithTrigger();
    // A vertical list computes `overflow-x: auto` too; a 281.25px sheet can report 1px of overflow.
    await dragClosed(scroller(281, 280));
    expect(state()).toBe("closed");
  });

  test("leaves a real horizontal scroller to scroll", async () => {
    await openWithTrigger();
    await dragClosed(scroller(600, 280));
    expect(state()).toBe("open");
  });

  test("blocks page scrolling during a drag from a listener registered before the touch", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 200, 300, sheet()!);
    // A touchmove that only reaches the document must still be cancelled while dragging.
    const move = touchEvent("touchmove", 190, 300);
    await act(async () => { document.dispatchEvent(move); });
    expect(move.defaultPrevented).toBe(true);
  });

  test("a tap during the settle animation does not cut it short", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 40, 300, sheet()!);
    await touch("touchend", 40, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -100%, 0px))");

    await touch("touchstart", 300, 500);
    await touch("touchend", 300, 500);
    expect(state()).toBe("open");
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -100%, 0px))");
    await settle();
    expect(state()).toBe("closed");
  });

  // Releases a close-drag, leaving the sheet mid-way through sliding shut at `left`px.
  async function releaseIntoClosingSettle(left: number) {
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 40, 300, sheet()!);
    await touch("touchend", 40, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -100%, 0px))");
    vi.spyOn(sheet()!, "getBoundingClientRect").mockReturnValue({ left, right: 280 + left, width: 280 } as DOMRect);
  }

  test("a new drag during the closing animation picks the sheet up instead of closing it", async () => {
    await openWithTrigger();
    await releaseIntoClosingSettle(-150);

    await touch("touchstart", 200, 300, sheet()!);
    await touch("touchmove", 180, 300, sheet()!);
    expect(state()).toBe("open");
    // Continues from where the sheet was (-150px), not from fully open.
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -170px, 0px))");
    expect(sheet()!.style.transition).toBe("none");
    await settle();
    expect(state()).toBe("open");

    await touch("touchend", 180, 300, sheet()!);
    await settle();
    expect(state()).toBe("closed");
  });

  test("a sheet caught while closing can be pulled back open", async () => {
    await openWithTrigger();
    await releaseIntoClosingSettle(-150);

    await touch("touchstart", 100, 300, sheet()!);
    await touch("touchmove", 160, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, -90px, 0px))");
    vi.spyOn(sheet()!, "getBoundingClientRect").mockReturnValue({ left: -40, right: 240, width: 280 } as DOMRect);

    await touch("touchend", 260, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, 0px, 0px))");
    await settle();
    expect(state()).toBe("open");
    expect(sheet()!.style.transform).toBe("");
  });

  test("finishes as soon as the Sheet's transform transition ends", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 40, 300, sheet()!);
    await touch("touchend", 40, 300, sheet()!);

    const end = new Event("transitionend");
    Object.defineProperty(end, "propertyName", { value: "transform" });
    await act(async () => { sheet()!.dispatchEvent(end); });
    expect(state()).toBe("closed");
  });

  test("returns to open when the system cancels the touch mid-drag", async () => {
    await openWithTrigger();
    await touch("touchstart", 240, 300, sheet()!);
    await touch("touchmove", 40, 300, sheet()!);

    await touch("touchcancel", 40, 300, sheet()!);
    expect(sheet()!.style.transform).toBe("translateX(clamp(-100%, 0px, 0px))");
    await settle();
    expect(state()).toBe("open");
    expect(sheet()!.style.transform).toBe("");
  });

  test("leaves swipes alone while a modal dialog is open", async () => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);

    await openWithTrigger();
    await touch("touchstart", 240, 300, dialog);
    await touch("touchmove", 60, 300, dialog);
    await touch("touchend", 60, 300, dialog);
    await settle();
    expect(state()).toBe("open");
  });
});

describe("desktop sidebar height", () => {
  test("follows the visible viewport, so a phone browser in landscape leaves no gap below it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Landscape phone width: Tailwind's `md:` query matches, so the fixed desktop sidebar is used.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<SidebarProvider><Sidebar><nav>menu</nav></Sidebar></SidebarProvider>); });
      const sidebar = container.querySelector("[data-slot=sidebar-container]")!;
      // `svh` stays at the toolbars-shown height in mobile browsers; `dvh` tracks what is visible.
      expect(sidebar.classList).toContain("h-dvh");
      expect(sidebar.classList).not.toContain("h-svh");
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
