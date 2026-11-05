import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, FileIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage, uploadFile } from "../api";
import { UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "../constants";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { uploadError, uploadsFinished } from "../shellActions";
import { getShellView, subscribeShellView } from "../shellVisibility";
import { FolderOptionItems } from "./FolderOptions";
import { settingsDialogClassName, settingsDialogCloseClassName, settingsDialogFieldClassName, settingsDialogFooterClassName, settingsDialogHeaderClassName, settingsDialogPanelClassName, settingsDialogPrimaryButtonClassName, settingsDialogSelectClassName, settingsDialogTitleClassName } from "./settingsDialogStyles";

// Matches the server's limit, so a file that can't be accepted isn't sent at all.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const TOO_LARGE_MESSAGE = "This file is larger than the 2 GB upload limit";
const RESULT_UNKNOWN_MESSAGE = "Eagle may have added this file. Check the library before choosing it again.";

const secondaryButtonClassName = "h-11 flex-1 touch-manipulation rounded-full transition-colors";

type UploadStatus = "pending" | "uploading" | "adding" | "done" | "failed" | "unknown";

interface UploadEntry {
  error: string;
  file: File;
  id: number;
  progress: number;
  status: UploadStatus;
}

/** For users with the upload permission; the server refuses everyone else whatever this shows. */
export function UploadButton() {
  const { canUpload } = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const shellView = useSyncExternalStore(subscribeShellView, getShellView, getShellView);
  const inViewer = shellView === "viewer";
  const [open, setOpen] = useState(false);
  // Leaving the viewer ends the dialog and its uploads, so reconnecting doesn't bring them back.
  useEffect(() => {
    if (!inViewer) setOpen(false);
  }, [inViewer]);
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
      {open && inViewer ? <UploadDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function defaultFolderId(selectedFolderId: string) {
  return selectedFolderId === UNCATEGORIZED_FOLDER_ID || selectedFolderId === UNTAGGED_FOLDER_ID ? "" : selectedFolderId;
}

// After the whole file is sent, no answer or a server failure doesn't say whether Eagle added it,
// and neither does LIBRARY_CHANGED: the server also answers that in place of a success when the
// library switches just after the file was added. Other refusals (4xx) and a full disk (507) mean
// it never got that far.
function isResultUnknown(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  if (error.code === "LIBRARY_CHANGED") return true;
  return error.status >= 500 && error.status !== 507;
}

function canSend(entry: UploadEntry) {
  return (entry.status === "pending" || entry.status === "failed") && entry.file.size <= MAX_UPLOAD_BYTES;
}

export function parseUploadTags(value: string) {
  return [...new Set(value.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean))];
}

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const { folders, selectedFolderId } = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentFileSentRef = useRef(false);
  const stopAfterCurrentRef = useRef(false);
  const nextId = useRef(0);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [folderId, setFolderId] = useState(() => defaultFolderId(selectedFolderId));
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadStarted, setUploadStarted] = useState(false);
  const [stopping, setStopping] = useState(false);
  const sendable = entries.some(canSend);
  // Removing the last row by hand goes back to the start, the same as clearing the list.
  const showClose = !uploading && uploadStarted && entries.length > 0;

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
    const added = Array.from(files).map((file): UploadEntry => {
      const tooLarge = file.size > MAX_UPLOAD_BYTES;
      return { error: tooLarge ? TOO_LARGE_MESSAGE : "", file, id: nextId.current++, progress: 0, status: tooLarge ? "failed" : "pending" };
    });
    setEntries((current) => [...current, ...added]);
  };

  // One file at a time, so a failure or a cancel leaves the rest of the list in a clear state.
  const startUpload = async () => {
    if (uploading) return;
    const queue = entries.filter(canSend);
    if (!queue.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setUploadStarted(true);
    let mayHaveAdded = 0;
    const tagList = parseUploadTags(tags);
    for (const entry of queue) {
      if (controller.signal.aborted || stopAfterCurrentRef.current) break;
      currentFileSentRef.current = false;
      updateEntry(entry.id, { error: "", progress: 0, status: "uploading" });
      try {
        await uploadFile(entry.file, {
          folderId,
          onProgress: (progress) => updateEntry(entry.id, { progress }),
          onSent: () => {
            currentFileSentRef.current = true;
            updateEntry(entry.id, { progress: 1, status: "adding" });
          },
          signal: controller.signal,
          tags: tagList,
        });
        updateEntry(entry.id, { progress: 1, status: "done" });
        mayHaveAdded += 1;
      } catch (error) {
        if (controller.signal.aborted) {
          updateEntry(entry.id, { progress: 0, status: "pending" });
          break;
        }
        if (currentFileSentRef.current && isResultUnknown(error)) {
          updateEntry(entry.id, { error: RESULT_UNKNOWN_MESSAGE, status: "unknown" });
          mayHaveAdded += 1;
          continue;
        }
        updateEntry(entry.id, { error: errorMessage(error), status: "failed" });
        if (uploadError(error)) break;
      }
    }
    abortRef.current = null;
    stopAfterCurrentRef.current = false;
    setStopping(false);
    setUploading(false);
    if (mayHaveAdded) uploadsFinished();
  };

  // Only the list: what was added stays in Eagle, and the folder and tags stay for the next files.
  const clearList = () => {
    setEntries([]);
    setUploadStarted(false);
    dropZoneRef.current?.focus();
  };

  const requestClose = () => {
    if (!uploading) {
      onClose();
    } else if (currentFileSentRef.current) {
      // Eagle gets this file whatever happens now. Letting it finish shows that, rather than
      // putting it back in the list to be sent, and added, a second time.
      stopAfterCurrentRef.current = true;
      setStopping(true);
    } else {
      abortRef.current?.abort();
    }
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

  return createPortal(
    <dialog
      ref={dialogRef}
      id="uploadDialog"
      aria-labelledby="uploadDialogTitle"
      className={settingsDialogClassName}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={onClose}
    >
      <div className={settingsDialogPanelClassName}>
        <header className={settingsDialogHeaderClassName}>
          <h2 id="uploadDialogTitle" className={settingsDialogTitleClassName}><UploadIcon className="size-5" aria-hidden="true" />Upload to Eagle</h2>
          <Button type="button" variant="ghost" size="icon" className={settingsDialogCloseClassName} aria-label={uploading ? "Cancel upload" : "Close upload"} title={uploading ? "Cancel upload" : "Close"} onClick={requestClose}><XIcon aria-hidden="true" /></Button>
        </header>
        {/* Only the list scrolls, down to its minimum height; on a very short screen the whole body does. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="grid shrink-0 gap-3 px-5 py-4">
            <button
              ref={dropZoneRef}
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
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <label className={settingsDialogFieldClassName}><span className="uppercase">Folder</span>
                <span className="relative block">
                  <select
                    id="uploadFolder"
                    className={settingsDialogSelectClassName}
                    disabled={uploading}
                    value={folderId}
                    onChange={(event) => setFolderId(event.currentTarget.value)}
                  >
                    <option value="">No folder</option>
                    <FolderOptionItems folders={folders} />
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </span>
              </label>
              <label className={settingsDialogFieldClassName}><span className="uppercase">Tags</span>
                <Input id="uploadTags" className="h-10 rounded-xl bg-background px-3" disabled={uploading} placeholder="travel, family" value={tags} onChange={(event) => setTags(event.currentTarget.value)} />
              </label>
            </div>
          </div>
          {entries.length ? (
            <section className="flex min-h-[116px] flex-col gap-2 border-t border-border px-5 pt-3" aria-labelledby="uploadListTitle">
              <h3 id="uploadListTitle" className="m-0 flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="uppercase">Upload list</span>
                <span id="uploadListCount" className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none text-foreground [font-variant-numeric:tabular-nums]">{entries.length}</span>
              </h3>
              <ul id="uploadList" className="m-0 grid max-h-72 min-h-0 flex-1 list-none content-start gap-2.5 overflow-y-auto pb-3 pl-0 pr-1 pt-1">
                {entries.map((entry) => (
                  <UploadRow
                    key={entry.id}
                    entry={entry}
                    onRemove={uploading ? undefined : () => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        {uploading || sendable || showClose ? (
          <footer className={`${settingsDialogFooterClassName} flex gap-3`}>
            {uploading ? <Button id="uploadCancelButton" type="button" variant="outline" className={secondaryButtonClassName} disabled={stopping} onClick={requestClose}>{stopping ? "CANCELING" : "CANCEL"}</Button> : null}
            {showClose && !sendable ? <Button id="uploadClearButton" type="button" variant="outline" className={secondaryButtonClassName} onClick={clearList}>CLEAR LIST</Button> : null}
            {showClose ? <Button id="uploadCloseButton" type="button" variant={sendable ? "outline" : "default"} className={sendable ? secondaryButtonClassName : `${settingsDialogPrimaryButtonClassName} flex-1`} onClick={onClose}>CLOSE</Button> : null}
            {uploading || sendable ? (
              <Button id="uploadStartButton" type="button" className={`${settingsDialogPrimaryButtonClassName} flex-1`} disabled={uploading} onClick={() => void startUpload()}>
                <UploadIcon className="size-4" aria-hidden="true" />
                {uploading ? "UPLOADING" : "UPLOAD"}
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </dialog>,
    document.body,
  );
}

function UploadRow({ entry, onRemove }: { entry: UploadEntry; onRemove?: () => void }) {
  const percent = Math.round(entry.progress * 100);
  return (
    <li className="flex min-w-0 items-center gap-3 text-xs" data-status={entry.status}>
      <div className="relative size-12 shrink-0">
        <UploadThumbnail file={entry.file} />
        {entry.status === "done"
          ? <CheckIcon className="absolute -bottom-1 -right-1 size-4 rounded-full bg-card p-0.5 text-emerald-600" aria-hidden="true" />
          : entry.status === "failed"
            ? <CircleAlertIcon className="absolute -bottom-1 -right-1 size-4 rounded-full bg-card p-0.5 text-destructive" aria-hidden="true" />
            : entry.status === "unknown"
              ? <CircleAlertIcon className="absolute -bottom-1 -right-1 size-4 rounded-full bg-card p-0.5 text-amber-600" aria-hidden="true" />
              : null}
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-foreground" title={entry.file.name}>{entry.file.name}</span>
          <span className="shrink-0 text-muted-foreground [font-variant-numeric:tabular-nums]" role={entry.status === "failed" || entry.status === "unknown" ? "alert" : undefined}>
            {entry.status === "uploading" ? `${percent}%` : entry.status === "adding" ? "Processing…" : entry.status === "done" ? "Success" : entry.status === "failed" ? "Failed" : entry.status === "unknown" ? "Unknown" : formatFileSize(entry.file.size)}
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
        {/* Eagle doesn't report how far along it is, so this bar has no value: it only shows work going on. */}
        {entry.status === "adding" ? (
          <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Adding ${entry.file.name} to Eagle`}>
            <div className="h-full w-full animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          </div>
        ) : null}
        {entry.error ? <p className={`m-0 ${entry.status === "unknown" ? "text-amber-700" : "text-destructive"}`}>{entry.error}</p> : null}
      </div>
    </li>
  );
}

/** Shows the local file itself, and an icon for anything the browser can't display, such as HEIC in Chrome. */
function UploadThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "";

  useEffect(() => {
    if (!kind) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, kind]);

  const mediaClassName = "size-full rounded-lg border border-border bg-muted object-cover";
  if (url && !failed && kind === "image") {
    return <img className={mediaClassName} src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  if (url && !failed && kind === "video") {
    // The time makes browsers that wouldn't otherwise paint a frame, such as iOS Safari, show one.
    return <video className={mediaClassName} src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} onError={() => setFailed(true)} />;
  }
  return (
    <div className="grid size-full place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
      <FileIcon className="size-5" aria-hidden="true" />
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
