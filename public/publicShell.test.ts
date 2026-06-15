import { test } from "vitest";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function readViewerSources() {
  const files = [
    "../src/viewerApp.ts",
    "../src/viewer/api.ts",
    "../src/viewer/constants.ts",
    "../src/viewer/elements.ts",
    "../src/viewer/fileLinks.ts",
    "../src/viewer/format.ts",
    "../src/viewer/icons.ts",
    "../src/viewer/itemQuery.ts",
    "../src/viewer/libraryFooterState.ts",
    "../src/viewer/media.ts",
    "../src/viewer/metadata.ts",
    "../src/viewer/pagination.ts",
    "../src/viewer/previewDialogState.ts",
    "../src/viewer/previewDetails.ts",
    "../src/viewer/previewTransform.ts",
    "../src/viewer/resultsStatusState.ts",
    "../src/viewer/shellActions.ts",
    "../src/viewer/shellVisibility.ts",
    "../src/viewer/state.ts",
    "../src/viewer/tileLoading.ts",
    "../src/viewer/urlState.ts",
    "../src/viewer/viewMode.ts",
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  return sources.join("\n");
}

async function readAppSources() {
  const files = [
    "../src/App.tsx",
    "../src/viewer/ViewerShell.tsx",
    "../src/viewer/components/CardTemplate.tsx",
    "../src/viewer/components/FolderOptions.tsx",
    "../src/viewer/components/LibraryFooter.tsx",
    "../src/viewer/components/LoginView.tsx",
    "../src/viewer/loginConnectState.ts",
    "../src/viewer/components/Pager.tsx",
    "../src/viewer/components/PreviewBody.tsx",
    "../src/viewer/components/PreviewDialog.tsx",
    "../src/viewer/components/PreviewInfo.tsx",
    "../src/viewer/components/PreviewText.tsx",
    "../src/viewer/previewTextState.ts",
    "../src/viewer/components/RatingStars.tsx",
    "../src/viewer/components/ResultList.tsx",
    "../src/viewer/components/ResultsStatus.tsx",
    "../src/viewer/components/SearchControls.tsx",
    "../src/viewer/components/TagChips.tsx",
    "../src/viewer/components/TagSuggestions.tsx",
    "../src/viewer/components/TilesSentinel.tsx",
    "../src/viewer/components/ViewerShellLayout.tsx",
    "../src/viewer/pagerState.ts",
    "../src/viewer/shellConfig.ts",
    "../src/viewer/tilesSentinelState.ts",
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  return sources.join("\n");
}

test("public login no longer renders advanced Eagle connection settings", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /import iconOnUrl from "\.\.\/\.\.\/assets\/icon_on\.svg";/);
  assert.match(html, /className="[^"]*\bapp-logo\b[^"]*"[\s\S]*src=\{iconOnUrl\}/);
  assert.match(html, /<h1>Media Preview Server<\/h1>/);
  assert.match(html, /A local media server for your Eagle library\./);
  assert.doesNotMatch(html, /id="viewerPasswordField"/);
  assert.doesNotMatch(html, /id="viewerPasswordInput"/);
  assert.doesNotMatch(html, /id="togglePasswordButton"/);
  assert.doesNotMatch(html, /Advanced Settings/);
  assert.doesNotMatch(html, /id="advancedButton"/);
  assert.doesNotMatch(html, /id="advancedFields"/);
  assert.doesNotMatch(html, /id="hostInput"/);
  assert.doesNotMatch(html, /id="portInput"/);
  assert.doesNotMatch(html, /id="tokenInput"/);
  assert.doesNotMatch(app, /viewerPasswordField/);
  assert.doesNotMatch(app, /viewerPasswordInput/);
  assert.doesNotMatch(app, /togglePasswordButton/);
  assert.doesNotMatch(app, /advancedButton/);
  assert.doesNotMatch(app, /advancedFields/);
  assert.doesNotMatch(app, /restoreConnectionForm/);
});

test("public UI no longer shows connect lock icon or connection settings button", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="connectButtonIcon"/);
  assert.match(html, /<ConnectButton \/>/);
  assert.match(html, /<ConnectMessage \/>/);
  assert.doesNotMatch(html, /aria-label="Connection settings"/);
  assert.doesNotMatch(html, /id="changeConnectionButton"/);
  assert.doesNotMatch(app, /changeConnectionButton/);
  assert.doesNotMatch(app, /connectButtonIcon/);
  assert.doesNotMatch(app, /connectButtonHost: document\.querySelector\("#connectButtonHost"\),/);
  assert.doesNotMatch(app, /connectMessageHost: document\.querySelector\("#connectMessageHost"\),/);
  assert.doesNotMatch(app, /connectButton: document\.querySelector\("#connectButton"\),/);
  assert.match(app, /setLoginConnectState\(\{/);
  assert.doesNotMatch(app, /els\.connectMessage\.textContent/);
  assert.doesNotMatch(app, /els\.connectMessage\.classList/);
  assert.match(app, /import \{ getShellView, setShellView \} from "\.\/viewer\/shellVisibility";/);
  assert.match(html, /useSyncExternalStore\(subscribeShellView, getShellView, getShellView\)/);
  assert.match(html, /<LoginView hidden=\{shellView !== "login"\} \/>/);
  assert.match(html, /<ViewerShellLayout hidden=\{shellView !== "viewer"\} \/>/);
  assert.doesNotMatch(app, /loginView: document\.querySelector\("#loginView"\),/);
  assert.doesNotMatch(app, /viewerShell: document\.querySelector\("#viewerShell"\),/);
  assert.doesNotMatch(app, /els\.loginView\.hidden/);
  assert.doesNotMatch(app, /els\.viewerShell\.hidden/);
  assert.match(app, /setShellView\("login"\);/);
  assert.match(app, /setShellView\("viewer"\);/);
  assert.match(html, /<LibraryFooter \/>/);
  assert.doesNotMatch(html, /id="libraryFooterNameHost"/);
  assert.match(app, /setLibraryFooterName\(libraryLabel\(data\)\);/);
  assert.match(html, /useSyncExternalStore\(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName\)/);
  assert.doesNotMatch(app, /libraryFooterNameHost: document\.querySelector\("#libraryFooterNameHost"\),/);
  assert.doesNotMatch(html, /renderLibraryFooterView/);
  assert.doesNotMatch(app, /libraryFooterName: document\.querySelector\("#libraryFooterName"\),/);
  assert.doesNotMatch(app, /els\.libraryFooterName\.textContent/);
  assert.doesNotMatch(app, /syncAuthUi/);
  assert.doesNotMatch(html, /id="connectionStatusDot"/);
  assert.doesNotMatch(html, /id="libraryName"/);
  assert.doesNotMatch(html, /id="refreshButton"/);
  assert.doesNotMatch(html, /id="toggleHeaderButton"/);
  assert.doesNotMatch(html, /id="showHeaderButton"/);
  assert.doesNotMatch(app, /setHeaderHidden/);
  assert.doesNotMatch(app, /setConnectionStatus/);
  assert.match(css, /\.login-panel\s*\{[^}]*width:\s*min\(320px,\s*100%\);[^}]*padding:\s*42px 30px 30px;/s);
  assert.match(css, /\.connect-message\s*\{[^}]*display:\s*none;[^}]*position:\s*fixed;[^}]*left:\s*50%;[^}]*bottom:\s*max\(24px,\s*env\(safe-area-inset-bottom\)\);[^}]*transform:\s*translateX\(-50%\);/s);
  assert.match(css, /\.login-panel \.connect-message\s*\{[^}]*text-align:\s*center;[^}]*white-space:\s*normal;/s);
  assert.match(css, /\.connect-message:not\(:empty\)\s*\{[^}]*display:\s*block;/s);
  assert.match(html, /className="status-line grid grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /max-\[540px\]:gap-2 max-\[540px\]:text-xs/);
  assert.doesNotMatch(css, /\.status-line\s*\{/);
  assert.doesNotMatch(css, /\.status-actions\s*\{/);
  assert.match(html, /<select id="pageSizeSelect" aria-label="Page size" value=\{selectedLimit\} onChange=\{changePageSize\}>[\s\S]*PAGE_SIZE_OPTIONS\.map/);
  assert.match(html, /export const PAGE_SIZE_OPTIONS = \[30, 60, 120, 240\] as const;/);
  assert.match(app, /limit:\s*30,/);
  assert.match(app, /if \(state\.limit !== DEFAULT_PAGE_SIZE\) params\.set\("limit", String\(state\.limit\)\);/);
  assert.match(app, /const parsed = Number\.parseInt\(value \|\| String\(DEFAULT_PAGE_SIZE\), 10\);/);
  assert.match(app, /if \(!Number\.isFinite\(parsed\)\) return DEFAULT_PAGE_SIZE;/);
});

test("public thumbnails lazy-load with visible loading states", async () => {
  const html = await readAppSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /loading="lazy"/);
  assert.match(html, /loading \? " thumb-loading" : ""/);
  assert.match(html, /missing \? " thumb-missing" : ""/);
  assert.match(html, /onLoad=\{\(\) => \{\s*setLoading\(false\);\s*setMissing\(false\);\s*\}\}/);
  assert.match(html, /onError=\{\(\) => \{\s*setLoading\(false\);\s*setMissing\(true\);\s*\}\}/);
  assert.match(css, /\.thumb-button\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2;/s);
  assert.match(css, /\.thumb-button\.thumb-loading::after,\s*\.row-thumb\.thumb-loading::after/);
  assert.match(css, /animation:\s*thumb-spinner 0\.75s linear infinite;/);
});

test("public image preview fit mode scales to the viewport and refreshes on resize", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /window\.addEventListener\("resize", refreshLayout\);/);
  assert.match(app, /const IMAGE_FIT_MARGIN = 0\.96;/);
  assert.match(html, /hidden=\{!imageState\.statusVisible\}/);
  assert.match(html, /width: `\$\{imageState\.naturalSize\.width\}px`/);
  assert.match(html, /statusVisible: true/);
  assert.match(html, /onError=\{\(\) => \{/);
  assert.match(html, /statusVisible: false/);
  assert.match(html, /height: `\$\{imageState\.naturalSize\.height\}px`/);
  assert.match(app, /const fitScale = Math\.min\(widthRatio, heightRatio\) \* IMAGE_FIT_MARGIN;/);
  assert.match(app, /const naturalScale = 1;/);
  assert.match(app, /const keepFitted = Math\.abs\(previousTransform\.scale - previousFitScale\) < 0\.01;/);
  assert.match(html, /transform: `translate\(-50%, -50%\) translate3d\(\$\{imageState\.transform\.x\}px, \$\{imageState\.transform\.y\}px, 0\) scale\(\$\{imageState\.transform\.scale\}\)`/);
  assert.match(css, /\.preview-layout\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;/s);
  assert.match(css, /\.preview-image\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*max-width:\s*none;[^}]*max-height:\s*none;/s);
  assert.match(css, /\.preview-body img:not\(\.preview-image\),\s*\.preview-body video/);
});

test("public video preview reserves top space for floating action buttons", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /#previewDialog\.video-mode \.preview-layout\s*\{[^}]*padding-top:\s*calc\(60px \+ env\(safe-area-inset-top\)\);[^}]*background:\s*#05070a;/s);
  assert.match(css, /\.video-mode \.preview-body\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s);
  assert.match(css, /\.preview-video\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
});

test("public audio preview uses video-style dark action buttons", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.video-mode \.dialog-actions \.icon-button,\s*\.audio-mode \.dialog-actions \.icon-button\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.62\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.video-mode \.dialog-actions \.icon-button:hover,\s*\.audio-mode \.dialog-actions \.icon-button:hover\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.82\);[^}]*color:\s*#fff;/s);
});

test("public UI exposes direct original file URLs for each media item", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const directFileUrlSource = app.match(/function directFileUrl\(item[^)]*\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.doesNotMatch(html, /class="direct-file-link"/);
  assert.match(app, /function directFileUrl\(item[^)]*\)/);
  assert.match(app, /function previewFileName\(item[^)]*\)/);
  assert.match(directFileUrlSource, /return new URL\(`\/file\/\$\{encodeURIComponent\(String\(item\.id \|\| ""\)\)\}`,\s*baseUrl\)\.href;/);
  assert.match(html, /className="direct-file-link preview-info-cta"/);
  assert.match(html, /Open file/);
  assert.doesNotMatch(directFileUrlSource, /connectionId/);
  assert.doesNotMatch(app, /state\.connectionId/);
  assert.doesNotMatch(app, /function withConnection\(/);
  assert.doesNotMatch(app, /copy-file-url-button/);
  assert.doesNotMatch(app, /copyDirectFileUrl/);
  assert.doesNotMatch(app, /function copyText\(/);
  assert.doesNotMatch(app, /function directFileActions\(/);
  assert.doesNotMatch(app, /function setDirectFileActions\(/);
});

test("public image modal no longer exposes metadata editing controls", async () => {
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(app, /metadata-editor/);
  assert.doesNotMatch(app, /Save metadata/);
  assert.doesNotMatch(app, /Select one or more folders\. Deselect to remove\./);
  assert.doesNotMatch(app, /function metadataInput\(/);
  assert.doesNotMatch(app, /function metadataFolderSelect\(/);
  assert.doesNotMatch(app, /function parseCommaList\(/);
  assert.doesNotMatch(css, /\.metadata-editor/);
  assert.doesNotMatch(css, /\.metadata-editor-message/);
});

test("public preview renders text-like files and PDFs from their thumbnails", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const server = await readFile(new URL("../plugin/service/viewerServer.cjs", import.meta.url), "utf8");

  assert.match(app, /const textPreviewExts = new Set\(\[/);
  assert.match(app, /"txt", "md", "js", "css", "html", "json"/);
  assert.match(app, /const pdfPreviewExts = new Set\(\["pdf"\]\);/);
  assert.match(app, /textPreviewExts\.has\(ext\)/);
  assert.match(app, /pdfPreviewExts\.has\(ext\)/);
  assert.match(html, /function TextPreview\(\{ item \}/);
  assert.match(html, /const response = await fetch\(mediaUrl\(String\(item\.id \|\| ""\), "file"\)\);/);
  assert.match(html, /setText\(nextText\);/);
  assert.match(app, /if \(pdfPreviewExts\.has\(ext\)\) return \{ kind: "image", srcKind: "thumb" \};/);
  assert.match(html, /function ImagePreview\(\{ item, srcKind \}/);
  assert.match(html, /src=\{mediaUrl\(String\(item\.id \|\| ""\), srcKind\)\}/);
  assert.doesNotMatch(app, /function renderPdfPreview\(item\) \{/);
  assert.doesNotMatch(app, /viewer\.src = directFileUrl\(item\);/);
  assert.match(app, /function previewFileName\(item[^)]*\) \{/);
  assert.match(app, /PreviewDialogMode = "" \| "audio" \| "image" \| "text" \| "unsupported" \| "video"/);
  assert.doesNotMatch(app, /pdf-mode/);
  assert.match(css, /\.text-mode \.preview-body/);
  assert.match(css, /\.text-preview/);
  assert.doesNotMatch(css, /\.pdf-mode \.preview-body/);
  assert.doesNotMatch(css, /\.pdf-preview/);
  assert.match(server, /"\.html": "text\/html; charset=utf-8"/);
  assert.match(server, /"\.css": "text\/css; charset=utf-8"/);
  assert.match(server, /"\.js": "text\/javascript; charset=utf-8"/);
  assert.match(server, /"\.txt": "text\/plain; charset=utf-8"/);
  assert.match(server, /"\.md": "text\/plain; charset=utf-8"/);
  assert.match(server, /"\.pdf": "application\/pdf"/);
});

test("public grid thumbnail hover icon uses play for video and audio", async () => {
  const app = await readViewerSources();
  const html = await readAppSources();

  assert.match(html, /"move-diagonal":/);
  assert.match(app, /function thumbnailOverlayIcon\(mediaType[^)]*\)/);
  assert.match(app, /return mediaType === "video" \|\| mediaType === "audio" \? "play" : "move-diagonal";/);
  assert.match(html, /overlayIconPaths\[thumbnailOverlayIcon\(mediaType\)\]/);
  assert.doesNotMatch(app, /mediaType === "document" \? "file-text"/);
  assert.doesNotMatch(app, /mediaType === "image" \? "maximize-2"/);
});

test("public status line no longer renders page count UI", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="pageInfo"/);
  assert.doesNotMatch(app, /pageInfo:\s*document\.querySelector\("#pageInfo"\)/);
  assert.doesNotMatch(app, /els\.pageInfo\.textContent/);
  assert.doesNotMatch(css, /#pageInfo/);
});

test("public shell uses Media Preview Server branding and serves a favicon", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const appComponent = await readAppSources();
  await access(new URL("./favicon.ico", import.meta.url));

  assert.match(html, /<title>Media Preview Server - Eagle<\/title>/);
  assert.match(appComponent, /<strong>Media Preview Server<\/strong>/);
  assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
  assert.doesNotMatch(html, /Eagle Web UI/);
});

test("public audio preview attempts autoplay when the modal opens", async () => {
  const html = await readAppSources();

  assert.match(html, /function AudioPreview\(\{ item \}/);
  assert.match(html, /audioRef\.current\?\.play\(\)\.catch\(\(\) => \{\}\)/);
});

test("public ratings are static in grid and table but editable in the preview modal", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /function RatingStars\(\{ className, interactive = false, item, onSelect \}/);
  assert.match(html, /className=\{interactive \? "rating-star" : "rating-star rating-star-static"\}/);
  assert.match(html, /data-active=\{value <= current \? "true" : "false"\}/);
  assert.match(app, /renderRatingView\(els\.previewRating, \{/);
  assert.match(html, /function renderRatingView\(container[^,]*,\s*props: RatingStarsProps\)/);
  assert.match(html, /const Tag = interactive \? "button" : "span";/);
  assert.match(css, /\.rating-star-static\s*\{/);
  assert.match(css, /cursor:\s*default;/);
});

test("public file names expose original names in truncated views and preview info", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /function originalFileName\(item[^)]*\) \{/);
  assert.match(html, /<strong title=\{originalFileName\(item\)\}>/);
  assert.match(html, /<span className="row-file-name" title=\{originalFileName\(item\)\}>/);
  assert.match(html, /<section className="[^"]*\bpreview-original-name-section\b[^"]*">[\s\S]*<PreviewOriginalName \/>[\s\S]*<\/section>[\s\S]*<section className="[^"]*\bpreview-rating-section\b[^"]*">/);
  assert.doesNotMatch(html, /File Name/);
  assert.doesNotMatch(app, /previewOriginalNameHost: document\.querySelector\("#previewOriginalNameHost"\),/);
  assert.doesNotMatch(app, /previewMetaHost: document\.querySelector\("#previewMetaHost"\),/);
  assert.doesNotMatch(app, /previewOriginalName: document\.querySelector\("#previewOriginalName"\),/);
  assert.match(app, /setPreviewTextState\(\{[\s\S]*originalName: originalFileName\(item\),[\s\S]*\}\);/);
  assert.doesNotMatch(app, /els\.previewOriginalName\.textContent/);
  assert.match(css, /\.preview-original-name-section\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*padding:\s*8px 8px 14px;[^}]*border-bottom:\s*1px solid rgba\(148,\s*163,\s*184,\s*0\.18\);/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.preview-original-name-section\s*\{[^}]*padding:\s*6px 8px 14px;/);
  assert.match(css, /\.preview-rating-section\s*\{[^}]*padding:\s*0 8px 0;/s);
  assert.doesNotMatch(css, /\.preview-rating-section\s*\{[^}]*border-bottom:/s);
  assert.match(css, /\.preview-original-name-value\s*\{[^}]*width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s);
});

test("public preview info uses chip lists and a full-width open file CTA", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /<section className="preview-details-section">/);
  assert.match(html, /function PreviewChipList\(\{ values \}/);
  assert.match(html, /className="preview-chip"/);
  assert.doesNotMatch(app, /preview-chip-empty/);
  assert.match(app, /previewActions: document\.querySelector\("#previewActions"\),/);
  assert.match(html, /className="direct-file-link preview-info-cta"/);
  assert.match(html, /function ExternalLinkIcon\(\)/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.match(app, /renderPreviewInfoView\(els\.previewDetails, els\.previewActions, \{/);
  assert.match(html, /function PreviewMetadataEditor\(\{/);
  assert.match(html, /<PreviewEditField label="Tags">/);
  assert.match(html, /<PreviewEditField label="Categories">/);
  assert.match(html, /await onSaveMetadata\(item, \{ tags, folders: categories \}\);/);
  assert.match(html, /onSubmit=\{submitMetadata\}/);
  assert.match(app, /postJson<\{[\s\S]*folders\?: unknown;[\s\S]*\}>\(`\/api\/items\/\$\{encodeURIComponent\(String\(item\.id \|\| ""\)\)\}\/metadata`, \{ tags, folders \}\)/);
  assert.match(app, /rememberRecentValues\(RECENT_TAGS_STORAGE_KEY, patch\.tags\);/);
  assert.match(app, /rememberRecentValues\(RECENT_FOLDERS_STORAGE_KEY, patch\.folders\);/);
  assert.match(html, /setStatus\("Saved"\);/);
  assert.match(app, /const RECENT_TAGS_STORAGE_KEY = "eagleRecentTags";/);
  assert.match(app, /const RECENT_FOLDERS_STORAGE_KEY = "eagleRecentFolders";/);
  assert.match(html, /function MetadataChipEditor\(\{/);
  assert.match(html, /onPointerDown=\{\(\) => updateSuggestions\(\)\}/);
  assert.match(html, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(html, /setQuery\(""\);\s*hideSuggestions\(\);/);
  assert.match(app, /function readRecentList\(key[^)]*\) \{/);
  assert.match(app, /function writeRecentList\(key[^,]*,\s*values[^)]*\) \{/);
  assert.match(app, /function tagSuggestionItems\(\{/);
  assert.match(app, /function folderSuggestionItems\(\{/);
  assert.match(html, /className="preview-edit-row"/);
  assert.doesNotMatch(app, /const row = document\.createElement\("label"\);/);
  assert.doesNotMatch(app, /render\(\);\s*if \(els\.dialog\.open && state\.previewItemId === item\.id\) \{\s*renderPreviewDetails\(item\);/s);
  assert.match(app, /{ label: "Date Modified", value: formatItemDate\(item, DATE_KEYS_MODIFIED\) \|\| "-" }/);
  assert.doesNotMatch(app, /Date Imported/);
  assert.doesNotMatch(app, /Date Created/);
  assert.doesNotMatch(app, /preview-date-section/);
  assert.match(app, /function formatItemDate\(item[^,]*,\s*keys[^)]*\) \{/);
  assert.match(html, /detailsRoot\.render\(<PreviewDetailsPanel \{\.\.\.props\} \/>/);
  assert.match(html, /actionsRoot\.render\(<PreviewActions item=\{props\.item\} \/>/);
  assert.match(css, /\.preview-details-section\s*\{/);
  assert.doesNotMatch(css, /\.preview-detail-row-divider\s*\{/);
  assert.match(css, /\.preview-rating-section\s*\{[^}]*min-height:\s*32px;/s);
  assert.match(css, /\.preview-detail-row\s*\{[^}]*min-height:\s*28px;/s);
  assert.match(css, /\.preview-chip-list\s*\{/);
  assert.match(css, /\.preview-chip\s*\{/);
  assert.match(css, /\.preview-rating-section \.rating-star\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*font-size:\s*20px;/s);
  assert.match(css, /\.info-label,\s*\.preview-detail-label\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*400;/s);
  assert.match(css, /\.preview-detail-value\s*\{[^}]*font-size:\s*14px;/s);
  assert.match(css, /\.preview-chip\s*\{[^}]*min-height:\s*24px;[^}]*background:\s*#e2e8f0;[^}]*font-size:\s*11px;[^}]*font-weight:\s*500;/s);
  assert.doesNotMatch(css, /\.preview-chip-empty/);
  assert.match(css, /\.preview-info-actions\s*\{[^}]*padding:\s*12px 8px 0;[^}]*border-top:\s*1px solid rgba\(148,\s*163,\s*184,\s*0\.22\);/s);
  assert.match(css, /\.preview-edit-form\s*\{/);
  assert.match(css, /\.preview-edit-row\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*112px\) minmax\(0,\s*1fr\);/s);
  assert.match(css, /\.preview-chip-editor\s*\{/);
  assert.match(css, /\.preview-edit-chip-list\s*\{/);
  assert.match(css, /\.preview-edit-chip svg\s*\{[^}]*fill:\s*none;[^}]*stroke:\s*currentColor;[^}]*stroke-linecap:\s*round;[^}]*stroke-linejoin:\s*round;[^}]*stroke-width:\s*2;/s);
  assert.match(css, /\.preview-chip-input\s*\{/);
  assert.match(css, /\.preview-chip-suggestions\s*\{/);
  assert.match(css, /\.preview-chip-suggestion\s*\{/);
  assert.match(css, /\.preview-edit-actions\s*\{/);
  assert.match(css, /\.preview-info-cta\s*\{/);
  assert.match(css, /width:\s*100%;/);
  assert.match(css, /background:\s*var\(--accent\);/);
  assert.match(css, /color:\s*#fff;/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*max-height:\s*min\(72dvh,\s*560px\);/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.preview-detail-row\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*112px\) minmax\(0,\s*1fr\);/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.preview-rating-section\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*112px\) minmax\(0,\s*1fr\);/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.preview-detail-value\s*\{[^}]*font-size:\s*13px;/);
  assert.match(css, /\.preview-details\s*\{[^}]*gap:\s*10px;/s);
  assert.match(css, /\.preview-details-section\s*\{[^}]*gap:\s*6px;/s);
  assert.doesNotMatch(css, /\.preview-info-cta\s*\{[^}]*linear-gradient/s);
});

test("public preview info closes when pressing outside the side menu", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /onPointerDown=\{handlePreviewPointerDown\}/);
  assert.match(html, /useSyncExternalStore\(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState\)/);
  assert.match(html, /previewDialogState\.mode \? `\$\{previewDialogState\.mode\}-mode` : ""/);
  assert.match(html, /aria-expanded=\{previewDialogState\.infoOpen\}/);
  assert.match(html, /document\.body\.classList\.toggle\("modal-open", previewDialogState\.open\)/);
  assert.match(html, /dialog\.showModal\(\)/);
  assert.match(html, /dialog\.close\(\)/);
  assert.match(html, /dialog\.addEventListener\(eventName, preventGestureWhileOpen\)/);
  assert.match(html, /dialog\.removeEventListener\(eventName, preventGestureWhileOpen\)/);
  assert.match(html, /const toggleFullscreen = async \(\) => \{/);
  assert.match(html, /previewBodyRef\.current/);
  assert.match(html, /document\.fullscreenElement/);
  assert.match(html, /target\.requestFullscreen/);
  assert.match(html, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(html, /document\.removeEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(app, /setPreviewDialogState\(\{/);
  assert.match(app, /open:\s*true,/);
  assert.match(app, /setPreviewDialogInfoOpen\(isOpen\);/);
  assert.match(app, /resetPreviewDialogState\(\);/);
  assert.doesNotMatch(app, /els\.dialog\.classList/);
  assert.doesNotMatch(app, /document\.body\.classList/);
  assert.doesNotMatch(app, /document\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(app, /els\.dialog\.addEventListener/);
  assert.doesNotMatch(app, /toggleFullscreen,/);
  assert.doesNotMatch(app, /function toggleFullscreen\(\)/);
  assert.doesNotMatch(app, /document\.fullscreenElement/);
  assert.doesNotMatch(app, /requestFullscreen/);
  assert.doesNotMatch(app, /function showPreviewDialog\(\)/);
  assert.doesNotMatch(app, /els\.dialog\.showModal/);
  assert.doesNotMatch(app, /els\.dialog\.close/);
  assert.doesNotMatch(app, /els\.dialog\.setAttribute\("open"/);
  assert.doesNotMatch(app, /els\.dialog\.removeAttribute\("open"/);
  assert.doesNotMatch(app, /toggleInfoPreview: document\.querySelector\("#toggleInfoPreview"\),/);
  assert.doesNotMatch(app, /els\.toggleInfoPreview\.setAttribute/);
  assert.match(app, /searchOutsidePointerDown: \(target\) => \{/);
  assert.match(app, /previewPointerDown:\s*closePreviewInfoFromOutside,/);
  assert.match(app, /function closePreviewInfoFromOutside\(target: EventTarget \| null\) \{/);
  assert.match(app, /if \(!state\.previewInfoOpen\) return;/);
  assert.match(app, /if \(\(target as Element \| null\)\?\.closest\("\.preview-info, #toggleInfoPreview"\)\) return;/);
  assert.match(app, /setPreviewInfoOpen\(false\);/);
});

test("public UI labels media extensions as type", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /<select id="folderSelect" aria-label="Folder" value=\{selectedFolderId\} onChange=\{changeFolder\}>[\s\S]*?<FolderOptions folders=\{folders\} \/>/);
  assert.match(html, /<select id="extSelect" aria-label="Type" value=\{selectedExt\} onChange=\{changeMediaType\}>[\s\S]*?<option value="">All types<\/option>/);
  assert.match(html, /<select id="ratingSelect" aria-label="Rating" value=\{selectedRating\} onChange=\{changeRating\}>[\s\S]*?<option value="">All ratings<\/option>/);
  assert.match(html, /<select id="pageSizeSelect" aria-label="Page size" value=\{selectedLimit\} onChange=\{changePageSize\}>[\s\S]*?PAGE_SIZE_OPTIONS\.map/);
  assert.match(html, /export const PAGE_SIZE_OPTIONS = \[30, 60, 120, 240\] as const;/);
  assert.doesNotMatch(html, /<span>Folder<\/span>/);
  assert.doesNotMatch(html, /<span>Type<\/span>\s*<select id="extSelect"/);
  assert.doesNotMatch(html, /<span>Rating<\/span>/);
  assert.doesNotMatch(html, /<span>Page Size<\/span>/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.doesNotMatch(html, />Extension</);
  assert.doesNotMatch(app, /label: "Extension"/);
});

test("public UI supports tag filter chips", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="tagChips"/);
  assert.match(html, /id="tagSuggestionsHost"/);
  assert.match(html, /id="tagSuggestions"/);
  assert.match(html, /<div className="[^"]*\bsearch-box\b[^"]*"[\s\S]*id="tagChips"[\s\S]*id="searchInputHost"[\s\S]*id="tagSuggestionsHost"[\s\S]*<\/div>[\s\S]*id="resetFiltersButtonHost"[\s\S]*id="toggleFiltersButtonHost"/);
  assert.match(html, /id="resetFiltersButton"[\s\S]*aria-label="Reset filters"[\s\S]*disabled=\{!hasActiveFilters\}/);
  assert.match(html, /id="resetFiltersButton"[\s\S]*<FunnelXIcon \/>/);
  assert.doesNotMatch(html, /id="tagInput"/);
  assert.doesNotMatch(html, /id="advancedFilters"[\s\S]*id="tagChips"/);
  assert.match(html, /id="advancedFiltersHost"[\s\S]*<AdvancedFilters[\s\S]*filtersOpen=\{filtersOpen\}/);
  assert.match(app, /tags:\s*\[\]/);
  assert.match(app, /tagChips: document\.querySelector\("#tagChips"\),/);
  assert.match(app, /searchInputHost: document\.querySelector\("#searchInputHost"\),/);
  assert.doesNotMatch(app, /searchInput: document\.querySelector\("#searchInput"\),/);
  assert.match(app, /tagSuggestionsHost: document\.querySelector\("#tagSuggestionsHost"\),/);
  assert.doesNotMatch(app, /tagSuggestions: document\.querySelector\("#tagSuggestions"\),/);
  assert.doesNotMatch(app, /els\.tagSuggestions\.hidden/);
  assert.match(app, /resetFiltersButtonHost: document\.querySelector\("#resetFiltersButtonHost"\),/);
  assert.match(app, /advancedFiltersHost: document\.querySelector\("#advancedFiltersHost"\),/);
  assert.doesNotMatch(app, /resetFiltersButton: document\.querySelector\("#resetFiltersButton"\),/);
  assert.doesNotMatch(app, /advancedFilters: document\.querySelector\("#advancedFilters"\),/);
  assert.doesNotMatch(app, /els\.advancedFilters\.hidden/);
  assert.match(html, /export function FolderOptions\(\{ folders \}/);
  assert.match(html, /<option value=\{UNCATEGORIZED_FOLDER_ID\}>Uncategorized<\/option>/);
  assert.doesNotMatch(app, /renderFolderOptionsView/);
  assert.doesNotMatch(app, /folderSelect: document\.querySelector\("#folderSelect"\),/);
  assert.doesNotMatch(app, /extSelect: document\.querySelector\("#extSelect"\),/);
  assert.doesNotMatch(app, /ratingSelect: document\.querySelector\("#ratingSelect"\),/);
  assert.doesNotMatch(app, /pageSizeSelect: document\.querySelector\("#pageSizeSelect"\),/);
  assert.doesNotMatch(app, /els\.folderSelect\.value/);
  assert.doesNotMatch(app, /els\.extSelect\.value/);
  assert.doesNotMatch(app, /els\.ratingSelect\.value/);
  assert.doesNotMatch(app, /els\.pageSizeSelect\.value/);
  assert.doesNotMatch(app, /function optionNode\(/);
  assert.doesNotMatch(app, /document\.createElement\("option"\)/);
  assert.match(html, /function FunnelXIcon\(\) \{[\s\S]*<path d="M12\.531 3H3/);
  assert.match(html, /onClick=\{resetFilters\}/);
  assert.match(app, /setViewerShellActions\(\{/);
  assert.match(app, /resetFilters,/);
  assert.match(app, /function syncResetFiltersButton\(\) \{/);
  assert.match(app, /renderSearchControlButtonsView\(els\.searchInputHost, els\.resetFiltersButtonHost, els\.toggleFiltersButtonHost, els\.advancedFiltersHost, \{/);
  assert.match(app, /searchQuery:\s*state\.query,/);
  assert.match(app, /selectedFolderId:\s*state\.folderId,/);
  assert.match(app, /selectedLimit:\s*state\.limit,/);
  assert.doesNotMatch(app, /els\.resetFiltersButton\.disabled/);
  assert.doesNotMatch(app, /tagInput:/);
  assert.match(html, /export function SearchInput\(\{ value = "" \}/);
  assert.match(html, /id="searchInput"[\s\S]*value=\{inputValue\}[\s\S]*changeSearchQuery\(event\)[\s\S]*onFocus=\{focusSearch\}[\s\S]*onKeyDown=\{handleSearchKeyDown\}/);
  assert.doesNotMatch(app, /els\.searchInput\.value/);
  assert.match(app, /searchChanged:\s*debounce\(\(query: string\) => \{[\s\S]*applyFilterChange\(\{ query: query\.trim\(\) \}\);[\s\S]*loadTagSuggestions\(\);/);
  assert.match(app, /params\.getAll\("tag"\)/);
  assert.match(app, /params\.append\("tag", tag\)/);
  assert.match(app, /params\.append\("tags", tag\)/);
  assert.match(app, /getJson<\{ items\?: TagSuggestionApiItem\[\] \}>\(`\/api\/tags\?\$\{params\.toString\(\)\}`\)/);
  assert.match(app, /function loadTagSuggestions\(\) \{/);
  assert.match(app, /function renderTagSuggestions\(items[^)]*\) \{/);
  assert.match(app, /function addTagFilter\(value[^)]*\) \{/);
  assert.match(app, /applyFilterChange\(\{ query: "", tags: \[\.\.\.state\.tags, tag\] \}\);/);
  assert.match(app, /function removeTagFilter\(tag[^)]*\) \{/);
  assert.match(app, /function renderTagChips\(\) \{/);
  assert.match(app, /Object\.assign\(state, resetFilterState\(\)\);/);
  assert.match(css, /\.search-composer\s*\{/);
  assert.match(css, /\.search-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto auto;/s);
  assert.match(css, /\.filter-reset-button,\s*\.filter-toggle-button\s*\{/);
  assert.match(css, /\.filter-reset-button:disabled\s*\{/);
  assert.match(css, /\.unified-search-input\s*\{/);
  assert.doesNotMatch(css, /\.tag-input\s*\{/);
  assert.match(css, /\.tag-suggestions\s*\{/);
  assert.match(css, /\.tag-chips\s*\{/);
  assert.match(css, /\.tag-chip\s*\{/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.search-box\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*5px 10px;/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.search-composer\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow:\s*hidden;/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.tag-chips\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.unified-search-input\s*\{[^}]*min-width:\s*0;[^}]*flex-basis:\s*72px;/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.filter-reset-button,\s*\.filter-toggle-button\s*\{[^}]*width:\s*44px;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
});

test("public UI adds a masonry tiles view with infinite loading", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="tilesViewButton"/);
  assert.match(html, /<ViewModeButton id="tilesViewButton" mode="tiles" selectedMode=\{displayViewMode\} label="Tiles" \/>/);
  assert.match(html, /<ViewModeButton id="gridViewButton" mode="grid" selectedMode=\{displayViewMode\} label="Grid" \/>/);
  assert.match(html, /aria-pressed=\{pressed\} onClick=\{\(\) => selectViewMode\(mode\)\}/);
  assert.match(html, /id="tilesSentinel"/);
  assert.match(app, /const DEFAULT_VIEW_MODE = "tiles";/);
  assert.match(app, /const TILE_PREFETCH_PAGES = 3;/);
  assert.match(app, /setResultsStatusState\(\{/);
  assert.doesNotMatch(app, /resultsStatusHost: document\.querySelector\("#resultsStatusHost"\),/);
  assert.doesNotMatch(app, /tilesViewButton: document\.querySelector\("#tilesViewButton"\),/);
  assert.doesNotMatch(app, /tilesSentinelHost: document\.querySelector\("#tilesSentinelHost"\),/);
  assert.doesNotMatch(app, /tilesSentinel: document\.querySelector\("#tilesSentinel"\),/);
  assert.doesNotMatch(app, /pagerHost: document\.querySelector\("#pagerHost"\),/);
  assert.doesNotMatch(app, /prevButton: document\.querySelector\("#prevButton"\),/);
  assert.doesNotMatch(app, /pageButtons: document\.querySelector\("#pageButtons"\),/);
  assert.match(app, /state\.viewMode === "tiles"/);
  assert.match(html, /export function ResultList\(\{ items, viewMode, onOpenPreview \}[^)]*\) \{/);
  assert.match(html, /style=\{\{ aspectRatio: width > 0 && height > 0 \? `\$\{width\} \/ \$\{height\}` : "1 \/ 1" \}\}/);
  assert.match(html, /<RatingStars item=\{item\} className="rating-control tile-rating" \/>/);
  assert.match(html, /onPointerDown=\{trigger\.onPointerDown\}/);
  assert.match(html, /onClick=\{trigger\.onClick\}/);
  assert.match(app, /renderResultListView\(els\.resultGridHost, \{/);
  assert.match(app, /setPagerState\(\{/);
  assert.match(app, /setTilesSentinelState\(\{/);
  assert.match(app, /getTilesSentinelElement\(\)/);
  assert.match(app, /function setupTileAutoLoading\(\) \{/);
  assert.match(app, /resetTileAutoLoading\(\);/);
  assert.match(app, /function resetTileAutoLoading\(\) \{/);
  assert.match(app, /state\.items = \[\];/);
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /!state\.items\.length/);
  assert.match(app, /loadItems\(\{ append: true \}\)/);
  assert.match(app, /const params = itemQueryParams\(\{[\s\S]*\.\.\.state,[\s\S]*limit: currentFetchLimit\(\),[\s\S]*\}\);/);
  assert.match(app, /state\.offset = state\.items\.length;/);
  assert.match(app, /function currentFetchLimit\(\) \{/);
  assert.match(app, /if \(viewMode !== "tiles" \|\| tags\.length\) return limit;/);
  assert.match(app, /return Math\.min\(limit \* TILE_PREFETCH_PAGES, MAX_PAGE_SIZE\);/);
  assert.match(app, /params\.get\("view"\) === "tiles"/);
  assert.match(css, /\.media-tiles\s*\{/);
  assert.match(css, /\.tile-item\s*\{/);
  assert.match(css, /\.tile-item\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /\.tile-item\s*\{[^}]*contain:\s*layout paint;/s);
  assert.match(css, /\.tile-item img\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.tile-item\.thumb-loading::before\s*\{/);
  assert.match(css, /animation:\s*tile-skeleton 1\.1s ease-in-out infinite;/);
  assert.match(css, /@keyframes tile-skeleton/);
  assert.match(css, /\.tile-item \.tile-rating\s*\{/);
  assert.match(css, /\.media-tiles \.tile-item\s*\{[^}]*border-radius:\s*0;/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.media-tiles\s*\{[^}]*column-count:\s*3;[^}]*column-width:\s*auto;/);
  assert.match(css, /\.tiles-sentinel\s*\{/);
});

test("public extension pills use varied colors for common text formats", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.ext-pill\[data-ext="html"\]\s*\{[^}]*background:\s*#fff7ed;[^}]*color:\s*#c2410c;/s);
  assert.match(css, /\.ext-pill\[data-ext="css"\]\s*\{[^}]*background:\s*#eff6ff;[^}]*color:\s*#2563eb;/s);
  assert.match(css, /\.ext-pill\[data-ext="js"\],[\s\S]*\.ext-pill\[data-ext="mjs"\],[\s\S]*\.ext-pill\[data-ext="cjs"\]\s*\{[^}]*background:\s*#fefce8;[^}]*color:\s*#a16207;/s);
  assert.match(css, /\.ext-pill\[data-ext="md"\]\s*\{[^}]*background:\s*#f8fafc;[^}]*color:\s*#475569;/s);
  assert.match(css, /\.ext-pill\[data-ext="txt"\],[\s\S]*\.ext-pill\[data-ext="log"\]\s*\{[^}]*background:\s*#f1f5f9;[^}]*color:\s*#334155;/s);
  assert.match(css, /\.file-badge\[data-ext="html"\]\s*\{[^}]*background:\s*#fff7ed;[^}]*color:\s*#c2410c;/s);
  assert.match(css, /\.file-badge\[data-ext="css"\]\s*\{[^}]*background:\s*#eff6ff;[^}]*color:\s*#2563eb;/s);
  assert.match(css, /\.file-badge\[data-ext="js"\],[\s\S]*\.file-badge\[data-ext="mjs"\],[\s\S]*\.file-badge\[data-ext="cjs"\]\s*\{[^}]*background:\s*#fefce8;[^}]*color:\s*#a16207;/s);
  assert.match(css, /\.file-badge\[data-ext="md"\]\s*\{[^}]*background:\s*#f8fafc;[^}]*color:\s*#475569;/s);
  assert.match(css, /\.file-badge\[data-ext="txt"\],[\s\S]*\.file-badge\[data-ext="log"\]\s*\{[^}]*background:\s*#f1f5f9;[^}]*color:\s*#334155;/s);
});

test("public UI syncs filters, pagination, and preview state into the URL history", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /window\.addEventListener\("popstate", handleUrlPop\)/);
  assert.match(html, /window\.removeEventListener\("popstate", handleUrlPop\)/);
  assert.match(app, /urlPopped: \(\) => \{/);
  assert.match(app, /export function handleUrlPop\(\) \{/);
  assert.doesNotMatch(app, /window\.addEventListener\("popstate"/);
  assert.match(app, /pushState/);
  assert.match(app, /if \(state\.viewMode !== "tiles"\) params\.set\("page", String\(currentPage\(state\)\)\);/);
  assert.match(app, /offset: viewMode === "tiles" \? 0 : \(Math\.max\(1, Number\.parseInt\(params\.get\("page"\) \|\| "1", 10\)\) - 1\) \* limit,/);
  assert.match(app, /state\.viewMode === "tiles" && new URLSearchParams\(window\.location\.search\)\.has\("page"\)/);
  assert.match(app, /syncUrlState\(\{ replace: true \}\);/);
  assert.match(app, /params\.set\("item"/);
  assert.match(app, /params\.set\("info", "1"\)/);
});

test("public results status and empty states stay concise and consistent across views", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /useSyncExternalStore\(subscribeResultsStatusState, getResultsStatusState, getResultsStatusState\)/);
  assert.match(html, /<span id="resultCount" className="justify-self-start whitespace-nowrap">\{displayTotal\.toLocaleString\(\)\} items<\/span>/);
  assert.doesNotMatch(app, /renderResultsStatusView\(els\.resultsStatusHost, \{/);
  assert.doesNotMatch(app, /els\.resultCount\.textContent/);
  assert.doesNotMatch(app, /items · \$\{start\}-\$\{end\}/);
  assert.match(app, /resultGridHost: document\.querySelector\("#resultGridHost"\),/);
  assert.doesNotMatch(app, /els\.grid\.classList\.toggle/);
  assert.match(html, /function resultSurfaceClassName\(viewMode:[\s\S]*isEmpty/);
  assert.match(css, /\.media-grid,\s*\.media-table\s*\{[\s\S]*align-content:\s*start;/);
  assert.doesNotMatch(css, /\.media-grid\s*\{[^}]*min-height:\s*320px;/s);
  assert.doesNotMatch(css, /\.media-table\s*\{[^}]*min-height:\s*320px;/s);
  assert.match(css, /\.media-grid\.is-empty,\s*\.media-table\.is-empty,\s*\.media-tiles\.is-empty\s*\{[\s\S]*display:\s*block;[\s\S]*column-width:\s*auto;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /\.empty-state\s*\{[\s\S]*min-height:\s*320px;/);
});

test("public UI exposes collapsible advanced filters without sort controls", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /id="toggleFiltersButton"/);
  assert.match(html, /aria-label=\{label\}/);
  assert.match(html, /aria-expanded=\{filtersOpen\}/);
  assert.match(html, /id="advancedFilters"/);
  assert.doesNotMatch(html, /id="sortSelect"/);
  assert.doesNotMatch(html, /id="randomizeCheckbox"/);
  assert.match(app, /state\.filtersOpen/);
  assert.match(app, /params\.set\("filters", "1"\)/);
  assert.doesNotMatch(app, /params\.set\("sort"/);
  assert.doesNotMatch(app, /params\.set\("random", "1"\)/);
});

test("package no longer exposes a standalone server CLI", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.equal("start" in packageJson.scripts, false);
  await assert.rejects(() => access(new URL("../server/index.js", import.meta.url)));
  assert.doesNotMatch(readme, /npm start/);
  assert.doesNotMatch(readme, /Standalone Server/);
  assert.doesNotMatch(readme, /VIEWER_PASSWORD=/);
  assert.doesNotMatch(readme, /VIEWER_PASSWORD_HASH=/);
  assert.doesNotMatch(readme, /REQUEST_LOG_ENABLED/);
  await assert.rejects(() => access(new URL("../.env.example", import.meta.url)));
});

test("package no longer ships duplicate ESM service modules", async () => {
  await assert.rejects(() => access(new URL("../server/eagleClient.js", import.meta.url)));
  await assert.rejects(() => access(new URL("../server/connection.js", import.meta.url)));
});
