import { forwardRef, useSyncExternalStore } from "react";
import type { EagleItem } from "../types";
import { getPreviewBodyState, subscribePreviewBodyState } from "../previewBodyState";
import { AudioPreview, VideoPreview } from "./previewBody/MediaPreviews";
import { ImagePreview } from "./previewBody/ImagePreview";
import { PdfPreview, TextPreview, UnsupportedPreview, UrlPreview, safeExternalUrl } from "./previewBody/SimplePreviews";

export { safeExternalUrl };

export type PreviewBodyKind = "video" | "audio" | "text" | "pdf" | "url" | "image" | "unsupported";

export interface PreviewBodyProps {
  item: EagleItem;
  kind: PreviewBodyKind;
  srcKind?: "file" | "thumb";
}

const checkerboardClassName =
  "bg-muted bg-[linear-gradient(45deg,#7373732e_25%,transparent_25%),linear-gradient(-45deg,#7373732e_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#7373732e_75%),linear-gradient(-45deg,transparent_75%,#7373732e_75%)] [background-position:0_0,0_12px,12px_-12px,-12px_0] [background-size:24px_24px]";

export function PreviewBody({ item, kind, srcKind = "file" }: PreviewBodyProps) {
  if (kind === "video") return <VideoPreview item={item} />;
  if (kind === "audio") return <AudioPreview item={item} />;
  if (kind === "text") return <TextPreview item={item} />;
  if (kind === "pdf") return <PdfPreview item={item} />;
  if (kind === "url") return <UrlPreview item={item} />;
  if (kind === "unsupported") return <UnsupportedPreview item={item} />;
  return <ImagePreview item={item} srcKind={srcKind} />;
}

export const PreviewBodyHost = forwardRef<HTMLDivElement>(function PreviewBodyHost(_, ref) {
  const previewBodyState = useSyncExternalStore(subscribePreviewBodyState, getPreviewBodyState, getPreviewBodyState);
  return (
    <div
      ref={ref}
      id="previewBody"
      className={previewBodyClassName(previewBodyState?.kind)}
    >
      {previewBodyState ? <PreviewBody key={String(previewBodyState.item.id || "")} {...previewBodyState} /> : null}
    </div>
  );
});

function previewBodyClassName(kind?: PreviewBodyKind) {
  const base = "preview-body relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden p-0";
  if (kind === "video") return `${base} bg-[#05070a] max-h-full`;
  if (kind === "audio") return `${base} place-items-center bg-[#05070a]`;
  if (kind === "text") return `${base} overflow-auto bg-muted p-[18px]`;
  if (kind === "pdf") return `${base} bg-background`;
  if (kind === "url") return `${base} bg-background`;
  if (kind === "unsupported") return `${base} content-center justify-items-center gap-4 bg-[#05070a] p-8 [&_.preview-notice]:text-white`;
  return `${base} ${checkerboardClassName}`;
}
