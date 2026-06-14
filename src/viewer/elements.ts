export interface ViewerElements {
  loginView: HTMLElement;
  viewerShell: HTMLElement;
  connectButtonHost: HTMLElement;
  connectMessageHost: HTMLElement;
  searchInput: HTMLInputElement;
  tagChips: HTMLElement;
  tagSuggestionsHost: HTMLElement;
  resetFiltersButtonHost: HTMLElement;
  toggleFiltersButtonHost: HTMLElement;
  advancedFilters: HTMLElement;
  folderSelect: HTMLSelectElement;
  extSelect: HTMLSelectElement;
  ratingSelect: HTMLSelectElement;
  pageSizeSelect: HTMLSelectElement;
  resultsStatusHost: HTMLElement;
  libraryFooterNameHost: HTMLElement;
  resultGridHost: HTMLElement;
  tilesSentinelHost: HTMLElement;
  pagerHost: HTMLElement;
  template: HTMLTemplateElement;
  dialog: HTMLDialogElement;
  previewMetaHost: HTMLElement;
  previewBody: HTMLElement;
  previewOriginalNameHost: HTMLElement;
  previewRating: HTMLElement;
  previewDetails: HTMLElement;
  previewActions: HTMLElement;
  toggleInfoPreview: HTMLButtonElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
    loginView: document.querySelector("#loginView"),
    viewerShell: document.querySelector("#viewerShell"),
    connectButtonHost: document.querySelector("#connectButtonHost"),
    connectMessageHost: document.querySelector("#connectMessageHost"),
    searchInput: document.querySelector("#searchInput"),
    tagChips: document.querySelector("#tagChips"),
    tagSuggestionsHost: document.querySelector("#tagSuggestionsHost"),
    resetFiltersButtonHost: document.querySelector("#resetFiltersButtonHost"),
    toggleFiltersButtonHost: document.querySelector("#toggleFiltersButtonHost"),
    advancedFilters: document.querySelector("#advancedFilters"),
    folderSelect: document.querySelector("#folderSelect"),
    extSelect: document.querySelector("#extSelect"),
    ratingSelect: document.querySelector("#ratingSelect"),
    pageSizeSelect: document.querySelector("#pageSizeSelect"),
    resultsStatusHost: document.querySelector("#resultsStatusHost"),
    libraryFooterNameHost: document.querySelector("#libraryFooterNameHost"),
    resultGridHost: document.querySelector("#resultGridHost"),
    tilesSentinelHost: document.querySelector("#tilesSentinelHost"),
    pagerHost: document.querySelector("#pagerHost"),
    template: document.querySelector("#cardTemplate"),
    dialog: document.querySelector("#previewDialog"),
    previewMetaHost: document.querySelector("#previewMetaHost"),
    previewBody: document.querySelector("#previewBody"),
    previewOriginalNameHost: document.querySelector("#previewOriginalNameHost"),
    previewRating: document.querySelector("#previewRating"),
    previewDetails: document.querySelector("#previewDetails"),
    previewActions: document.querySelector("#previewActions"),
    toggleInfoPreview: document.querySelector("#toggleInfoPreview"),
  };
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`Missing viewer element: ${name}`);
  }
  return elements as ViewerElements;
}
