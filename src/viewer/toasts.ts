import { toast, type ExternalToast } from "sonner";
import { getPreviewDialogState } from "./previewDialogState";

const VIEWER_TOASTER_ID = "viewer";
const PREVIEW_TOASTER_ID = "preview";

function currentToasterId() {
  return getPreviewDialogState().open ? PREVIEW_TOASTER_ID : VIEWER_TOASTER_ID;
}

function toastOptions(options?: ExternalToast): ExternalToast {
  return {
    ...options,
    toasterId: currentToasterId(),
  };
}

export function showSuccessToast(message: string, options?: ExternalToast) {
  toast.success(message, toastOptions(options));
}

export function showErrorToast(message: string, options?: ExternalToast) {
  toast.error(message, toastOptions(options));
}

export { PREVIEW_TOASTER_ID, VIEWER_TOASTER_ID };
