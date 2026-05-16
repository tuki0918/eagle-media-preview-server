# Eagle | Media Preview Server Spec

## Overview

Eagle | Media Preview Server is an Eagle plugin that starts a local HTTP server on the computer running Eagle, allowing devices on the same LAN to browse media from the Eagle library.

The product has two user-facing surfaces:

- `Plugin management window`
  - Runs inside Eagle
  - Manages server start, stop, settings, Endpoint URL, and QR code
- `Browser viewer`
  - Runs in a phone, tablet, or another computer's browser
  - Handles library search, filters, pagination, and previews

External devices connect to the plugin server, not directly to Eagle's Web API.

## Goals

- Start and stop the media preview server from inside Eagle
- Browse Eagle media from iPhone, iPad, and other computers on the same LAN
- Make access simple through an Endpoint URL and QR code
- Optionally protect access with BasicAuth
- Serve images, videos, audio, and text-like files in browser-friendly formats
- Keep server status and settings understandable for non-technical users

## Non-Goals

- Public Internet exposure
- Multi-user accounts or role management
- Folder-level or item-level ACLs
- Full Eagle metadata editing
- Persistent request logs or a log viewer screen
- Custom video transcoding, audio transcoding, or thumbnail generation

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

- Viewer server host: `0.0.0.0`
- Viewer server port: `41532`
- Eagle API host: `127.0.0.1`
- Eagle API port: `41595`
- BasicAuth: disabled
- Auto start: disabled

## Plugin Management Window

### Responsibilities

- Show the current server state
- Start and stop the server
- Toggle auto-start
- Toggle Public Network access
- Configure the port
- Configure BasicAuth enablement, username, and password
- Display and copy the Endpoint URL
- Display the Endpoint URL as a QR code

### UI Elements

- `Server Status`
  - States: `stopped`, `starting`, `running`, `stopping`, `error`
  - Power toggle for start and stop
- `Endpoint URL`
  - Current access URL
  - Copy action
- `Quick Access (QR)`
  - Shows the URL QR code only while the server is running
  - Shows an empty-state icon while the server is stopped
- `Options`
  - Auto start
  - BasicAuth protection
  - Public Network
- `Settings`
  - Port
  - User
  - Password

### Persisted Settings

```ts
type Settings = {
  autoStart: boolean;
  host: string;
  port: number;
  authEnabled: boolean;
  basicAuthUser: string;
  passwordHash: string;
  preferredLanAddress: string;
  lastServerStatus: "running" | "stopped" | "error";
};
```

Settings path:

```text
~/.eagle-media-preview-server/settings.json
```

## Browser Viewer

### Responsibilities

- Connect to the Eagle API
- Display the library name and Eagle version
- Fetch items page by page
- Filter by folder, uncategorized state, extension, rating, and keyword
- Switch between grid and table views
- Preview images, videos, audio, text-like files, PDFs, and unsupported media
- Change rating from the preview panel
- Open the original file in a new tab
- Sync search filters, page, view mode, and preview state into the URL

### Supported Browsing Features

- Keyword search
- Folder filter
- Uncategorized filter
- Extension filter
- Rating filter
- Page size: `30`, `60`, `120`, `240`
- Grid view
- Table view
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
  - Embeds the original file from `/file/:id` with the browser's native PDF viewer
- Unsupported timed media
  - Shows the thumbnail and an unsupported-format message

## HTTP Server

### Static Routes

- `GET /`
  - Browser viewer shell
- `GET /assets/*`
  - Viewer assets

### API Routes

- `GET /api/auth/status`
  - Returns whether authentication is required and whether the current request is authenticated
- `POST /api/auth/login`
  - Issues a BasicAuth session cookie
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
  - API for tag/folder updates. The current UI does not use it
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

When BasicAuth protection is enabled, static viewer routes, API routes, and media routes require authentication except:

- `/api/auth/status`
- `/api/auth/login`

Supported authentication paths:

- BasicAuth header
- `viewer_session` cookie issued by the login API

Password handling:

- Plain text passwords are never persisted
- The settings file stores a SHA-256 hash

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

1. Open the plugin management window in Eagle
2. Enable `Public Network`
3. If needed, enable `BasicAuth protection` and set User and Password
4. Confirm the Port setting
5. Start the server with the power toggle
6. Open the Endpoint URL or scan the QR code from a phone
7. Browse the Eagle library in the browser viewer

### Daily use

1. If Auto start is enabled, the server starts when Eagle launches
2. Confirm `Running` in the plugin management window
3. Open the browser viewer from the Endpoint URL or QR code
4. Search, filter, and preview media

### Protected access

1. Enable BasicAuth protection
2. Set User and Password
3. If the server is already running, settings changes that affect binding or auth restart it automatically
4. External browser access requires authentication

## Implementation Notes

- ESM wrapper `server/viewerServer.js` reuses the CommonJS implementation in `plugin/service/viewerServer.cjs`
- CommonJS runtime for Eagle plugin windows is kept in `plugin/service/runtime.cjs`
- QR code generation uses `plugin/vendor/qrcode-generator.cjs`
- Request log UI, diagnostics UI, and shared URL expiration UI are intentionally not part of the current implementation
