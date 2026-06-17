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

Authentication is optional. When password protection is enabled, browser access uses the built-in login screen and a session cookie issued by the login API. Passwords are only sent to `POST /api/auth/login`; follow-up API and media requests use the session cookie instead of resending credentials. HTTP sessions use `HttpOnly; SameSite=Lax`; when HTTPS is enabled with a certificate and key, session cookies also use `Secure`.

- Viewer users can browse and preview media.
- Editor users can edit rating, tags, and categories from the preview panel.
- Admin users can edit metadata and switch the active Eagle library.

Plain text passwords are never persisted. New passwords are saved as salted PBKDF2-SHA-256 hashes, and existing legacy SHA-256 hashes remain accepted for migration compatibility. The viewer session is a server-side cookie session rather than a JWT.

If a viewer session expires or an authenticated API call returns `401`, the browser viewer clears the current library state and returns to the login screen.

## Use HTTPS with mkcert

HTTPS protects the login password and session cookie on the network. The plugin needs two PEM files:

- `TLS Cert`: the certificate file
- `TLS Key`: the matching private key file

For local/LAN use, `mkcert` is the recommended way to create a trusted development certificate.

### 1. Install mkcert

```sh
brew install mkcert
mkcert -install
```

`mkcert -install` creates a local root CA on the Mac that runs the command.

### 2. Create a certificate for your endpoint

```sh
mkcert 127.0.0.1 localhost 192.168.x.x
```

Replace `192.168.x.x` with the LAN IP address shown in the plugin Endpoint URL. If that LAN IP changes, create a new certificate that includes the new IP.

The certificate is valid only for the IP addresses and hostnames passed to `mkcert`. The browser URL must match one of them. For example, a certificate created for `192.168.1.20` will not be valid when opening `https://192.168.1.30:41532`.

The command creates files like:

```text
127.0.0.1+2.pem      -> set as TLS Cert
127.0.0.1+2-key.pem  -> set as TLS Key
```

Keep the `*-key.pem` file private. It is the TLS private key.

### 3. Enable HTTPS in the plugin

1. Open the plugin settings.
2. Set `TLS Cert` to the generated `.pem` file.
3. Set `TLS Key` to the generated `-key.pem` file.
4. Turn on `HTTPS`.

The Endpoint URL and QR code switch to `https://...`, and session cookies use `Secure; HttpOnly; SameSite=Lax`.

### 4. Trust the mkcert root CA on other devices

To avoid browser certificate warnings on another device, that device must trust the mkcert root CA. Only copy `rootCA.pem`; do not copy or share `rootCA-key.pem`.

On the Mac that created the certificate:

```sh
mkcert -CAROOT
```

This prints the folder containing:

```text
rootCA.pem      -> copy this to other devices
rootCA-key.pem  -> keep this private on the Mac that created it
```

For another Mac, copy `rootCA.pem` to that Mac, open it in Keychain Access, add it to the System keychain, and set it to Always Trust.

For Windows, copy `rootCA.pem` to the Windows device. If the certificate picker does not show `.pem` files, rename the copy to `mkcert-rootCA.crt`; do not change the file contents. Open the certificate, choose `Install Certificate`, then install it for either the current user or local machine in:

```text
Trusted Root Certification Authorities
```

Restart the browser after installing the CA. If Windows, Chrome, or Edge still shows a warning, confirm the browser URL host exactly matches the IP address or hostname included in the `mkcert` command.

For iPhone or iPad, send `rootCA.pem` to the device, install the downloaded profile, then enable full trust in:

```text
Settings > General > About > Certificate Trust Settings
```

For Android, copy `rootCA.pem` to the device. If the file picker does not show `.pem` files, rename the copy to `mkcert-rootCA.crt`; do not change the file contents. Install it as a CA certificate from the Android security settings. The exact path varies by device, but it is usually under:

```text
Settings > Security > Encryption & credentials > Install a certificate > CA certificate
```

or:

```text
Settings > Security & privacy > More security settings > Encryption & credentials > Install a certificate > CA certificate
```

Android may require a screen lock before installing a CA certificate, and it may show a warning that network traffic can be inspected by trusted certificates. This is expected for a user-installed local CA. Browser access should trust certificates created by that CA after installation, but some Android apps do not trust user-installed CAs.

Without trusting the root CA, HTTPS still encrypts the connection, but browsers will show a certificate warning.

### Notes and cautions

- Files you can copy to other devices:
  - `rootCA.pem`: install this on another Mac, Windows PC, iPhone, iPad, or Android device so it trusts mkcert certificates.
  - A renamed copy such as `mkcert-rootCA.crt`: use this only when Windows or Android does not show `.pem` files in the certificate picker.
- Files you must not share:
  - `*-key.pem`: the private key for this plugin server's HTTPS certificate.
  - `rootCA-key.pem`: the private key for the mkcert root CA. If this leaks, anyone with the key can create certificates trusted by devices where `rootCA.pem` is installed.
- Recreate the certificate when the Endpoint URL host changes, such as when the LAN IP changes, you switch from `localhost` to a LAN IP, or you start using a custom hostname.
- Include every hostname or IP address you plan to open in the browser in the `mkcert` command.
- `TLS Cert` and `TLS Key` must be a matching pair generated by the same `mkcert` command.
- Keep `*-key.pem` and `rootCA-key.pem` private. Do not send them to other devices, commit them to Git, or share them.
- Other devices only need `rootCA.pem` installed and trusted. They do not need the site certificate or private key.
- If Chrome still shows a warning after trusting `rootCA.pem`, confirm the URL host matches the certificate and restart the browser.
- If the Endpoint URL changes from `http://...` to `https://...`, use the new URL or refresh the QR code before testing.

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
