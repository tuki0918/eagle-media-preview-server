import type { ViewerMode } from "./types";

export interface ViewerShellActions {
  connect: (credentials?: { password: string; username: string }) => void;
  logout: () => void;
  urlPopped: () => void;
  searchChanged: (query: string) => void;
  searchFocused: (query: string) => void;
  searchKeyDown: (key: string) => void;
  searchOutsidePointerDown: (target: EventTarget | null) => void;
  folderChanged: (folderId: string) => void;
  mediaTypeChanged: (mediaType: string) => void;
  ratingChanged: (rating: string) => void;
  pageSizeChanged: (pageSize: number) => void;
  toggleFilters: () => void;
  resetFilters: () => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  setViewMode: (mode: ViewerMode) => void;
  closePreview: () => void;
  togglePreviewInfo: () => void;
  previewPointerDown: (target: EventTarget | null) => void;
  previewClosed: () => void;
  previewDoubleClicked: (target: EventTarget | null, preventDefault: () => void) => void;
}

const noop = () => {};

let actions: ViewerShellActions = {
  connect: noop,
  logout: noop,
  urlPopped: noop,
  searchChanged: noop,
  searchFocused: noop,
  searchKeyDown: noop,
  searchOutsidePointerDown: noop,
  folderChanged: noop,
  mediaTypeChanged: noop,
  ratingChanged: noop,
  pageSizeChanged: noop,
  toggleFilters: noop,
  resetFilters: noop,
  goToPreviousPage: noop,
  goToNextPage: noop,
  setViewMode: noop,
  closePreview: noop,
  togglePreviewInfo: noop,
  previewPointerDown: noop,
  previewClosed: noop,
  previewDoubleClicked: noop,
};

export function setViewerShellActions(nextActions: ViewerShellActions) {
  actions = nextActions;
}

export function submitConnection(event: { currentTarget: HTMLFormElement; preventDefault: () => void }) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const passwordField = event.currentTarget.elements.namedItem("password");
  actions.connect({
    password: String(data.get("password") || ""),
    username: String(data.get("username") || ""),
  });
  if (passwordField instanceof HTMLInputElement) passwordField.value = "";
}

export function submitLogout() {
  actions.logout();
}

export function handleUrlPop() {
  actions.urlPopped();
}

export function changeSearchQuery(event: { currentTarget: { value: string } }) {
  actions.searchChanged(event.currentTarget.value);
}

export function focusSearch(event: { currentTarget: { value: string } }) {
  actions.searchFocused(event.currentTarget.value);
}

export function handleSearchKeyDown(event: { key: string }) {
  actions.searchKeyDown(event.key);
}

export function handleSearchOutsidePointerDown(target: EventTarget | null) {
  actions.searchOutsidePointerDown(target);
}

export function changeFolder(event: { currentTarget: { value: string } }) {
  actions.folderChanged(event.currentTarget.value);
}

export function changeMediaType(event: { currentTarget: { value: string } }) {
  actions.mediaTypeChanged(event.currentTarget.value);
}

export function changeRating(event: { currentTarget: { value: string } }) {
  actions.ratingChanged(event.currentTarget.value);
}

export function changePageSize(event: { currentTarget: { value: string } }) {
  actions.pageSizeChanged(Number(event.currentTarget.value));
}

export function toggleFilters() {
  actions.toggleFilters();
}

export function resetFilters() {
  actions.resetFilters();
}

export function goToPreviousPage() {
  actions.goToPreviousPage();
}

export function goToNextPage() {
  actions.goToNextPage();
}

export function selectViewMode(mode: ViewerMode) {
  actions.setViewMode(mode);
}

export function closePreview() {
  actions.closePreview();
}

export function togglePreviewInfo() {
  actions.togglePreviewInfo();
}

export function handlePreviewPointerDown(event: { target: EventTarget | null }) {
  actions.previewPointerDown(event.target);
}

export function handlePreviewClose() {
  actions.previewClosed();
}

export function handlePreviewDoubleClick(event: { target: EventTarget | null; preventDefault: () => void }) {
  actions.previewDoubleClicked(event.target, () => event.preventDefault());
}
