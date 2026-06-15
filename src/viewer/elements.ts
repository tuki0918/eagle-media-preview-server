export interface ViewerElements {
  searchInputHost: HTMLElement;
  tagChips: HTMLElement;
  tagSuggestionsHost: HTMLElement;
  resetFiltersButtonHost: HTMLElement;
  toggleFiltersButtonHost: HTMLElement;
  advancedFiltersHost: HTMLElement;
  resultGridHost: HTMLElement;
  template: HTMLTemplateElement;
  dialog: HTMLDialogElement;
  previewBody: HTMLElement;
  previewRating: HTMLElement;
  previewDetails: HTMLElement;
  previewActions: HTMLElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
    searchInputHost: document.querySelector("#searchInputHost"),
    tagChips: document.querySelector("#tagChips"),
    tagSuggestionsHost: document.querySelector("#tagSuggestionsHost"),
    resetFiltersButtonHost: document.querySelector("#resetFiltersButtonHost"),
    toggleFiltersButtonHost: document.querySelector("#toggleFiltersButtonHost"),
    advancedFiltersHost: document.querySelector("#advancedFiltersHost"),
    resultGridHost: document.querySelector("#resultGridHost"),
    template: document.querySelector("#cardTemplate"),
    dialog: document.querySelector("#previewDialog"),
    previewBody: document.querySelector("#previewBody"),
    previewRating: document.querySelector("#previewRating"),
    previewDetails: document.querySelector("#previewDetails"),
    previewActions: document.querySelector("#previewActions"),
  };
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`Missing viewer element: ${name}`);
  }
  return elements as ViewerElements;
}
