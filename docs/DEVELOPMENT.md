# Development

## Requirements

- Eagle 4.0 Build 23 or later
- Eagle's **AI Models** plugin, which provides the AI SDK (declared in `manifest.json` as the `ai-sdk` dependency; Eagle asks to install it)
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
