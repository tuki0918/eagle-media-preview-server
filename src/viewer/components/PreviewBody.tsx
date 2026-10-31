import { forwardRef, useCallback, useRef, useSyncExternalStore } from "react";
import { useImageFullscreen, type ImageFullscreenControls } from "../useImageFullscreen";
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

export function PreviewBody({ item, kind, srcKind = "file", imageFullscreen }: PreviewBodyProps & { imageFullscreen?: ImageFullscreenControls }) {
  if (kind === "video") return <VideoPreview item={item} />;
  if (kind === "audio") return <AudioPreview item={item} />;
  if (kind === "text") return <TextPreview item={item} />;
  if (kind === "pdf") return <PdfPreview item={item} />;
  if (kind === "url") return <UrlPreview item={item} />;
  if (kind === "unsupported") return <UnsupportedPreview item={item} />;
  return <ImagePreview item={item} srcKind={srcKind} fullscreen={imageFullscreen} />;
}

export const PreviewBodyHost = forwardRef<HTMLDivElement>(function PreviewBodyHost(_, ref) {
  const previewBodyState = useSyncExternalStore(subscribePreviewBodyState, getPreviewBodyState, getPreviewBodyState);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const setSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const imageFullscreen = useImageFullscreen(surfaceRef, previewBodyState?.kind === "image");
  return (
    <div
      ref={setSurfaceRef}
      id="previewBody"
      className={`${previewBodyClassName(previewBodyState?.kind)}${imageFullscreen.active ? " !fixed inset-0 z-[10] !h-dvh w-screen !bg-black" : ""}`}
    >
      {previewBodyState ? <PreviewBody key={String(previewBodyState.item.id || "")} {...previewBodyState} imageFullscreen={imageFullscreen} /> : null}
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
  return `${base} bg-muted`;
}
