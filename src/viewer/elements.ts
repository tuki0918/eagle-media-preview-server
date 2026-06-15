export interface ViewerElements {
  template: HTMLTemplateElement;
  dialog: HTMLDialogElement;
  previewBody: HTMLElement;
  previewRating: HTMLElement;
  previewDetails: HTMLElement;
  previewActions: HTMLElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
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
