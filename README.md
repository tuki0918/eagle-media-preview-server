# Eagle | Media Preview Server Plugin

A local media preview server for browsing an Eagle library from phones, tablets, and other computers on the same LAN.
Run the server on the same computer as Eagle, then open the LAN URL from another device's browser.

![](docs/concept.png)
![](docs/server_panel.png)

## Requirements

- Eagle 4.0 Build 21 or later
- Node.js 20 or later
- Eagle app running

## Eagle Plugin

The intended setup is the Eagle background service plugin.
The plugin window is only for server management; media browsing happens in an external browser by opening the displayed Endpoint URL or scanning the QR code.

Main features:

- Start, stop, and auto-start the embedded HTTP server
- Default port `41532`, bound to `0.0.0.0` when Public Network is enabled
- Display the LAN access URL and QR code
- Enable BasicAuth protection with username and password settings
- Store the password as a SHA-256 hash
- Copy the URL through the Eagle clipboard API when available

During development, install this repository folder as an Eagle plugin.
Eagle reads `manifest.json` and starts `plugin/index.html` in service mode.

## Viewer

The browser viewer connects to Eagle's local Web API and only fetches the data needed for browsing and previewing.

- Eagle API target: `127.0.0.1:41595`
- Filter by folder, uncategorized items, extension, rating, and keyword
- Grid and table views
- Sync search filters, page, view mode, and preview target into the URL
- Lazy-load thumbnails
- Fetch original files from `/file/:id` only when previewed or opened
- Support image zoom, fit, actual size, drag, and pinch interactions
- Use native browser playback for video and audio
- Support HTTP Range requests for video and audio streaming
- Allow rating changes from the preview panel
- Show an "Open file" link for the original media

## Authentication

When BasicAuth protection is enabled, the static viewer, API routes, and media routes require authentication.
After a successful login, the viewer keeps the session with a `viewer_session` cookie.

## Notes

- Request logs are not persisted.
- The server is not designed for public Internet exposure.
- External device access depends on OS firewall settings and same-LAN reachability.
- The design does not expose Eagle's Web API directly to external devices.
