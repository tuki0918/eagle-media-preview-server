import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { ServerStartAlert } from "./ServerAlert";

function render(message: string) {
  const doc = new JSDOM(renderToStaticMarkup(<ServerStartAlert message={message} port={41532} />)).window.document;
  return doc.querySelector('[role="alert"]')?.textContent;
}

test("keeps the Eagle plugin hint when the server reported it", () => {
  expect(render("port in use (the Eagle plugin may be running)")).toContain("The Media Preview Server plugin in Eagle may be using this port.");
  expect(render("listen EADDRINUSE: address already in use 0.0.0.0:41532")).not.toContain("plugin in Eagle");
});

test("leaves the startup failure heading to the banner", () => {
  const alert = render("not started: No library to serve");
  expect(alert).toContain("Could not start the server");
  expect(alert).toContain("No library to serve");
  expect(alert).not.toContain("not started:");
});
