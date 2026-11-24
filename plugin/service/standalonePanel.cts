import { randomBytes, timingSafeEqual } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

const { accessLogCsv } = require("./accessLog.cjs");
const { serveStatic, securityHeaders } = require("./static.cjs");

const panelDir = resolve(__dirname, "../standalone-panel");
const pluginDir = resolve(__dirname, "../../plugin");
const publicDir = resolve(__dirname, "../../public");
export interface PanelSnapshot {
  activeClients: number;
  blockedAddresses: Array<{ address: string; addedAt: number }>;
  settingsPath: string;
  source: string;
  libraryNames: Array<[string, string]>;
  servers: PanelServer[];
}

export interface PanelServer {
  index: number;
  state: "error" | "running" | "stopped";
  error: string;
  url: string;
  port: number;
  authEnabled: boolean;
  httpsEnabled: boolean;
  publicNetwork: boolean;
  libraries: Array<{ name: string; status: string }>;
}

type ActivityRange = "1h" | "24h" | "7d";
const filterFields = ["address", "event", "libraryId", "user"] as const;

export interface PanelActivityQuery {
  range: ActivityRange;
  type: string;
  search: string;
  searchKeys: { events: string[]; fields: string[] };
  filters: Array<{ field: typeof filterFields[number]; value: string }>;
}

interface PanelControls {
  activity(query: PanelActivityQuery): unknown;
  clearLog(): Promise<void>;
  exportLog(): unknown[];
  serverCount: number;
  setPower(index: number, enabled: boolean): Promise<void>;
  snapshot(): PanelSnapshot;
}

function activityQuery(query: URLSearchParams): PanelActivityQuery {
  const range = query.get("range");
  return {
    range: range === "1h" || range === "7d" ? range : "24h",
    type: query.get("type") || "",
    search: query.get("search") || "",
    searchKeys: { events: query.getAll("eventKey"), fields: query.getAll("fieldKey") },
    filters: filterFields.flatMap((field) => query.getAll(field).map((value) => ({ field, value }))),
  };
}

export async function startStandalonePanel(controls: PanelControls, assets = panelDir) {
  const staticFiles = new Map([
    ["/", assets],
    ["/app.js", assets],
    ["/styles.css", publicDir],
    ["/assets/icon_on.svg", pluginDir],
    ["/assets/icon_off.svg", pluginDir],
  ]);
  try {
    await Promise.all([access(resolve(assets, "index.html")), access(resolve(assets, "app.js"))]);
  } catch {
    throw new Error("The management panel isn't built yet. Run `npm run build` first.");
  }

  const host = "127.0.0.1";
  const token = randomBytes(32).toString("base64url");
  const authorization = Buffer.from(`Bearer ${token}`);
  let authority: string;
  let origin: string;

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value as string);
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.host !== authority) {
      return json(res, 403, { error: "Open the 127.0.0.1 management panel URL printed by the CLI." });
    }
    if (req.headers.origin && req.headers.origin !== origin) {
      return json(res, 403, { error: "Forbidden" });
    }

    const [path, query] = (req.url || "/").split("?", 2);
    const assetDir = staticFiles.get(path);
    if (req.method === "GET" && assetDir) return serveStatic(path, res, assetDir);

    const supplied = Buffer.from(req.headers.authorization || "");
    if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization)) {
      return json(res, 401, { error: "Open the management panel using the URL printed by the CLI." });
    }
    if (req.method === "GET" && path === "/api/status") return json(res, 200, controls.snapshot());
    if (req.method === "GET" && path === "/api/activity") {
      return json(res, 200, controls.activity(activityQuery(new URLSearchParams(query))));
    }
    if (req.method === "GET" && path === "/api/activity/export") {
      res.writeHead(200, {
        "Content-Disposition": 'attachment; filename="standalone-access-log.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      });
      return res.end(accessLogCsv(controls.exportLog()));
    }
    if (req.method === "POST") {
      if (req.headers.origin !== origin) return json(res, 403, { error: "Forbidden" });
      if (path === "/api/activity/clear") {
        await controls.clearLog();
        return json(res, 200, {});
      }
      const power = /^\/api\/servers\/(\d+)\/(start|stop)$/.exec(path);
      if (power && Number(power[1]) < controls.serverCount) {
        await controls.setPower(Number(power[1]), power[2] === "start");
        return json(res, 200, controls.snapshot());
      }
    }
    return json(res, 404, { error: "Not found" });
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (res.headersSent) res.destroy();
      else json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine the management panel's address");
  authority = `${host}:${address.port}`;
  origin = `http://${authority}`;

  return {
    url: `${origin}/#${token}`,
    stop: () => new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
      server.closeAllConnections();
    }),
  };
}
