import { useSyncExternalStore } from "react";
import { getEagleStatus, subscribeEagleStatus } from "../../eagleStatusState";

const previewNoticeClassName = "preview-notice m-0 max-w-[560px] text-center text-[13px] leading-normal text-muted-foreground";

export const MEDIA_SERVER_OFFLINE_MESSAGE = "Can't reach the media server right now.";

export function PreviewNotice({ message }: { message: string }) {
  return <p className={previewNoticeClassName}>{message}</p>;
}

// Centered over the preview, where the loading spinner was.
export function PreviewOverlayNotice({ message, className = "" }: { message: string; className?: string }) {
  return (
    <span className={`pointer-events-none absolute inset-0 z-[1] grid place-items-center p-6 ${className}`}>
      <PreviewNotice message={message} />
    </span>
  );
}

// A stopped server can leave a media request pending with no error event, so previews read the
// status check instead of spinning until the browser gives up.
export function useMediaServerOffline() {
  return useSyncExternalStore(subscribeEagleStatus, getEagleStatus, getEagleStatus) === "offline";
}
