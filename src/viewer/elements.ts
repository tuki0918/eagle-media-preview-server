export interface ViewerElements {
  template: HTMLTemplateElement;
  dialog: HTMLDialogElement;
}

export function getViewerElements(): ViewerElements {
  const elements = {
    template: document.querySelector("#cardTemplate"),
    dialog: document.querySelector("#previewDialog"),
  };
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`Missing viewer element: ${name}`);
  }
  return elements as ViewerElements;
}
