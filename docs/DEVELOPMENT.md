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

A server whose port is taken (the plugin is running in Eagle, say) is skipped; the others run. Advanced Sort is on or off as in the plugin (`experimentalSort` in settings.json). The access log goes to `~/.eagle-media-preview-server/standalone-access-log.jsonl`. Run `npm run standalone -- --help` for every option. Options go after `--`, which passes them on to `bin/eagle-media-server.cjs`.

With `--panel`, the CLI prints a management URL and tries to open it in the default browser. Open the printed URL on the same machine when the browser does not open automatically. The panel listens on `127.0.0.1` on a separate port. The URL carries a per-run token and appears in the CLI output and in the arguments passed to the browser launcher. Keep any saved output private and use `--panel` on machines where you trust users who can inspect process arguments.

Select a configured viewer server to start or stop it and check its endpoint, QR code, and library status. Activity covers all servers in this CLI process and supports search, filters, CSV export, and clearing the log. The panel stays open while viewer servers are stopped, including when their listeners fail to start. Use Ctrl+C to stop the CLI and close its management endpoint.

The **Settings** form edits the shared `settings.json`, or the path given by `--settings`. Stop all viewer servers before saving. Saving applies the new settings when you next start a viewer from the panel. Standalone server overrides and command-line overrides still take precedence over the saved defaults. The Libraries tab edits access to configured or previously shared libraries. Define the servers and their library paths in `standalone.json` or with `--library`. When startup relies on shared libraries alone, keep library protection enabled and at least one library shared.

Blocking or unblocking an address in **Activity** saves it to the same settings file and applies it to running viewers immediately. To pick up external edits, reload the form from the Libraries tab and save, or restart the CLI. If the file changes while you are editing, reload the form before retrying a save.
