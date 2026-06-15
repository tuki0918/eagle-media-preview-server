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
  canEditMetadata?: boolean;
  detailRows: readonly PreviewDetailRow[];
  folders: readonly EagleFolder[];
  item: EagleItem;
  onFolderSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  onSaveMetadata: (item: EagleItem, patch: { tags: string[]; folders: string[] }) => Promise<void>;
  onTagSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
}

interface MetadataChipEditorProps {
  inputLabel: string;
  kind: "tag" | "category";
  labelForValue: (value: string) => string;
  normalizeValue: (value: unknown) => string;
  onSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  placeholder: string;
  selected: string[];
  setSelected: (values: string[]) => void;
}

const textActionButtonClassName =
  "rounded-app border border-app-border bg-app-surface px-3 text-[13px] font-[680] text-app-accent hover:border-[rgba(37,99,235,0.22)] hover:bg-app-accent-soft hover:text-app-accent-strong";
const previewLabelClassName = "preview-detail-label text-xs font-normal text-app-muted";
const directFileLinkClassName =
  "direct-file-link preview-info-cta inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-3 whitespace-nowrap rounded-[10px] border border-app-accent bg-app-accent px-2 text-[15px] font-[760] leading-none text-white no-underline shadow-none hover:border-app-accent-strong hover:bg-app-accent-strong hover:text-white focus-visible:border-app-accent-strong focus-visible:bg-app-accent-strong focus-visible:text-white [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2]";
const previewDetailsSectionClassName = "preview-details-section grid gap-1.5 px-2 pt-1";
const previewDetailRowClassName =
  "preview-detail-row grid min-h-7 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-start gap-[18px] max-[540px]:gap-3";
const previewDetailValueClassName = "preview-detail-value min-w-0 text-sm leading-[1.35] text-[#0f172a] [overflow-wrap:anywhere] max-[540px]:text-[13px]";
const previewChipListClassName = "preview-chip-list flex flex-wrap gap-x-2.5 gap-y-2";
const previewChipClassName = "preview-chip inline-flex min-h-6 items-center rounded-app bg-[#e2e8f0] px-2 text-[11px] font-medium text-[#1e293b]";
const previewEditFormClassName = "preview-edit-form grid gap-2.5 border-t border-[rgba(148,163,184,0.18)] pt-1.5";
const previewEditRowClassName =
  "preview-edit-row grid min-h-8 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-start gap-[18px] max-[540px]:gap-3";
const previewChipEditorClassName = "preview-chip-editor relative grid w-full min-w-0 gap-2";
const previewEditChipListClassName = "preview-edit-chip-list flex min-h-0 flex-wrap gap-1.5";
const previewEditChipClassName = "preview-edit-chip inline-flex min-h-[26px] max-w-full items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.34)] bg-[#f8fafc] py-0 pl-[9px] pr-1.5 text-xs font-[560] text-[#0f172a]";
const previewChipInputClassName = "preview-chip-input min-h-[34px] w-full min-w-0 rounded-app border border-app-border bg-white px-2.5 text-base text-app-text focus:border-[rgba(37,99,235,0.58)] focus:outline focus:outline-2 focus:outline-[rgba(37,99,235,0.22)] min-[720px]:text-sm";
const previewChipSuggestionsClassName = "preview-chip-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[8] grid max-h-[184px] overflow-auto rounded-app border border-[rgba(148,163,184,0.28)] bg-white p-1 shadow-[0_16px_36px_rgba(15,23,42,0.16)]";
const previewChipSuggestionClassName = "preview-chip-suggestion flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2 text-left text-[13px] text-[#0f172a] hover:bg-[#eff6ff] focus-visible:bg-[#eff6ff] focus-visible:outline-none";

export function PreviewDetailsPanel({ canEditMetadata = false, detailRows, folders, item, onFolderSuggestions, onSaveMetadata, onTagSuggestions }: PreviewInfoProps) {
  return (
    <section className={previewDetailsSectionClassName}>
      {detailRows.map((row) => (
        <PreviewDetail key={row.label} {...row} />
      ))}
      {canEditMetadata ? (
        <PreviewMetadataEditor
          key={String(item.id || item.name || "")}
          folders={folders}
          item={item}
          onFolderSuggestions={onFolderSuggestions}
          onSaveMetadata={onSaveMetadata}
          onTagSuggestions={onTagSuggestions}
        />
      ) : (
        <PreviewMetadataSummary folders={folders} item={item} />
      )}
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
    <a className={directFileLinkClassName} href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
      <ExternalLinkIcon />
      Open file
    </a>
  );
}

function PreviewDetail({ chips = false, label, value }: PreviewDetailRow) {
  return (
    <div className={previewDetailRowClassName}>
      <span className={previewLabelClassName}>{label}</span>
      <div className={previewDetailValueClassName}>{chips ? <PreviewChipList values={value} /> : value}</div>
    </div>
  );
}

function PreviewChipList({ values }: { values: string | readonly string[] }) {
  const chipValues = Array.isArray(values) ? values : [values];
  return (
    <div className={previewChipListClassName}>
      {chipValues.map((value, index) => (
        <span key={`${value}-${index}`} className={previewChipClassName}>
          {String(value || "")}
        </span>
      ))}
    </div>
  );
}

function PreviewMetadataSummary({ folders, item }: { folders: readonly EagleFolder[]; item: EagleItem }) {
  const tags = tagValues(item.tags);
  const categories = categoryValues(item.folders).map((value) => folderLabel(value, folders));
  if (!tags.length && !categories.length) return null;
  return (
    <>
      {tags.length ? <PreviewDetail label="Tags" value={tags} chips /> : null}
      {categories.length ? <PreviewDetail label="Categories" value={categories} chips /> : null}
    </>
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
  const initialTags = tagValues(item.tags);
  const initialCategories = categoryValues(item.folders);
  const [tags, setTags] = useState(() => initialTags);
  const [categories, setCategories] = useState(() => initialCategories);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const hasMetadataChanges = !sameStringValues(tags, initialTags) || !sameStringValues(categories, initialCategories);

  useEffect(() => {
    if (hasMetadataChanges && status === "Saved") setStatus("");
  }, [hasMetadataChanges, status]);

  const submitMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasMetadataChanges) return;
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
    <form className={previewEditFormClassName} onSubmit={submitMetadata}>
      <PreviewEditField label="Tags">
        <MetadataChipEditor
          kind="tag"
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
          selected={categories}
          setSelected={setCategories}
          placeholder="Add category"
          inputLabel="Add category"
          labelForValue={(value) => folderLabel(value, folders)}
          onSuggestions={onFolderSuggestions}
          normalizeValue={(value) => String(value || "").trim()}
        />
      </PreviewEditField>
      <div className="preview-edit-actions flex items-center justify-end gap-2.5">
        <button type="submit" className={`${textActionButtonClassName} preview-edit-save min-h-[34px] px-3`} disabled={saving || !hasMetadataChanges}>
          Save
        </button>
        <span className="preview-edit-status min-w-0 text-xs text-app-muted" role="status">
          {status}
        </span>
      </div>
    </form>
  );
}

function MetadataChipEditor({
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
      className={previewChipEditorClassName}
      data-kind={kind}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        window.setTimeout(hideSuggestions, 120);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={previewEditChipListClassName}>
        {selected.map((value) => (
          <span key={value} className={previewEditChipClassName}>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{labelForValue(value)}</span>
            <button className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[#64748b] hover:bg-[#e2e8f0] hover:text-[#0f172a] [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]" type="button" title={`Remove ${labelForValue(value)}`} aria-label={`Remove ${labelForValue(value)}`} onClick={() => removeValue(value)}>
              <XIcon />
            </button>
          </span>
        ))}
      </div>
      <div className="preview-chip-input-wrap relative">
        <input
          className={previewChipInputClassName}
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
        <div className={previewChipSuggestionsClassName} role="listbox" hidden={!suggestionsOpen}>
          {suggestions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={previewChipSuggestionClassName}
              role="option"
              onPointerDown={(event) => {
                event.preventDefault();
                addValue(item.value);
              }}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
              {item.meta ? <span className="preview-chip-suggestion-meta flex-none text-[11px] text-app-muted">{item.meta}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewEditField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className={previewEditRowClassName}>
      <span className={previewLabelClassName}>{label}</span>
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

function sameStringValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
