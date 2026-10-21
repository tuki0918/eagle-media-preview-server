# Changelog

All notable changes to Eagle Media Preview Server are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/tuki0918/eagle-media-preview-server/compare/v0.4.1...HEAD
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
