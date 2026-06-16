# Eagle | Media Preview Server Plugin

Media Preview Server is a tool that starts a local preview server for your Eagle library with one click.
You can preview your media from other devices on the same network.

![](docs/concept.png)
![](docs/server_panel.png)

## Features

- One-click local preview server
- Access from devices on the same network
- Password-protected viewer login
- Multiple users with Viewer, Editor, and Admin roles
- Read-only media browsing by default
- Role-based metadata editing for rating, tags, and categories

## Requirements

- Eagle 4.0 Build 23 or later
- Node.js 20 or later

## Authentication and roles

Authentication is optional. When password protection is enabled, browser access uses the built-in login screen and a `viewer_session` cookie issued by the login API. Passwords are only sent to `POST /api/auth/login`; follow-up API and media requests use the session cookie instead of resending credentials. HTTP sessions use `HttpOnly; SameSite=Lax`; when HTTPS is enabled with a certificate and key, session cookies also use `Secure`.

- Viewer users can browse and preview media.
- Editor users can edit rating, tags, and categories from the preview panel.
- Admin users can edit metadata and switch the active Eagle library.

Plain text passwords are never persisted. New passwords are saved as salted PBKDF2-SHA-256 hashes, and existing legacy SHA-256 hashes remain accepted for migration compatibility. The viewer session is a server-side cookie session rather than a JWT.

If a viewer session expires or an authenticated API call returns `401`, the browser viewer clears the current library state and returns to the login screen.

## Enabling HTTPS with mkcert

HTTPS requires a certificate file and a private key file. For local/LAN use, `mkcert` is the recommended way to create a trusted development certificate.

```sh
brew install mkcert
mkcert -install
mkcert 127.0.0.1 localhost 192.168.x.x
```

Replace `192.168.x.x` with the LAN IP address shown in the plugin Endpoint URL. If that LAN IP changes, create a new certificate that includes the new IP.

`mkcert` creates files like:

```text
127.0.0.1+2.pem      -> set as TLS Cert
127.0.0.1+2-key.pem  -> set as TLS Key
```

Keep the `*-key.pem` file private. It is the TLS private key.

To avoid browser certificate warnings on another device, that device must trust the mkcert root CA.

On the Mac that created the certificate:

```sh
mkcert -CAROOT
```

This prints the folder containing `rootCA.pem`.

For another Mac, copy `rootCA.pem` to that Mac, open it in Keychain Access, add it to the System keychain, and set it to Always Trust.

For iPhone or iPad, send `rootCA.pem` to the device, install the downloaded profile, then enable full trust in:

```text
Settings > General > About > Certificate Trust Settings
```

Without trusting the root CA, HTTPS still encrypts the connection, but browsers will show a certificate warning.

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
