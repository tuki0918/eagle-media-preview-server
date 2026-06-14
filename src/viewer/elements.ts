export interface ViewerElements {
  connectButtonHost: HTMLElement;
  connectMessageHost: HTMLElement;
  searchInputHost: HTMLElement;
  tagChips: HTMLElement;
  tagSuggestionsHost: HTMLElement;
  resetFiltersButtonHost: HTMLElement;
  toggleFiltersButtonHost: HTMLElement;
  advancedFiltersHost: HTMLElement;
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
}

export function getViewerElements(): ViewerElements {
  const elements = {
    connectButtonHost: document.querySelector("#connectButtonHost"),
    connectMessageHost: document.querySelector("#connectMessageHost"),
    searchInputHost: document.querySelector("#searchInputHost"),
    tagChips: document.querySelector("#tagChips"),
    tagSuggestionsHost: document.querySelector("#tagSuggestionsHost"),
    resetFiltersButtonHost: document.querySelector("#resetFiltersButtonHost"),
    toggleFiltersButtonHost: document.querySelector("#toggleFiltersButtonHost"),
    advancedFiltersHost: document.querySelector("#advancedFiltersHost"),
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
  };
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`Missing viewer element: ${name}`);
  }
  return elements as ViewerElements;
}
