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
node bin/eagle-media-server.cjs                                   # the servers in standalone.json
node bin/eagle-media-server.cjs --library /path/to/Photos.library # or one server, from the command line
node bin/eagle-media-server.cjs -f                                # and stream the access log here
node bin/eagle-media-server.cjs logs -f                           # or follow it from another terminal
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

A server whose port is taken (the plugin is running in Eagle, say) is skipped; the others run. Advanced Sort is on or off as in the plugin (`experimentalSort` in settings.json). The access log goes to `~/.eagle-media-preview-server/standalone-access-log.jsonl`. Run `node bin/eagle-media-server.cjs --help` for every option.
