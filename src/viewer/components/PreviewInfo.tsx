import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { EllipsisIcon, ExternalLinkIcon as LucideExternalLinkIcon, FolderIcon, LinkIcon, LoaderCircleIcon, PencilIcon, RotateCcwIcon, ShareIcon, TagIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../api";
import { TAG_PICKER_SECTIONS_COLLAPSED_STORAGE_KEY } from "../constants";
import { directFileUrl, isStandaloneApp } from "../fileLinks";
import { getItemActionsVisible, subscribeItemActionsVisible } from "../itemActionsVisibilityState";
import { folderIds, itemTags } from "../format";
import { uniqueValues, type MetadataSuggestion } from "../metadata";
import { getPreviewInfoState, subscribePreviewInfoState } from "../previewInfoState";
import { errorName, fetchShareFile, shareOrDownloadFile } from "../shareFile";
import { showErrorToast, showSuccessToast } from "../toasts";
import type { EagleFolder, EagleItem } from "../types";
import { MetadataPickerDialog } from "./MetadataPickerDialog";

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
  onSaveMetadata: (item: EagleItem, patch: { tags: string[]; folders: string[] }, field: "tags" | "folders") => Promise<{ tags: string[]; folders: string[] }>;
  onTagSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  onToggleTrash?: (item: EagleItem, isDeleted: boolean) => Promise<void>;
}

const previewLabelClassName = "preview-detail-label text-[13px] font-normal text-muted-foreground";
const previewSectionHeadingClassName = "preview-section-heading m-0 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const previewSectionCountClassName = "rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums tracking-normal text-muted-foreground";
const directFileLinkClassName =
  "primary-action-button direct-file-link preview-info-cta min-h-11 w-full desktop:min-h-12 cursor-pointer gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold leading-none text-primary-foreground no-underline shadow-none [&_svg]:size-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2]";
const adminMenuTriggerClassName =
  "preview-admin-menu-trigger size-11 rounded-full desktop:size-12 border-border bg-background text-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5";
const previewDetailsSectionClassName = "preview-details-section grid gap-6";
const previewDetailTableClassName = "preview-detail-table grid rounded-xl border border-border px-3.5";
const previewDetailRowClassName =
  "preview-detail-row grid min-h-10 grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-4 border-b border-border py-2 last:border-b-0";
const previewDetailValueClassName = "preview-detail-value min-w-0 text-right text-[13px] font-medium leading-[1.35] text-foreground tabular-nums [overflow-wrap:anywhere]";
const previewChipListClassName = "preview-chip-list flex flex-wrap justify-end gap-1.5";
const previewChipClassName = "preview-chip inline-flex h-auto min-h-7 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground [&_svg]:size-3.5 [&_svg]:text-muted-foreground";
const previewEditChipListClassName = "preview-edit-chip-list flex min-h-0 flex-wrap gap-1.5";
const previewEditChipClassName = "preview-edit-chip inline-flex h-auto min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary py-0 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground [&_svg]:size-3.5";
const previewMetadataRowClassName = "preview-metadata-row grid gap-2.5";
const previewMetadataEmptyClassName = "preview-metadata-empty m-0 text-[13px] text-muted-foreground";

export function PreviewDetailsPanel({ canEditMetadata = false, detailRows, folders, item, onFolderSuggestions, onSaveMetadata, onTagSuggestions }: PreviewInfoProps) {
  return (
    <section className={previewDetailsSectionClassName}>
      <PreviewItemText item={item} />
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
      <section className="preview-detail-group grid gap-2.5 pb-4" aria-label="Information">
        <h3 className={previewSectionHeadingClassName}>Information</h3>
        <div className={previewDetailTableClassName}>
          {detailRows.map((row) => (
            <PreviewDetail key={row.label} {...row} />
          ))}
        </div>
      </section>
    </section>
  );
}

function PreviewItemText({ item }: { item: EagleItem }) {
  const annotation = itemTextValue(item.annotation);
  const url = itemTextValue(item.url);
  if (!annotation && !url) return null;
  return (
    <>
      {annotation ? (
        <section className="preview-item-text grid gap-2.5" aria-label="Notes">
          <h3 className={previewSectionHeadingClassName}>Notes</h3>
          <p className="preview-item-annotation m-0 whitespace-pre-wrap rounded-xl bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] px-3.5 py-3 text-[13px] leading-[1.6] text-foreground [overflow-wrap:anywhere]">
            {annotation}
          </p>
        </section>
      ) : null}
      {url ? (
        <section className="preview-item-source grid gap-2.5" aria-label="Source">
          <h3 className={previewSectionHeadingClassName}>Source</h3>
          <a
            className="preview-item-url grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-border px-3.5 text-[13px] leading-[1.35] text-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            href={url}
            target="_blank"
            rel="noopener"
            title={url}
            onClick={(event) => event.stopPropagation()}
          >
            <LinkIcon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{urlLabel(url)}</span>
            <LucideExternalLinkIcon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </a>
        </section>
      ) : null}
    </>
  );
}

function urlLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function PreviewInfoDetails() {
  const previewInfoState = useSyncExternalStore(subscribePreviewInfoState, getPreviewInfoState, getPreviewInfoState);
  return (
    <div id="previewDetails" className="preview-details grid gap-6">
      {previewInfoState ? <PreviewDetailsPanel key={String(previewInfoState.item.id || "")} {...previewInfoState} /> : null}
    </div>
  );
}

export function PreviewInfoActions() {
  const actionsVisible = useSyncExternalStore(subscribeItemActionsVisible, getItemActionsVisible, getItemActionsVisible);
  const previewInfoState = useSyncExternalStore(subscribePreviewInfoState, getPreviewInfoState, getPreviewInfoState);
  if (!actionsVisible) return null;
  return (
    // Beside the image, the buttons line up with its zoom toolbar, which sits 24px up without the safe area.
    <div id="previewActions" className="preview-info-actions sticky bottom-0 z-[1] -mx-5 mt-auto border-t border-border bg-card px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4 max-[540px]:static desktop:pb-6">
      {previewInfoState ? <PreviewActions key={String(previewInfoState.item.id || "")} canEditMetadata={previewInfoState.canEditMetadata} canManageLibrary={previewInfoState.canManageLibrary} item={previewInfoState.item} onToggleTrash={previewInfoState.onToggleTrash} /> : null}
    </div>
  );
}

export function PreviewActions({ canEditMetadata = false, canManageLibrary = false, item, onToggleTrash }: { canEditMetadata?: boolean; canManageLibrary?: boolean; item: EagleItem; onToggleTrash?: (item: EagleItem, isDeleted: boolean) => Promise<void> }) {
  const actionsVisible = useSyncExternalStore(subscribeItemActionsVisible, getItemActionsVisible, getItemActionsVisible);
  const standalone = isStandaloneApp();
  const [trashSaving, setTrashSaving] = useState(false);
  // "sharing" covers the time the OS share sheet is open, after the file has finished loading.
  const [sharePhase, setSharePhase] = useState<"idle" | "preparing" | "sharing">("idle");
  const [shareReady, setShareReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const readyFileRef = useRef<File | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!actionsVisible) setMenuOpen(false);
  }, [actionsVisible]);
  const actionsRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nextDeletedState = !Boolean(item.isDeleted);
  const trashLabel = item.isDeleted ? "Restore from trash" : "Move to trash";

  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (actionsRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Drop any in-flight file fetch once this item's actions go away (preview switched or closed).
  useEffect(() => () => {
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = null;
    readyFileRef.current = null;
  }, []);

  const fetchSignal = () => {
    if (!fetchControllerRef.current || fetchControllerRef.current.signal.aborted) {
      fetchControllerRef.current = new AbortController();
    }
    return fetchControllerRef.current.signal;
  };

  const handleShare = async () => {
    if (sharePhase !== "idle") return;
    // A file left over from a blocked share opens the sheet straight from this fresh click.
    const readyFile = readyFileRef.current;
    if (readyFile) {
      readyFileRef.current = null;
      setShareReady(false);
      setMenuOpen(false);
      await shareOrDownloadFile(readyFile);
      return;
    }
    // The file is fetched only after Share is picked; the menu stays open to show progress.
    setSharePhase("preparing");
    try {
      const file = await fetchShareFile(item, fetchSignal());
      setSharePhase("sharing");
      const result = await shareOrDownloadFile(file, { retryable: true });
      if (result === "blocked") {
        // The fetch outlived the click's user activation, so ask for one more tap.
        readyFileRef.current = file;
        setShareReady(true);
        setMenuOpen(true);
      } else {
        setMenuOpen(false);
      }
    } catch (error) {
      if (errorName(error) === "AbortError") return;
      setMenuOpen(false);
      showErrorToast("Unable to share", { description: errorMessage(error) });
    } finally {
      setSharePhase("idle");
    }
  };

  const handleToggleTrash = async () => {
    if (trashSaving || !onToggleTrash) return;
    setMenuOpen(false);
    setTrashSaving(true);
    try {
      await onToggleTrash(item, nextDeletedState);
    } finally {
      setTrashSaving(false);
    }
  };
  const canToggleTrash = canManageLibrary && Boolean(onToggleTrash);

  if (!actionsVisible) return null;

  return (
    <section ref={actionsRef} className="preview-admin-actions relative grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      {standalone ? (
        <Button type="button" disabled className={directFileLinkClassName}>
          <ExternalLinkIcon />
          Open file
        </Button>
      ) : (
        <Button asChild className={directFileLinkClassName}>
          <a href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
            <ExternalLinkIcon />
            Open file
          </a>
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={adminMenuTriggerClassName}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="previewAdminMenu"
        title="More actions"
        disabled={trashSaving}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <EllipsisIcon aria-hidden="true" />
      </Button>
      {menuOpen ? (
        <div
          ref={menuRef}
          id="previewAdminMenu"
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 min-w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="preview-share-action relative flex w-full cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
            disabled={sharePhase !== "idle"}
            aria-busy={sharePhase === "preparing"}
            onClick={() => {
              void handleShare();
            }}
          >
            {sharePhase === "preparing" ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <ShareIcon aria-hidden="true" />}
            <span>{sharePhase === "preparing" ? "Preparing…" : sharePhase === "sharing" ? "Sharing…" : shareReady ? "Tap to share" : "Share"}</span>
          </button>
          {canToggleTrash ? (
            <>
              {/* Keeps the destructive action apart from Share; same look as the dropdown menu separator. */}
              <div role="separator" aria-orientation="horizontal" className="preview-menu-separator -mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                className="preview-trash-action relative flex w-full cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-destructive outline-hidden select-none hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                disabled={trashSaving}
                onClick={() => {
                  void handleToggleTrash();
                }}
              >
                {item.isDeleted ? <RotateCcwIcon aria-hidden="true" /> : <Trash2Icon aria-hidden="true" />}
                <span>{trashSaving ? "Saving" : trashLabel}</span>
              </button>
            </>
          ) : null}
        </div>
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
    <section className="preview-metadata-summary grid gap-6">
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

  const saveMetadata = async (field: "tags" | "folders", nextTags: string[], nextCategories: string[], successToast?: { description: string; title: string }) => {
    if (saving) return;
    const previousTags = tags;
    const previousCategories = categories;
    setTags(nextTags);
    setCategories(nextCategories);
    setSaving(true);
    try {
      const saved = await onSaveMetadata(item, { tags: nextTags, folders: nextCategories }, field);
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

  const applyValues = async (kind: "tags" | "folders", nextValues: string[]) => {
    const currentValues = kind === "tags" ? tags : categories;
    if (sameStringValues(nextValues, currentValues)) {
      closeInput();
      return;
    }
    const labelFor = (value: string) => kind === "tags" ? value : folderLabel(value, folders);
    const added = nextValues.filter((value) => !currentValues.includes(value));
    const removed = currentValues.filter((value) => !nextValues.includes(value));
    await saveMetadata(kind, kind === "tags" ? nextValues : tags, kind === "folders" ? nextValues : categories, {
      title: kind === "tags" ? "Tags saved" : "Folders saved",
      description: metadataChangeSummary(added, removed, labelFor, kind === "tags" ? "tag" : "folder"),
    });
  };

  const openInput = (kind: "tags" | "folders") => {
    if (saving) return;
    setActiveInput(kind);
  };

  return (
    <section className="preview-metadata-summary grid gap-6" aria-busy={saving}>
      <EditableMetadataRow
        icon={<TagIcon aria-hidden="true" />}
        label="Tags"
        values={tags.map((value) => ({ label: value, value }))}
        disabled={saving}
        onEdit={() => openInput("tags")}
        onRemove={(value) => saveMetadata("tags", tags.filter((entry) => entry !== value), categories, {
          title: "Tags saved",
          description: `"${value}" was removed.`,
        })}
      />
      <EditableMetadataRow
        icon={<FolderIcon aria-hidden="true" />}
        label="Folders"
        values={categories.map((value) => ({ label: folderLabel(value, folders), value }))}
        disabled={saving}
        onEdit={() => openInput("folders")}
        onRemove={(value) => saveMetadata("folders", tags, categories.filter((entry) => entry !== value), {
          title: "Folders saved",
          description: `"${folderLabel(value, folders)}" was removed.`,
        })}
      />
      {activeInput === "tags" ? (
        <MetadataPickerDialog
          id="tagPickerDialog"
          collapsedStorageKey={TAG_PICKER_SECTIONS_COLLAPSED_STORAGE_KEY}
          title="Tags"
          icon={<TagIcon aria-hidden="true" />}
          placeholder="Search or add tag"
          allowCreate
          disabled={saving}
          initialValues={tags}
          labelFor={(value) => value}
          onSuggestions={onTagSuggestions}
          onApply={(values) => applyValues("tags", values)}
          onClose={closeInput}
        />
      ) : null}
      {activeInput === "folders" ? (
        <MetadataPickerDialog
          id="folderPickerDialog"
          title="Folders"
          icon={<FolderIcon aria-hidden="true" />}
          placeholder="Search folder"
          allowCreate={false}
          disabled={saving}
          initialValues={categories}
          labelFor={(value) => folderLabel(value, folders)}
          onSuggestions={onFolderSuggestions}
          onApply={(values) => applyValues("folders", values)}
          onClose={closeInput}
        />
      ) : null}
    </section>
  );
}

function MetadataReadOnlyRow({ icon, label, values }: { icon: ReactNode; label: string; values: string[] }) {
  return (
    <div className={previewMetadataRowClassName}>
      <MetadataHeading label={label} count={values.length} />
      {values.length ? (
        <MetadataChipList icon={icon} values={values.map((value) => ({ label: value, value }))} />
      ) : (
        <p className={previewMetadataEmptyClassName} aria-label={`${label}: none`}>—</p>
      )}
    </div>
  );
}

function MetadataHeading({ action, count, label }: { action?: ReactNode; count: number; label: string }) {
  const heading = (
    <h3 className={previewSectionHeadingClassName}>
      <span>{label}</span>
      {count > 0 ? <span className={previewSectionCountClassName}>{count.toLocaleString()}</span> : null}
    </h3>
  );
  if (!action) return heading;
  return (
    <div className="flex min-h-5 items-center justify-between gap-3">
      {heading}
      {action}
    </div>
  );
}

function EditableMetadataRow({
  disabled,
  icon,
  label,
  onEdit,
  onRemove,
  values,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onEdit: () => void;
  onRemove: (value: string) => void;
  values: Array<{ label: string; value: string }>;
}) {
  const editLabel = `Edit ${label.toLowerCase()}`;
  return (
    <div className={previewMetadataRowClassName}>
      <MetadataHeading
        label={label}
        count={values.length}
        action={(
          // The negative margin keeps the larger tap target from growing the heading row.
          <Button type="button" variant="ghost" size="icon" className="preview-metadata-edit -my-2 size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground max-[540px]:size-9 [&_svg]:size-4" title={editLabel} aria-label={editLabel} disabled={disabled} onClick={onEdit}>
            <PencilIcon aria-hidden="true" />
          </Button>
        )}
      />
      {values.length ? (
        <MetadataChipList editable disabled={disabled} icon={icon} values={values} onRemove={onRemove} />
      ) : (
        <button type="button" className="preview-metadata-empty-edit flex min-h-9 w-full cursor-pointer items-center rounded-xl border border-dashed border-border bg-transparent px-3 text-left text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45" title={editLabel} disabled={disabled} onClick={onEdit}>
          No {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function MetadataChipList({
  disabled,
  editable = false,
  icon,
  onRemove,
  values,
}: {
  disabled?: boolean;
  editable?: boolean;
  icon: ReactNode;
  onRemove?: (value: string) => void;
  values: Array<{ label: string; value: string }>;
}) {
  return (
    <div className={previewEditChipListClassName}>
      {values.map((item) => (
        <Badge key={item.value} variant="outline" className={editable ? previewEditChipClassName : previewChipClassName}>
          {icon}
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
          {editable ? (
            <Button className="size-[18px] cursor-pointer rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-[13px] [&_svg]:w-[13px]" variant="ghost" size="icon-xs" type="button" title={`Remove ${item.label}`} aria-label={`Remove ${item.label}`} disabled={disabled} onClick={() => onRemove?.(item.value)}>
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </Badge>
      ))}
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
  const flattenedFolders = folderTreeItems(folders);
  const index = flattenedFolders.findIndex((entry) => entry.id === id);
  const folder = flattenedFolders[index];
  if (!folder) return id;
  const path = [folder.name];
  let targetDepth = Number(folder.depth || 0);
  for (let cursor = index - 1; cursor >= 0 && targetDepth > 0; cursor -= 1) {
    const parent = flattenedFolders[cursor];
    const parentDepth = Number(parent?.depth || 0);
    if (parentDepth >= targetDepth) continue;
    path.unshift(parent.name);
    targetDepth = parentDepth;
  }
  return path.join(" / ");
}

function folderTreeItems(folders: readonly EagleFolder[]): EagleFolder[] {
  const items: EagleFolder[] = [];
  for (const folder of folders) {
    items.push(folder);
    if (folder.children?.length) items.push(...folderTreeItems(folder.children));
  }
  return items;
}

function tagValues(value: unknown) {
  return uniqueValues(itemTags({ tags: value }));
}

function categoryValues(value: unknown) {
  return uniqueValues(folderIds(value));
}

function metadataChangeSummary(added: readonly string[], removed: readonly string[], labelFor: (value: string) => string, noun: string) {
  if (added.length === 1 && !removed.length) return `"${labelFor(added[0])}" was added.`;
  if (removed.length === 1 && !added.length) return `"${labelFor(removed[0])}" was removed.`;
  const parts = [
    added.length ? `${added.length} ${noun}${added.length === 1 ? "" : "s"} added` : "",
    removed.length ? `${removed.length} ${added.length ? "" : `${noun}${removed.length === 1 ? "" : "s"} `}removed` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}.`;
}

function sameStringValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
