import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("sonner", () => ({
  Toaster: ({ toastOptions }: { toastOptions?: { classNames?: { description?: string } } }) => (
    <div data-description-class={toastOptions?.classNames?.description ?? ""} />
  ),
}));

import { Toaster } from "./sonner";

describe("Toaster", () => {
  test("uses readable description text color for dark toast content", () => {
    const html = renderToStaticMarkup(<Toaster />);

    expect(html).toContain("!text-popover-foreground/90");
  });

  test("overrides sonner's built-in description color selector", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");

    expect(css).toContain(".toaster [data-sonner-toast][data-styled=\"true\"] [data-description]");
    expect(css).toContain("color: var(--popover-foreground) !important;");
    expect(css).toContain("opacity: 0.9;");
  });
});
