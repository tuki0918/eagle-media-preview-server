const state = {
  offset: 0,
  limit: 30,
  total: 0,
  items: [],
  query: "",
  folderId: "",
  ext: "",
  rating: "",
  filtersOpen: false,
  folders: [],
  viewMode: "grid",
  requestId: 0,
  previewTransform: {
    scale: 1,
    x: 0,
    y: 0,
  },
  previewFitScale: 1,
  previewNaturalScale: 1,
  previewDrag: null,
  previewPointers: new Map(),
  previewPinch: null,
  previewItemId: "",
  previewInfoOpen: false,
  restoringHistory: false,
};

const UNCATEGORIZED_FOLDER_ID = "__uncategorized__";
const DEFAULT_EAGLE_CONNECTION = Object.freeze({
  host: "127.0.0.1",
  port: "41595",
  token: "",
});
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 1000;
const DEFAULT_VIEW_MODE = "grid";
const LIBRARY_EMPTY_LABEL = "No library";
const EAGLE_UNAVAILABLE_LABEL = "Eagle unavailable";
const DATE_KEYS_MODIFIED = Object.freeze(["modifiedAt", "modificationTime", "mtime", "lastModified"]);

const playableVideoExts = new Set(["mp4", "webm", "mov", "m4v"]);
const playableAudioExts = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);
const textPreviewExts = new Set([
  "txt", "md", "js", "css", "html", "json", "xml", "csv", "log",
  "ts", "tsx", "jsx", "mjs", "cjs", "yml", "yaml",
]);
const pdfPreviewExts = new Set(["pdf"]);
const videoExts = new Set([...playableVideoExts, "avi", "mkv"]);
const audioExts = new Set([...playableAudioExts, "flac", "wma"]);
const IMAGE_FIT_MARGIN = 0.96;
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const lucideIcons = {
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  "maximize-2": '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  "minus": '<path d="M5 12h14"/>',
  move: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
  "move-diagonal": '<polyline points="13 5 19 5 19 11"/><polyline points="11 19 5 19 5 13"/><line x1="19" x2="5" y1="5" y2="19"/>',
  "panel-left": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1.06 6.63 2.93"/><path d="M21 3v6h-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

const els = {
  loginView: document.querySelector("#loginView"),
  viewerShell: document.querySelector("#viewerShell"),
  connectForm: document.querySelector("#connectForm"),
  connectButton: document.querySelector("#connectButton"),
  connectMessage: document.querySelector("#connectMessage"),
  searchInput: document.querySelector("#searchInput"),
  toggleFiltersButton: document.querySelector("#toggleFiltersButton"),
  advancedFilters: document.querySelector("#advancedFilters"),
  folderSelect: document.querySelector("#folderSelect"),
  extSelect: document.querySelector("#extSelect"),
  ratingSelect: document.querySelector("#ratingSelect"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
  gridViewButton: document.querySelector("#gridViewButton"),
  tableViewButton: document.querySelector("#tableViewButton"),
  resultCount: document.querySelector("#resultCount"),
  libraryFooterName: document.querySelector("#libraryFooterName"),
  grid: document.querySelector("#grid"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  pageButtons: document.querySelector("#pageButtons"),
  template: document.querySelector("#cardTemplate"),
  dialog: document.querySelector("#previewDialog"),
  previewMeta: document.querySelector("#previewMeta"),
  previewBody: document.querySelector("#previewBody"),
  backPreview: document.querySelector("#backPreview"),
  previewOriginalName: document.querySelector("#previewOriginalName"),
  previewRating: document.querySelector("#previewRating"),
  previewDetails: document.querySelector("#previewDetails"),
  previewActions: document.querySelector("#previewActions"),
  toggleInfoPreview: document.querySelector("#toggleInfoPreview"),
  fullscreenPreview: document.querySelector("#fullscreenPreview"),
  closePreview: document.querySelector("#closePreview"),
};

init();

async function init() {
  renderLucideIcons();
  restoreUrlState();
  restoreViewMode();
  els.connectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    connect();
  });
  window.addEventListener("popstate", () => {
    restoreUrlState();
    applyControlsFromState();
    if (els.viewerShell.hidden) return;
    loadItems();
  });
  window.addEventListener("resize", () => refreshPreviewImageLayout());
  els.toggleFiltersButton.addEventListener("click", () => {
    state.filtersOpen = !state.filtersOpen;
    syncAdvancedFiltersUi();
    syncUrlState();
  });
  els.prevButton.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    resetPreviewState();
    syncUrlState();
    loadItems();
  });
  els.nextButton.addEventListener("click", () => {
    state.offset += state.limit;
    resetPreviewState();
    syncUrlState();
    loadItems();
  });
  els.searchInput.addEventListener("input", debounce(() => {
    applyFilterChange({ query: els.searchInput.value.trim() });
  }, 280));
  els.folderSelect.addEventListener("change", () => {
    applyFilterChange({ folderId: els.folderSelect.value });
  });
  els.extSelect.addEventListener("change", () => {
    applyFilterChange({ ext: els.extSelect.value });
  });
  els.ratingSelect.addEventListener("change", () => {
    applyFilterChange({ rating: els.ratingSelect.value });
  });
  els.pageSizeSelect.addEventListener("change", () => {
    applyFilterChange({ limit: Number(els.pageSizeSelect.value) });
  });
  els.gridViewButton.addEventListener("click", () => setViewMode("grid"));
  els.tableViewButton.addEventListener("click", () => setViewMode("table"));
  els.closePreview.addEventListener("click", () => closePreview());
  els.backPreview.addEventListener("click", () => closePreview());
  els.toggleInfoPreview.addEventListener("click", () => togglePreviewInfo());
  els.fullscreenPreview.addEventListener("click", () => toggleFullscreen());
  els.dialog.addEventListener("pointerdown", closePreviewInfoFromOutside);
  els.dialog.addEventListener("close", () => {
    clearPreviewContents();
    document.body.classList.remove("modal-open");
  });
  els.dialog.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) {
      event.preventDefault();
    }
  });
  for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
    els.dialog.addEventListener(eventName, (event) => {
      if (els.dialog.open) {
        event.preventDefault();
      }
    });
  }
  showLogin();
}

async function connect() {
  setConnectMessage("Connecting", false);
  els.connectButton.disabled = true;

  try {
    const connection = { ...DEFAULT_EAGLE_CONNECTION };
    const data = await postJson("/api/connect", connection);
    showViewer(data);
    await Promise.all([loadFolders(), loadItems()]);
  } catch (error) {
    showLogin();
    setConnectMessage(error.message, true);
  } finally {
    els.connectButton.disabled = false;
  }
}

function showLogin() {
  els.loginView.hidden = false;
  els.viewerShell.hidden = true;
}

function showViewer(data) {
  els.loginView.hidden = true;
  els.viewerShell.hidden = false;
  els.libraryFooterName.textContent = libraryLabel(data);
  els.folderSelect.replaceChildren(
    optionNode("", "All folders"),
    optionNode(UNCATEGORIZED_FOLDER_ID, "Uncategorized"),
  );
  state.total = 0;
  state.items = [];
  applyControlsFromState();
  updateStatus();
  updatePager();
}

function setConnectMessage(message, isError) {
  els.connectMessage.textContent = message;
  els.connectMessage.classList.toggle("error-text", isError);
}

function libraryLabel(data) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  const version = data.app?.version ? `Eagle ${data.app.version}` : EAGLE_UNAVAILABLE_LABEL;
  return `${name} - ${version}`;
}

function optionNode(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

async function loadFolders() {
  try {
    const data = await getJson("/api/folders");
    state.folders = flattenFolders(data.items);
    const fragment = document.createDocumentFragment();
    for (const folder of state.folders) {
      fragment.append(optionNode(
        folder.id,
        `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name} (${folder.imageCount ?? 0})`,
      ));
    }
    els.folderSelect.append(fragment);
    els.folderSelect.value = state.folderId;
  } catch {
    state.folders = [];
    // Folder loading is optional; item browsing still works without it.
  }
}

async function loadItems() {
  const requestId = ++state.requestId;
  els.grid.replaceChildren(messageNode("Loading"));
  updatePager();

  const params = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
  });
  if (state.query) params.set("q", state.query);
  if (state.folderId) params.set("folderId", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);

  try {
    const data = await getJson(`/api/items?${params.toString()}`);
    if (requestId !== state.requestId) return;
    state.total = data.total;
    state.items = data.items;
    render();
    syncPreviewFromState();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.items = [];
    state.total = 0;
    els.grid.replaceChildren(messageNode(error.message, "error"));
    updateStatus();
    updatePager();
  }
}

function render() {
  const fragment = document.createDocumentFragment();
  els.grid.classList.toggle("media-table", state.viewMode === "table");
  els.grid.classList.toggle("media-grid", state.viewMode === "grid");
  els.grid.classList.toggle("is-empty", !state.items.length);

  if (state.viewMode === "table" && state.items.length) {
    fragment.append(tableHeader());
  }
  for (const item of state.items) {
    fragment.append(state.viewMode === "table" ? tableRow(item) : gridCard(item));
  }

  if (!state.items.length) {
    fragment.append(emptyStateNode());
  }

  els.grid.replaceChildren(fragment);
  updateStatus();
  updatePager();
  updateViewToggle();
}

function renderLucideIcons(root = document) {
  for (const placeholder of root.querySelectorAll("[data-lucide]")) {
    const name = placeholder.dataset.lucide;
    const paths = lucideIcons[name];
    if (!paths) continue;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths;
    placeholder.replaceWith(svg);
  }
}

function iconNode(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = lucideIcons[name] || "";
  return svg;
}

function bindPreviewTrigger(element, item) {
  let lastTriggerAt = 0;
  let touchSession = null;
  const TAP_MOVE_THRESHOLD = 10;
  const TAP_HOLD_THRESHOLD_MS = 300;

  const openFromPointer = (event) => {
    if (Date.now() - lastTriggerAt < 700) return;
    if (event?.type === "touchend") {
      event.preventDefault();
    }
    lastTriggerAt = Date.now();
    openPreview(item);
  };

  element.addEventListener("click", (event) => {
    if (Date.now() - lastTriggerAt < 700) {
      event.preventDefault();
      return;
    }
    openPreview(item);
  });

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touchSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      moved: false,
    };
  });

  element.addEventListener("pointermove", (event) => {
    if (!touchSession || touchSession.pointerId !== event.pointerId) return;
    const deltaX = Math.abs(event.clientX - touchSession.startX);
    const deltaY = Math.abs(event.clientY - touchSession.startY);
    if (deltaX > TAP_MOVE_THRESHOLD || deltaY > TAP_MOVE_THRESHOLD) {
      touchSession.moved = true;
    }
  });

  element.addEventListener("pointercancel", () => {
    touchSession = null;
  });

  element.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    if (!touchSession || touchSession.pointerId !== event.pointerId) return;
    const heldFor = Date.now() - touchSession.startedAt;
    const shouldOpen = !touchSession.moved && heldFor <= TAP_HOLD_THRESHOLD_MS;
    touchSession = null;
    if (shouldOpen) {
      openFromPointer(event);
    }
  });
}

function gridCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const img = node.querySelector("img");
  const button = node.querySelector("button");
  const badge = node.querySelector(".file-badge");
  const duration = node.querySelector(".duration-badge");
  const overlayIcon = node.querySelector(".thumb-overlay-icon");
  const title = node.querySelector("strong");
  const metaLine = node.querySelector(".card-meta span");
  const rating = node.querySelector(".rating-control");

  populateThumb({ img, badge, duration, item });
  decorateThumbButton(button, overlayIcon, item);
  title.textContent = item.name || item.id;
  title.title = originalFileName(item);
  metaLine.hidden = true;
  renderRating(rating, item, { interactive: false });
  button.append(rating);
  bindPreviewTrigger(button, item);
  return node;
}

function tableHeader() {
  const header = document.createElement("div");
  header.className = "media-row media-row-header";
  header.innerHTML = `
    <span>Item</span>
    <span>Name</span>
    <span>Type</span>
    <span>Size</span>
    <span>Dimensions</span>
    <span>Duration</span>
    <span>Modified</span>
  `;
  return header;
}

function tableRow(item) {
  const row = document.createElement("article");
  row.className = "media-row";
  const thumb = document.createElement("button");
  thumb.className = "row-thumb";
  thumb.type = "button";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  thumb.append(img);

  populateThumb({ img, item });
  decorateThumbButton(thumb, null, item);
  bindPreviewTrigger(thumb, item);
  row.append(
    thumb,
    tableNameCell(item),
    extensionPill(item),
    tableCell(formatBytes(item.size) || "-"),
    tableCell(formatDimensions(item) || "-", "dimensions-cell"),
    tableCell(formatDurationCell(item) || "-", "duration-cell"),
    tableCell(formatDateShort(item.modificationTime) || "-", "modified-cell", formatDate(item.modificationTime) || ""),
  );
  return row;
}

function tableNameCell(item) {
  const cell = document.createElement("span");
  cell.className = "row-name-cell";
  const name = document.createElement("span");
  name.className = "row-file-name";
  name.textContent = item.name || item.id;
  name.title = originalFileName(item);
  const meta = document.createElement("span");
  meta.className = "table-mobile-meta";
  meta.textContent = [
    ((item.ext || "").toUpperCase() || "FILE"),
    formatBytes(item.size),
  ].filter(Boolean).join(" · ");
  const rating = document.createElement("div");
  rating.className = "rating-control";
  rating.ariaLabel = "Rating";
  renderRating(rating, item, { interactive: false });
  cell.append(name, meta, rating);
  return cell;
}

function populateThumb({ img, badge, duration, item }) {
  const button = img.closest("button");
  button?.classList.add("thumb-loading");
  img.loading = "lazy";
  img.decoding = "async";
  img.src = mediaUrl(item.id, "thumb");
  img.alt = item.name || item.id;
  img.onload = () => {
    button?.classList.remove("thumb-loading");
    img.hidden = false;
  };
  img.onerror = () => {
    button?.classList.remove("thumb-loading");
    img.hidden = true;
    button?.classList.add("thumb-missing");
  };
  if (badge) {
    badge.textContent = (item.ext || "").toUpperCase();
    badge.dataset.ext = (item.ext || "file").toLowerCase();
  }
  const formattedDuration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  if (duration) {
    duration.textContent = formattedDuration;
    duration.hidden = !formattedDuration;
  }
}

function decorateThumbButton(button, overlayIcon, item) {
  const ext = (item.ext || "").toLowerCase();
  const mediaType = playableVideoExts.has(ext)
    ? "video"
    : playableAudioExts.has(ext)
      ? "audio"
      : textPreviewExts.has(ext) || pdfPreviewExts.has(ext)
        ? "document"
        : "image";
  button.dataset.mediaType = mediaType;
  button.setAttribute("aria-label", mediaType === "video" || mediaType === "audio" ? `Play ${item.name || item.id}` : `Open ${item.name || item.id}`);
  if (!overlayIcon) return;
  const icon = mediaType === "video" || mediaType === "audio" ? "play" : "move-diagonal";
  overlayIcon.replaceChildren(iconNode(icon));
}

function openPreview(item, { skipHistory = false } = {}) {
  state.previewItemId = item.id;
  els.previewMeta.textContent = itemMeta(item);
  els.previewOriginalName.textContent = originalFileName(item);
  els.previewOriginalName.title = originalFileName(item);
  els.previewBody.replaceChildren();
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "text-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", state.previewInfoOpen ? "true" : "false");
  renderRating(els.previewRating, item, { interactive: true });
  renderPreviewDetails(item);
  if (state.previewInfoOpen) {
    els.dialog.classList.add("info-open");
  }

  const ext = (item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) {
    els.dialog.classList.add("video-mode");
    const video = document.createElement("video");
    video.className = "preview-video";
    video.src = mediaUrl(item.id, "file");
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    video.addEventListener("error", () => showPreviewNotice(videoErrorMessage(video.error)));
    els.previewBody.append(video);
    showPreviewDialog();
    if (!skipHistory) syncUrlState();
    video.play().catch(() => {});
    return;
  } else if (playableAudioExts.has(ext)) {
    els.dialog.classList.add("audio-mode");
    const audio = document.createElement("audio");
    audio.src = mediaUrl(item.id, "file");
    audio.controls = true;
    audio.preload = "metadata";
    els.previewBody.append(audio);
    showPreviewDialog();
    if (!skipHistory) syncUrlState();
    audio.play().catch(() => {});
    return;
  } else if (textPreviewExts.has(ext)) {
    els.dialog.classList.add("text-mode");
    renderTextPreview(item);
  } else if (pdfPreviewExts.has(ext)) {
    els.dialog.classList.add("image-mode");
    renderImagePreview(item, { srcKind: "thumb" });
  } else if (isTimedMedia(item)) {
    els.dialog.classList.add("unsupported-mode");
    const image = document.createElement("img");
    image.className = "unsupported-thumb";
    image.src = mediaUrl(item.id, "thumb");
    image.alt = item.name || item.id;
    const notice = document.createElement("p");
    notice.className = "preview-notice";
    notice.textContent = `${(item.ext || "This format").toUpperCase()} is not supported in this browser.`;
    els.previewBody.append(image, notice);
  } else {
    els.dialog.classList.add("image-mode");
    renderImagePreview(item);
  }

  showPreviewDialog();
  if (!skipHistory) syncUrlState();
}

function renderTextPreview(item) {
  const preview = document.createElement("pre");
  preview.className = "text-preview";
  const code = document.createElement("code");
  code.textContent = "Loading...";
  preview.append(code);
  els.previewBody.append(preview);

  (async () => {
    try {
      const response = await fetch(mediaUrl(item.id, "file"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      code.textContent = text;
    } catch (error) {
      code.textContent = `Unable to load preview: ${error.message}`;
    }
  })();
}

function renderImagePreview(item, { srcKind = "file" } = {}) {
  const viewport = document.createElement("div");
  viewport.className = "image-viewport";
  const status = document.createElement("div");
  status.className = "image-status";
  status.hidden = true;
  const image = document.createElement("img");
  image.className = "preview-image";
  image.src = mediaUrl(item.id, srcKind);
  image.alt = item.name || item.id;
  image.draggable = false;
  viewport.append(image, status);
  els.previewBody.append(viewport, imageToolbar());

  resetPreviewTransform();
  image.addEventListener("load", () => {
    image.style.width = `${image.naturalWidth}px`;
    image.style.height = `${image.naturalHeight}px`;
    updatePreviewScales(image, viewport);
    setImageZoom(state.previewFitScale, { x: 0, y: 0 });
    status.hidden = false;
    updateImageStatus();
  });
  image.addEventListener("error", () => {
    status.hidden = true;
    status.textContent = "";
  });
  viewport.addEventListener("pointerdown", (event) => startImageDrag(event, viewport));
  viewport.addEventListener("pointermove", (event) => moveImageDrag(event));
  viewport.addEventListener("pointerup", (event) => endImageDrag(event));
  viewport.addEventListener("pointercancel", (event) => endImageDrag(event));
  viewport.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomImage(event.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });
}

function imageToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "image-toolbar";
  toolbar.append(
    toolbarButton("Zoom out", "minus", () => zoomImage(0.85)),
    toolbarButton("Fit", "maximize", () => setImageZoom(state.previewFitScale, { x: 0, y: 0 })),
    toolbarButton("Actual size", "maximize-2", () => setImageZoom(state.previewNaturalScale, { x: 0, y: 0 })),
    toolbarButton("Zoom in", "plus", () => zoomImage(1.18)),
  );
  return toolbar;
}

function toolbarButton(label, icon, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.ariaLabel = label;
  button.append(iconNode(icon));
  button.addEventListener("click", action);
  return button;
}

function resetPreviewTransform() {
  state.previewTransform = { scale: 1, x: 0, y: 0 };
  state.previewFitScale = 1;
  state.previewNaturalScale = 1;
  state.previewDrag = null;
  state.previewPointers = new Map();
  state.previewPinch = null;
}

function updatePreviewScales(image, viewport) {
  const previousFitScale = state.previewFitScale;
  const previousScale = state.previewTransform.scale;
  const widthRatio = viewport.clientWidth / image.naturalWidth;
  const heightRatio = viewport.clientHeight / image.naturalHeight;
  state.previewFitScale = Math.min(widthRatio, heightRatio) * IMAGE_FIT_MARGIN;
  state.previewNaturalScale = 1;
  const keepFitted = Math.abs(state.previewTransform.scale - previousFitScale) < 0.01;
  if (keepFitted || previousScale === 1) {
    state.previewTransform.scale = state.previewFitScale;
    state.previewTransform.x = 0;
    state.previewTransform.y = 0;
  }
}

function zoomImage(multiplier) {
  const nextScale = clamp(state.previewTransform.scale * multiplier, minimumPreviewScale(), 8);
  setImageZoom(nextScale);
}

function setImageZoom(scale, position = state.previewTransform) {
  state.previewTransform = {
    scale,
    x: position.x,
    y: position.y,
  };
  applyImageTransform();
}

function applyImageTransform() {
  const image = els.previewBody.querySelector(".preview-image");
  if (!image) return;
  const { scale, x, y } = state.previewTransform;
  image.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  updateImageStatus();
}

function updateImageStatus() {
  const image = els.previewBody.querySelector(".preview-image");
  const status = els.previewBody.querySelector(".image-status");
  if (!image || !status || !image.naturalWidth || !image.naturalHeight) return;
  const zoomPercent = Math.round((state.previewTransform.scale / state.previewNaturalScale) * 100);
  status.textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${zoomPercent}%`;
}

function startImageDrag(event, viewport) {
  const image = els.previewBody.querySelector(".preview-image");
  if (!image) return;
  if (event.pointerType === "touch") {
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.previewPointers.size === 2) {
      state.previewPinch = {
        distance: pointerDistance(),
        scale: state.previewTransform.scale,
      };
      state.previewDrag = null;
      return;
    }
    if (state.previewPointers.size > 1) {
      return;
    }
  }
  viewport.setPointerCapture(event.pointerId);
  state.previewDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: state.previewTransform.x,
    originY: state.previewTransform.y,
  };
}

function moveImageDrag(event) {
  if (event.pointerType === "touch" && state.previewPointers.has(event.pointerId)) {
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.previewPointers.size === 2 && state.previewPinch) {
      const distance = pointerDistance();
      if (distance > 0 && state.previewPinch.distance > 0) {
        const nextScale = clamp(
          state.previewPinch.scale * (distance / state.previewPinch.distance),
          minimumPreviewScale(),
          8,
        );
        setImageZoom(nextScale);
      }
      return;
    }
  }
  const drag = state.previewDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.previewTransform.x = drag.originX + event.clientX - drag.startX;
  state.previewTransform.y = drag.originY + event.clientY - drag.startY;
  applyImageTransform();
}

function endImageDrag(event) {
  if (event?.pointerType === "touch") {
    state.previewPointers.delete(event.pointerId);
    if (state.previewPointers.size < 2) {
      state.previewPinch = null;
    }
  }
  if (!event || !state.previewDrag || state.previewDrag.pointerId === event.pointerId) {
    state.previewDrag = null;
  }
}

function showPreviewNotice(message) {
  const notice = document.createElement("p");
  notice.className = "preview-notice";
  notice.textContent = message;
  els.previewBody.append(notice);
}

function minimumPreviewScale() {
  return Math.max(0.05, Math.min(state.previewFitScale, state.previewNaturalScale) * 0.5);
}

function refreshPreviewImageLayout() {
  const image = els.previewBody.querySelector(".preview-image");
  const viewport = els.previewBody.querySelector(".image-viewport");
  if (!image || !viewport || !image.naturalWidth || !image.naturalHeight) return;
  updatePreviewScales(image, viewport);
  applyImageTransform();
}

function videoErrorMessage(error) {
  if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This video could not be played on this device. iPhone requires Safari-compatible video such as H.264 video with AAC audio.";
  }
  return "This video could not be played on this device.";
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  localStorage.setItem("eagleViewMode", mode);
  syncUrlState();
  render();
}

function updateViewToggle() {
  els.gridViewButton.setAttribute("aria-pressed", state.viewMode === "grid" ? "true" : "false");
  els.tableViewButton.setAttribute("aria-pressed", state.viewMode === "table" ? "true" : "false");
}

function restoreViewMode() {
  if (new URLSearchParams(window.location.search).has("view")) {
    updateViewToggle();
    return;
  }
  const saved = localStorage.getItem("eagleViewMode");
  state.viewMode = saved === "table" ? "table" : DEFAULT_VIEW_MODE;
  updateViewToggle();
}

function closePreview({ skipHistory = false } = {}) {
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", "false");
  state.previewItemId = "";
  state.previewInfoOpen = false;
  document.body.classList.remove("modal-open");
  if (typeof els.dialog.close === "function" && els.dialog.open) {
    els.dialog.close();
    if (!skipHistory) syncUrlState();
    return;
  }
  els.dialog.removeAttribute("open");
  clearPreviewContents();
  if (!skipHistory) syncUrlState();
}

function togglePreviewInfo() {
  setPreviewInfoOpen(!state.previewInfoOpen);
}

function closePreviewInfoFromOutside(event) {
  if (!state.previewInfoOpen) return;
  if (event.target.closest(".preview-info, #toggleInfoPreview")) return;
  setPreviewInfoOpen(false);
}

function setPreviewInfoOpen(isOpen) {
  els.dialog.classList.toggle("info-open", isOpen);
  els.toggleInfoPreview.setAttribute("aria-expanded", isOpen ? "true" : "false");
  state.previewInfoOpen = isOpen;
  syncUrlState();
}

async function toggleFullscreen() {
  const target = els.previewBody.firstElementChild || els.previewBody;
  try {
    if (target.tagName === "VIDEO" && target.webkitEnterFullscreen && !document.fullscreenEnabled) {
      target.webkitEnterFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return;
    }
    if (target.tagName === "VIDEO" && target.webkitEnterFullscreen) {
      target.webkitEnterFullscreen();
    }
  } catch (error) {
    console.warn("Fullscreen is unavailable in this browser.", error);
  }
}

function showPreviewDialog() {
  document.body.classList.add("modal-open");
  if (typeof els.dialog.showModal === "function") {
    try {
      if (!els.dialog.open) {
        els.dialog.showModal();
      }
      return;
    } catch {
      // Safari fallback below.
    }
  }
  els.dialog.setAttribute("open", "");
}

function restoreUrlState() {
  state.restoringHistory = true;
  try {
    const params = new URLSearchParams(window.location.search);
    state.query = params.get("q") || "";
    state.folderId = params.get("folder") || "";
    state.ext = params.get("ext") || "";
    state.rating = params.get("rating") || "";
    state.filtersOpen = params.get("filters") === "1";
    state.limit = clampPageSize(params.get("limit"));
    state.viewMode = params.get("view") === "table" ? "table" : DEFAULT_VIEW_MODE;
    state.offset = (Math.max(1, Number.parseInt(params.get("page") || "1", 10)) - 1) * state.limit;
    state.previewItemId = params.get("item") || "";
    state.previewInfoOpen = params.get("info") === "1";
  } finally {
    state.restoringHistory = false;
  }
}

function applyControlsFromState() {
  els.searchInput.value = state.query;
  els.folderSelect.value = state.folderId;
  els.extSelect.value = state.ext;
  els.ratingSelect.value = state.rating;
  els.pageSizeSelect.value = String(state.limit);
  syncAdvancedFiltersUi();
  updateViewToggle();
}

function applyFilterChange(patch) {
  Object.assign(state, patch, { offset: 0 });
  resetPreviewState();
  syncUrlState();
  loadItems();
}

function syncUrlState({ replace = false } = {}) {
  if (state.restoringHistory) return;
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.folderId) params.set("folder", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);
  if (state.filtersOpen) params.set("filters", "1");
  if (state.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(state.limit));
  if (state.viewMode !== DEFAULT_VIEW_MODE) params.set("view", state.viewMode);
  params.set("page", String(currentPage()));
  if (state.previewItemId) params.set("item", state.previewItemId);
  if (state.previewInfoOpen) params.set("info", "1");
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", nextUrl);
}

function syncAdvancedFiltersUi() {
  const label = state.filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  els.advancedFilters.hidden = !state.filtersOpen;
  els.toggleFiltersButton.setAttribute("aria-expanded", String(state.filtersOpen));
  els.toggleFiltersButton.setAttribute("aria-label", label);
  els.toggleFiltersButton.title = label;
}

function currentPage() {
  return Math.floor(state.offset / state.limit) + 1;
}

function clampPageSize(value) {
  const parsed = Number.parseInt(value || "30", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return clamp(parsed, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

function resetPreviewState() {
  if (!state.previewItemId && !state.previewInfoOpen) return;
  state.previewItemId = "";
  state.previewInfoOpen = false;
  if (els.dialog.open) {
    closePreview({ skipHistory: true });
  }
}

function syncPreviewFromState() {
  if (!state.previewItemId) {
    if (els.dialog.open) closePreview({ skipHistory: true });
    return;
  }
  const item = state.items.find((entry) => entry.id === state.previewItemId);
  if (!item) {
    if (els.dialog.open) closePreview({ skipHistory: true });
    return;
  }
  openPreview(item, { skipHistory: true });
}

function clearPreviewContents() {
  els.previewBody.replaceChildren();
  els.previewOriginalName.textContent = "";
  els.previewOriginalName.removeAttribute("title");
  els.previewRating.replaceChildren();
  els.previewDetails.replaceChildren();
  els.previewActions.replaceChildren();
  resetPreviewTransform();
}

function pointerDistance() {
  const points = [...state.previewPointers.values()];
  if (points.length < 2) return 0;
  const [first, second] = points;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function renderRating(container, item, { interactive = false } = {}) {
  container.replaceChildren();
  const current = Number(item.star || 0);
  for (let value = 1; value <= 5; value += 1) {
    const star = document.createElement(interactive ? "button" : "span");
    if (interactive) star.type = "button";
    star.className = interactive ? "rating-star" : "rating-star rating-star-static";
    star.textContent = "★";
    star.title = `${value}`;
    star.dataset.active = value <= current ? "true" : "false";
    if (interactive) {
      star.ariaLabel = `Rating ${value}`;
      star.setAttribute("aria-pressed", value <= current ? "true" : "false");
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        setItemStar(item, value === Number(item.star || 0) ? 0 : value);
      });
    } else {
      star.setAttribute("aria-hidden", "true");
    }
    container.append(star);
  }
}

async function setItemStar(item, star) {
  const previous = Number(item.star || 0);
  item.star = star;
  updateItemInState(item.id, { star });
  render();
  if (els.dialog.open) {
    renderRating(els.previewRating, item, { interactive: true });
  }

  try {
    const data = await postJson(`/api/items/${encodeURIComponent(item.id)}/star`, { star });
    const savedStar = Number(data.star ?? star);
    item.star = savedStar;
    updateItemInState(item.id, { star: savedStar });
  } catch (error) {
    item.star = previous;
    updateItemInState(item.id, { star: previous });
    alert(error.message);
  } finally {
    render();
    if (els.dialog.open) {
      renderRating(els.previewRating, item, { interactive: true });
    }
  }
}

function updateItemInState(id, patch) {
  const target = state.items.find((item) => item.id === id);
  if (target) Object.assign(target, patch);
}

function updateStatus() {
  els.resultCount.textContent = `${state.total.toLocaleString()} items`;
}

function updatePager() {
  els.prevButton.disabled = state.offset <= 0;
  els.nextButton.disabled = state.offset + state.limit >= state.total;
  renderPageButtons();
}

function renderPageButtons() {
  const current = currentPage();
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const pages = pageButtonList(current, totalPages);
  const fragment = document.createDocumentFragment();

  for (const page of pages) {
    if (page === "...") {
      const spacer = document.createElement("span");
      spacer.textContent = "...";
      spacer.className = "page-ellipsis";
      fragment.append(spacer);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(page);
    button.dataset.active = page === current ? "true" : "false";
    button.addEventListener("click", () => {
      state.offset = (page - 1) * state.limit;
      loadItems();
    });
    fragment.append(button);
  }

  els.pageButtons.replaceChildren(fragment);
}

function pageButtonList(current, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (current >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", current - 1, current, current + 1, "...", totalPages];
}

function itemMeta(item) {
  const ext = (item.ext || "").toUpperCase() || "FILE";
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : "";
  const duration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  const size = formatBytes(item.size);
  return [ext, dimensions, duration, size].filter(Boolean).join(" · ");
}

function formatDimensions(item) {
  return item.width && item.height ? `${item.width} x ${item.height}` : "";
}

function formatDurationCell(item) {
  return isTimedMedia(item) ? formatDuration(item.duration) : "";
}

function tableCell(value, className = "", title = "") {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = value;
  if (title) cell.title = title;
  return cell;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function extensionPill(item) {
  const ext = document.createElement("span");
  ext.className = "ext-pill";
  ext.textContent = (item.ext || "file").toUpperCase();
  ext.dataset.ext = (item.ext || "file").toLowerCase();
  return ext;
}

function directFileUrl(item) {
  return new URL(`/file/${encodeURIComponent(item.id)}/${encodeURIComponent(previewFileName(item))}`, window.location.href).href;
}

function previewFileName(item) {
  return originalFileName(item);
}

function originalFileName(item) {
  const name = String(item.name || item.id || "file").trim() || "file";
  const ext = String(item.ext || "").trim().replace(/^\./, "");
  if (!ext || name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return name;
  return `${name}.${ext}`;
}

function directFileLink(item) {
  const link = document.createElement("a");
  link.className = "direct-file-link";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open file";
  link.href = directFileUrl(item);
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

function renderPreviewDetails(item) {
  const detailsSection = document.createElement("section");
  detailsSection.className = "preview-details-section";

  const rows = [
    { label: "Type", value: mediaTypeLabel(item) },
    { label: "Size", value: formatBytes(item.size) },
    { label: "Dimensions", value: item.width && item.height ? `${item.width} x ${item.height}` : "" },
    { label: "Duration", value: isTimedMedia(item) ? formatDuration(item.duration) : "" },
    { label: "Tags", value: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [], chips: true, always: true },
    { label: "Folders", value: folderDisplayNames(item.folders), chips: true, always: true },
    { label: "ID", value: item.id },
    { label: "Date Modified", value: formatItemDate(item, DATE_KEYS_MODIFIED) || "-" },
  ].filter(({ value, chips, always }) => always || (chips ? value.length > 0 : Boolean(value)));

  for (const { label, value, chips = false } of rows) {
    const row = document.createElement("div");
    row.className = "preview-detail-row";

    const labelNode = document.createElement("span");
    labelNode.className = "preview-detail-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("div");
    valueNode.className = "preview-detail-value";
    if (chips && value.length > 0) {
      const chipList = previewChipList(value);
      valueNode.append(chipList);
    } else {
      valueNode.textContent = chips ? "-" : value;
    }

    row.append(labelNode, valueNode);
    detailsSection.append(row);
  }

  const link = directFileLink(item);
  link.classList.add("preview-info-cta");
  link.prepend(iconNode("external-link"));

  els.previewDetails.replaceChildren(detailsSection);
  els.previewActions.replaceChildren(link);
}

function previewChipList(values) {
  const list = document.createElement("div");
  list.className = "preview-chip-list";
  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "preview-chip";
    chip.textContent = value;
    list.append(chip);
  }
  return list;
}

function mediaTypeLabel(item) {
  return (item.ext || "").toUpperCase() || "FILE";
}

function formatItemDate(item, keys) {
  for (const key of keys) {
    const value = item[key];
    const formatted = formatDate(value);
    if (formatted) return formatted;
  }
  return "";
}

function folderIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item?.id || "";
  }).filter(Boolean);
}

function folderDisplayNames(value) {
  const byId = new Map(state.folders.map((folder) => [folder.id, folder.name]));
  return folderIds(value).map((id) => byId.get(id) || id);
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatDate(value) {
  const timestamp = typeof value === "string" && value.trim() && !Number.isFinite(Number(value))
    ? Date.parse(value)
    : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return dateTimeFormatter.format(new Date(timestamp));
}

function formatDateShort(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return dateFormatter.format(new Date(timestamp));
}

function isTimedMedia(item) {
  const ext = (item.ext || "").toLowerCase();
  return videoExts.has(ext) || audioExts.has(ext);
}

function flattenFolders(folders, depth = 0) {
  const output = [];
  for (const folder of folders || []) {
    output.push({ ...folder, depth });
    output.push(...flattenFolders(folder.children, depth + 1));
  }
  return output;
}

function messageNode(text, className = "empty") {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

function emptyStateNode() {
  const node = document.createElement("section");
  node.className = "empty-state";

  const title = document.createElement("strong");
  title.textContent = hasActiveFilters() ? "No items matched these filters" : "No items found";

  const description = document.createElement("p");
  description.textContent = hasActiveFilters()
    ? "Try changing the search text, folder, extension, or rating to widen the results."
    : "This page has no items yet. Refresh or change the current view to load another range.";

  node.append(title, description);

  if (hasActiveFilters()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button empty-state-button";
    button.textContent = "Clear filters";
    button.addEventListener("click", resetFilters);
    node.append(button);
  }

  return node;
}

function hasActiveFilters() {
  return Boolean(state.query || state.folderId || state.ext || state.rating !== "");
}

function resetFilters() {
  state.query = "";
  state.folderId = "";
  state.ext = "";
  state.rating = "";
  state.offset = 0;
  els.searchInput.value = "";
  els.folderSelect.value = "";
  els.extSelect.value = "";
  els.ratingSelect.value = "";
  syncUrlState();
  loadItems();
}

async function getJson(url) {
  return requestJson(url);
}

async function postJson(url, body) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function mediaUrl(id, kind) {
  if (kind === "file") {
    return `/file/${encodeURIComponent(id)}`;
  }
  return `/api/items/${encodeURIComponent(id)}/${kind}`;
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
