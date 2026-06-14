import { debounce } from "./api";
import { iconNode } from "./icons";
import { uniqueValues, type MetadataSuggestion } from "./metadata";

export interface MetadataChipPickerOptions {
  kind: "tag" | "category";
  initialValues: readonly unknown[];
  placeholder: string;
  inputLabel: string;
  labelForValue: (value: string) => string;
  getSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  normalizeValue: (value: unknown) => string;
}

export interface MetadataChipPicker {
  element: HTMLElement;
  values: () => string[];
}

export function metadataChipPicker({
  kind,
  initialValues,
  placeholder,
  inputLabel,
  labelForValue,
  getSuggestions,
  normalizeValue,
}: MetadataChipPickerOptions): MetadataChipPicker {
  let selected = uniqueValues((initialValues || []).map(normalizeValue).filter(Boolean));
  let currentSuggestions: MetadataSuggestion[] = [];
  let requestId = 0;

  const wrapper = document.createElement("div");
  wrapper.className = "preview-chip-editor";
  wrapper.dataset.kind = kind;

  const chipList = document.createElement("div");
  chipList.className = "preview-edit-chip-list";

  const inputWrap = document.createElement("div");
  inputWrap.className = "preview-chip-input-wrap";

  const input = document.createElement("input");
  input.className = "preview-chip-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", inputLabel);
  input.setAttribute("autocomplete", "off");

  const suggestions = document.createElement("div");
  suggestions.className = "preview-chip-suggestions";
  suggestions.setAttribute("role", "listbox");
  suggestions.hidden = true;

  inputWrap.append(input, suggestions);
  wrapper.append(chipList, inputWrap);

  const addValue = (value: unknown) => {
    const normalized = normalizeValue(value);
    if (!normalized || selected.includes(normalized)) return;
    selected = [...selected, normalized];
    input.value = "";
    renderSelected();
    hideSuggestions();
  };

  const removeValue = (value: string) => {
    selected = selected.filter((entry) => entry !== value);
    renderSelected();
    updateSuggestions();
  };

  const hideSuggestions = () => {
    requestId += 1;
    suggestions.hidden = true;
    suggestions.replaceChildren();
    currentSuggestions = [];
  };

  const renderSuggestions = (items: MetadataSuggestion[]) => {
    currentSuggestions = items;
    if (!items.length) {
      suggestions.hidden = true;
      suggestions.replaceChildren();
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preview-chip-suggestion";
      button.setAttribute("role", "option");
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        addValue(item.value);
      });

      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(label);

      if (item.meta) {
        const meta = document.createElement("span");
        meta.className = "preview-chip-suggestion-meta";
        meta.textContent = item.meta;
        button.append(meta);
      }

      fragment.append(button);
    }
    suggestions.replaceChildren(fragment);
    suggestions.hidden = false;
  };

  const updateSuggestions = async () => {
    const query = input.value.trim();
    const currentRequest = ++requestId;
    try {
      const items = await getSuggestions(query, selected);
      if (currentRequest !== requestId) return;
      renderSuggestions(items);
    } catch {
      if (currentRequest === requestId) hideSuggestions();
    }
  };

  const renderSelected = () => {
    const fragment = document.createDocumentFragment();
    for (const value of selected) {
      const chip = document.createElement("span");
      chip.className = "preview-edit-chip";

      const label = document.createElement("span");
      label.textContent = labelForValue(value);

      const button = document.createElement("button");
      button.type = "button";
      button.title = `Remove ${label.textContent}`;
      button.setAttribute("aria-label", `Remove ${label.textContent}`);
      button.append(iconNode("x"));
      button.addEventListener("click", () => removeValue(value));

      chip.append(label, button);
      fragment.append(chip);
    }
    chipList.replaceChildren(fragment);
  };

  input.addEventListener("input", debounce(updateSuggestions, 160));
  input.addEventListener("pointerdown", updateSuggestions);
  input.addEventListener("focus", updateSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSuggestions();
      return;
    }
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = input.value.trim();
    if (value && kind === "tag") {
      addValue(value);
      return;
    }
    if (currentSuggestions[0]) addValue(currentSuggestions[0].value);
  });
  wrapper.addEventListener("focusout", (event) => {
    if (wrapper.contains(event.relatedTarget as Node | null)) return;
    window.setTimeout(hideSuggestions, 120);
  });
  wrapper.addEventListener("pointerdown", (event) => event.stopPropagation());

  renderSelected();

  return {
    element: wrapper,
    values: () => selected.slice(),
  };
}

export function previewEditField(label: string, control: Node) {
  const row = document.createElement("div");
  row.className = "preview-edit-row";
  const labelNode = document.createElement("span");
  labelNode.className = "preview-detail-label";
  labelNode.textContent = label;
  row.append(labelNode, control);
  return row;
}

export function previewEditActions(saveButton: HTMLButtonElement, status: HTMLElement) {
  const row = document.createElement("div");
  row.className = "preview-edit-actions";
  row.append(saveButton, status);
  return row;
}
