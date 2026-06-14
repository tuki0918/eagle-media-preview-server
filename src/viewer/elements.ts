export interface ViewerElements {
  loginView: HTMLElement;
  viewerShell: HTMLElement;
  connectForm: HTMLFormElement;
  connectButton: HTMLButtonElement;
  connectMessage: HTMLElement;
  searchInput: HTMLInputElement;
  tagChips: HTMLElement;
  tagSuggestions: HTMLElement;
  resetFiltersButton: HTMLButtonElement;
  toggleFiltersButton: HTMLButtonElement;
  advancedFilters: HTMLElement;
  folderSelect: HTMLSelectElement;
  extSelect: HTMLSelectElement;
  ratingSelect: HTMLSelectElement;
  pageSizeSelect: HTMLSelectElement;
  gridViewButton: HTMLButtonElement;
  tilesViewButton: HTMLButtonElement;
  tableViewButton: HTMLButtonElement;
  resultCount: HTMLElement;
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
  backPreview: HTMLButtonElement;
  previewOriginalName: HTMLElement;
  previewRating: HTMLElement;
  previewDetails: HTMLElement;
  previewActions: HTMLElement;
  toggleInfoPreview: HTMLButtonElement;
  fullscreenPreview: HTMLButtonElement;
  closePreview: HTMLButtonElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
    loginView: document.querySelector("#loginView"),
    viewerShell: document.querySelector("#viewerShell"),
    connectForm: document.querySelector("#connectForm"),
    connectButton: document.querySelector("#connectButton"),
    connectMessage: document.querySelector("#connectMessage"),
    searchInput: document.querySelector("#searchInput"),
    tagChips: document.querySelector("#tagChips"),
    tagSuggestions: document.querySelector("#tagSuggestions"),
    resetFiltersButton: document.querySelector("#resetFiltersButton"),
    toggleFiltersButton: document.querySelector("#toggleFiltersButton"),
    advancedFilters: document.querySelector("#advancedFilters"),
    folderSelect: document.querySelector("#folderSelect"),
    extSelect: document.querySelector("#extSelect"),
    ratingSelect: document.querySelector("#ratingSelect"),
    pageSizeSelect: document.querySelector("#pageSizeSelect"),
    gridViewButton: document.querySelector("#gridViewButton"),
    tilesViewButton: document.querySelector("#tilesViewButton"),
    tableViewButton: document.querySelector("#tableViewButton"),
    resultCount: document.querySelector("#resultCount"),
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
    backPreview: document.querySelector("#backPreview"),
    previewOriginalName: document.querySelector("#previewOriginalName"),
    previewRating: document.querySelector("#previewRating"),
    previewDetails: document.querySelector("#previewDetails"),
    previewActions: document.querySelector("#previewActions"),
    toggleInfoPreview: document.querySelector("#toggleInfoPreview"),
    fullscreenPreview: document.querySelector("#fullscreenPreview"),
    closePreview: document.querySelector("#closePreview"),
  };
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`Missing viewer element: ${name}`);
  }
  return elements as ViewerElements;
}
