# Changelog

All notable changes to Eagle Media Preview Server are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.1] - 2026-10-30

### Changed

- After the one-hour browser cache expires, unchanged media is revalidated with the server instead of downloaded again.

### Fixed

- When the server stops, previews show "Can't reach the media server right now." instead of loading forever, and videos and text previews reload automatically when it is back.
- Show the server as offline sooner when it stops responding.
- Prevent previews and covers from falling back to images from another library after Eagle switches libraries.
- Fit the Reset to default button in the Preferences dialog on narrow screens.
- Prevent resumed media downloads from mixing old and new content when a file is replaced.

## [0.6.0] - 2026-10-29

### Added

- Added library protection: choose which Eagle libraries the viewer may serve from the new **Libraries** settings tab. If Eagle has a different library open, viewers see the "Media Library is offline" page. Changes take effect when the server starts.

### Changed

- When the library open in Eagle changes, viewers return to the connect screen, and requests never read or change data in the newly opened library.
- Viewers no longer receive library file paths; `/api/connect` and `/api/health` return only the library name and an opaque id, and never the id of an unshared library.

### Removed

- **Breaking:** Removed `GET /api/libraries` and `POST /api/library/switch`. Libraries can only be switched in the Eagle app.
- **Breaking:** `POST /api/connect` no longer changes the Eagle API host, port, or token; the server always uses its own local Eagle connection.
- **Breaking:** Viewer API and media requests now require the connected library id, so bookmarks of old `/file/:id` links stop working. The "Open file" link in the viewer includes it.

## [0.5.3] - 2026-10-29

### Added

- Added a full-screen button to image previews; it stays in full screen while moving between images.

### Changed

- Display settings (theme, items per page, subfolders, and item actions) now open in a Preferences dialog from the account menu.
- On phones and tablets, image previews now overlay the header on the image, and the header hides together with the image controls.
- Fit now scales images to fill the preview area.

### Fixed

- Show the Picture-in-Picture button more reliably in Safari.

## [0.5.2] - 2026-10-29

### Added

- Added a Picture-in-Picture button for video previews on supported desktop and mobile browsers, including Safari's native presentation mode; desktop Chrome can also open PiP automatically when switching tabs during playback.

### Changed

- Slideshows now start muted on all devices; use the speaker button in the playback bar to turn sound on.
- Primary action buttons now show clearer hover and pressed states.

### Fixed

- Improved slideshow loading and playback reliability.
- Keep sidebar popovers above the floating viewer controls.

## [0.5.1] - 2026-10-28

### Added

- Added a fullscreen slideshow for the current search and filters, with image, video, and audio playback, configurable image timing and transitions, looping, optional titles, and playback controls.
- Added a sidebar filter for folders and smart folders, with highlighted matches and a clear button.
- Added optional, collapsible subfolder cards with thumbnails and item counts; subfolder display is disabled by default and can be enabled from the sidebar menu.
- Added a setting to show or hide item detail panel actions.
- Added a Reset display settings action to restore the default viewer preferences.

### Changed

- The sidebar now starts wider and remembers its resized width between visits.
- Clicking the library name in the sidebar now clears filters and shows all items.
- Improved preview layouts on phones and tablets, with a draggable details panel handle on phones and a desktop-style inspector on landscape tablets.
- Disabled Open file in the standalone PWA.

### Fixed

- Show loading and offline screens with a Retry action when the viewer cannot start or the server is unavailable.
- Keep tag and folder suggestions visible when the mobile keyboard is open.
- Show the correct header name for nested folders and smart folders.
- Prevent long audio titles from overflowing the player layout.

## [0.5.0] - 2026-10-24

### Added

- Playing audio and video now shows the file name, library name, and thumbnail in the OS media controls (lock screen / Now Playing), with play, pause, and seek support.
- Added a maskable PWA icon.
- The sidebar menu fades out at the scroll edge to hint at more content.

### Changed

- Renamed the viewer app to "Media Library" in the page title, PWA name, and home screen title.
- Refreshed the app icon, PWA icons, favicon, and plugin icons with a new design.
- The sidebar shows only the library name, without the Eagle version.
- Simplified login, empty-state, and error messages so they no longer mention Eagle internals; technical error details are logged to the console instead of shown on screen.
- Updated the PWA description and background color.
- Updated the README and screenshots.

## [0.4.2] - 2026-10-24

### Added

- The Rating filter now accepts multiple ratings at once.
- Added a search box with a clear button to the All Tags page, and a clear button to the main search box.
- Active filters are shown as labels next to the filter button.
- The sidebar shows the Eagle connection status and checks it periodically.
- The sidebar shortcuts show item totals for tags, uncategorized, and untagged items.
- Added a System option to the theme setting that follows the OS preference.
- The plugin settings can pick the HTTPS certificate and key files with a file dialog.
- Items in grid and tile view fade in from below, row by row from left to right, including tiles loaded while scrolling.

### Changed

- Moved the items-per-page setting from the filter panel to the sidebar menu.
- The Type filter now uses the same dropdown menu as the Rating filter.
- Search and filters are disabled in smart folders, with a tooltip explaining why.
- The last row in tile view now fits its tiles more evenly.
- Renamed "Custom hostname" to "Hostname".
- Removed uppercase styling from the sidebar group label and header title.

## [0.4.1] - 2026-10-21

### Added

- Added an All Tags page, opened from the sidebar, that lists tags with thumbnails: starred tags first, then each tag group, then ungrouped tags.
- Tag sections can be collapsed, and the collapsed sections are remembered.
- Selecting a tag opens the items with that tag.

### Changed

- The search and filter panel now overlays the results and closes when clicking outside it.
- Adjusted the preview dialog layout for touch and desktop devices.

## [0.4.0] - 2026-10-20

### Added

- Added the library name to the viewer.

### Changed

- The Type filter now lists the file extensions actually present in the library instead of a fixed set.
- Redesigned the viewer with a dock, zoom controls, and preview navigation.
- Refreshed the plugin panel design and added feedback when copying URLs.

## [0.3.7] - 2026-10-20

### Added

- Added custom hostname configuration with validation.

### Fixed

- Fall back to the default host when a custom hostname is invalid.

## [0.3.6] - 2026-08-03

### Fixed

- Bounded Eagle API requests and exposed upstream Eagle failures.
- Cancelled stale search updates and isolated asynchronous preview updates.
- Synchronized native preview dialog closes.
- Prevented duplicate metadata submissions.
- Rebuild the server after a failed start when settings change.
- Handled missing library item folders when resolving media.

### Security

- Hardened the file stream lifecycle.
- Sandboxed active library content.
- Preserved active login rate limits across server updates.

## [0.3.5] - 2026-08-02

### Added

- Added PWA support.

## [0.3.4] - 2026-06-26

### Added

- Added support for listing untagged items.
- Added collapsible folder sections with persisted state.
- Added a folder count refresh action.

### Changed

- Fetch smart folder items with pagination.
- Improved folder navigation and folder shortcuts.

### Fixed

- Fixed folder metadata list refresh.
- Fixed event handling for folder suggestions and metadata input.

## [0.3.3] - 2026-06-24

### Added

- Added previews for InternetShortcut URLs.
- Added a placeholder for assets without a preview.
- Added server status and session duration to the login screen.
- Persist the selected viewer mode.

### Changed

- Updated empty states with icons that match the current view mode.

### Fixed

- Handled shortcut encoding and malformed file URLs.

## [0.3.2] - 2026-06-23

### Added

- Added smart folder support.
- Added a resizable sidebar.
- Show folders that contain no items.

### Changed

- Improved folder navigation, folder counts, and sidebar scrolling.

## [0.3.1] - 2026-06-21

### Added

- Added a configurable session duration.
- Added the total folder count to the sidebar.

## [0.3.0] - 2026-06-20

### Added

- Added PDF previews.
- Added moving items to the trash for admins.
- Added item URLs and annotations to the preview.
- Added the image zoom level to the preview.
- Added the pagination position on mobile.

### Changed

- Renamed the table view to list view.

### Fixed

- Validated settings ports, pagination parameters, and HTTPS certificate settings.
- Fixed session cookies across HTTP and HTTPS protocol changes.

### Security

- Added security headers and a Content Security Policy.
- Switched to cookie-only viewer sessions.
- Restricted plugin settings file permissions.
- Hardened static file serving, trusted origin checks, and media path resolution.
- Added a warning before allowing authenticated access over public HTTP.

## [0.2.1] - 2026-06-18

### Added

- Added HTTPS support.
- Added light and dark themes.
- Added toast notifications.
- Added file names to thumbnails.

### Changed

- Changed the default host to `127.0.0.1`.
- Organized plugin settings into General, Access, and Security tabs.

### Security

- Added rate limiting for repeated failed logins.
- Signed session cookies and tracked revoked sessions.
- Added confirmation before starting on a public network without password protection.

## [0.2.0] - 2026-06-16

### Added

- Added tag filtering and suggestions to search.
- Added a masonry tiles view with infinite loading.
- Added metadata editing for tags and folders.
- Added multi-user authentication with roles.

### Changed

- Rebuilt the viewer with React, Vite, Tailwind CSS, and shadcn/ui.

## [0.1.2] - 2026-05-17

### Added

- Added original file names to the preview.

### Fixed

- Matched audio preview styles to video previews.
- Removed the preview file name from direct file URLs.

## [0.1.1] - 2026-05-16

### Added

- Added text and PDF file previews.
- Added color-coded file badges and extension pills.

### Changed

- Improved the video preview layout.
- Close preview info when clicking outside the side menu.

## [0.1.0] - 2026-05-15

### Added

- Initial release of Eagle Media Preview Server.

[Unreleased]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.7...v0.4.0
[0.3.7]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/tuki0918/eagle-media-preview-server/compare/cdcbd86...v0.3.6
[0.3.5]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.4...cdcbd86
[0.3.4]: https://github.com/tuki0918/eagle-media-preview-server/compare/7b8ea8d...v0.3.4
[0.3.3]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.2...7b8ea8d
[0.3.2]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tuki0918/eagle-media-preview-server/releases/tag/v0.1.0
