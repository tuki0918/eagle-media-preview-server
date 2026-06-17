import { useEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, PencilIcon, SearchIcon, TagIcon, XIcon } from "lucide-react";
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
  canManageLibrary?: boolean;
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
const previewEditFormClassName = "preview-edit-form grid gap-3 border-t border-border pt-3";
const previewEditRowClassName =
  "preview-edit-row grid min-h-8 gap-2";
const previewChipEditorClassName = "preview-chip-editor relative grid w-full min-w-0 gap-2";
const previewEditChipListClassName = "preview-edit-chip-list flex min-h-0 flex-wrap gap-1.5";
const previewEditChipClassName = "preview-edit-chip inline-flex h-auto min-h-[28px] max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary py-0 pl-[9px] pr-1.5 text-xs font-[560] text-secondary-foreground";
const previewChipInputClassName = "preview-chip-input min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground min-[720px]:text-sm";
const previewChipSuggestionsClassName = "preview-chip-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[8] grid max-h-[260px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm max-[540px]:max-h-[32dvh] max-[540px]:rounded-lg";
const previewChipSuggestionClassName = "preview-chip-suggestion flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-[13px] text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none";
const previewMetadataRowClassName = "preview-metadata-row grid gap-1.5";
const previewMetadataHeaderClassName = "flex min-h-8 items-center justify-between gap-3";
const previewMetadataLabelClassName = "text-xs font-normal text-muted-foreground";
const previewMetadataEmptyClassName = "text-[13px] leading-[1.35] text-muted-foreground";

interface FolderChecklistItem {
  depth: number;
  label: string;
  value: string;
}

interface FolderChecklistSections {
  allFolders: FolderChecklistItem[];
  recent: FolderChecklistItem[];
}

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
      {previewInfoState ? <PreviewActions canManageLibrary={previewInfoState.canManageLibrary} item={previewInfoState.item} /> : null}
    </div>
  );
}

export function PreviewActions({ canManageLibrary = false, item }: { canManageLibrary?: boolean; item: EagleItem }) {
  if (!canManageLibrary) return null;

  return (
    <section className="preview-admin-actions grid gap-2">
      <Button asChild className={directFileLinkClassName}>
        <a href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
          <ExternalLinkIcon />
          Open file
        </a>
      </Button>
    </section>
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
      {categories.length ? <PreviewDetail label="Folders" value={categories} chips /> : null}
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
  const [editing, setEditing] = useState(false);
  const hasMetadataChanges = !sameStringValues(tags, savedTags) || !sameStringValues(categories, savedCategories);
  const changeCount = Number(!sameStringValues(tags, savedTags)) + Number(!sameStringValues(categories, savedCategories));

  useEffect(() => {
    if (hasMetadataChanges && status === "Saved") setStatus("");
  }, [hasMetadataChanges, status]);

  const cancelMetadataChanges = () => {
    if (saving) return;
    setTags(savedTags);
    setCategories(savedCategories);
    setStatus("");
    setEditing(false);
  };

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
      setEditing(false);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveButtonLabel = saving ? "Saving metadata" : hasMetadataChanges ? "Save metadata" : "No metadata changes";

  if (!editing) {
    return (
      <section className="preview-metadata-summary grid gap-3 border-t border-border pt-3">
        <div className={previewMetadataHeaderClassName}>
          <span className={previewMetadataLabelClassName}>Metadata</span>
          <Button
            type="button"
            variant="outline"
            className={`${textActionButtonClassName} preview-edit-toggle min-h-8 gap-1.5 px-2.5`}
            onClick={() => {
              setStatus("");
              setEditing(true);
            }}
          >
            <PencilIcon aria-hidden="true" />
            Edit
          </Button>
        </div>
        <MetadataReadOnlyRow label="Tags" values={savedTags} emptyLabel="No tags" />
        <MetadataReadOnlyRow label="Folders" values={savedCategories.map((value) => folderLabel(value, folders))} emptyLabel="No folders" />
        {status ? (
          <span className="preview-edit-status min-w-0 text-xs text-muted-foreground" role="status">
            {status}
          </span>
        ) : null}
      </section>
    );
  }

  return (
    <form className={previewEditFormClassName} aria-busy={saving} onSubmit={submitMetadata}>
      <div className={previewMetadataHeaderClassName}>
        <span className={previewMetadataLabelClassName}>Metadata</span>
        {!hasMetadataChanges ? (
          <Button type="button" variant="outline" className={`${textActionButtonClassName} preview-edit-done min-h-8 px-2.5`} disabled={saving} onClick={() => setEditing(false)}>
            Done
          </Button>
        ) : null}
      </div>
      <PreviewEditField label="Tags">
        <TagChipEditor
          disabled={saving}
          selected={tags}
          setSelected={setTags}
          placeholder="Add tag"
          inputLabel="Add tag"
          labelForValue={(value) => value}
          onSuggestions={onTagSuggestions}
          normalizeValue={(value) => String(value || "").trim()}
        />
      </PreviewEditField>
      <PreviewEditField label="Folders">
        <FolderChecklistEditor
          disabled={saving}
          selected={categories}
          setSelected={setCategories}
          folders={folders}
          onSuggestions={onFolderSuggestions}
        />
      </PreviewEditField>
      {hasMetadataChanges || saving ? (
        <div className="preview-edit-actions sticky bottom-0 z-[7] -mx-2 mt-1 flex min-h-[48px] items-center justify-end gap-2.5 border-t border-border bg-card/95 px-2 py-2 backdrop-blur max-[540px]:bottom-[env(safe-area-inset-bottom)]">
          <span className="preview-edit-status min-w-0 text-xs text-muted-foreground" role="status">
            {saving ? "Saving" : `${changeCount} ${changeCount === 1 ? "change" : "changes"}`}
          </span>
          <Button type="button" variant="outline" className={`${textActionButtonClassName} preview-edit-cancel min-h-9 px-3`} disabled={saving} onClick={cancelMetadataChanges}>
            Cancel
          </Button>
          <Button type="submit" className={`${textActionButtonClassName} preview-edit-save min-h-9 px-3`} aria-label={saveButtonLabel} title={saveButtonLabel} disabled={saving || !hasMetadataChanges}>
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function MetadataReadOnlyRow({ emptyLabel, label, values }: { emptyLabel: string; label: string; values: string[] }) {
  return (
    <div className={previewMetadataRowClassName}>
      <span className={previewMetadataLabelClassName}>{label}</span>
      {values.length ? <PreviewChipList values={values} /> : <span className={previewMetadataEmptyClassName}>{emptyLabel}</span>}
    </div>
  );
}

function TagChipEditor({
  disabled = false,
  inputLabel,
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
      const selectedSet = new Set(nextSelected);
      const visibleItems = items.filter((item) => !selectedSet.has(normalizeValue(item.value)));
      setSuggestions(visibleItems);
      setSuggestionsOpen(visibleItems.length > 0 || nextQuery.trim().length > 0);
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

  const addInputValues = (rawValue: string) => {
    const values = rawValue.split(",").map(normalizeValue).filter(Boolean);
    if (!values.length) return;
    const nextSelected = [...selected];
    for (const value of values) {
      if (!nextSelected.includes(value)) nextSelected.push(value);
    }
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      hideSuggestions();
      return;
    }
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addInputValues(event.currentTarget.value || query);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes(",")) return;
    event.preventDefault();
    addInputValues(text);
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleInput = () => {
      setQuery(input.value);
      queueSuggestions(input.value);
    };
    const handleNativeKeyDown = (event: globalThis.KeyboardEvent) => {
      if (disabled) return;
      if (event.key === "Escape") {
        hideSuggestions();
        return;
      }
      if (event.key !== "Enter" && event.key !== ",") return;
      event.preventDefault();
      addInputValues(input.value);
    };
    const handleNativePaste = (event: globalThis.ClipboardEvent) => {
      const text = event.clipboardData?.getData("text") || "";
      if (!text.includes(",")) return;
      event.preventDefault();
      addInputValues(text);
    };
    const handleFocus = () => updateSuggestions(input.value);
    input.addEventListener("input", handleInput);
    input.addEventListener("keydown", handleNativeKeyDown);
    input.addEventListener("paste", handleNativePaste);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("pointerdown", handleFocus);
    return () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleNativeKeyDown);
      input.removeEventListener("paste", handleNativePaste);
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("pointerdown", handleFocus);
    };
  });

  return (
    <div
      className={previewChipEditorClassName}
      data-kind="tag"
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
              <XIcon aria-hidden="true" />
            </Button>
          </Badge>
        ))}
      </div>
      <div className="preview-chip-input-wrap relative">
        <TagIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          className={`${previewChipInputClassName} pl-9`}
          type="text"
          placeholder={placeholder}
          aria-label={inputLabel}
          autoComplete="off"
          disabled={disabled}
          defaultValue=""
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            queueSuggestions(event.currentTarget.value);
          }}
          onFocus={() => updateSuggestions()}
          onPointerDown={() => updateSuggestions()}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <div className={previewChipSuggestionsClassName} role="listbox" hidden={!suggestionsOpen}>
          {suggestions.length ? suggestions.map((item) => (
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
              {item.meta ? <span className="preview-chip-suggestion-meta flex-none rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.meta}</span> : null}
            </button>
          )) : (
            <div className="preview-chip-suggestion-empty px-2.5 py-2 text-[12px] leading-snug text-muted-foreground">
              Press Enter to add this tag.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderChecklistEditor({
  disabled = false,
  folders,
  onSuggestions,
  selected,
  setSelected,
}: {
  disabled?: boolean;
  folders: readonly EagleFolder[];
  onSuggestions: PreviewInfoProps["onFolderSuggestions"];
  selected: string[];
  setSelected: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MetadataSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  const clearDebounceTimer = () => {
    if (!debounceTimer.current) return;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
  };

  const updateSuggestions = async (nextQuery = query, nextSelected = selected) => {
    if (disabled) return;
    const currentRequest = ++requestId.current;
    try {
      const items = await onSuggestions(nextQuery.trim(), nextSelected);
      if (currentRequest !== requestId.current) return;
      setSuggestions(items);
    } catch {
      if (currentRequest === requestId.current) setSuggestions([]);
    }
  };

  const queueSuggestions = (nextQuery: string) => {
    clearDebounceTimer();
    debounceTimer.current = window.setTimeout(() => updateSuggestions(nextQuery), 120);
  };

  useEffect(() => {
    updateSuggestions();
    return () => {
      requestId.current += 1;
      clearDebounceTimer();
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    requestId.current += 1;
    clearDebounceTimer();
  }, [disabled]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleInput = () => {
      setQuery(input.value);
      queueSuggestions(input.value);
    };
    const handleFocus = () => updateSuggestions(input.value);
    input.addEventListener("input", handleInput);
    input.addEventListener("focus", handleFocus);
    return () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("focus", handleFocus);
    };
  });

  const toggleFolder = (folderId: string) => {
    if (disabled) return;
    const nextSelected = selected.includes(folderId)
      ? selected.filter((value) => value !== folderId)
      : [...selected, folderId];
    setSelected(nextSelected);
    updateSuggestions(query, nextSelected);
  };

  const selectedFolders = selected.map((value) => ({ value, label: folderLabel(value, folders) }));
  const folderSections = folderChecklistSections({
    folders,
    query,
    suggestions,
  });
  const hasFolderMatches = folderSections.recent.length > 0 || folderSections.allFolders.length > 0;

  return (
    <div className="preview-folder-editor grid gap-2" onPointerDown={(event) => event.stopPropagation()}>
      {selectedFolders.length ? (
        <div className={previewEditChipListClassName}>
          {selectedFolders.map((item) => (
            <Badge key={item.value} variant="outline" className={previewEditChipClassName}>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
              <Button className="size-[18px] cursor-pointer rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-[13px] [&_svg]:w-[13px]" variant="ghost" size="icon-xs" type="button" title={`Remove ${item.label}`} aria-label={`Remove ${item.label}`} disabled={disabled} onClick={() => toggleFolder(item.value)}>
                <XIcon aria-hidden="true" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
      <label className="preview-folder-search relative block">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          className={`${previewChipInputClassName} pl-9`}
          type="text"
          placeholder="Search folders"
          aria-label="Search folders"
          autoComplete="off"
          disabled={disabled}
          defaultValue=""
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            queueSuggestions(event.currentTarget.value);
          }}
          onFocus={() => updateSuggestions()}
        />
      </label>
      <div className="preview-folder-list grid max-h-[260px] overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-sm max-[540px]:max-h-[38dvh]" role="listbox" aria-label="Folder checklist">
        {folderSections.recent.length ? (
          <div className="preview-folder-section grid gap-0.5 pb-1">
            <span className="preview-folder-section-label px-2.5 py-1 text-[11px] font-[680] text-muted-foreground">Recent</span>
            {folderSections.recent.map((item) => (
              <FolderChecklistOption
                key={`recent-${item.value}`}
                checked={selected.includes(item.value)}
                disabled={disabled}
                item={item}
                onToggle={toggleFolder}
              />
            ))}
          </div>
        ) : null}
        {folderSections.allFolders.length ? (
          <div className={`preview-folder-section grid gap-0.5 ${folderSections.recent.length ? "border-t border-border pt-1" : ""}`}>
            <span className="preview-folder-section-label px-2.5 py-1 text-[11px] font-[680] text-muted-foreground">All folders</span>
            {folderSections.allFolders.map((item) => (
              <FolderChecklistOption
                key={`folder-${item.value}`}
                checked={selected.includes(item.value)}
                disabled={disabled}
                item={item}
                onToggle={toggleFolder}
              />
            ))}
          </div>
        ) : null}
        {query.trim() && !hasFolderMatches ? (
          <div className="preview-chip-suggestion-empty px-2.5 py-3 text-[12px] leading-snug text-muted-foreground">
            No matching folder. Create folders in Eagle first.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FolderChecklistOption({
  checked,
  disabled,
  item,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  item: FolderChecklistItem;
  onToggle: (folderId: string) => void;
}) {
  return (
    <button
      type="button"
      className="preview-folder-option grid min-h-10 grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[13px] text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
      role="option"
      aria-selected={checked}
      disabled={disabled}
      onClick={() => onToggle(item.value)}
      style={{ paddingLeft: `${10 + item.depth * 14}px` }}
    >
      <span className={`inline-grid size-4 place-items-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-transparent"}`}>
        <CheckIcon className="size-3" aria-hidden="true" />
      </span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
    </button>
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

function folderLabel(id: string, folders: readonly EagleFolder[]) {
  const folder = folders.find((entry) => entry.id === id);
  if (!folder) return id;
  return folder.name;
}

function folderChecklistSections({
  folders,
  query,
  suggestions,
}: {
  folders: readonly EagleFolder[];
  query: string;
  suggestions: readonly MetadataSuggestion[];
}): FolderChecklistSections {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const toItem = (value: string, fallbackLabel = value): FolderChecklistItem => {
    const folder = byId.get(value);
    return {
      depth: Number(folder?.depth || 0),
      label: folder?.name || fallbackLabel,
      value,
    };
  };
  const matchesFolderQuery = (folder: EagleFolder) => !query.trim() || folder.name.toLowerCase().includes(query.trim().toLowerCase());
  const recent = suggestions
    .filter((suggestion) => suggestion.meta === "Recent")
    .filter((suggestion, index, items) => items.findIndex((item) => item.value === suggestion.value) === index)
    .map((suggestion) => toItem(suggestion.value, suggestion.label));
  const allFolders = folders.filter(matchesFolderQuery).map((folder) => toItem(folder.id, folder.name)).slice(0, 80);

  if (!query.trim()) {
    return { allFolders, recent };
  }

  return { allFolders, recent };
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
