# Eagle | Media Preview Server Spec

## Overview

Eagle | Media Preview Server is an Eagle plugin that starts a local HTTP or HTTPS server on the computer running Eagle, allowing devices on the same LAN to browse media from the Eagle library.

The product has two user-facing surfaces:

- `Server management window`
  - Runs inside Eagle
  - Manages server start, stop, settings, Endpoint URL, and QR code
- `Browser viewer`
  - Opens in a phone, tablet, or another computer's browser
  - Handles library search, filters, tag chips, paged/grid/list/tiles views, and previews

External devices connect to the plugin server, not directly to Eagle's Web API.

## Goals

- Start and stop the media preview server from inside Eagle
- Browse Eagle media from iPhone, iPad, and other computers on the same LAN
- Make access simple through an Endpoint URL and QR code
- Optionally protect access with a viewer login
- Serve images, videos, audio, and text-like files in browser-friendly formats
- Keep server status and settings understandable for non-technical users

## Non-Goals

- Public Internet exposure
- Folder-level or item-level ACLs
- Full Eagle metadata editing beyond rating, tags, and categories
- Persistent request logs or a log viewer screen
- Custom video transcoding or audio transcoding

## Runtime Model

```text
iPhone / Tablet / Other PC Browser
        |
        v
http://<Eagle PC LAN IP>:41532
        |
        v
Eagle | Media Preview Server
        |
        v
Eagle local Web API on 127.0.0.1:41595
```

Defaults:

- Viewer server host: `127.0.0.1`
- Viewer server port: `41532`
- Eagle API host: `127.0.0.1`
- Eagle API port: `41595`
- Password protection: disabled
- HTTPS: disabled
- Public Network: disabled (`127.0.0.1`)
- Auto start: disabled

## Codebase Model

The source is managed as a TypeScript / React / Vite / Tailwind CSS / Vitest project.

- `plugin/app.tsx`
  - React management window loaded by Eagle
  - Bundled by Vite/esbuild into `dist/plugin/app.js`
- `src/viewer/**/*.tsx`
  - Browser viewer shell and reusable React components
  - Component styling is primarily Tailwind utility classes in the components, with shared structural rules in `src/styles.css`
- `src/viewer/**/*.ts`
  - Viewer state, URL sync, media helpers, formatting, API calls, and controller logic
- `plugin/service/*.cts`
  - Eagle-compatible service runtime sources
  - Compiled by `tsconfig.plugin-service.json` to `dist/.generated/plugin-service/*.cjs` files for Eagle's `require` runtime
- `server/viewerServer.ts`
  - ESM wrapper that reuses the generated plugin service runtime for tests and local imports

Build output is created under `dist`:

- `dist/manifest.json`
- `dist/plugin/index.html`
- `dist/plugin/app.js`
- `dist/plugin/styles.css`
- `dist/plugin/assets/*`
- `dist/plugin/service/*.cjs`
- `dist/public/index.html`
- `dist/public/app.js`
- `dist/public/viewerApp.js`
- `dist/public/styles.css`
- `dist/public/assets/*`
- `dist/public/favicon.ico`

## Server Management Window

### Responsibilities

- Show the current server state
- Start and stop the server
- Toggle auto-start
- Toggle Public Network access
- Configure the port
- Configure Password protection
- Configure multiple users with Viewer, Editor, and Admin roles
- Display and copy the Endpoint URL
- Display the Endpoint URL as a QR code
- Keep settings usable in the fixed-size Eagle window through a collapsible panel and resizable window

### UI Elements

- `Server Status`
  - States: `stopped`, `running`, `error`
  - Shows a busy indicator while start/stop/save actions are in flight
  - Power toggle for start and stop
- `Endpoint URL`
  - Current access URL
  - Copy action
- `Quick Access (QR)`
  - Shows the URL QR code only while the server is running
  - Shows an empty-state icon while the server is stopped
- `Options`
  - Auto start
  - Password protection
  - HTTPS
  - Public Network
- `Settings`
  - Collapsible settings panel
  - Port
  - TLS certificate path
  - TLS key path
  - Users
  - Per-user role and password
  - Session duration

### Persisted Settings

```ts
type Settings = {
  settingsVersion: 2;
  authUsers: Array<{
    username: string;
    role: "viewer" | "editor" | "admin";
    passwordHash: string;
  }>;
  autoStart: boolean;
  host: string;
  httpsCertPath: string;
  httpsEnabled: boolean;
  httpsKeyPath: string;
  port: number;
  authEnabled: boolean;
  sessionSecret: string;
  lastServerStatus: "running" | "stopped" | "error";
  sessionDurationDays: number;
};
```

Legacy settings with `basicAuthUser`, `passwordHash`, and `allowMetadataEditing` are read for migration, converted into `authUsers`, and rewritten with `settingsVersion: 2`.

Settings path:

```text
~/.eagle-media-preview-server/settings.json
```

## Browser Viewer

### Responsibilities

- Connect to the Eagle API
- Display the library name and Eagle version
- Fetch items page by page
- Filter by folder, uncategorized state, extension/type, rating, keyword, and tag chips
- Switch between tiles, grid, and list views
- Preview images, videos, audio, text-like files, PDFs, and unsupported media
- Change rating, tags, and categories from the preview panel when authenticated metadata editing is enabled
- Open the original file in a new tab
- Sync search filters, page, view mode, and preview state into the URL
- Clear viewer state and return to the login screen when an authenticated viewer API request returns `401`

### Supported Browsing Features

- Keyword search
- Folder filter
- Uncategorized filter
- Extension filter
- Rating filter
- Tag filter chips
- Page size: `30`, `60`, `120`, `240`
- Tiles view
- Grid view
- List view
- Infinite loading in tiles view
- URL history restore

### Preview Behavior

- Images
  - Loads the original file from `/file/:id`
  - Supports fit, actual size, zoom in, and zoom out
  - Supports drag, wheel zoom, and touch pinch
- Videos
  - Playable extensions: `mp4`, `webm`, `mov`, `m4v`
  - Uses native browser controls
  - Preloads metadata
  - Attempts autoplay after opening
- Audio
  - Playable extensions: `mp3`, `wav`, `m4a`, `aac`, `ogg`
  - Uses native browser controls
  - Attempts autoplay after opening
- Text-like files
  - Preview extensions: `txt`, `md`, `js`, `css`, `html`, `json`, `xml`, `csv`, `log`, `ts`, `tsx`, `jsx`, `mjs`, `cjs`, `yml`, `yaml`
  - Fetches the original file from `/file/:id`
  - Displays source content as escaped plain text in a dedicated text preview
- PDF
  - Preview extension: `pdf`
  - Displays the Eagle thumbnail as an image preview
  - The original PDF is still available through the open-file action
- Unsupported timed media
  - Shows the thumbnail and an unsupported-format message

## HTTP/HTTPS Server

### Static Routes

- `GET /`
  - Browser viewer shell
- `GET /assets/*`
  - Viewer assets

### API Routes

- Routes with a fixed method return `405` with an `Allow` header for unsupported methods
- `GET /api/auth/status`
  - Returns whether authentication is required, whether the current request is authenticated, the current user, and viewer permissions
- `POST /api/auth/login`
  - Requires username and password
  - Issues an HttpOnly session cookie: `viewer_session_http` for HTTP and `viewer_session` for HTTPS
  - When authentication is disabled, returns an authenticated response with anonymous read permissions and does not issue a cookie
- `POST /api/auth/logout`
  - Clears viewer session cookies and removes the server-side session token
- `POST /api/connect`
  - Connects to Eagle API and returns app/library information
- `GET /api/health`
  - Checks Eagle app/library health
- `GET /api/folders`
  - Returns folder list
- `GET /api/libraries`
  - Returns current library and history
- `POST /api/library/switch`
  - Switches the Eagle library
- `GET /api/items`
  - Returns item list or search results
- `POST /api/items/:id/star`
  - Updates rating
- `POST /api/items/:id/metadata`
  - Updates tags and folders/categories from the preview panel
- `GET|HEAD /api/items/:id/thumb`
  - Serves item thumbnail
- `GET|HEAD /api/items/:id/file`
  - Serves original file
- `GET|HEAD /file/:id`
  - Direct original file access

### Media Streaming

- Allows only `GET` and `HEAD`
- Supports HTTP Range requests
- Sends `Content-Disposition: inline`
- Sends `Cache-Control: private, max-age=3600`
- Sends `X-Content-Type-Options: nosniff`
- Returns MIME types for common images, videos, audio, PDF, and text files

## Authentication

When password protection is enabled, viewer API routes and media routes require authentication except:

- `/api/auth/status`
- `/api/auth/login`

Static viewer routes stay available so unauthenticated browsers can load the login screen.

Supported authentication paths:

- `viewer_session_http` or `viewer_session` cookie issued by the login API; cookie and server-side session tokens expire after the configured session duration, 7 days by default
- Browser authentication uses the HttpOnly cookie only; session tokens are not returned in JSON or accepted through `Authorization` headers
- HTTPS mode requires certificate and private key paths, serves the endpoint with `https://`, and adds `Secure` to `viewer_session`
- If a cookie session expires or is rejected, viewer API requests return `401`; the browser viewer treats that as an auth reset and prompts for login again

Roles:

- Viewer: can browse and preview media
- Editor: can browse and update rating, tags, and categories
- Admin: highest available role; includes metadata editing and any admin-only server capabilities exposed by the current UI/API

Password handling:

- Plain text passwords are never persisted
- New passwords are stored as salted PBKDF2-SHA-256 hashes
- Existing legacy SHA-256 hashes are still accepted for migration compatibility

Authorization:

- Browsing is read-only by default
- `POST /api/items/:id/star` and `POST /api/items/:id/metadata` require an Editor or Admin user
- `POST /api/library/switch` requires an Admin user
- Unsafe methods reject mismatched `Origin` or `Referer` headers before API handlers run
- JSON request bodies are capped at 1 MiB; malformed bodies return `400` and oversized bodies return `413`

## Runtime State

Server states:

- `stopped`
- `starting`
- `running`
- `stopping`
- `error`

Main status fields:

- `host`
- `port`
- `boundAddress`
- `boundPort`
- `lastError`
- `activeSessions`
- `requestCount`

`requestCount` is an in-memory runtime counter and is not persisted as a log.

## User Flows

### First-time setup

1. Open the server management window in Eagle
2. Enable `Public Network`
3. If needed, add Viewer, Editor, or Admin users and enable `Password protection`
4. Confirm the Port setting
5. Start the server with the power toggle
6. Open the Endpoint URL or scan the QR code from a phone
7. Browse the Eagle library in the browser viewer

### Daily use

1. If Auto start is enabled, the server starts when Eagle launches
2. Confirm `Running` in the server management window
3. Open the browser viewer from the Endpoint URL or QR code
4. Search, filter, and preview media

### Protected access

1. Add at least one user with a password
2. Assign Viewer, Editor, or Admin roles
3. Enable Password protection
4. To protect credentials and sessions on the wire, enter TLS certificate/key paths and enable HTTPS
5. If the server is already running, settings changes that affect binding, protocol, TLS paths, or auth restart it automatically
6. External browser access requires authentication

## Build and Verification

Development command:

```sh
npm install
npm run dev
```

`npm run dev` starts the Vite development server for the React surfaces. It is for local UI development and does not replace the Eagle plugin runtime build.

Build and verification commands:

```sh
npm run typecheck
npm run build
npm test
npm run verify
```

`npm run build` compiles the plugin service `.cts` files into `dist/.generated/plugin-service` before Vite builds and packages the React surfaces. The Vite package step also copies `manifest.json`, plugin icons/assets, public assets, favicon, generated service `.cjs` files, and CSS into `dist`.

Generated `dist/.generated/plugin-service/*.cjs` files and `dist` output are build artifacts.

`npm run verify` runs TypeScript checks, the production build, and Vitest.

## Implementation Notes

- QR code generation is bundled into the plugin window from the `qrcode-generator` dependency.
- Generated `dist/.generated/plugin-service/*.cjs` files are build artifacts and are not tracked as source.
- Request log UI, diagnostics UI, and shared URL expiration UI are intentionally not part of the current implementation.
