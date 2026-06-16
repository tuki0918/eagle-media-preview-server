import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../api";
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
  onSaveMetadata: (item: EagleItem, patch: { tags: string[]; folders: string[] }) => Promise<{ tags: string[]; folders: string[] }>;
  onTagSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
}

interface MetadataChipEditorProps {
  disabled?: boolean;
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
  "rounded-lg px-3 text-[13px] font-[680]";
const previewLabelClassName = "preview-detail-label text-xs font-normal text-muted-foreground";
const directFileLinkClassName =
  "direct-file-link preview-info-cta min-h-[52px] w-full cursor-pointer gap-3 whitespace-nowrap rounded-lg bg-primary px-2 text-[15px] font-[760] leading-none text-primary-foreground no-underline shadow-none hover:bg-primary hover:text-primary-foreground [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2]";
const previewDetailsSectionClassName = "preview-details-section grid gap-1.5 px-2 pt-1";
const previewDetailRowClassName =
  "preview-detail-row grid min-h-7 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-start gap-[18px] max-[540px]:gap-3";
const previewDetailValueClassName = "preview-detail-value min-w-0 text-sm leading-[1.35] text-foreground [overflow-wrap:anywhere] max-[540px]:text-[13px]";
const previewChipListClassName = "preview-chip-list flex flex-wrap gap-x-2.5 gap-y-2";
const previewChipClassName = "preview-chip inline-flex h-auto min-h-6 items-center rounded-lg bg-secondary px-2 text-[11px] font-medium text-secondary-foreground";
const previewEditFormClassName = "preview-edit-form grid gap-2.5 border-t border-border pt-1.5";
const previewEditRowClassName =
  "preview-edit-row grid min-h-8 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-start gap-[18px] max-[540px]:gap-3";
const previewChipEditorClassName = "preview-chip-editor relative grid w-full min-w-0 gap-2";
const previewEditChipListClassName = "preview-edit-chip-list flex min-h-0 flex-wrap gap-1.5";
const previewEditChipClassName = "preview-edit-chip inline-flex h-auto min-h-[26px] max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary py-0 pl-[9px] pr-1.5 text-xs font-[560] text-secondary-foreground";
const previewChipInputClassName = "preview-chip-input min-h-[34px] w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base text-foreground min-[720px]:text-sm";
const previewChipSuggestionsClassName = "preview-chip-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[8] grid max-h-[184px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm";
const previewChipSuggestionClassName = "preview-chip-suggestion flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2 text-left text-[13px] text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none";

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
    <div id="previewActions" className="preview-info-actions border-t border-border px-2 pt-3">
      {previewInfoState ? <PreviewActions item={previewInfoState.item} /> : null}
    </div>
  );
}

export function PreviewActions({ item }: { item: EagleItem }) {
  return (
    <Button asChild className={directFileLinkClassName}>
    <a href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
      <ExternalLinkIcon />
      Open file
    </a>
    </Button>
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
        <Badge key={`${value}-${index}`} variant="secondary" className={previewChipClassName}>
          {String(value || "")}
        </Badge>
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
  const [savedTags, setSavedTags] = useState(() => initialTags);
  const [savedCategories, setSavedCategories] = useState(() => initialCategories);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const hasMetadataChanges = !sameStringValues(tags, savedTags) || !sameStringValues(categories, savedCategories);

  useEffect(() => {
    if (hasMetadataChanges && status === "Saved") setStatus("");
  }, [hasMetadataChanges, status]);

  const submitMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasMetadataChanges) return;
    setSaving(true);
    setStatus("Saving");
    try {
      const saved = await onSaveMetadata(item, { tags, folders: categories });
      setTags(saved.tags);
      setCategories(saved.folders);
      setSavedTags(saved.tags);
      setSavedCategories(saved.folders);
      setStatus("Saved");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveButtonLabel = saving ? "Saving metadata" : hasMetadataChanges ? "Save metadata" : "No metadata changes";

  return (
    <form className={previewEditFormClassName} aria-busy={saving} onSubmit={submitMetadata}>
      <PreviewEditField label="Tags">
        <MetadataChipEditor
          disabled={saving}
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
          disabled={saving}
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
        <Button type="submit" variant="outline" className={`${textActionButtonClassName} preview-edit-save min-h-[34px] px-3`} aria-label={saveButtonLabel} title={saveButtonLabel} disabled={saving || !hasMetadataChanges}>
          {saving ? "Saving" : "Save"}
        </Button>
        <span className="preview-edit-status min-w-0 text-xs text-muted-foreground" role="status">
          {status}
        </span>
      </div>
    </form>
  );
}

function MetadataChipEditor({
  disabled = false,
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  const clearDebounceTimer = () => {
    if (!debounceTimer.current) return;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
  };

  const hideSuggestions = () => {
    requestId.current += 1;
    setSuggestions([]);
    setSuggestionsOpen(false);
  };

  useEffect(() => {
    return () => {
      requestId.current += 1;
      clearDebounceTimer();
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    requestId.current += 1;
    clearDebounceTimer();
    setSuggestions([]);
    setSuggestionsOpen(false);
  }, [disabled]);

  const updateSuggestions = async (nextQuery = query, nextSelected = selected) => {
    if (disabled) return;
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
    if (disabled) return;
    clearDebounceTimer();
    debounceTimer.current = window.setTimeout(() => updateSuggestions(nextQuery), 160);
  };

  const addValue = (value: unknown) => {
    if (disabled) return;
    const normalized = normalizeValue(value);
    if (!normalized || selected.includes(normalized)) return;
    const nextSelected = [...selected, normalized];
    setSelected(nextSelected);
    setQuery("");
    if (inputRef.current) inputRef.current.value = "";
    hideSuggestions();
  };

  const removeValue = (value: string) => {
    if (disabled) return;
    const nextSelected = selected.filter((entry) => entry !== value);
    setSelected(nextSelected);
    updateSuggestions(query, nextSelected);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    if (event.key === "Escape") {
      hideSuggestions();
      return;
    }
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = ((event.currentTarget as HTMLInputElement | null)?.value || "").trim() || query.trim();
    if (value && kind === "tag") {
      addValue(value);
      return;
    }
    if (suggestions[0]) addValue(suggestions[0].value);
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleInput = () => {
      setQuery(input.value);
      queueSuggestions(input.value);
    };
    const handleFocus = () => updateSuggestions();
    const handlePointerDown = () => updateSuggestions();
    input.addEventListener("input", handleInput);
    input.addEventListener("keydown", handleKeyDown);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("pointerdown", handlePointerDown);
    return () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleKeyDown);
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("pointerdown", handlePointerDown);
    };
  });

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
          <Badge key={value} variant="outline" className={previewEditChipClassName}>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{labelForValue(value)}</span>
            <Button className="size-[18px] cursor-pointer rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]" variant="ghost" size="icon-xs" type="button" title={`Remove ${labelForValue(value)}`} aria-label={`Remove ${labelForValue(value)}`} disabled={disabled} onClick={() => removeValue(value)}>
              <XIcon />
            </Button>
          </Badge>
        ))}
      </div>
      <div className="preview-chip-input-wrap relative">
        <input
          ref={inputRef}
          className={previewChipInputClassName}
          type="text"
          placeholder={placeholder}
          aria-label={inputLabel}
          autoComplete="off"
          disabled={disabled}
          defaultValue=""
        />
        <div className={previewChipSuggestionsClassName} role="listbox" hidden={!suggestionsOpen}>
          {suggestions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={previewChipSuggestionClassName}
              role="option"
              disabled={disabled}
              onPointerDown={(event) => {
                event.preventDefault();
                addValue(item.value);
              }}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
              {item.meta ? <span className="preview-chip-suggestion-meta flex-none text-[11px] text-muted-foreground">{item.meta}</span> : null}
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
  return uniqueValues(itemTags({ tags: value }));
}

function categoryValues(value: unknown) {
  return uniqueValues(folderIds(value));
}

function sameStringValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
