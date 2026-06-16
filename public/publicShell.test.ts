import { test } from "vitest";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import {
  AccountSideMenu,
  AdvancedFilters,
  ConnectButton,
  ConnectMessage,
  LibraryFooter,
  LoginView,
  PreviewActions,
  PreviewDetailsPanel,
  ResultList,
  SearchControls,
} from "../src/viewer/ViewerShell";
import { setLoginConnectState } from "../src/viewer/loginConnectState";
import { PAGE_SIZE_OPTIONS } from "../src/viewer/shellConfig";

function accountSideMenuElement() {
  return createElement(TooltipProvider, null, createElement(SidebarProvider, null, [
    createElement(AccountSideMenu, { key: "sidebar" }),
    createElement(SearchControls, { key: "search" }),
  ]));
}

async function readViewerSources() {
  const files = [
    "../src/viewerApp.ts",
    "../src/viewer/api.ts",
    "../src/viewer/constants.ts",
    "../src/viewer/fileLinks.ts",
    "../src/viewer/format.ts",
    "../src/viewer/itemQuery.ts",
    "../src/viewer/libraryFooterState.ts",
    "../src/viewer/media.ts",
    "../src/viewer/metadata.ts",
    "../src/viewer/pagination.ts",
    "../src/viewer/previewBodyState.ts",
    "../src/viewer/previewDialogState.ts",
    "../src/viewer/previewDetails.ts",
    "../src/viewer/previewInfoState.ts",
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
    "../src/viewer/components/AccountSideMenu.tsx",
    "../src/viewer/components/CardTemplate.tsx",
    "../src/viewer/components/FolderOptions.tsx",
    "../src/viewer/components/Icons.tsx",
    "../src/viewer/components/LibraryFooter.tsx",
    "../src/viewer/components/LoginView.tsx",
    "../src/viewer/loginConnectState.ts",
    "../src/viewer/components/Pager.tsx",
    "../src/viewer/components/PreviewBody.tsx",
    "../src/viewer/previewBodyState.ts",
    "../src/viewer/components/PreviewDialog.tsx",
    "../src/viewer/components/PreviewInfo.tsx",
    "../src/viewer/previewInfoState.ts",
    "../src/viewer/components/PreviewText.tsx",
    "../src/viewer/previewTextState.ts",
    "../src/viewer/components/RatingStars.tsx",
    "../src/viewer/previewRatingState.ts",
    "../src/viewer/components/ResultList.tsx",
    "../src/viewer/components/ResultSurface.tsx",
    "../src/viewer/components/ResultState.tsx",
    "../src/viewer/resultSurfaceState.ts",
    "../src/viewer/components/ResultsStatus.tsx",
    "../src/viewer/components/SearchControls.tsx",
    "../src/viewer/searchControlsState.ts",
    "../src/viewer/components/TagChips.tsx",
    "../src/viewer/tagChipsState.ts",
    "../src/viewer/components/TagSuggestions.tsx",
    "../src/viewer/tagSuggestionsState.ts",
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
  const app = await readViewerSources();
  const login = renderToStaticMarkup(createElement(LoginView, { hidden: false }));

  assert.match(login, /class="[^"]*\bapp-logo\b/);
  assert.match(login, /src="[^"]*icon_on\.svg/);
  assert.match(login, /<h1 class="[^"]*">Media Preview Server<\/h1>/);
  assert.match(login, /A local media server for your Eagle library\./);
  assert.doesNotMatch(login, /id="viewerPasswordField"/);
  assert.doesNotMatch(login, /id="viewerPasswordInput"/);
  assert.doesNotMatch(login, /id="togglePasswordButton"/);
  assert.doesNotMatch(login, /Advanced Settings/);
  assert.doesNotMatch(login, /id="advancedButton"/);
  assert.doesNotMatch(login, /id="advancedFields"/);
  assert.doesNotMatch(login, /id="hostInput"/);
  assert.doesNotMatch(login, /id="portInput"/);
  assert.doesNotMatch(login, /id="tokenInput"/);
  assert.doesNotMatch(app, /viewerPasswordField/);
  assert.doesNotMatch(app, /viewerPasswordInput/);
  assert.doesNotMatch(app, /togglePasswordButton/);
  assert.doesNotMatch(app, /advancedButton/);
  assert.doesNotMatch(app, /advancedFields/);
  assert.doesNotMatch(app, /restoreConnectionForm/);
});

test("public login renders credentials when server auth is required", async () => {
  const app = await readViewerSources();
  setLoginConnectState({
    authenticated: false,
    authRequired: true,
    disabled: false,
    isError: false,
    message: "",
    user: null,
  });
  const login = renderToStaticMarkup(createElement(LoginView, { hidden: false }));
  const button = renderToStaticMarkup(createElement(ConnectButton, { disabled: false }));

  assert.match(login, /id="authUsernameInput"/);
  assert.match(login, /name="username"/);
  assert.match(login, /aria-label="Username"/);
  assert.match(login, /id="authUsernameInput"[\s\S]*required=""/);
  assert.match(login, /id="authPasswordInput"/);
  assert.match(login, /name="password"/);
  assert.match(login, /aria-label="Password"/);
  assert.match(login, /id="authPasswordInput"[\s\S]*required=""/);
  assert.match(button, /Sign in/);
  assert.match(app, /postJson<AuthStatusResponse>\("\/api\/auth\/login", \{ username, password \}\)/);
  assert.match(app, /Enter username and password\./);
  assert.match(app, /const passwordField = event\.currentTarget\.elements\.namedItem\("password"\);/);
  assert.match(app, /if \(passwordField instanceof HTMLInputElement\) passwordField\.value = "";/);

  setLoginConnectState({
    authenticated: false,
    authRequired: false,
    disabled: false,
    isError: false,
    message: "",
    user: null,
  });
});

test("public viewer exposes sign out when authenticated", async () => {
  const app = await readViewerSources();
  const types = await readFile(new URL("../src/viewer/types.ts", import.meta.url), "utf8");
  setLoginConnectState({
    authenticated: true,
    authRequired: true,
    disabled: false,
    isError: false,
    message: "",
    user: { role: "editor", username: "ed" },
  });
  const accountMenu = renderToStaticMarkup(accountSideMenuElement());
  const footer = renderToStaticMarkup(createElement(LibraryFooter, { name: "My Library" }));

  assert.match(accountMenu, /id="accountMenuButton"/);
  assert.match(accountMenu, /id="accountSideMenu"/);
  assert.match(accountMenu, /id="authUserLabel"/);
  assert.match(accountMenu, />ed</);
  assert.match(accountMenu, /id="authAccountLabel"/);
  assert.match(accountMenu, /aria-label="ed - Editor\. Can edit ratings, tags, and categories"/);
  assert.match(accountMenu, /title="Can edit ratings, tags, and categories"/);
  assert.match(accountMenu, /id="authRoleLabel"/);
  assert.match(accountMenu, />Editor</);
  assert.match(accountMenu, /id="logoutButton"/);
  assert.match(accountMenu, /Sign out/);
  assert.match(accountMenu, /data-slot="sidebar"/);
  assert.match(accountMenu, /data-sidebar="menu-button"/);
  assert.match(accountMenu, /grid-cols-\[auto_minmax\(0,1fr\)_auto_auto\]/);
  assert.doesNotMatch(accountMenu, /md:hidden/);
  assert.doesNotMatch(accountMenu, /fixed left-3/);
  assert.doesNotMatch(accountMenu, /authFooterMessage/);
  assert.match(footer, /id="libraryFooterName"/);
  assert.doesNotMatch(footer, /logoutButton/);
  assert.match(app, /authUser = login\.user \?\? null/);
  assert.match(app, /authUser = data\.user \?\? null/);
  assert.match(app, /state\.permissions = normalizePermissions\(login\.permissions, authAuthenticated\);/);
  assert.match(app, /state\.permissions = normalizePermissions\(data\.permissions, !authRequired \|\| authAuthenticated\);/);
  assert.match(app, /state\.permissions = defaultPermissions\(!authRequired\);/);
  assert.match(app, /function normalizePermissions\(value: AuthStatusResponse\["permissions"\], readFallback = true\)/);
  assert.match(app, /function clearAuthState\(nextAuthRequired: boolean\) \{/);
  assert.match(app, /const logoutStatus = await postJson<AuthStatusResponse>\("\/api\/auth\/logout", \{\}\);/);
  assert.match(app, /const nextAuthRequired = Boolean\(logoutStatus\.required\);/);
  assert.match(app, /clearAuthState\(nextAuthRequired\);/);
  assert.match(app, /state\.permissions = normalizePermissions\(logoutStatus\.permissions, !nextAuthRequired\);/);
  assert.match(app, /clearAuthState\(false\);/);
  assert.match(app, /clearAuthState\(true\);/);
  assert.match(app, /clearViewerSessionState\(\);/);
  assert.match(app, /function clearViewerSessionState\(\) \{/);
  assert.match(app, /function resetViewerResults\(\{ resetOffset = false \}: \{ resetOffset\?: boolean \} = \{\}\) \{/);
  assert.match(app, /function resetViewerResults\(\{ resetOffset = false \}: \{ resetOffset\?: boolean \} = \{\}\) \{[\s\S]*pendingRatingItemIds\.clear\(\);/);
  assert.match(app, /resetViewerResults\(\{ resetOffset: true \}\);/);
  assert.match(app, /state\.folders = \[\];/);
  assert.match(app, /function showViewer\(data: ConnectResponse\) \{[\s\S]*resetViewerResults\(\);/);
  assert.match(app, /state\.requestId \+= 1;/);
  assert.match(app, /Object\.assign\(state, resetFilterState\(\)\);/);
  assert.match(app, /function clearViewerSessionState\(\) \{[\s\S]*closePreview\(\{ skipHistory: true \}\);[\s\S]*syncUrlState\(\{ replace: true \}\);/);
  assert.match(app, /if \(handleAuthError\(error\)\) return;/);
  assert.match(app, /function handleAuthError\(error: unknown\) \{/);
  assert.match(app, /error instanceof ApiError/);
  assert.match(app, /error\.status !== 401/);
  assert.match(app, /import \{ ApiError, debounce, errorMessage, getJson, postJson \} from "\.\/viewer\/api";/);
  assert.doesNotMatch(app, /setConnectMessage\(error\.message, true\)/);
  assert.doesNotMatch(app, /alert\(error\.message\)/);
  assert.match(app, /async function loadFolders\(\) \{[\s\S]*if \(handleAuthError\(error\)\) return;/);
  assert.match(app, /async function loadTagSuggestions\(\) \{[\s\S]*handleAuthError\(error\)/);
  assert.match(app, /async function setItemStar\([\s\S]*if \(handleAuthError\(error\)\) return;/);
  assert.match(app, /async function savePreviewMetadata\([\s\S]*handleAuthError\(error\);/);
  assert.match(app, /showLogin\(\);/);
  assert.match(types, /export interface AuthStatusPermissions extends Partial<ViewerPermissions>/);
  assert.match(types, /manageLibrary\?: boolean;/);
  assert.match(types, /permissions\?: AuthStatusPermissions;/);
  assert.doesNotMatch(app, /manageLibrary/);

  setLoginConnectState({
    authenticated: false,
    authRequired: false,
    disabled: false,
    isError: false,
    message: "",
    user: null,
  });
});

test("public login shows auth errors above the submit button", () => {
  setLoginConnectState({
    authenticated: false,
    authRequired: true,
    disabled: false,
    isError: true,
    message: "Invalid username or password",
    user: null,
  });
  const login = renderToStaticMarkup(createElement(LoginView, { hidden: false }));
  const message = renderToStaticMarkup(createElement(ConnectMessage, { message: "Invalid username or password", isError: true }));

  assert.match(message, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(message, /bg-destructive\/10/);
  assert.doesNotMatch(message, /\bborder\b/);
  assert.doesNotMatch(message, /border-destructive/);
  assert.match(message, /text-left/);
  assert.match(message, /lucide-circle-alert/);
  assert.ok(login.indexOf('id="connectMessage"') < login.indexOf('id="connectButton"'));

  setLoginConnectState({
    authenticated: false,
    authRequired: false,
    disabled: false,
    isError: false,
    message: "",
    user: null,
  });
});

test("public viewer exposes auth errors in the footer", () => {
  setLoginConnectState({
    authenticated: true,
    authRequired: true,
    disabled: false,
    isError: true,
    message: "Sign out failed",
    user: { role: "viewer", username: "reader" },
  });
  const accountMenu = renderToStaticMarkup(accountSideMenuElement());
  const footerMessageClass = accountMenu.match(/id="authFooterMessage" class="([^"]*)"/)?.[1] ?? "";

  assert.match(accountMenu, /id="authFooterMessage"/);
  assert.match(accountMenu, /role="alert"/);
  assert.doesNotMatch(footerMessageClass, /\bborder\b/);
  assert.doesNotMatch(footerMessageClass, /border-destructive/);
  assert.match(accountMenu, /Sign out failed/);

  setLoginConnectState({
    authenticated: false,
    authRequired: false,
    disabled: false,
    isError: false,
    message: "",
    user: null,
  });
});

test("public UI no longer shows connect lock icon or connection settings button", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const button = renderToStaticMarkup(createElement(ConnectButton, { disabled: false }));
  const message = renderToStaticMarkup(createElement(ConnectMessage, { message: "Connecting", isError: false }));
  const login = renderToStaticMarkup(createElement(LoginView, { hidden: false }));
  const controls = renderToStaticMarkup(createElement(SearchControls, {
    filtersOpen: true,
    folders: [{ id: "folder-1", name: "Folder 1", imageCount: 2 }],
    hasActiveFilters: true,
    searchQuery: "alpha",
    selectedExt: "jpg",
    selectedFolderId: "folder-1",
    selectedLimit: 60,
    selectedRating: "3",
  }));

  assert.match(button, /id="connectButton"/);
  assert.doesNotMatch(button, /id="connectButtonIcon"/);
  assert.match(message, /id="connectMessage"/);
  assert.match(message, /Connecting/);
  assert.doesNotMatch(controls, /aria-label="Connection settings"/);
  assert.doesNotMatch(controls, /id="changeConnectionButton"/);
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
  assert.match(html, /<SidebarProvider/);
  assert.match(html, /"--sidebar-width-icon": "3rem"/);
  assert.match(html, /<AccountSideMenu \/>/);
  assert.doesNotMatch(app, /loginView: document\.querySelector\("#loginView"\),/);
  assert.doesNotMatch(app, /viewerShell: document\.querySelector\("#viewerShell"\),/);
  assert.doesNotMatch(app, /els\.loginView\.hidden/);
  assert.doesNotMatch(app, /els\.viewerShell\.hidden/);
  assert.match(app, /setShellView\("login"\);/);
  assert.match(app, /setShellView\("viewer"\);/);
  assert.doesNotMatch(html, /<LibraryFooter \/>/);
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
  assert.match(login, /w-\[min\(320px,100%\)\]/);
  assert.match(login, /pt-\[42px\]/);
  assert.match(message, /min-h-\[18px\]/);
  assert.doesNotMatch(message, /fixed/);
  assert.match(message, /empty:hidden/);
  assert.doesNotMatch(css, /\.login-panel\s*\{/);
  assert.doesNotMatch(css, /\.connect-message\s*\{/);
  assert.match(html, /className="status-line grid grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /max-\[540px\]:gap-2 max-\[540px\]:text-xs/);
  assert.doesNotMatch(css, /\.status-line\s*\{/);
  assert.doesNotMatch(css, /\.status-actions\s*\{/);
  assert.match(controls, /id="pageSizeSelect"[^>]*aria-label="Page size"/);
  for (const pageSize of PAGE_SIZE_OPTIONS) {
    assert.match(controls, new RegExp(`value="${pageSize}"[\\s\\S]*${pageSize} items`));
  }
  assert.match(app, /limit:\s*30,/);
  assert.match(app, /if \(state\.limit !== DEFAULT_PAGE_SIZE\) params\.set\("limit", String\(state\.limit\)\);/);
  assert.match(app, /const parsed = Number\.parseInt\(value \|\| String\(DEFAULT_PAGE_SIZE\), 10\);/);
  assert.match(app, /if \(!Number\.isFinite\(parsed\)\) return DEFAULT_PAGE_SIZE;/);
});

test("public thumbnails lazy-load with visible loading states", async () => {
  const html = await readAppSources();

  assert.match(html, /loading="lazy"/);
  assert.match(html, /loading \? " thumb-loading" : ""/);
  assert.match(html, /missing \? ` thumb-missing \$\{missingThumbClassName\}` : ""/);
  assert.match(html, /onLoad=\{\(\) => \{\s*setLoading\(false\);\s*setMissing\(false\);\s*\}\}/);
  assert.match(html, /onError=\{\(\) => \{\s*setLoading\(false\);\s*setMissing\(true\);\s*\}\}/);
  assert.match(html, /const gridThumbButtonClassName =[\s\S]*aspect-\[3\/2\]/);
  assert.match(html, /function LoadingIndicator\(\{ variant \}/);
  assert.match(html, /animate-spin rounded-full border-2/);
  assert.match(html, /NO PREVIEW/);
});

test("public image preview fit mode scales to the viewport and refreshes on resize", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /window\.addEventListener\("resize", refreshLayout\);/);
  assert.match(app, /const IMAGE_FIT_MARGIN = 0\.96;/);
  assert.match(html, /width: `\$\{imageState\.naturalSize\.width\}px`/);
  assert.match(html, /height: `\$\{imageState\.naturalSize\.height\}px`/);
  assert.match(app, /const fitScale = Math\.min\(widthRatio, heightRatio\) \* IMAGE_FIT_MARGIN;/);
  assert.match(app, /const naturalScale = 1;/);
  assert.match(app, /const keepFitted = Math\.abs\(previousTransform\.scale - previousFitScale\) < 0\.01;/);
  assert.match(html, /transform: `translate\(-50%, -50%\) translate3d\(\$\{imageState\.transform\.x\}px, \$\{imageState\.transform\.y\}px, 0\) scale\(\$\{imageState\.transform\.scale\}\)`/);
  assert.match(html, /const previewLayoutClassName = \[/);
  assert.match(html, /const previewImageClassName =[\s\S]*"preview-image absolute left-1\/2 top-1\/2/);
  assert.match(html, /backdrop:bg-foreground\/30/);
  assert.match(html, /\[&:fullscreen\]:h-screen \[&:fullscreen\]:w-screen/);
});

test("public video preview reserves top space for floating action buttons", async () => {
  const html = await readAppSources();

  assert.match(html, /previewDialogState\.mode === "video" \? "h-dvh max-h-dvh bg-\[#05070a\]"/);
  assert.doesNotMatch(html, /pt-\[calc\(60px\+env\(safe-area-inset-top\)\)\]/);
  assert.match(html, /if \(kind === "video"\) return `\$\{base\} bg-\[#05070a\] max-h-full`;/);
  assert.match(html, /const previewVideoClassName =[\s\S]*"preview-video h-full w-full max-h-full cursor-pointer bg-\[#05070a\] object-contain/);
});

test("public audio preview uses video-style dark action buttons", async () => {
  const html = await readAppSources();

  assert.match(html, /previewDialogState\.mode === "video" \|\| previewDialogState\.mode === "audio"/);
  assert.match(html, /bg-\[rgba\(15,23,42,0\.48\)\][\s\S]*hover:bg-\[rgba\(15,23,42,0\.64\)\]/);
});

test("public UI exposes direct original file URLs for each media item", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const directFileUrlSource = app.match(/function directFileUrl\(item[^)]*\) \{[\s\S]*?\n\}/)?.[0] || "";
  const actions = renderToStaticMarkup(createElement(PreviewActions, { item: { id: "item 1" } }));

  assert.doesNotMatch(html, /class="direct-file-link"/);
  assert.match(app, /function directFileUrl\(item[^)]*\)/);
  assert.match(app, /function previewFileName\(item[^)]*\)/);
  assert.match(directFileUrlSource, /return new URL\(`\/file\/\$\{encodeURIComponent\(String\(item\.id \|\| ""\)\)\}`,\s*baseUrl\)\.href;/);
  assert.match(actions, /class="[^"]*\bdirect-file-link\b[^"]*\bpreview-info-cta\b/);
  assert.match(actions, /href="http:\/\/localhost\/file\/item%201"/);
  assert.match(actions, /Open file/);
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
  const server = await readFile(new URL("../dist/.generated/plugin-service/viewerServer.cjs", import.meta.url), "utf8");

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
  assert.match(html, /if \(kind === "text"\) return `\$\{base\} overflow-auto bg-muted p-\[18px\]`;/);
  assert.match(html, /const textPreviewClassName =/);
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
  const resultList = renderToStaticMarkup(createElement(ResultList, {
    items: [
      { id: "video-1", name: "Video.mp4", ext: "mp4" },
      { id: "audio-1", name: "Audio.mp3", ext: "mp3" },
      { id: "image-1", name: "Image.jpg", ext: "jpg" },
    ],
    onOpenPreview: () => {},
    viewMode: "grid",
  }));

  assert.match(resultList, /data-media-type="video"/);
  assert.match(resultList, /data-media-type="audio"/);
  assert.match(resultList, /data-media-type="image"/);
  assert.match(resultList, /M8 5v14l11-7z/);
  assert.match(resultList, /13 5 19 5 19 11/);
  assert.match(app, /function thumbnailOverlayIcon\(mediaType[^)]*\)/);
  assert.match(app, /return mediaType === "video" \|\| mediaType === "audio" \? "play" : "move-diagonal";/);
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
  assert.match(appComponent, /<strong className="[^"]*">Media Preview Server<\/strong>/);
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

  assert.match(html, /function RatingStars\(\{ className, disabled = false, disabledLabel, id, interactive = false, item, onSelect \}/);
  assert.match(html, /const ratingStarBaseClassName =[\s\S]*rating-star[\s\S]*data-\[active=true\]:text-yellow-500/);
  assert.match(html, /const interactiveRatingStarClassName = `\$\{ratingStarBaseClassName\} cursor-pointer`/);
  assert.match(html, /const cardRatingClassName =[\s\S]*\[&_\.rating-star\[data-active=true\]\]:text-yellow-300/);
  assert.match(html, /const canSelect = interactive && !disabled;/);
  assert.match(html, /const label = interactive && disabled && disabledLabel \? disabledLabel : interactive \? "Rating" : "Rating \(read only\)";/);
  assert.match(html, /aria-label=\{label\}/);
  assert.match(html, /title=\{interactive && disabled && disabledLabel \? disabledLabel : interactive \? `\$\{value\}` : undefined\}/);
  assert.match(html, /disabled=\{interactive \? disabled : undefined\}/);
  assert.match(html, /const staticRatingStarClassName = `\$\{ratingStarBaseClassName\} rating-star-static cursor-default`/);
  assert.match(html, /const current = normalizeRating\(item\.star\);/);
  assert.match(html, /data-active=\{value <= current \? "true" : "false"\}/);
  assert.match(app, /const pendingRatingItemIds = new Set<string>\(\);/);
  assert.match(app, /if \(!itemId \|\| pendingRatingItemIds\.has\(itemId\)\) return;/);
  assert.match(app, /pendingRatingItemIds\.add\(itemId\);/);
  assert.match(app, /pendingRatingItemIds\.delete\(itemId\);/);
  assert.match(app, /const previous = normalizeRating\(item\.star\);/);
  assert.match(app, /item\.star = previous;[\s\S]*if \(handleAuthError\(error\)\) return;/);
  assert.match(app, /const savedStar = normalizeRating\(data\.star \?\? star\);/);
  assert.doesNotMatch(app, /renderRatingView\(els\.previewRating, \{/);
  assert.doesNotMatch(html, /function renderRatingView\(container[^,]*,\s*props: RatingStarsProps\)/);
  assert.doesNotMatch(app, /previewRating: document\.querySelector\("#previewRating"\),/);
  assert.match(app, /function renderPreviewRating\(item: EagleItem\) \{[\s\S]*setPreviewRatingState\(\{/);
  assert.match(app, /saving: pendingRatingItemIds\.has\(String\(item\.id \|\| ""\)\)/);
  assert.match(html, /disabledLabel=\{state\.saving \? "Saving rating" : undefined\}/);
  assert.match(app, /renderPreviewRating\(item\);/);
  assert.match(app, /if \(isPreviewDialogOpen\(\)\) renderPreviewRating\(item\);/);
  assert.doesNotMatch(app, /if \(isPreviewDialogOpen\(\)\) \{\s*setPreviewRatingState/s);
  assert.match(html, /const Tag = interactive \? "button" : "span";/);
});

test("public file names expose original names in truncated views and preview info", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /function originalFileName\(item[^)]*\) \{/);
  assert.match(html, /<strong title=\{originalFileName\(item\)\}>/);
  assert.match(html, /const rowFileNameClassName =[\s\S]*row-file-name/);
  assert.match(html, /<span className=\{rowFileNameClassName\} title=\{originalFileName\(item\)\}>/);
  assert.match(html, /<section className="[^"]*\bpreview-original-name-section\b[^"]*">[\s\S]*<PreviewOriginalName \/>[\s\S]*<\/section>[\s\S]*<section className="[^"]*\bpreview-rating-section\b[^"]*">/);
  assert.doesNotMatch(html, /File Name/);
  assert.doesNotMatch(app, /previewOriginalNameHost: document\.querySelector\("#previewOriginalNameHost"\),/);
  assert.doesNotMatch(app, /previewMetaHost: document\.querySelector\("#previewMetaHost"\),/);
  assert.doesNotMatch(app, /previewOriginalName: document\.querySelector\("#previewOriginalName"\),/);
  assert.doesNotMatch(app, /getViewerElements/);
  assert.doesNotMatch(app, /document\.querySelector/);
  assert.match(app, /setPreviewTextState\(\{[\s\S]*originalName: originalFileName\(item\),[\s\S]*\}\);/);
  assert.doesNotMatch(app, /els\.previewOriginalName\.textContent/);
  assert.match(html, /preview-original-name-section grid min-h-8 grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(html, /max-\[540px\]:pb-3\.5 max-\[540px\]:pt-1\.5/);
  assert.match(html, /preview-rating-section grid min-h-8 grid-cols-\[minmax\(96px,112px\)_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(html, /preview-rating-section[^"]*border-b/);
  assert.match(html, /preview-original-name-value w-full min-w-0 whitespace-normal/);
});

test("public preview info uses chip lists and a full-width open file CTA", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /const previewDetailsSectionClassName = "preview-details-section/);
  assert.match(html, /function PreviewInfoDetails\(\)/);
  assert.match(html, /function PreviewInfoActions\(\)/);
  assert.match(html, /function PreviewChipList\(\{ values \}/);
  assert.match(html, /const previewChipClassName = "preview-chip/);
  assert.doesNotMatch(app, /preview-chip-empty/);
  assert.doesNotMatch(app, /previewActions: document\.querySelector\("#previewActions"\),/);
  assert.match(html, /const directFileLinkClassName =[\s\S]*direct-file-link preview-info-cta/);
  assert.match(html, /function ExternalLinkIcon\(\)/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.doesNotMatch(app, /renderPreviewInfoView\(els\.previewDetails, els\.previewActions, \{/);
  assert.match(app, /setPreviewInfoState\(\{/);
  assert.match(html, /function PreviewMetadataEditor\(\{/);
  assert.match(html, /<PreviewEditField label="Tags">/);
  assert.match(html, /<PreviewEditField label="Categories">/);
  assert.match(html, /const saved = await onSaveMetadata\(item, \{ tags, folders: categories \}\);/);
  assert.match(html, /const \[savedTags, setSavedTags\] = useState\(\(\) => initialTags\);/);
  assert.match(html, /const \[savedCategories, setSavedCategories\] = useState\(\(\) => initialCategories\);/);
  assert.match(html, /const hasMetadataChanges = !sameStringValues\(tags, savedTags\) \|\| !sameStringValues\(categories, savedCategories\);/);
  assert.match(html, /const saveButtonLabel = saving \? "Saving metadata" : hasMetadataChanges \? "Save metadata" : "No metadata changes";/);
  assert.match(html, /setTags\(saved\.tags\);/);
  assert.match(html, /setCategories\(saved\.folders\);/);
  assert.match(html, /setSavedTags\(saved\.tags\);/);
  assert.match(html, /setSavedCategories\(saved\.folders\);/);
  assert.match(html, /if \(hasMetadataChanges && status === "Saved"\) setStatus\(""\);/);
  assert.match(html, /if \(!hasMetadataChanges\) return;/);
  assert.match(html, /disabled=\{saving \|\| !hasMetadataChanges\}/);
  assert.match(html, /aria-label=\{saveButtonLabel\}/);
  assert.match(html, /title=\{saveButtonLabel\}/);
  assert.match(html, /function sameStringValues\(left: readonly string\[\], right: readonly string\[\]\) \{/);
  assert.match(html, /onSubmit=\{submitMetadata\}/);
  assert.match(app, /postJson<\{[\s\S]*folders\?: unknown;[\s\S]*\}>\(`\/api\/items\/\$\{encodeURIComponent\(String\(item\.id \|\| ""\)\)\}\/metadata`, \{ tags, folders \}\)/);
  assert.match(app, /rememberRecentValues\(RECENT_TAGS_STORAGE_KEY, patch\.tags\);/);
  assert.match(app, /rememberRecentValues\(RECENT_FOLDERS_STORAGE_KEY, patch\.folders\);/);
  assert.match(app, /if \(isPreviewDialogOpen\(\)\) renderPreviewDetails\(item\);/);
  assert.match(app, /return patch;/);
  assert.match(html, /setStatus\("Saved"\);/);
  assert.match(app, /const RECENT_TAGS_STORAGE_KEY = "eagleRecentTags";/);
  assert.match(app, /const RECENT_FOLDERS_STORAGE_KEY = "eagleRecentFolders";/);
  assert.match(html, /function MetadataChipEditor\(\{/);
  assert.doesNotMatch(html, /initialValues/);
  assert.match(html, /const clearDebounceTimer = \(\) => \{/);
  assert.match(html, /return \(\) => \{\s*requestId\.current \+= 1;\s*clearDebounceTimer\(\);\s*\};/);
  assert.match(html, /input\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(html, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(html, /setQuery\(""\);[\s\S]*inputRef\.current\.value = "";[\s\S]*hideSuggestions\(\);/);
  assert.match(app, /function readRecentList\(key[^)]*\) \{/);
  assert.match(app, /function writeRecentList\(key[^,]*,\s*values[^)]*\) \{/);
  assert.match(app, /function tagSuggestionItems\(\{/);
  assert.match(app, /function folderSuggestionItems\(\{/);
  assert.match(html, /const previewEditRowClassName =[\s\S]*"preview-edit-row/);
  assert.doesNotMatch(app, /const row = document\.createElement\("label"\);/);
  assert.doesNotMatch(app, /render\(\);\s*if \(els\.dialog\.open && state\.previewItemId === item\.id\) \{\s*renderPreviewDetails\(item\);/s);
  assert.match(app, /{ label: "Date Modified", value: formatItemDate\(item, DATE_KEYS_MODIFIED\) \|\| "-" }/);
  assert.doesNotMatch(app, /Date Imported/);
  assert.doesNotMatch(app, /Date Created/);
  assert.doesNotMatch(app, /preview-date-section/);
  assert.match(app, /function formatItemDate\(item[^,]*,\s*keys[^)]*\) \{/);
  assert.match(html, /<div id="previewDetails" className="preview-details grid gap-2\.5">/);
  assert.match(html, /\{previewInfoState \? <PreviewDetailsPanel \{\.\.\.previewInfoState\} \/> : null\}/);
  assert.match(html, /<div id="previewActions" className="preview-info-actions/);
  assert.match(html, /\{previewInfoState \? <PreviewActions item=\{previewInfoState\.item\} \/> : null\}/);
  assert.match(html, /const previewDetailsSectionClassName =[\s\S]*gap-1\.5/);
  assert.doesNotMatch(css, /\.preview-detail-row-divider\s*\{/);
  assert.match(html, /preview-rating-section grid min-h-8/);
  assert.match(html, /const previewDetailRowClassName =[\s\S]*min-h-7/);
  assert.match(html, /const previewChipListClassName = "preview-chip-list/);
  assert.match(html, /const previewChipClassName =[\s\S]*min-h-6[\s\S]*bg-secondary[\s\S]*text-\[11px\][\s\S]*font-medium/);
  assert.match(html, /className="rating-control inline-flex items-center gap-2\.5 \[&_\.rating-star\]:h-6 \[&_\.rating-star\]:w-6 \[&_\.rating-star\]:text-xl"/);
  assert.match(html, /const previewLabelClassName = "preview-detail-label text-xs font-normal text-muted-foreground"/);
  assert.match(html, /const previewDetailValueClassName =[\s\S]*text-sm[\s\S]*max-\[540px\]:text-\[13px\]/);
  assert.doesNotMatch(css, /\.preview-chip-empty/);
  assert.match(html, /className="preview-info-actions border-t border-border px-2 pt-3"/);
  assert.match(html, /const previewEditFormClassName = "preview-edit-form/);
  assert.match(html, /const previewEditRowClassName =[\s\S]*grid-cols-\[minmax\(96px,112px\)_minmax\(0,1fr\)\]/);
  assert.match(html, /const previewChipEditorClassName = "preview-chip-editor/);
  assert.match(html, /const previewEditChipListClassName = "preview-edit-chip-list/);
  assert.match(html, /\[&_svg\]:h-\[13px\][\s\S]*\[&_svg\]:\[stroke-width:2\]/);
  assert.match(html, /const previewChipInputClassName = "preview-chip-input/);
  assert.match(html, /const previewChipSuggestionsClassName = "preview-chip-suggestions/);
  assert.match(html, /const previewChipSuggestionClassName = "preview-chip-suggestion/);
  assert.match(html, /className="preview-edit-actions flex items-center justify-end gap-2\.5"/);
  assert.match(html, /const directFileLinkClassName =[\s\S]*min-h-\[52px\] w-full[\s\S]*bg-primary[\s\S]*text-primary-foreground/);
  assert.match(html, /max-\[540px\]:max-h-\[min\(72dvh,560px\)\]/);
  assert.match(html, /max-\[540px\]:gap-3/);
  assert.match(html, /<div id="previewDetails" className="preview-details grid gap-2\.5">/);
  assert.match(html, /const previewDetailsSectionClassName =[\s\S]*gap-1\.5/);
  assert.doesNotMatch(html, /preview-info-cta[^"]*linear-gradient/);
});

test("public preview info closes when pressing outside the side menu", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();

  assert.match(html, /onPointerDown=\{handleDialogPointerDown\}/);
  assert.match(html, /handlePreviewPointerDown\(event\);/);
  assert.match(html, /useSyncExternalStore\(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState\)/);
  assert.match(html, /previewDialogState\.mode \? `\$\{previewDialogState\.mode\}-mode` : ""/);
  assert.match(html, /aria-expanded=\{previewDialogState\.infoOpen\}/);
  assert.match(html, /document\.body\.classList\.toggle\("modal-open", previewDialogState\.open\)/);
  assert.match(html, /dialog\.showModal\(\)/);
  assert.match(html, /dialog\.close\(\)/);
  assert.match(html, /document\.addEventListener\(eventName, preventGestureWhileOpen, options\)/);
  assert.match(html, /document\.removeEventListener\(eventName, preventGestureWhileOpen\)/);
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
  const app = await readViewerSources();
  const filters = renderToStaticMarkup(createElement(AdvancedFilters, {
    filtersOpen: true,
    folders: [{ id: "folder-1", name: "Folder 1", imageCount: 2 }],
    selectedExt: "jpg",
    selectedFolderId: "folder-1",
    selectedLimit: 60,
    selectedRating: "3",
  }));

  assert.match(filters, /id="folderSelect"[^>]*aria-label="Folder"/);
  assert.match(filters, /id="extSelect"[^>]*aria-label="Type"/);
  assert.match(filters, /<option value="">All types<\/option>/);
  assert.match(filters, /id="ratingSelect"[^>]*aria-label="Rating"/);
  assert.match(filters, /<option value="">All ratings<\/option>/);
  assert.match(filters, /id="pageSizeSelect"[^>]*aria-label="Page size"/);
  for (const pageSize of PAGE_SIZE_OPTIONS) {
    assert.match(filters, new RegExp(`value="${pageSize}"[\\s\\S]*${pageSize} items`));
  }
  assert.doesNotMatch(filters, /<span>Folder<\/span>/);
  assert.doesNotMatch(filters, /<span>Type<\/span>\s*<select id="extSelect"/);
  assert.doesNotMatch(filters, /<span>Rating<\/span>/);
  assert.doesNotMatch(filters, /<span>Page Size<\/span>/);
  assert.match(app, /{ label: "Type", value: mediaTypeLabel\(item\) }/);
  assert.doesNotMatch(filters, />Extension</);
  assert.doesNotMatch(app, /label: "Extension"/);
});

test("public UI supports tag filter chips", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const advancedFiltersSource = html.match(/export function AdvancedFilters\([\s\S]*?\nfunction ResetFiltersButton/)?.[0] || "";
  const controls = renderToStaticMarkup(createElement(SearchControls, {
    filtersOpen: true,
    folders: [{ id: "folder-1", name: "Folder 1", imageCount: 2 }],
    hasActiveFilters: true,
    searchQuery: "alpha",
    selectedExt: "jpg",
    selectedFolderId: "folder-1",
    selectedLimit: 60,
    selectedRating: "3",
  }));

  assert.match(controls, /id="tagChips"/);
  assert.match(controls, /id="searchInput"/);
  assert.match(controls, /value="alpha"/);
  assert.match(controls, /id="tagSuggestions"/);
  assert.match(controls, /id="resetFiltersButton"/);
  assert.match(controls, /aria-label="Reset filters"/);
  assert.doesNotMatch(controls, /disabled=""/);
  assert.match(controls, /id="toggleFiltersButton"/);
  assert.match(controls, /aria-expanded="true"/);
  assert.doesNotMatch(controls, /id="tagInput"/);
  assert.doesNotMatch(advancedFiltersSource, /id="tagChips"/);
  assert.doesNotMatch(controls, /id="advancedFiltersHost"/);
  assert.match(app, /tags:\s*\[\]/);
  assert.doesNotMatch(app, /tagChips: document\.querySelector\("#tagChips"\),/);
  assert.doesNotMatch(app, /searchInputHost: document\.querySelector\("#searchInputHost"\),/);
  assert.doesNotMatch(app, /searchInput: document\.querySelector\("#searchInput"\),/);
  assert.doesNotMatch(app, /tagSuggestionsHost: document\.querySelector\("#tagSuggestionsHost"\),/);
  assert.doesNotMatch(app, /tagSuggestions: document\.querySelector\("#tagSuggestions"\),/);
  assert.doesNotMatch(app, /els\.tagSuggestions\.hidden/);
  assert.doesNotMatch(app, /resetFiltersButtonHost: document\.querySelector\("#resetFiltersButtonHost"\),/);
  assert.doesNotMatch(app, /toggleFiltersButtonHost: document\.querySelector\("#toggleFiltersButtonHost"\),/);
  assert.doesNotMatch(app, /advancedFiltersHost: document\.querySelector\("#advancedFiltersHost"\),/);
  assert.doesNotMatch(app, /resetFiltersButton: document\.querySelector\("#resetFiltersButton"\),/);
  assert.doesNotMatch(app, /advancedFilters: document\.querySelector\("#advancedFilters"\),/);
  assert.doesNotMatch(app, /els\.advancedFilters\.hidden/);
  assert.match(controls, /Uncategorized/);
  assert.doesNotMatch(app, /renderFolderOptionsView/);
  assert.match(app, /setTagChipsState\(\{/);
  assert.match(app, /setSearchControlsState\(\{/);
  assert.match(app, /setTagSuggestionsState\(\{/);
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
  assert.match(controls, /M12\.531 3H3/);
  assert.match(app, /setViewerShellActions\(\{/);
  assert.match(app, /resetFilters,/);
  assert.match(app, /function syncResetFiltersButton\(\) \{/);
  assert.match(app, /setSearchControlsState\(\{/);
  assert.match(app, /searchQuery:\s*state\.query,/);
  assert.match(app, /selectedFolderId:\s*state\.folderId,/);
  assert.match(app, /selectedLimit:\s*state\.limit,/);
  assert.doesNotMatch(app, /els\.resetFiltersButton\.disabled/);
  assert.doesNotMatch(app, /tagInput:/);
  assert.match(controls, /id="searchInput"[^>]*type="search"/);
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
  assert.match(controls, /search-composer[^"]*max-\[540px\]:flex-nowrap/);
  assert.match(controls, /search-row[^"]*grid-cols-\[minmax\(0,1fr\)_auto_auto\]/);
  assert.match(controls, /filter-reset-button[^"]*max-\[540px\]:w-11/);
  assert.match(controls, /filter-reset-button[^"]*disabled:opacity-\[0\.42\]/);
  assert.match(controls, /unified-search-input[^"]*max-\[540px\]:basis-\[72px\]/);
  assert.doesNotMatch(css, /\.tag-input\s*\{/);
  assert.doesNotMatch(css, /\.tag-suggestions\s*\{/);
  assert.doesNotMatch(css, /\.tag-chips\s*\{/);
  assert.doesNotMatch(css, /\.tag-chip\s*\{/);
  assert.doesNotMatch(css, /@media \(max-width: 540px\)[\s\S]*\.search-box\s*\{/);
});

test("public UI adds a masonry tiles view with infinite loading", async () => {
  const html = await readAppSources();
  const app = await readViewerSources();
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="tilesViewButton"/);
  assert.match(html, /<Tabs[\s\S]*value=\{displayViewMode\}/);
  assert.match(html, /<TabsList className="rounded-lg bg-muted shadow-none">/);
  assert.match(html, /import \{ LayoutDashboard, LayoutGrid, List, type LucideIcon \} from "lucide-react";/);
  assert.match(html, /<ViewModeButton id="tilesViewButton" mode="tiles" label="Tiles" icon=\{LayoutDashboard\} \/>/);
  assert.match(html, /<ViewModeButton id="gridViewButton" mode="grid" label="Grid" icon=\{LayoutGrid\} \/>/);
  assert.match(html, /<ViewModeButton id="tableViewButton" mode="table" label="Table" icon=\{List\} \/>/);
  assert.match(html, /<Icon data-icon="inline-start" aria-hidden="true" \/>/);
  assert.match(html, /data-\[state=active\]:bg-background/);
  assert.match(html, /data-active:bg-background/);
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
  assert.match(html, /aspectRatio: width > 0 && height > 0 \? `\$\{width\} \/ \$\{height\}` : "1 \/ 1"/);
  assert.match(html, /gridRowEnd: `span \$\{tileMasonrySpan\(width, height\)\}`/);
  assert.match(html, /onPointerDown=\{trigger\.onPointerDown\}/);
  assert.match(html, /onClick=\{trigger\.onClick\}/);
  assert.match(app, /setResultSurfaceState\(\{[\s\S]*kind: "list",/);
  assert.match(app, /setPagerState\(\{/);
  assert.match(app, /function goToPage\(page: number\) \{[\s\S]*state\.offset = \(page - 1\) \* state\.limit;[\s\S]*resetPreviewState\(\);[\s\S]*syncUrlState\(\);[\s\S]*loadItems\(\);[\s\S]*\}/);
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
  assert.match(html, /media-tiles grid content-start gap-1 \[grid-auto-flow:dense\] \[grid-auto-rows:4px\] \[grid-template-columns:repeat\(auto-fill,minmax\(180px,1fr\)\)\]/);
  assert.match(html, /const tileButtonClassName =[\s\S]*tile-item[\s\S]*\[contain:layout_paint\]/);
  assert.match(html, /animate-pulse rounded-none bg-muted/);
  assert.match(html, /gridRowEnd: `span \$\{tileMasonrySpan\(width, height\)\}`/);
  assert.match(html, /max-\[540px\]:grid-cols-3 max-\[540px\]:gap-\[3px\]/);
  assert.match(html, /className="tiles-sentinel mt-3 grid min-h-\[52px\] place-items-center text-\[13px\] font-\[680\] text-muted-foreground"/);
});

test("public extension pills use varied colors for common text formats", async () => {
  const html = await readAppSources();

  assert.match(html, /const extensionColorClassNames: Record<string, string> = \{/);
  assert.match(html, /html: "border-\[#fed7aa\] bg-\[#fff7ed\] text-\[#c2410c\]"/);
  assert.match(html, /css: "border-\[#bfdbfe\] bg-\[#eff6ff\] text-\[#2563eb\]"/);
  assert.match(html, /js: "border-\[#fde68a\] bg-\[#fefce8\] text-\[#a16207\]"/);
  assert.match(html, /md: "border-\[#cbd5e1\] bg-\[#f8fafc\] text-\[#475569\]"/);
  assert.match(html, /txt: "border-\[#cbd5e1\] bg-\[#f1f5f9\] text-\[#334155\]"/);
  assert.match(html, /const fileBadgeColorClassNames: Record<string, string> = \{/);
  assert.match(html, /html: "bg-\[#fff7ed\] text-\[#c2410c\]"/);
  assert.match(html, /css: "bg-\[#eff6ff\] text-\[#2563eb\]"/);
  assert.match(html, /js: "bg-\[#fefce8\] text-\[#a16207\]"/);
  assert.match(html, /md: "bg-\[#f8fafc\] text-\[#475569\]"/);
  assert.match(html, /txt: "bg-\[#f1f5f9\] text-\[#334155\]"/);
});

test("public table rows left align filenames and ratings", async () => {
  const html = await readAppSources();

  assert.match(html, /const tableRowClassName =[\s\S]*\[&>span:not\(\.row-name-cell\)\]:justify-self-center/);
  assert.match(html, /const tableHeaderClassName =[\s\S]*!min-h-8 !py-1/);
  assert.match(html, /const rowNameCellClassName =[\s\S]*text-left justify-self-stretch/);
  assert.match(html, /const tableRatingClassName = "rating-control inline-flex items-center justify-self-start gap-px text-left"/);
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
  assert.doesNotMatch(app, /resultGridHost: document\.querySelector\("#resultGridHost"\),/);
  assert.doesNotMatch(app, /els\.grid\.classList\.toggle/);
  assert.match(html, /function resultSurfaceClassName\(viewMode:[\s\S]*isEmpty/);
  assert.match(html, /media-grid grid content-start gap-3/);
  assert.match(html, /media-table grid content-start gap-0/);
  assert.doesNotMatch(css, /\.media-grid\s*\{[^}]*min-height:\s*320px;/s);
  assert.doesNotMatch(css, /\.media-table\s*\{[^}]*min-height:\s*320px;/s);
  assert.match(html, /is-empty block overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none/);
  assert.match(html, /min-h-\[320px\]/);
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
