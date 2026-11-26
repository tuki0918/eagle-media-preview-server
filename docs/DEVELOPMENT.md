# Development

## Requirements

- Eagle 4.0 Build 23 or later
- Node.js 20 or later

## Development

```sh
npm install
npm run dev
```

`npm run dev` starts the Vite development server for the React UI.

## Build

```sh
npm run build
```

Build output is written to `dist`.

## Verification

```sh
npm run typecheck
npm run build
npm test
```

Run `npm run verify` before committing when you need the full TypeScript, Vite build, and Vitest check in one command.

## Documentation diagrams

Edit the Mermaid sources in [docs/use-cases](use-cases), then regenerate the README images with the pinned `tui-mermaid-diagram` version. PNG export requires Chrome or Chromium. Set `CHROME_PATH` if the browser is installed in a custom location. On Apple Silicon, use native builds of Node.js and Chrome if rendering under Rosetta times out.

```sh
npm run diagram:images -- personal family business upload
npm run diagram:images -- family
```

Keep the use-case diagrams consistent:

- Title: `CASE: short description`, e.g. `FAMILY: a home media library on a NAS`. Do not use `·` as a separator.
- Three columns, left to right: client devices, `HOST MACHINE (<where>)` (server above Eagle), and storage.
- One box per person, titled `WHO (Role) ── Device`, e.g. `PARTNER (Editor) ── Phone`, then a concrete activity such as `Rate and tag favorite photos`. Use `PC`, `Phone`, `Tablet` or `Tablet or TV` for the device. The PNG script puts the text after `──` on the right end of the top border.
- Settings go only in the server box, as `✓` lines with the exact UI names, in this order: Public Network, HTTPS, Password protection, Share only selected libraries, Auto start. Put case details in parentheses, e.g. `Password protection (3 users)`. List only what the case turns on, then a sample endpoint URL in italic with the default port 41532: `*e.g. https://media-server.lan:41532*` with HTTPS (a hostname, since the certificate must match it), or `*e.g. http://192.168.1.20:41532*` without HTTPS (a private IP address). Use the hostname examples from the README (`studio-mac.local`, `media-server.lan`). The client arrow label names the protocol, e.g. `HTTPS` or `HTTP (office LAN)`.
- The Eagle box says which library to keep open. Each library box ends with `✓ shared` or `✕ not shared`.
- Do not draw setup steps (how-to) in the diagram. The README text explains them.
- Arrow labels in lowercase: `HTTPS` (or the network) from clients, `library info, edits` (`library info` for Viewer only, `import` for uploads) to Eagle, `opens` (or `saves`) to the library.
- Arrows between people and the server follow the role: two-way (`you <-->|HTTPS| server`) for Admin, Editor + Upload and Editor, one-way from the server (`server -->|HTTPS| kids`) for Viewer. Give one-way arrows the client color with `linkStyle <index> stroke:#7fd8e8`, since an arrow takes its source's color. If arrows cross, reorder the edge lines and update the `linkStyle` indexes.
- Colors: gray frames (`#aeb7c6`), cyan for people and browsers (`#7fd8e8`), purple for the server (`#b9a0f0`), green for Eagle (`#7fd99a`), yellow for shared libraries (`#e8c86e`), red (`#f08080`) for excluded libraries or people without access.
- `accDescr` has at most three lines: what the case does, then tips or caveats. Do not repeat the settings there.

`npm run diagram:images` renders all diagrams. The existing `overview`, `architecture`, and `standalone` targets use [scripts/diagram.mjs](../scripts/diagram.mjs). To adopt the Mermaid workflow for one of those targets, add its source path as the third entry in the corresponding row in [scripts/diagram-images.mjs](../scripts/diagram-images.mjs) and keep its PNG path.

## Standalone server (experimental)

Serves libraries to the viewer without Eagle, read only. See [docs/design/standalone-server.md](design/standalone-server.md).

```sh
npm run build
npm run standalone                                       # the servers in standalone.json
npm run standalone -- --library /path/to/Photos.library  # or one server, from the command line
npm run standalone -- --panel                            # print the local management URL
npm run standalone -- -f                                 # and stream the access log here
npm run standalone -- logs -f                            # or follow it from another terminal
```

It reads the plugin's `~/.eagle-media-preview-server/settings.json` (read only without `--panel`) for users, sign-in, HTTPS, port, and hostname, so it answers at the plugin's address with the same sign-ins. `~/.eagle-media-preview-server/standalone.json` lists the servers to run; each may change only where it listens:

```jsonc
{
  "servers": [
    { "libraries": ["~/Pictures/Photos.library"] },
    { "libraries": ["/Volumes/nas/Work.library"], "port": 41533, "customDomain": "work.local" },
    { "libraries": ["/Volumes/nas/A.library", { "path": "/Volumes/nas/B.library", "name": "Archive" }], "port": 41534 }
  ]
}
```

A server whose port is taken (the plugin is running in Eagle, say) is skipped; the others run. Advanced Sort is on or off as in the plugin (`experimentalSort` in settings.json). The standalone server writes to `~/.eagle-media-preview-server/standalone-access-log.jsonl`. The Eagle plugin writes to `~/.eagle-media-preview-server/access-log.jsonl`. Run `npm run standalone -- --help` for every option. Options go after `--`, which passes them on to `bin/eagle-media-server.cjs`.

Run `--panel` to start the local management panel. The panel uses the default `settings.json` and its shared library list. CLI options such as `--config`, `--library`, `--settings` and `-f` are for terminal mode.

The panel listens only on `127.0.0.1:41531` by default, independently of the viewer's port and Public Network setting. Set another management port with `--panel --panel-port 41080`, or pass `--panel-port 0` to use an available port. If both servers are configured for the same port, the management panel starts first so you can change the viewer port in **Settings → General**.

Open the complete URL printed in the terminal on the machine running the CLI. The browser stores the token after `#` for the current tab and uses it to authorize management requests. Each CLI run generates a new token. Keep the complete URL and any saved terminal output private.

Start or stop the viewer server and check its endpoint and QR code in the panel. **Auto start** decides whether the viewer server starts with the CLI: on starts it right away, off leaves it stopped until you start it in the panel. It is the plugin's `autoStart` in `settings.json`, so it also applies when Eagle launches the plugin. The switches under **Server Status** save Auto start, Password protection, Public Network, and HTTPS immediately. Changing Auto start doesn't restart a running viewer; the other switches restart it to apply the change. While the viewer runs, the Settings form is locked and, with Advanced Sort on, Server Status shows the library scan as the Advanced Sort Index. Save user passwords in **Settings → Access** and certificate and key paths in **Settings → Security** before enabling their switches. The file icon in the panel header shows the settings file in use.

Each Activity panel shows, searches, exports, and clears its own access log. The connected count tracks the current server. The panel stays open while the viewer server is stopped or fails to start. Use Ctrl+C to stop the CLI and close its management endpoint.

The **Settings** form edits the default `settings.json` shared with the Eagle plugin. Stop the viewer before saving. In the Libraries tab, enter the path to a `.library` folder, click **Add library**, and save. The viewer can serve all selected libraries through one server. Enable library protection to set per-user access. A fresh panel starts with a stopped viewer so you can add the first library. Saved settings take effect when you next start the viewer from the panel.

Blocking or unblocking an address in **Activity** saves it to the same settings file and applies it to running viewers immediately. To pick up external edits, reload the form from the Libraries tab and save, or restart the CLI. If any editable setting changes on disk while the form is open, reload the form before retrying a save.
