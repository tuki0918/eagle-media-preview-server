export interface ViewerElements {
  loginView: HTMLElement;
  viewerShell: HTMLElement;
  connectButton: HTMLButtonElement;
  connectMessage: HTMLElement;
  searchInput: HTMLInputElement;
  tagChips: HTMLElement;
  tagSuggestions: HTMLElement;
  resetFiltersButtonHost: HTMLElement;
  toggleFiltersButtonHost: HTMLElement;
  advancedFilters: HTMLElement;
  folderSelect: HTMLSelectElement;
  extSelect: HTMLSelectElement;
  ratingSelect: HTMLSelectElement;
  pageSizeSelect: HTMLSelectElement;
  resultsStatusHost: HTMLElement;
  libraryFooterName: HTMLElement;
  grid: HTMLElement;
  tilesSentinel: HTMLElement;
  pager: HTMLElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  pageButtons: HTMLElement;
  template: HTMLTemplateElement;
  dialog: HTMLDialogElement;
  previewMeta: HTMLElement;
  previewBody: HTMLElement;
  previewOriginalName: HTMLElement;
  previewRating: HTMLElement;
  previewDetails: HTMLElement;
  previewActions: HTMLElement;
  toggleInfoPreview: HTMLButtonElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
    loginView: document.querySelector("#loginView"),
    viewerShell: document.querySelector("#viewerShell"),
    connectButton: document.querySelector("#connectButton"),
    connectMessage: document.querySelector("#connectMessage"),
    searchInput: document.querySelector("#searchInput"),
    tagChips: document.querySelector("#tagChips"),
    tagSuggestions: document.querySelector("#tagSuggestions"),
    resetFiltersButtonHost: document.querySelector("#resetFiltersButtonHost"),
    toggleFiltersButtonHost: document.querySelector("#toggleFiltersButtonHost"),
    advancedFilters: document.querySelector("#advancedFilters"),
    folderSelect: document.querySelector("#folderSelect"),
    extSelect: document.querySelector("#extSelect"),
    ratingSelect: document.querySelector("#ratingSelect"),
    pageSizeSelect: document.querySelector("#pageSizeSelect"),
    resultsStatusHost: document.querySelector("#resultsStatusHost"),
    libraryFooterName: document.querySelector("#libraryFooterName"),
    grid: document.querySelector("#grid"),
    tilesSentinel: document.querySelector("#tilesSentinel"),
    pager: document.querySelector(".pager"),
    prevButton: document.querySelector("#prevButton"),
    nextButton: document.querySelector("#nextButton"),
    pageButtons: document.querySelector("#pageButtons"),
    template: document.querySelector("#cardTemplate"),
    dialog: document.querySelector("#previewDialog"),
    previewMeta: document.querySelector("#previewMeta"),
    previewBody: document.querySelector("#previewBody"),
    previewOriginalName: document.querySelector("#previewOriginalName"),
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
