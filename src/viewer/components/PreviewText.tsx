import { useSyncExternalStore } from "react";
import { getPreviewTextState, subscribePreviewTextState } from "../previewTextState";

interface PreviewMetaProps {
  value?: string;
}

interface PreviewOriginalNameProps {
  id?: string;
  source?: "display" | "original";
  value?: string;
}

export function PreviewMeta({ value }: PreviewMetaProps) {
  const state = useSyncExternalStore(subscribePreviewTextState, getPreviewTextState, getPreviewTextState);
  return <span id="previewMeta">{value ?? state.meta}</span>;
}

export function PreviewOriginalName({ id = "previewOriginalName", source = "original", value }: PreviewOriginalNameProps) {
  const state = useSyncExternalStore(subscribePreviewTextState, getPreviewTextState, getPreviewTextState);
  const displayValue = value ?? (source === "display" ? state.displayName : state.originalName);

  return (
    <div
      id={id}
      className="preview-original-name-value w-full min-w-0 whitespace-normal text-sm leading-[1.4] text-foreground [overflow-wrap:anywhere]"
      title={displayValue || undefined}
    >
      {displayValue}
    </div>
  );
}
