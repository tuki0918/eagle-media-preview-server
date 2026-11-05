import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent } from "react";
import { CheckIcon, FileIcon, RotateCcwIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, uploadFile } from "../api";
import { UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "../constants";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { uploadError, uploadsFinished } from "../shellActions";
import { FolderOptionItems } from "./FolderOptions";
import { settingsDialogClassName, settingsDialogCloseClassName, settingsDialogHeaderClassName, settingsDialogTitleClassName } from "./settingsDialogStyles";

type UploadStatus = "pending" | "uploading" | "done" | "failed";

interface UploadEntry {
  error: string;
  file: File;
  id: number;
  progress: number;
  status: UploadStatus;
}

/** Admins only; the server refuses everyone else whatever this shows. */
export function UploadButton() {
  const { canUpload } = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const [open, setOpen] = useState(false);
  if (!canUpload) return null;
  return (
    <>
      <Button
        id="uploadButton"
        className="icon-button size-9 rounded-full text-muted-foreground hover:text-foreground"
        variant="ghost"
        size="icon-sm"
        type="button"
        aria-haspopup="dialog"
        aria-label="Upload files"
        title="Upload files"
        onClick={() => setOpen(true)}
      >
        <UploadIcon className="size-[18px]" aria-hidden="true" />
      </Button>
      {open ? <UploadDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function defaultFolderId(selectedFolderId: string) {
  return selectedFolderId === UNCATEGORIZED_FOLDER_ID || selectedFolderId === UNTAGGED_FOLDER_ID ? "" : selectedFolderId;
}

export function parseUploadTags(value: string) {
  return [...new Set(value.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean))];
}

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const { folders, selectedFolderId } = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [folderId, setFolderId] = useState(() => defaultFolderId(selectedFolderId));
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pending = entries.some((entry) => entry.status === "pending" || entry.status === "failed");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      abortRef.current?.abort();
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const updateEntry = (id: number, patch: Partial<UploadEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added = Array.from(files).map((file) => ({ error: "", file, id: nextId.current++, progress: 0, status: "pending" as const }));
    setEntries((current) => [...current, ...added]);
  };

  // One file at a time, so a failure or a cancel leaves the rest of the list in a clear state.
  const startUpload = async () => {
    if (uploading) return;
    const queue = entries.filter((entry) => entry.status === "pending" || entry.status === "failed");
    if (!queue.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    let added = 0;
    const tagList = parseUploadTags(tags);
    for (const entry of queue) {
      if (controller.signal.aborted) break;
      updateEntry(entry.id, { error: "", progress: 0, status: "uploading" });
      try {
        await uploadFile(entry.file, {
          folderId,
          onProgress: (progress) => updateEntry(entry.id, { progress }),
          signal: controller.signal,
          tags: tagList,
        });
        updateEntry(entry.id, { progress: 1, status: "done" });
        added += 1;
      } catch (error) {
        if (controller.signal.aborted) {
          updateEntry(entry.id, { progress: 0, status: "pending" });
          break;
        }
        updateEntry(entry.id, { error: errorMessage(error), status: "failed" });
        if (uploadError(error)) break;
      }
    }
    abortRef.current = null;
    setUploading(false);
    if (added) uploadsFinished();
  };

  const requestClose = () => {
    if (uploading) abortRef.current?.abort();
    else onClose();
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.currentTarget.files);
    // Lets the same file be chosen again after it is removed or fails.
    event.currentTarget.value = "";
  };

  return (
    <dialog
      ref={dialogRef}
      id="uploadDialog"
      aria-labelledby="uploadDialogTitle"
      className={`${settingsDialogClassName} flex-col open:flex max-[540px]:mb-3`}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={onClose}
    >
      <header className={settingsDialogHeaderClassName}>
        <h2 id="uploadDialogTitle" className={settingsDialogTitleClassName}><UploadIcon className="size-5" aria-hidden="true" />Upload to Eagle</h2>
        <Button variant="ghost" size="icon" className={settingsDialogCloseClassName} aria-label={uploading ? "Cancel upload" : "Close upload"} onClick={requestClose}><XIcon className="size-4" aria-hidden="true" /></Button>
      </header>
      <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4">
        <button
          id="uploadDropZone"
          type="button"
          className={`grid w-full cursor-pointer place-items-center gap-1 rounded-xl border border-dashed p-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${dragging ? "border-primary bg-accent" : "border-input bg-transparent"}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <UploadIcon className="size-5" aria-hidden="true" />
          <span>Drop files here or choose files</span>
        </button>
        <input ref={inputRef} id="uploadFileInput" className="sr-only" type="file" multiple tabIndex={-1} aria-label="Choose files" onChange={onInputChange} />
        <div className="grid gap-3 min-[420px]:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
            Folder
            <select
              id="uploadFolder"
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
              disabled={uploading}
              value={folderId}
              onChange={(event) => setFolderId(event.currentTarget.value)}
            >
              <option value="">No folder</option>
              <FolderOptionItems folders={folders} />
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
            Tags
            <Input id="uploadTags" disabled={uploading} placeholder="travel, family" value={tags} onChange={(event) => setTags(event.currentTarget.value)} />
          </label>
        </div>
        {entries.length ? (
          <ul className="m-0 grid list-none gap-2.5 p-0" aria-label="Files to upload">
            {entries.map((entry) => (
              <UploadRow
                key={entry.id}
                entry={entry}
                onRemove={uploading ? undefined : () => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))}
              />
            ))}
          </ul>
        ) : null}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="outline" className="h-9 rounded-full px-4" onClick={requestClose}>{uploading ? "Cancel" : "Close"}</Button>
        {uploading || pending ? (
          <Button id="uploadStartButton" className="primary-action-button h-9 rounded-full px-4" disabled={uploading} onClick={() => void startUpload()}>
            <UploadIcon className="size-4" aria-hidden="true" />
            {uploading ? "Uploading" : "Upload"}
          </Button>
        ) : null}
      </footer>
    </dialog>
  );
}

function UploadRow({ entry, onRemove }: { entry: UploadEntry; onRemove?: () => void }) {
  const percent = Math.round(entry.progress * 100);
  return (
    <li className="grid gap-1 text-xs" data-status={entry.status}>
      <div className="flex min-w-0 items-center gap-2">
        {entry.status === "done"
          ? <CheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          : entry.status === "failed"
            ? <RotateCcwIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            : <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-foreground" title={entry.file.name}>{entry.file.name}</span>
        <span className="shrink-0 text-muted-foreground [font-variant-numeric:tabular-nums]" role={entry.status === "failed" ? "alert" : undefined}>
          {entry.status === "uploading" ? `${percent}%` : entry.status === "done" ? "Added" : entry.status === "failed" ? "Failed" : formatFileSize(entry.file.size)}
        </span>
        {onRemove && entry.status !== "done" ? (
          <Button variant="ghost" size="icon-sm" className="size-6 shrink-0 rounded-full text-muted-foreground" aria-label={`Remove ${entry.file.name}`} onClick={onRemove}>
            <XIcon className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {entry.status === "uploading" ? (
        <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uploading ${entry.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {entry.error ? <p className="m-0 pl-6 text-destructive">{entry.error}</p> : null}
    </li>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
