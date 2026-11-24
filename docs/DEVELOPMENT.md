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

## Standalone server (experimental)

Serves libraries to the viewer without Eagle, read only. See [docs/design/standalone-server.md](design/standalone-server.md).

```sh
npm run build
npm run standalone                                       # the servers in standalone.json
npm run standalone -- --library /path/to/Photos.library  # or one server, from the command line
npm run standalone -- --panel                            # open the local management panel
npm run standalone -- -f                                 # and stream the access log here
npm run standalone -- logs -f                            # or follow it from another terminal
```

It reads the plugin's `~/.eagle-media-preview-server/settings.json` (never writes it) for users, sign-in, HTTPS, port, and hostname, so it answers at the plugin's address with the same sign-ins. `~/.eagle-media-preview-server/standalone.json` lists the servers to run; each may change only where it listens:

```jsonc
{
  "servers": [
    { "libraries": ["~/Pictures/Photos.library"] },
    { "libraries": ["/Volumes/nas/Work.library"], "port": 41533, "customDomain": "work.local" },
    { "libraries": ["/Volumes/nas/A.library", { "path": "/Volumes/nas/B.library", "name": "Archive" }], "port": 41534 }
  ]
}
```

A server whose port is taken (the plugin is running in Eagle, say) is skipped; the others run. Advanced Sort is on or off as in the plugin (`experimentalSort` in settings.json). The access log goes to `~/.eagle-media-preview-server/standalone-access-log.jsonl`. Run `npm run standalone -- --help` for every option. Options go after `--`, which passes them on to `bin/eagle-media-server.cjs`.

With `--panel`, the CLI prints a management URL and tries to open it in the default browser. Open the printed URL on the same machine when the browser does not open automatically. The panel listens on `127.0.0.1` on a separate port. The URL carries a per-run token, so keep it private.

Select a configured viewer server to start or stop it and check its endpoint, QR code, and library status. Activity covers all servers in this CLI process and supports search, filters, CSV export, and clearing the log. The panel stays open while viewer servers are stopped, including when their listeners fail to start. It uses the configuration loaded at CLI startup. To apply changes to `settings.json` or `standalone.json`, restart the CLI. Use Ctrl+C to stop the CLI and close its management endpoint.
