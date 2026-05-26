import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("public login no longer renders advanced Eagle connection settings", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(html, /class="app-logo" src="\/assets\/icon_on\.svg"/);
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
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="connectButtonIcon"/);
  assert.doesNotMatch(html, /aria-label="Connection settings"/);
  assert.doesNotMatch(html, /id="changeConnectionButton"/);
  assert.doesNotMatch(app, /changeConnectionButton/);
  assert.doesNotMatch(app, /connectButtonIcon/);
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
  assert.match(css, /\.status-line\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/s);
  assert.match(css, /\.status-actions\s*\{[^}]*margin-left:\s*auto;[^}]*justify-self:\s*end;/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.status-line\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/s);
  assert.match(html, /<option value="30" selected>30 items<\/option>/);
  assert.match(app, /limit:\s*30,/);
  assert.match(app, /if \(state\.limit !== DEFAULT_PAGE_SIZE\) params\.set\("limit", String\(state\.limit\)\);/);
  assert.match(app, /const parsed = Number\.parseInt\(value \|\| "30", 10\);/);
  assert.match(app, /if \(!Number\.isFinite\(parsed\)\) return DEFAULT_PAGE_SIZE;/);
});

test("public thumbnails lazy-load with visible loading states", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /img\.loading = "lazy";/);
  assert.match(app, /button\?\.classList\.add\("thumb-loading"\);/);
  assert.match(app, /button\?\.classList\.remove\("thumb-loading"\);/);
  assert.match(css, /\.thumb-button\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2;/s);
  assert.match(css, /\.thumb-button\.thumb-loading::after,\s*\.row-thumb\.thumb-loading::after/);
  assert.match(css, /animation:\s*thumb-spinner 0\.75s linear infinite;/);
});

test("public image preview fit mode scales to the viewport and refreshes on resize", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /window\.addEventListener\("resize", \(\) => refreshPreviewImageLayout\(\)\);/);
  assert.match(app, /const IMAGE_FIT_MARGIN = 0\.96;/);
  assert.match(app, /status\.hidden = true;/);
  assert.match(app, /image\.style\.width = `\$\{image\.naturalWidth\}px`;/);
  assert.match(app, /status\.hidden = false;/);
  assert.match(app, /image\.addEventListener\("error", \(\) => \{/);
  assert.match(app, /status\.hidden = true;/);
  assert.match(app, /image\.style\.height = `\$\{image\.naturalHeight\}px`;/);
  assert.match(app, /state\.previewFitScale = Math\.min\(widthRatio, heightRatio\) \* IMAGE_FIT_MARGIN;/);
  assert.match(app, /state\.previewNaturalScale = 1;/);
  assert.match(app, /const keepFitted = Math\.abs\(state\.previewTransform\.scale - previousFitScale\) < 0\.01;/);
  assert.match(app, /image\.style\.transform = `translate\(-50%, -50%\) translate3d\(\$\{x\}px, \$\{y\}px, 0\) scale\(\$\{scale\}\)`;/);
  assert.match(css, /\.preview-layout\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;/s);
  assert.match(css, /\.preview-image\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*max-width:\s*none;[^}]*max-height:\s*none;/s);
  assert.match(css, /\.preview-body img:not\(\.preview-image\),\s*\.preview-body video/);
});

test("public video preview reserves top space for floating action buttons", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(css, /#previewDialog\.video-mode \.preview-layout\s*\{[^}]*padding-top:\s*calc\(60px \+ env\(safe-area-inset-top\)\);[^}]*background:\s*#05070a;/s);
  assert.match(css, /\.video-mode \.preview-body\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s);
  assert.match(css, /\.preview-video\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
});

test("public audio preview uses video-style dark action buttons", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(css, /\.video-mode \.dialog-actions \.icon-button,\s*\.audio-mode \.dialog-actions \.icon-button\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.62\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.video-mode \.dialog-actions \.icon-button:hover,\s*\.audio-mode \.dialog-actions \.icon-button:hover\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.82\);[^}]*color:\s*#fff;/s);
});

test("public UI exposes direct original file URLs for each media item", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const directFileUrlSource = app.match(/function directFileUrl\(item\) \{[\s\S]*?\n\}/)?.[0] || "";
  const directFileLinkSource = app.match(/function directFileLink\(item\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.doesNotMatch(html, /class="direct-file-link"/);
  assert.match(app, /function directFileUrl\(item\)/);
  assert.match(app, /function previewFileName\(item\)/);
  assert.match(app, /function directFileLink\(item\)/);
  assert.match(directFileUrlSource, /return new URL\(`\/file\/\$\{encodeURIComponent\(item\.id\)\}`,\s*window\.location\.href\)\.href;/);
  assert.match(directFileLinkSource, /link\.className = "direct-file-link"/);
  assert.match(directFileLinkSource, /link\.textContent = "Open file"/);
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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const server = await readFile(new URL("../plugin/service/viewerServer.cjs", import.meta.url), "utf8");

  assert.match(app, /const textPreviewExts = new Set\(\[/);
  assert.match(app, /"txt", "md", "js", "css", "html", "json"/);
  assert.match(app, /const pdfPreviewExts = new Set\(\["pdf"\]\);/);
  assert.match(app, /textPreviewExts\.has\(ext\)/);
  assert.match(app, /pdfPreviewExts\.has\(ext\)/);
  assert.match(app, /function renderTextPreview\(item\) \{/);
  assert.match(app, /const response = await fetch\(mediaUrl\(item\.id, "file"\)\);/);
  assert.match(app, /code\.textContent = text;/);
  assert.match(app, /renderImagePreview\(item,\s*\{\s*srcKind:\s*"thumb"\s*\}\);/);
  assert.match(app, /function renderImagePreview\(item,\s*\{\s*srcKind = "file"\s*\} = \{\}\) \{/);
  assert.match(app, /image\.src = mediaUrl\(item\.id, srcKind\);/);
  assert.doesNotMatch(app, /function renderPdfPreview\(item\) \{/);
  assert.doesNotMatch(app, /viewer\.src = directFileUrl\(item\);/);
  assert.match(app, /function previewFileName\(item\) \{/);
  assert.match(app, /text-mode/);
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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /"move-diagonal":/);
  assert.match(app, /const icon = mediaType === "video" \|\| mediaType === "audio" \? "play" : "move-diagonal";/);
  assert.doesNotMatch(app, /mediaType === "document" \? "file-text"/);
  assert.doesNotMatch(app, /mediaType === "image" \? "maximize-2"/);
});

test("public status line no longer renders page count UI", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="pageInfo"/);
  assert.doesNotMatch(app, /pageInfo:\s*document\.querySelector\("#pageInfo"\)/);
  assert.doesNotMatch(app, /els\.pageInfo\.textContent/);
  assert.doesNotMatch(css, /#pageInfo/);
});

test("public shell uses Media Preview Server branding and serves a favicon", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  await access(new URL("./favicon.ico", import.meta.url));

  assert.match(html, /<title>Media Preview Server - Eagle<\/title>/);
  assert.match(html, /<strong>Media Preview Server<\/strong>/);
  assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
  assert.doesNotMatch(html, /Eagle Web UI/);
});

test("public audio preview attempts autoplay when the modal opens", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /const audio = document\.createElement\("audio"\)/);
  assert.match(app, /audio\.play\(\)\.catch\(\(\) => \{\}\)/);
});

test("public ratings are static in grid and table but editable in the preview modal", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /renderRating\(rating, item, \{ interactive: false \}\);/);
  assert.match(app, /renderRating\(els\.previewRating, item, \{ interactive: true \}\);/);
  assert.match(app, /function renderRating\(container, item, \{ interactive = false \} = \{\}\)/);
  assert.match(app, /const star = document\.createElement\(interactive \? "button" : "span"\);/);
  assert.match(app, /star\.className = interactive \? "rating-star" : "rating-star rating-star-static";/);
  assert.match(css, /\.rating-star-static\s*\{/);
  assert.match(css, /cursor:\s*default;/);
});

test("public file names expose original names in truncated views and preview info", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /function originalFileName\(item\) \{/);
  assert.match(app, /title\.title = originalFileName\(item\);/);
  assert.match(app, /name\.title = originalFileName\(item\);/);
  assert.match(html, /<section class="preview-original-name-section">\s*<div id="previewOriginalName" class="preview-original-name-value"><\/div>\s*<\/section>\s*<section class="preview-rating-section">/);
  assert.doesNotMatch(html, /File Name/);
  assert.match(app, /previewOriginalName: document\.querySelector\("#previewOriginalName"\),/);
  assert.match(app, /els\.previewOriginalName\.textContent = originalFileName\(item\);/);
  assert.match(css, /\.preview-original-name-section\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*padding:\s*8px 8px 14px;[^}]*border-bottom:\s*1px solid rgba\(148,\s*163,\s*184,\s*0\.18\);/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.preview-original-name-section\s*\{[^}]*padding:\s*6px 8px 14px;/);
  assert.match(css, /\.preview-rating-section\s*\{[^}]*padding:\s*0 8px 0;/s);
  assert.doesNotMatch(css, /\.preview-rating-section\s*\{[^}]*border-bottom:/s);
  assert.match(css, /\.preview-original-name-value\s*\{[^}]*width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s);
});

test("public preview info uses chip lists and a full-width open file CTA", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /detailsSection\.className = "preview-details-section";/);
  assert.match(app, /if \(chips && value\.length > 0\) \{/);
  assert.match(app, /function previewChipList\(values\) \{/);
  assert.match(app, /chip\.className = "preview-chip";/);
  assert.doesNotMatch(app, /preview-chip-empty/);
  assert.match(app, /previewActions: document\.querySelector\("#previewActions"\),/);
  assert.match(app, /link\.classList\.add\("preview-info-cta"\);/);
  assert.match(app, /link\.prepend\(iconNode\("external-link"\)\);/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.match(app, /{ label: "Tags", value: Array\.isArray\(item\.tags\) \? item\.tags\.filter\(Boolean\) : \[\], chips: true, always: true }/);
  assert.match(app, /{ label: "Date Modified", value: formatItemDate\(item, DATE_KEYS_MODIFIED\) \|\| "-" }/);
  assert.doesNotMatch(app, /Date Imported/);
  assert.doesNotMatch(app, /Date Created/);
  assert.doesNotMatch(app, /preview-date-section/);
  assert.match(app, /function formatItemDate\(item, keys\) \{/);
  assert.match(app, /els\.previewDetails\.replaceChildren\(detailsSection\);/);
  assert.match(app, /els\.previewActions\.replaceChildren\(link\);/);
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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /els\.dialog\.addEventListener\("pointerdown", closePreviewInfoFromOutside\);/);
  assert.match(app, /function closePreviewInfoFromOutside\(event\) \{/);
  assert.match(app, /if \(!state\.previewInfoOpen\) return;/);
  assert.match(app, /if \(event\.target\.closest\("\.preview-info, #toggleInfoPreview"\)\) return;/);
  assert.match(app, /setPreviewInfoOpen\(false\);/);
});

test("public UI labels media extensions as type", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(html, /<select id="folderSelect" aria-label="Folder">[\s\S]*?<option value="">All folders<\/option>/);
  assert.match(html, /<select id="extSelect" aria-label="Type">[\s\S]*?<option value="">All types<\/option>/);
  assert.match(html, /<select id="ratingSelect" aria-label="Rating">[\s\S]*?<option value="">All ratings<\/option>/);
  assert.match(html, /<select id="pageSizeSelect" aria-label="Page size">[\s\S]*?<option value="30" selected>30 items<\/option>/);
  assert.doesNotMatch(html, /<span>Folder<\/span>/);
  assert.doesNotMatch(html, /<span>Type<\/span>\s*<select id="extSelect"/);
  assert.doesNotMatch(html, /<span>Rating<\/span>/);
  assert.doesNotMatch(html, /<span>Page Size<\/span>/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.doesNotMatch(html, />Extension</);
  assert.doesNotMatch(app, /label: "Extension"/);
});

test("public UI supports tag filter chips", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(html, /id="tagChips"/);
  assert.match(html, /id="tagSuggestions"/);
  assert.match(html, /<div class="search-box"[\s\S]*id="tagChips"[\s\S]*id="searchInput"[\s\S]*id="tagSuggestions"[\s\S]*<\/div>[\s\S]*<button[\s\S]*id="toggleFiltersButton"/);
  assert.doesNotMatch(html, /id="tagInput"/);
  assert.doesNotMatch(html, /id="advancedFilters"[\s\S]*id="tagChips"/);
  assert.match(app, /tags:\s*\[\]/);
  assert.match(app, /tagChips: document\.querySelector\("#tagChips"\),/);
  assert.match(app, /tagSuggestions: document\.querySelector\("#tagSuggestions"\),/);
  assert.doesNotMatch(app, /tagInput:/);
  assert.match(app, /applyFilterChange\(\{ query: els\.searchInput\.value\.trim\(\) \}\);[\s\S]*loadTagSuggestions\(\);/);
  assert.match(app, /params\.getAll\("tag"\)/);
  assert.match(app, /params\.append\("tag", tag\)/);
  assert.match(app, /params\.append\("tags", tag\)/);
  assert.match(app, /getJson\(`\/api\/tags\?\$\{params\.toString\(\)\}`\)/);
  assert.match(app, /function loadTagSuggestions\(\) \{/);
  assert.match(app, /function renderTagSuggestions\(items\) \{/);
  assert.match(app, /function addTagFilter\(value\) \{/);
  assert.match(app, /applyFilterChange\(\{ query: "", tags: \[\.\.\.state\.tags, tag\] \}\);/);
  assert.match(app, /function removeTagFilter\(tag\) \{/);
  assert.match(app, /function renderTagChips\(\) \{/);
  assert.match(app, /state\.tags = \[\];/);
  assert.match(css, /\.search-composer\s*\{/);
  assert.match(css, /\.unified-search-input\s*\{/);
  assert.doesNotMatch(css, /\.tag-input\s*\{/);
  assert.match(css, /\.tag-suggestions\s*\{/);
  assert.match(css, /\.tag-chips\s*\{/);
  assert.match(css, /\.tag-chip\s*\{/);
});

test("public UI adds a masonry tiles view with infinite loading", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(html, /id="tilesViewButton"/);
  assert.match(html, /<button id="tilesViewButton" type="button" aria-pressed="true">Tiles<\/button>[\s\S]*<button id="gridViewButton" type="button" aria-pressed="false">Grid<\/button>/);
  assert.match(html, /id="tilesSentinel"/);
  assert.match(app, /const DEFAULT_VIEW_MODE = "tiles";/);
  assert.match(app, /const TILE_PREFETCH_PAGES = 3;/);
  assert.match(app, /tilesViewButton: document\.querySelector\("#tilesViewButton"\),/);
  assert.match(app, /tilesSentinel: document\.querySelector\("#tilesSentinel"\),/);
  assert.match(app, /state\.viewMode === "tiles"/);
  assert.match(app, /function tileItem\(item\) \{/);
  assert.match(app, /button\.style\.aspectRatio = width > 0 && height > 0 \? `\$\{width\} \/ \$\{height\}` : "1 \/ 1";/);
  assert.match(app, /rating\.className = "rating-control tile-rating";/);
  assert.match(app, /renderRating\(rating, item, \{ interactive: false \}\);/);
  assert.match(app, /button\.append\(img, overlay, badge, duration, rating\);/);
  assert.match(app, /populateThumb\(\{ img, badge, duration, item \}\);/);
  assert.match(app, /decorateThumbButton\(button, overlayIcon, item\);/);
  assert.match(app, /function appendRenderedItems\(items\) \{/);
  assert.match(app, /els\.grid\.append\(fragment\);/);
  assert.match(app, /function setupTileAutoLoading\(\) \{/);
  assert.match(app, /resetTileAutoLoading\(\);/);
  assert.match(app, /function resetTileAutoLoading\(\) \{/);
  assert.match(app, /state\.items = \[\];/);
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /!state\.items\.length/);
  assert.match(app, /loadItems\(\{ append: true \}\)/);
  assert.match(app, /limit: String\(currentFetchLimit\(\)\),/);
  assert.match(app, /state\.offset = state\.items\.length;/);
  assert.match(app, /function currentFetchLimit\(\) \{/);
  assert.match(app, /if \(state\.viewMode !== "tiles" \|\| state\.tags\.length\) return state\.limit;/);
  assert.match(app, /return Math\.min\(state\.limit \* TILE_PREFETCH_PAGES, MAX_PAGE_SIZE\);/);
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
  assert.match(css, /\.tiles-sentinel\s*\{/);
});

test("public extension pills use varied colors for common text formats", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.match(app, /pushState/);
  assert.match(app, /if \(state\.viewMode !== "tiles"\) params\.set\("page", String\(currentPage\(\)\)\);/);
  assert.match(app, /state\.offset = state\.viewMode === "tiles" \? 0 : \(Math\.max\(1, Number\.parseInt\(params\.get\("page"\) \|\| "1", 10\)\) - 1\) \* state\.limit;/);
  assert.match(app, /state\.viewMode === "tiles" && new URLSearchParams\(window\.location\.search\)\.has\("page"\)/);
  assert.match(app, /syncUrlState\(\{ replace: true \}\);/);
  assert.match(app, /params\.set\("item"/);
  assert.match(app, /params\.set\("info", "1"\)/);
});

test("public results status and empty states stay concise and consistent across views", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(app, /els\.resultCount\.textContent = `\$\{state\.total\.toLocaleString\(\)\} items`;/);
  assert.doesNotMatch(app, /items · \$\{start\}-\$\{end\}/);
  assert.match(app, /els\.grid\.classList\.toggle\("is-empty", !state\.items\.length\);/);
  assert.match(css, /\.media-grid,\s*\.media-table\s*\{[\s\S]*align-content:\s*start;/);
  assert.doesNotMatch(css, /\.media-grid\s*\{[^}]*min-height:\s*320px;/s);
  assert.doesNotMatch(css, /\.media-table\s*\{[^}]*min-height:\s*320px;/s);
  assert.match(css, /\.media-grid\.is-empty,\s*\.media-table\.is-empty,\s*\.media-tiles\.is-empty\s*\{[\s\S]*display:\s*block;[\s\S]*column-width:\s*auto;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /\.empty-state\s*\{[\s\S]*min-height:\s*320px;/);
});

test("public UI exposes collapsible advanced filters without sort controls", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(html, /id="toggleFiltersButton"/);
  assert.match(html, /aria-label="Show advanced search options"/);
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
