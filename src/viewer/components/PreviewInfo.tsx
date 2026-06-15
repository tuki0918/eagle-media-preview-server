import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { directFileUrl } from "../fileLinks";
import { folderIds, itemTags } from "../format";
import { uniqueValues, type MetadataSuggestion } from "../metadata";
import { getPreviewInfoState, subscribePreviewInfoState } from "../previewInfoState";
import type { EagleFolder, EagleItem } from "../types";

export interface PreviewDetailRow {
  label: string;
  value: string | readonly string[];
  chips?: boolean;
}

export interface PreviewInfoProps {
  detailRows: readonly PreviewDetailRow[];
  folders: readonly EagleFolder[];
  item: EagleItem;
  onFolderSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  onSaveMetadata: (item: EagleItem, patch: { tags: string[]; folders: string[] }) => Promise<void>;
  onTagSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
}

interface MetadataChipEditorProps {
  initialValues: readonly unknown[];
  inputLabel: string;
  kind: "tag" | "category";
  labelForValue: (value: string) => string;
  normalizeValue: (value: unknown) => string;
  onSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  placeholder: string;
  selected: string[];
  setSelected: (values: string[]) => void;
}

export function PreviewDetailsPanel({ detailRows, folders, item, onFolderSuggestions, onSaveMetadata, onTagSuggestions }: PreviewInfoProps) {
  return (
    <section className="preview-details-section">
      {detailRows.map((row) => (
        <PreviewDetail key={row.label} {...row} />
      ))}
      <PreviewMetadataEditor
        key={String(item.id || item.name || "")}
        folders={folders}
        item={item}
        onFolderSuggestions={onFolderSuggestions}
        onSaveMetadata={onSaveMetadata}
        onTagSuggestions={onTagSuggestions}
      />
    </section>
  );
}

export function PreviewInfoDetails() {
  const previewInfoState = useSyncExternalStore(subscribePreviewInfoState, getPreviewInfoState, getPreviewInfoState);
  return (
    <div id="previewDetails" className="preview-details grid gap-2.5">
      {previewInfoState ? <PreviewDetailsPanel {...previewInfoState} /> : null}
    </div>
  );
}

export function PreviewInfoActions() {
  const previewInfoState = useSyncExternalStore(subscribePreviewInfoState, getPreviewInfoState, getPreviewInfoState);
  return (
    <div id="previewActions" className="preview-info-actions border-t border-[rgba(148,163,184,0.22)] px-2 pt-3">
      {previewInfoState ? <PreviewActions item={previewInfoState.item} /> : null}
    </div>
  );
}

export function PreviewActions({ item }: { item: EagleItem }) {
  return (
    <a className="direct-file-link preview-info-cta" href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
      <ExternalLinkIcon />
      Open file
    </a>
  );
}

function PreviewDetail({ chips = false, label, value }: PreviewDetailRow) {
  return (
    <div className="preview-detail-row">
      <span className="preview-detail-label">{label}</span>
      <div className="preview-detail-value">{chips ? <PreviewChipList values={value} /> : value}</div>
    </div>
  );
}

function PreviewChipList({ values }: { values: string | readonly string[] }) {
  const chipValues = Array.isArray(values) ? values : [values];
  return (
    <div className="preview-chip-list">
      {chipValues.map((value, index) => (
        <span key={`${value}-${index}`} className="preview-chip">
          {String(value || "")}
        </span>
      ))}
    </div>
  );
}

function PreviewMetadataEditor({
  folders,
  item,
  onFolderSuggestions,
  onSaveMetadata,
  onTagSuggestions,
}: {
  folders: readonly EagleFolder[];
  item: EagleItem;
  onFolderSuggestions: PreviewInfoProps["onFolderSuggestions"];
  onSaveMetadata: PreviewInfoProps["onSaveMetadata"];
  onTagSuggestions: PreviewInfoProps["onTagSuggestions"];
}) {
  const [tags, setTags] = useState(() => tagValues(item.tags));
  const [categories, setCategories] = useState(() => categoryValues(item.folders));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const submitMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatus("Saving");
    try {
      await onSaveMetadata(item, { tags, folders: categories });
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="preview-edit-form" onSubmit={submitMetadata}>
      <PreviewEditField label="Tags">
        <MetadataChipEditor
          kind="tag"
          initialValues={tags}
          selected={tags}
          setSelected={setTags}
          placeholder="Add tag"
          inputLabel="Add tag"
          labelForValue={(value) => value}
          onSuggestions={onTagSuggestions}
          normalizeValue={(value) => String(value || "").trim()}
        />
      </PreviewEditField>
      <PreviewEditField label="Categories">
        <MetadataChipEditor
          kind="category"
          initialValues={categories}
          selected={categories}
          setSelected={setCategories}
          placeholder="Add category"
          inputLabel="Add category"
          labelForValue={(value) => folderLabel(value, folders)}
          onSuggestions={onFolderSuggestions}
          normalizeValue={(value) => String(value || "").trim()}
        />
      </PreviewEditField>
      <div className="preview-edit-actions">
        <button type="submit" className="text-button preview-edit-save" disabled={saving}>
          Save
        </button>
        <span className="preview-edit-status" role="status">
          {status}
        </span>
      </div>
    </form>
  );
}

function MetadataChipEditor({
  initialValues,
  inputLabel,
  kind,
  labelForValue,
  normalizeValue,
  onSuggestions,
  placeholder,
  selected,
  setSelected,
}: MetadataChipEditorProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MetadataSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    setSelected(uniqueValues(initialValues.map(normalizeValue).filter(Boolean)));
  }, []);

  const hideSuggestions = () => {
    requestId.current += 1;
    setSuggestions([]);
    setSuggestionsOpen(false);
  };

  const updateSuggestions = async (nextQuery = query, nextSelected = selected) => {
    const currentRequest = ++requestId.current;
    try {
      const items = await onSuggestions(nextQuery.trim(), nextSelected);
      if (currentRequest !== requestId.current) return;
      setSuggestions(items);
      setSuggestionsOpen(items.length > 0);
    } catch {
      if (currentRequest === requestId.current) hideSuggestions();
    }
  };

  const queueSuggestions = (nextQuery: string) => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => updateSuggestions(nextQuery), 160);
  };

  const addValue = (value: unknown) => {
    const normalized = normalizeValue(value);
    if (!normalized || selected.includes(normalized)) return;
    const nextSelected = [...selected, normalized];
    setSelected(nextSelected);
    setQuery("");
    hideSuggestions();
  };

  const removeValue = (value: string) => {
    const nextSelected = selected.filter((entry) => entry !== value);
    setSelected(nextSelected);
    updateSuggestions(query, nextSelected);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      hideSuggestions();
      return;
    }
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = query.trim();
    if (value && kind === "tag") {
      addValue(value);
      return;
    }
    if (suggestions[0]) addValue(suggestions[0].value);
  };

  return (
    <div
      className="preview-chip-editor"
      data-kind={kind}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        window.setTimeout(hideSuggestions, 120);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="preview-edit-chip-list">
        {selected.map((value) => (
          <span key={value} className="preview-edit-chip">
            <span>{labelForValue(value)}</span>
            <button type="button" title={`Remove ${labelForValue(value)}`} aria-label={`Remove ${labelForValue(value)}`} onClick={() => removeValue(value)}>
              <XIcon />
            </button>
          </span>
        ))}
      </div>
      <div className="preview-chip-input-wrap">
        <input
          className="preview-chip-input"
          type="text"
          placeholder={placeholder}
          aria-label={inputLabel}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            queueSuggestions(event.currentTarget.value);
          }}
          onFocus={() => updateSuggestions()}
          onKeyDown={handleKeyDown}
          onPointerDown={() => updateSuggestions()}
        />
        <div className="preview-chip-suggestions" role="listbox" hidden={!suggestionsOpen}>
          {suggestions.map((item) => (
            <button
              key={item.value}
              type="button"
              className="preview-chip-suggestion"
              role="option"
              onPointerDown={(event) => {
                event.preventDefault();
                addValue(item.value);
              }}
            >
              <span>{item.label}</span>
              {item.meta ? <span className="preview-chip-suggestion-meta">{item.meta}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewEditField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="preview-edit-row">
      <span className="preview-detail-label">{label}</span>
      {children}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function folderLabel(id: string, folders: readonly EagleFolder[]) {
  const folder = folders.find((entry) => entry.id === id);
  if (!folder) return id;
  return `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name}`;
}

function tagValues(value: unknown) {
  return itemTags({ tags: value });
}

function categoryValues(value: unknown) {
  return folderIds(value);
}
