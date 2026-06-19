import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ExternalLinkIcon as LucideExternalLinkIcon, FolderIcon, PlusIcon, RotateCcwIcon, TagIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../api";
import { directFileUrl } from "../fileLinks";
import { folderIds, itemTags } from "../format";
import { uniqueValues, type MetadataSuggestion } from "../metadata";
import { getPreviewInfoState, subscribePreviewInfoState } from "../previewInfoState";
import { showErrorToast, showSuccessToast } from "../toasts";
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
  onToggleTrash?: (item: EagleItem, isDeleted: boolean) => Promise<void>;
}

const previewLabelClassName = "preview-detail-label text-xs font-normal text-muted-foreground";
const directFileLinkClassName =
  "direct-file-link preview-info-cta min-h-11 w-full cursor-pointer gap-2.5 whitespace-nowrap rounded-md bg-primary px-2 text-[14px] font-[720] leading-none text-primary-foreground no-underline shadow-none hover:bg-primary hover:text-primary-foreground [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2]";
const previewDetailsSectionClassName = "preview-details-section grid gap-1.5 px-2";
const previewDetailRowClassName =
  "preview-detail-row grid min-h-7 grid-cols-[minmax(82px,104px)_minmax(0,1fr)] items-start gap-4 max-[540px]:gap-3";
const previewDetailValueClassName = "preview-detail-value min-w-0 text-sm leading-[1.35] text-foreground [overflow-wrap:anywhere] max-[540px]:text-[13px]";
const previewChipListClassName = "preview-chip-list flex flex-wrap gap-x-2 gap-y-1.5";
const previewChipClassName = "preview-chip inline-flex h-auto min-h-[28px] items-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-[12px] font-medium text-secondary-foreground [&_svg]:size-3.5";
const previewEditChipListClassName = "preview-edit-chip-list flex min-h-0 flex-wrap gap-1.5";
const previewEditChipClassName = "preview-edit-chip inline-flex h-auto min-h-[30px] max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary py-0 pl-2 pr-1 text-xs font-[560] text-secondary-foreground [&_svg]:size-3.5";
const previewChipInputClassName = "preview-chip-input min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground min-[720px]:text-sm";
const previewChipSuggestionsClassName = "preview-chip-suggestions mt-1 grid max-h-[220px] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm max-[540px]:max-h-[28dvh]";
const previewChipSuggestionClassName = "preview-chip-suggestion flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-[13px] text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-popover-foreground";
const previewMetadataRowClassName = "preview-metadata-row grid gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0";
const previewMetadataLabelClassName = "text-xs font-normal text-muted-foreground";

export function PreviewDetailsPanel({ canEditMetadata = false, detailRows, folders, item, onFolderSuggestions, onSaveMetadata, onTagSuggestions }: PreviewInfoProps) {
  return (
    <section className={previewDetailsSectionClassName}>
      <PreviewItemText item={item} />
      <section className="preview-detail-group grid gap-1.5 border-b border-border pb-3 pt-3 first:pt-0">
        {detailRows.map((row) => (
          <PreviewDetail key={row.label} {...row} />
        ))}
      </section>
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

function PreviewItemText({ item }: { item: EagleItem }) {
  const annotation = itemTextValue(item.annotation);
  const url = itemTextValue(item.url);
  if (!annotation && !url) return null;
  return (
    <section className="preview-item-text grid gap-2 border-b border-border pb-3">
      {annotation ? (
        <p className="preview-item-annotation whitespace-pre-wrap text-sm leading-[1.45] text-foreground [overflow-wrap:anywhere] max-[540px]:text-[13px]">
          {annotation}
        </p>
      ) : null}
      {url ? (
        <a
          className="preview-item-url grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md text-sm leading-[1.35] text-foreground no-underline hover:text-foreground max-[540px]:text-[13px]"
          href={url}
          target="_blank"
          rel="noopener"
          title={url}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{url}</span>
          <LucideExternalLinkIcon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </a>
      ) : null}
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
    <div id="previewActions" className="preview-info-actions mx-2 border-t border-border pt-3">
      {previewInfoState ? <PreviewActions canManageLibrary={previewInfoState.canManageLibrary} item={previewInfoState.item} onToggleTrash={previewInfoState.onToggleTrash} /> : null}
    </div>
  );
}

export function PreviewActions({ canManageLibrary = false, item, onToggleTrash }: { canManageLibrary?: boolean; item: EagleItem; onToggleTrash?: (item: EagleItem, isDeleted: boolean) => Promise<void> }) {
  const [trashSaving, setTrashSaving] = useState(false);
  if (!canManageLibrary) return null;
  const nextDeletedState = !Boolean(item.isDeleted);
  const trashLabel = item.isDeleted ? "Restore from trash" : "Move to trash";

  return (
    <section className="preview-admin-actions grid gap-2">
      <Button asChild className={directFileLinkClassName}>
        <a href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
          <ExternalLinkIcon />
          Open file
        </a>
      </Button>
      {onToggleTrash ? (
        <Button
          type="button"
          variant="destructive"
          className="preview-trash-action min-h-11 w-full gap-2.5 rounded-md px-2 text-[14px] font-[720] leading-none"
          disabled={trashSaving}
          onClick={async (event) => {
            event.stopPropagation();
            if (trashSaving) return;
            setTrashSaving(true);
            try {
              await onToggleTrash(item, nextDeletedState);
            } finally {
              setTrashSaving(false);
            }
          }}
        >
          {item.isDeleted ? <RotateCcwIcon aria-hidden="true" /> : <Trash2Icon aria-hidden="true" />}
          {trashSaving ? "Saving" : trashLabel}
        </Button>
      ) : null}
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
  return (
    <section className="preview-metadata-summary grid gap-3 pb-3 pt-3 min-[900px]:mx-0">
      <MetadataReadOnlyRow icon={<TagIcon aria-hidden="true" />} label="Tags" values={tags} />
      <MetadataReadOnlyRow icon={<FolderIcon aria-hidden="true" />} label="Folders" values={categories} />
    </section>
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
  const [activeInput, setActiveInput] = useState<"tags" | "folders" | null>(null);
  const [saving, setSaving] = useState(false);

  const closeInput = () => {
    if (saving) return;
    setActiveInput(null);
  };

  const saveMetadata = async (nextTags: string[], nextCategories: string[], successToast?: { description: string; title: string }) => {
    if (saving) return;
    const previousTags = tags;
    const previousCategories = categories;
    setTags(nextTags);
    setCategories(nextCategories);
    setSaving(true);
    try {
      const saved = await onSaveMetadata(item, { tags: nextTags, folders: nextCategories });
      setTags(saved.tags);
      setCategories(saved.folders);
      closeInput();
      if (successToast) {
        showSuccessToast(successToast.title, {
          description: successToast.description,
        });
      }
    } catch (error) {
      setTags(previousTags);
      setCategories(previousCategories);
      showErrorToast("Unable to save metadata", {
        description: errorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const addTag = async (rawValue: string) => {
    const values = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
    const nextTags = [...tags];
    const addedTags: string[] = [];
    for (const value of values) {
      if (nextTags.includes(value)) continue;
      nextTags.push(value);
      addedTags.push(value);
    }
    if (sameStringValues(nextTags, tags)) return;
    await saveMetadata(nextTags, categories, {
      title: "Tags saved",
      description: addedTags.length === 1 ? `"${addedTags[0]}" was added.` : `${addedTags.length} tags were added.`,
    });
  };

  const addFolder = async (rawValue: string) => {
    const query = rawValue.trim();
    if (!query) return;
    const lowerQuery = query.toLowerCase();
    const exactFolder = folders.find((folder) => folder.id === query || folder.name.toLowerCase() === lowerQuery);
    const suggestions = exactFolder ? [] : await onFolderSuggestions(query, categories);
    const suggestionFolder = suggestions.find((suggestion) => String(suggestion.value).toLowerCase() === lowerQuery || suggestion.label.toLowerCase() === lowerQuery) || suggestions[0];
    const folderId = exactFolder?.id || String(suggestionFolder?.value || "");
    if (!folderId || categories.includes(folderId)) {
      if (!folderId) {
        showErrorToast("Unable to add folder", {
          description: "Choose an existing folder.",
        });
      }
      return;
    }
    await saveMetadata(tags, [...categories, folderId], {
      title: "Folders saved",
      description: `"${folderLabel(folderId, folders)}" was added.`,
    });
  };

  const openInput = (kind: "tags" | "folders") => {
    if (saving) return;
    setActiveInput(kind);
  };

  return (
    <section className="preview-metadata-summary grid gap-3 pb-3 pt-3 min-[900px]:mx-0" aria-busy={saving}>
      <EditableMetadataRow
        icon={<TagIcon aria-hidden="true" />}
        label="Tags"
        values={tags.map((value) => ({ label: value, value }))}
        disabled={saving}
        inputOpen={activeInput === "tags"}
        inputLabel="Add tag"
        inputPlaceholder="Add tag"
        onAdd={() => openInput("tags")}
        onCloseInput={closeInput}
        onSuggestions={onTagSuggestions}
        selectedValues={tags}
        onSubmitValue={addTag}
        onRemove={(value) => saveMetadata(tags.filter((entry) => entry !== value), categories, {
          title: "Tags saved",
          description: `"${value}" was removed.`,
        })}
      />
      <EditableMetadataRow
        icon={<FolderIcon aria-hidden="true" />}
        label="Folders"
        values={categories.map((value) => ({ label: folderLabel(value, folders), value }))}
        disabled={saving}
        inputOpen={activeInput === "folders"}
        inputLabel="Add folder"
        inputPlaceholder="Search folder"
        onAdd={() => openInput("folders")}
        onCloseInput={closeInput}
        onSuggestions={onFolderSuggestions}
        selectedValues={categories}
        onSubmitValue={addFolder}
        onRemove={(value) => saveMetadata(tags, categories.filter((entry) => entry !== value), {
          title: "Folders saved",
          description: `"${folderLabel(value, folders)}" was removed.`,
        })}
      />
    </section>
  );
}

function MetadataReadOnlyRow({ icon, label, values }: { icon: ReactNode; label: string; values: string[] }) {
  return (
    <div className={previewMetadataRowClassName}>
      <span className={previewMetadataLabelClassName}>{label}</span>
      {values.length ? <MetadataChipList icon={icon} values={values.map((value) => ({ label: value, value }))} /> : null}
    </div>
  );
}

function EditableMetadataRow({
  disabled,
  icon,
  inputLabel,
  inputOpen,
  inputPlaceholder,
  label,
  onAdd,
  onCloseInput,
  onSuggestions,
  selectedValues,
  onSubmitValue,
  onRemove,
  values,
}: {
  disabled?: boolean;
  icon: ReactNode;
  inputLabel: string;
  inputOpen: boolean;
  inputPlaceholder: string;
  label: string;
  onAdd: () => void;
  onCloseInput: () => void;
  onSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  selectedValues: string[];
  onSubmitValue: (value: string) => void | Promise<void>;
  onRemove: (value: string) => void;
  values: Array<{ label: string; value: string }>;
}) {
  return (
    <div className={previewMetadataRowClassName}>
      <span className={previewMetadataLabelClassName}>{label}</span>
      <MetadataChipList editable disabled={disabled} icon={icon} values={values} onAdd={onAdd} onRemove={onRemove} addLabel={`Add ${label}`} />
      {inputOpen ? (
        <MetadataInlineInput
          disabled={disabled}
          icon={icon}
          inputLabel={inputLabel}
          inputPlaceholder={inputPlaceholder}
          onCloseInput={onCloseInput}
          onSuggestions={onSuggestions}
          selectedValues={selectedValues}
          onSubmitValue={onSubmitValue}
        />
      ) : null}
    </div>
  );
}

function MetadataInlineInput({
  disabled,
  icon,
  inputLabel,
  inputPlaceholder,
  onCloseInput,
  onSuggestions,
  selectedValues,
  onSubmitValue,
}: {
  disabled?: boolean;
  icon: ReactNode;
  inputLabel: string;
  inputPlaceholder: string;
  onCloseInput: () => void;
  onSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  selectedValues: string[];
  onSubmitValue: (value: string) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [suggestions, setSuggestions] = useState<MetadataSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  const clearDebounceTimer = () => {
    if (!debounceTimer.current) return;
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
  };

  const updateSuggestions = async (query: string) => {
    if (disabled) return;
    const currentRequest = ++requestId.current;
    try {
      const items = await onSuggestions(query.trim(), selectedValues);
      if (currentRequest !== requestId.current) return;
      setSuggestions(items);
      setSuggestionsOpen(items.length > 0);
    } catch {
      if (currentRequest !== requestId.current) return;
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  };

  const queueSuggestions = (query: string) => {
    clearDebounceTimer();
    debounceTimer.current = window.setTimeout(() => updateSuggestions(query), 120);
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    updateSuggestions(input.value);
    return () => {
      requestId.current += 1;
      clearDebounceTimer();
    };
  }, [onSuggestions, selectedValues.join("\u0000")]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleInput = () => {
      queueSuggestions(input.value);
    };
    const handleFocus = () => {
      updateSuggestions(input.value);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseInput();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      onSubmitValue(input.value);
    };
    input.addEventListener("input", handleInput);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("pointerdown", handleFocus);
    input.addEventListener("keydown", handleKeyDown);
    input.onkeydown = handleKeyDown;
    return () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("pointerdown", handleFocus);
      input.removeEventListener("keydown", handleKeyDown);
      input.onkeydown = null;
    };
  }, [onCloseInput, onSubmitValue, onSuggestions, selectedValues.join("\u0000")]);

  return (
    <div className="preview-metadata-input grid gap-0.5">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 grid size-4 -translate-y-1/2 place-items-center text-muted-foreground [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <input
          ref={inputRef}
          className={`${previewChipInputClassName} pl-9 pr-10`}
          placeholder={inputPlaceholder}
          aria-label={inputLabel}
          autoComplete="off"
          disabled={disabled}
        />
        <Button type="button" variant="ghost" size="icon-xs" className="absolute right-2 top-1/2 size-6 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground" title="Close" aria-label="Close" disabled={disabled} onClick={onCloseInput}>
          <XIcon aria-hidden="true" />
        </Button>
      </label>
      {suggestionsOpen ? (
        <div className={previewChipSuggestionsClassName} role="listbox">
          {suggestions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={previewChipSuggestionClassName}
              role="option"
              aria-selected={item.disabled ? "true" : "false"}
              disabled={disabled || item.disabled}
              style={{ paddingLeft: `${10 + Math.min(Math.max(Number(item.depth || 0), 0), 8) * 16}px` }}
              onPointerDown={(event) => {
                event.preventDefault();
                if (item.disabled) return;
                onSubmitValue(String(item.value || ""));
              }}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
              {item.meta ? <span className="preview-chip-suggestion-meta flex-none rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.meta}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetadataChipList({
  disabled,
  editable = false,
  icon,
  onAdd,
  onRemove,
  values,
  addLabel,
}: {
  disabled?: boolean;
  editable?: boolean;
  icon: ReactNode;
  onAdd?: () => void;
  onRemove?: (value: string) => void;
  values: Array<{ label: string; value: string }>;
  addLabel?: string;
}) {
  return (
    <div className={previewEditChipListClassName}>
      {values.map((item) => (
        <Badge key={item.value} variant="outline" className={editable ? previewEditChipClassName : previewChipClassName}>
          {icon}
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
          {editable ? (
            <Button className="size-[18px] cursor-pointer rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-[13px] [&_svg]:w-[13px]" variant="ghost" size="icon-xs" type="button" title={`Remove ${item.label}`} aria-label={`Remove ${item.label}`} disabled={disabled} onClick={() => onRemove?.(item.value)}>
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </Badge>
      ))}
      {editable ? (
        <Button type="button" variant="outline" size="icon-sm" className="preview-metadata-add size-[30px] rounded-md" title={addLabel} aria-label={addLabel} disabled={disabled} onClick={onAdd}>
          <PlusIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function itemTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function tagValues(value: unknown) {
  return uniqueValues(itemTags({ tags: value }));
}

function categoryValues(value: unknown) {
  return uniqueValues(folderIds(value));
}

function sameStringValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
