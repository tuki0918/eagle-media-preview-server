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

Serves a library to the viewer without Eagle, read only. See [docs/design/standalone-server.md](design/standalone-server.md).

```sh
npm run build
node bin/eagle-media-server.cjs --library /path/to/Photos.library
```

Repeat `--library` to serve several libraries at once; the viewer then shows a library picker. It listens on `127.0.0.1:41532` by default. `--config <file>` takes a settings file in the plugin's format (`~/.eagle-media-preview-server/settings.json`) for users, HTTPS, port, and host, and may list `libraries` (paths, or `{ path, name, access: "selected", users }`). Run `node bin/eagle-media-server.cjs --help` for every option.
