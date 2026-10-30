// Prints the architecture diagrams: a short user overview and the full architecture.
// Usage: node scripts/diagram.mjs [overview|architecture]   (no argument prints both)
// Plain-text output (NO_COLOR=1) is what the README copies.
const useColor = process.env.NO_COLOR === undefined && (process.stdout.isTTY || process.env.FORCE_COLOR);

const palette = {
  cyan: [127, 216, 232],
  blue: [106, 168, 240],
  green: [127, 217, 154],
  yellow: [232, 200, 110],
  purple: [185, 160, 240],
  red: [240, 128, 128],
  gray: [138, 147, 166],
  dim: [92, 99, 115],
  white: [230, 233, 240],
};

const paint = (name, text, bold = false) => {
  if (!useColor || !name) return text;
  const [r, g, b] = palette[name];
  return `\x1b[${bold ? "1;" : ""}38;2;${r};${g};${b}m${text}\x1b[0m`;
};

// ---------------------------------------------------------------- canvas

let W = 0;
let grid = [];

function newCanvas(width, height) {
  W = width;
  grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: " ", color: "", bold: false })));
}

function put(x, y, text, color = "white", bold = false) {
  [...text].forEach((ch, i) => {
    const cell = grid[y]?.[x + i];
    if (cell) Object.assign(cell, { ch, color, bold });
  });
}

// A line is a plain string, or a list of [text, color, bold] parts.
function putLine(x, y, line) {
  for (const [text, color, bold] of typeof line === "string" ? [[line, "white"]] : line) {
    put(x, y, text, color, bold);
    x += [...text].length;
  }
}

function box(x, y, w, h, { title, color, lines = [], dashed = false }) {
  const [hz, vt] = dashed ? ["╌", "╎"] : ["─", "│"];
  put(x, y, `╭${hz.repeat(w - 2)}╮`, color);
  for (let row = 1; row < h - 1; row += 1) {
    put(x, y + row, `${vt}${" ".repeat(w - 2)}${vt}`, color);
  }
  put(x, y + h - 1, `╰${hz.repeat(w - 2)}╯`, color);
  put(x + 2, y, ` ${title} `, color, true);
  lines.forEach((line, i) => putLine(x + 2, y + 1 + i, line));
}

const OPPOSITE = { r: "l", l: "r", u: "d", d: "u" };
const CORNER = { ur: "╰", ul: "╯", dr: "╭", dl: "╮" };
const HEAD = { r: "▶", l: "◀", u: "▲", d: "▼" };

// Orthogonal connector through `points`; bends get rounded corners, ends get arrowheads.
function connector(points, color, { start = false, end = true, label, labelAt = 0 } = {}) {
  const dirs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dir = x1 > x0 ? "r" : x1 < x0 ? "l" : y1 > y0 ? "d" : "u";
    dirs.push(dir);
    const steps = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    for (let s = 0; s <= steps; s += 1) {
      put(x0 + Math.sign(x1 - x0) * s, y0 + Math.sign(y1 - y0) * s, dir === "r" || dir === "l" ? "─" : "│", color);
    }
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const sides = new Set([OPPOSITE[dirs[i - 1]], dirs[i]]);
    put(points[i][0], points[i][1], CORNER[`${sides.has("u") ? "u" : "d"}${sides.has("l") ? "l" : "r"}`], color);
  }
  const [lx, ly] = points.at(-1);
  if (end) put(lx, ly, HEAD[dirs.at(-1)], color);
  if (start) put(points[0][0], points[0][1], HEAD[OPPOSITE[dirs[0]]], color);
  if (label) {
    // Labels sit inside a horizontal segment, centered, with a space of padding on each side.
    const [[ax, ay], [bx]] = [points[labelAt], points[labelAt + 1]];
    const text = ` ${label} `;
    put(Math.round((ax + bx) / 2 - [...text].length / 2), ay, text, "gray");
  }
}

function render() {
  const lines = grid.map((row) => {
    let out = "";
    let run = "";
    let style = null;
    const flush = () => {
      if (run) out += paint(style.color, run, style.bold);
      run = "";
    };
    for (const cell of row) {
      if (!style || cell.color !== style.color || cell.bold !== style.bold) {
        flush();
        style = cell;
      }
      run += cell.ch;
    }
    flush();
    return out.replace(/\s+$/, "");
  });
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

const g = (text) => [text, "gray"];
const w = (text) => [text, "white"];
const head = (text, color) => [[text, color, true]];
const ok = ["✓ ", "green"];
const no = ["✕ ", "red"];

function pad(text, width) {
  return text + " ".repeat(Math.max(0, width - [...text].length));
}

function centerTitle(text) {
  put(Math.floor((W - text.length) / 2), 0, text, "white", true);
}

// ---------------------------------------------------------------- 1. overview (for users)

function drawOverview() {
  newCanvas(131, 24);
  centerTitle("MEDIA PREVIEW SERVER  ·  overview");

  put(1, 2, "OTHER DEVICES", "cyan", true);
  put(37, 2, "THE COMPUTER RUNNING EAGLE", "purple", true);
  for (let y = 2; y <= 20; y += 1) put(34, y, "┊", "dim");

  box(1, 4, 30, 7, {
    title: "BROWSER",
    color: "cyan",
    lines: ["browse, search, filter", "view, play, slideshow", "edit rating and tags", [g("(Editor or Admin only)")]],
  });
  box(50, 4, 34, 7, {
    title: "PREVIEW SERVER",
    color: "blue",
    lines: ["checks sign-in and roles", "serves shared libraries only", "streams media files", [g("port 41532")]],
  });
  box(101, 4, 30, 6, {
    title: "EAGLE APP",
    color: "green",
    lines: ["manages the library", "applies the edits", [g("API: localhost:41595")]],
  });
  box(101, 13, 30, 7, {
    title: "EAGLE LIBRARY",
    color: "yellow",
    lines: ["originals, thumbnails,", "metadata", [g("internal disk, external")], [g("HDD / SSD, or NAS")]],
  });
  box(37, 14, 34, 6, {
    title: "PLUGIN WINDOW",
    color: "purple",
    lines: ["start / stop the server", "Password, Public Network,", "HTTPS, users, libraries"],
  });

  connector([[31, 7], [49, 7]], "cyan", { start: true });
  put(33, 6, " HTTP(S) :41532 ", "gray");
  put(32, 8, " pages, API, media", "gray");
  connector([[84, 6], [100, 6]], "green");
  put(86, 5, "edit requests", "gray");
  connector([[78, 11], [78, 16], [100, 16]], "blue", { label: "reads files", labelAt: 1 });
  connector([[116, 10], [116, 12]], "green");
  put(118, 11, "saves edits", "gray");
  connector([[60, 13], [60, 11]], "purple");
  put(62, 12, "controls", "gray");

  putLine(1, 22, [g("Connect by opening the URL or scanning the QR code shown in the plugin window.")]);
  putLine(1, 23, [g("Browsers talk only to the preview server; they never get direct access to Eagle's API or the library folder.")]);
  return render();
}

// ---------------------------------------------------------------- 2. architecture (details)

function drawArchitecture() {
  newCanvas(188, 58);
  centerTitle("MEDIA PREVIEW SERVER  ·  architecture");

  put(1, 2, "OTHER DEVICES", "cyan", true);
  put(1, 3, "phone, tablet, another computer", "gray");
  put(60, 2, "THE COMPUTER RUNNING EAGLE", "purple", true);
  put(60, 3, "┄".repeat(W - 60), "dim");
  for (let y = 2; y <= 52; y += 1) put(57, y, "┊", "dim");
  put(49, 53, "network", "dim");
  put(49, 54, "boundary", "dim");

  // Other devices
  box(1, 20, 37, 10, {
    title: "BROWSER VIEWER  (Media Library)",
    color: "cyan",
    lines: [
      [g("browse and preview the library")],
      "",
      head("HOLDS", "cyan"),
      "· session cookie (HttpOnly)",
      head("REACHES", "cyan"),
      "· the preview server only",
      [no, g("Eagle API, library folder")],
    ],
  });
  box(1, 33, 37, 4, {
    title: "SERVICE WORKER",
    color: "cyan",
    dashed: true,
    lines: ["caches the app shell only", [no, g("media files, API responses")]],
  });
  connector([[19, 30], [19, 32]], "gray");
  put(21, 31, "registers", "gray");
  putLine(1, 46, [g("browsers "), ["╌".repeat(46), "red"], ["✕", "red"]]);
  putLine(10, 47, [g("no direct access to the library folder")]);

  // Inside Eagle
  box(60, 5, 36, 8, {
    title: "PLUGIN WINDOW",
    color: "purple",
    lines: [
      [g("settings UI inside Eagle")],
      "",
      "· on / off, URL, QR code",
      "· Password, Public Network",
      "· HTTPS, users, libraries",
      [g("locked while the server runs")],
    ],
  });
  box(108, 5, 34, 8, {
    title: "BACKGROUND SERVICE",
    color: "purple",
    lines: [
      [g("no UI, runs inside Eagle")],
      "",
      "· runs the preview server",
      "· start, stop, restart",
      "· loads and saves settings",
      "· relays library switches",
    ],
  });
  box(154, 5, 34, 8, {
    title: "SETTINGS FILE",
    color: "yellow",
    lines: [
      [w("~/.eagle-media-preview-server/")],
      [w("  settings.json")],
      [ok, g("owner-only access (700/600)")],
      "· users, password hashes",
      "· port, hostname, HTTPS",
      "· shared libraries",
    ],
  });

  // Preview server
  box(60, 20, 82, 19, {
    title: "PREVIEW SERVER",
    color: "blue",
    lines: [
      [g("HTTP / HTTPS server run by the background service")],
      "",
      head("LISTENS ON", "blue"),
      [w("127.0.0.1:41532"), g("   this computer only (default)")],
      [w("0.0.0.0:41532"), g("     all network interfaces (Public Network on)")],
      "",
      head("ACCESS CONTROL", "blue"),
      [w(pad("· Origin", 22)), g("state-changing requests must come from its own URL")],
      [w(pad("· session cookie", 22)), g("when Password protection is on")],
      [w(pad("· role", 22)), g("Viewer: read, Editor: edit, Admin: trash")],
      [w(pad("· shared library", 22)), g("only libraries enabled under Libraries")],
      [w(pad("· library id", 22)), g("the library the viewer connected to")],
      "",
      head("FILE ACCESS", "blue"),
      [ok, w(pad("media is read-only", 22)), g("never written, moved or deleted directly")],
      [ok, w(pad("edits via Eagle", 22)), g("rating, tags, folders and trash go through Eagle's API")],
      [ok, w(pad("paths stay private", 22)), g("viewers get item ids, never folder paths")],
    ],
  });

  // Eagle
  box(154, 20, 34, 13, {
    title: "EAGLE APP",
    color: "green",
    lines: [
      [g("owns the library")],
      "",
      head("LOCAL WEB API", "green"),
      [w("http://localhost:41595")],
      [g("this computer only")],
      "",
      head("WRITES", "green"),
      "· rating, tags, folders",
      "· trash (restorable in Eagle)",
      [g("when an Editor or Admin asks")],
      [g("through the preview server")],
    ],
  });

  // Physical library storage
  box(60, 42, 128, 11, {
    title: "EAGLE LIBRARY  ·  physical files",
    color: "yellow",
    lines: [
      [w("<name>.library/"), g("   the folder Eagle has open")],
      [w("  images/<item id>.info/"), g("   original file, *_thumbnail.png, metadata.json")],
      "",
      [head("LOCATION", "yellow")[0], g("   any drive mounted on the computer running Eagle")],
      [w("  ▣ internal disk      ▣ external HDD / SSD      ▣ NAS / network drive (SMB, AFP, NFS)")],
      "",
      head("PROTECTION", "yellow"),
      [ok, w("no folder sharing"), g(pad(" — the plugin never shares this folder", 44)), ok, w("only shared libraries"), g(" — chosen under Libraries")],
      [ok, w("only item files"), g(pad(" — \"../\" path escapes are rejected", 46)), ok, w("media never modified"), g(" — no upload, no direct write or delete")],
    ],
  });

  // Connections
  connector([[96, 9], [107, 9]], "purple", { start: true });
  put(98, 8, "control", "gray");
  put(98, 10, "status", "gray");
  connector([[142, 9], [153, 9]], "yellow", { start: true });
  put(143, 8, "read/write", "gray");
  connector([[125, 13], [125, 19]], "purple");
  put(112, 16, "start, stop", "gray");
  connector([[171, 19], [171, 16], [135, 16], [135, 13]], "green", { label: "library switched", labelAt: 1 });

  connector([[38, 25], [59, 25]], "cyan", { start: true });
  put(41, 24, "HTTP(S) :41532", "gray");
  put(40, 26, "pages, API, media", "gray");
  put(40, 27, "+ session cookie", "gray");

  connector([[142, 26], [153, 26]], "green", { start: true });
  put(144, 25, "/api/v2/*", "gray");
  put(143, 27, "metadata,", "gray");
  put(143, 28, "file paths", "gray");

  connector([[100, 39], [100, 41]], "blue");
  putLine(102, 40, [g("reads media files (HTTP Range)")]);
  connector([[171, 33], [171, 41]], "green", { start: true });
  put(173, 37, "read, write", "gray");

  putLine(1, 56, [
    g("With "), w("Public Network"), g(" on, other devices may reach "), w("port 41532"),
    g("; actual reach depends on your network and firewall. Browsers never get direct access to Eagle's API or the library folder."),
  ]);
  putLine(1, 57, [
    w("HTTPS"), g(" encrypts passwords, session cookies and media in transit.  "),
    g("URL and QR code for connecting are shown in the plugin window."),
  ]);
  return render();
}

// ---------------------------------------------------------------- main

const VIEWS = { overview: drawOverview, architecture: drawArchitecture };
const requested = process.argv.slice(2).filter((arg) => arg in VIEWS);
const output = (requested.length ? requested : Object.keys(VIEWS)).map((name) => VIEWS[name]().join("\n"));
// A heavy rule with blank lines on both sides separates the views.
const separator = `\n\n${paint("dim", "━".repeat(188))}\n\n`;
process.stdout.write(`\n${output.join(separator)}\n\n`);
