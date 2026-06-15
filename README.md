# Eagle | Media Preview Server Plugin

Media Preview Server is a tool that starts a local preview server for your Eagle library with one click.
You can preview your media from other devices on the same network.

![](docs/concept.png)
![](docs/server_panel.png)

## Features

- One-click local preview server
- Access from devices on the same network
- Basic authentication
- Multiple users with Viewer, Editor, and Admin roles
- Read-only media browsing by default
- Role-based metadata editing for rating, tags, and categories

## Requirements

- Eagle 4.0 Build 23 or later
- Node.js 20 or later

## Development

This project is managed as a TypeScript / React / Vite / Tailwind CSS / Vitest codebase.

- Plugin management UI: `plugin/app.tsx`
- Browser viewer React shell and components: `src/viewer/**/*.tsx`
- Browser viewer controller/state helpers: `src/viewer/**/*.ts`
- Eagle-compatible service sources: `plugin/service/*.cts`
- Shared server wrapper for tests and local imports: `server/viewerServer.ts`

```sh
npm install
npm run dev
```

`npm run dev` starts the Vite development server for the React surfaces. The Eagle plugin runtime itself loads CommonJS service files generated from `plugin/service/*.cts` during build.

## Build

```sh
npm run build
```

The build performs two steps:

- `tsc -p tsconfig.plugin-service.json` generates Eagle-compatible `dist/.generated/plugin-service/*.cjs` files from `.cts` sources.
- `vite build` emits the browser viewer to `dist/public`, bundles the plugin window to `dist/plugin/app.js`, and copies `manifest.json`, plugin assets, public assets, favicon, and generated service files into `dist`.

Generated `dist/.generated/plugin-service/*.cjs` files and `dist` output are build artifacts.

## Verification

```sh
npm run typecheck
npm run build
npm test
```

Run `npm run verify` before committing when you need the full TypeScript, Vite build, and Vitest check in one command.

## Details

See [EAGLE_PLUGIN_SPEC.md](EAGLE_PLUGIN_SPEC.md) for plugin behavior, settings, server routes, authentication, and runtime details.
