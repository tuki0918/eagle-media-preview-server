import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage, getJson, mediaUrl } from "../../api";
import { directFileUrl, isStandaloneApp } from "../../fileLinks";
import { hasNoThumbnail } from "../../media";
import type { EagleItem } from "../../types";
import { MEDIA_SERVER_OFFLINE_MESSAGE, PreviewNotice, useMediaServerOffline } from "./shared";

const textPreviewClassName =
  "text-preview m-0 min-w-0 overflow-auto rounded-md border border-border bg-card p-[18px] font-mono text-[13px] leading-[1.55] text-card-foreground shadow-sm [overflow-wrap:anywhere] [white-space:pre-wrap]";
const pdfPreviewClassName = "pdf-preview h-full min-h-0 w-full border-0 bg-background";
const pdfOpenLinkClassName = "primary-action-button direct-file-link pdf-open-link absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-[1] min-h-11 -translate-x-1/2 cursor-pointer gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold leading-none text-primary-foreground no-underline shadow-lg [&_svg]:size-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2]";
const pdfUnsupportedNoticeClassName = "pdf-unsupported-notice pointer-events-none absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-[1] m-0 w-max max-w-[calc(100%_-_32px)] -translate-x-1/2 rounded-md bg-[rgba(5,7,10,0.82)] px-4 py-2.5 text-center text-[13px] leading-normal text-white shadow-lg";
// Mobile WebKit renders a PDF inside an iframe as a static image of its first page.
const PDF_INLINE_PAGES_LIMITED_QUERY = "(hover: none) and (pointer: coarse)";
const urlThumbPreviewClassName = "url-thumb-preview grid h-full min-h-0 place-items-center bg-[#05070a] p-5";
const urlThumbPreviewPanelClassName = "grid w-[min(760px,calc(100vw_-_40px))] gap-4";
const urlThumbPreviewImageClassName = "url-thumb-preview-image max-h-[min(66dvh,680px)] w-full max-w-full rounded-md object-contain shadow-[0_24px_80px_rgba(0,0,0,0.42)]";
const urlThumbPreviewPlaceholderClassName = "url-thumb-preview-placeholder grid min-h-[220px] place-items-center rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] px-5 text-center text-sm font-[680] text-white/70";
const urlThumbPreviewLinkClassName = "inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 justify-self-center rounded-md bg-primary px-4 text-sm font-[720] text-primary-foreground no-underline hover:bg-primary/90 [&_svg]:size-4";
const unsupportedThumbClassName = "unsupported-thumb max-h-[min(62dvh,640px)] w-[min(640px,calc(100vw_-_48px))] max-w-full object-contain";
const previewNoticeClassName = "preview-notice m-0 max-w-[560px] text-center text-[13px] leading-normal text-muted-foreground";
const TEXT_LOADING = "Loading...";

export function TextPreview({ item }: { item: EagleItem }) {
  const [text, setText] = useState(TEXT_LOADING);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const offline = useMediaServerOffline();
  const wasOffline = useRef(offline);

  // Fetch again once the server is back, since the failed or stalled request won't recover.
  useEffect(() => {
    if (wasOffline.current && !offline && !loaded) setLoadAttempt((attempt) => attempt + 1);
    wasOffline.current = offline;
  }, [offline]);

  useEffect(() => {
    let cancelled = false;
    setText(TEXT_LOADING);
    setLoaded(false);
    (async () => {
      try {
        const response = await fetch(mediaUrl(String(item.id || ""), "file"));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextText = await response.text();
        if (!cancelled) {
          setText(nextText);
          setLoaded(true);
        }
      } catch (error) {
        if (!cancelled) setText(`Unable to load preview: ${errorMessage(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, loadAttempt]);

  return (
    <pre className={textPreviewClassName}>
      <code>{offline && !loaded ? MEDIA_SERVER_OFFLINE_MESSAGE : text}</code>
    </pre>
  );
}

export function PdfPreview({ item }: { item: EagleItem }) {
  const title = item.name || item.id || "PDF preview";
  const inlinePagesLimited = usePdfInlinePagesLimited();
  // The standalone app has no direct file viewing, so it can only say the rest is unavailable.
  const standalone = isStandaloneApp();
  return (
    <>
      <iframe
        className={pdfPreviewClassName}
        src={mediaUrl(String(item.id || ""), "file")}
        title={title}
      />
      {inlinePagesLimited && standalone ? (
        <p className={pdfUnsupportedNoticeClassName}>PDF is not supported in this app.</p>
      ) : null}
      {inlinePagesLimited && !standalone ? (
        <Button asChild className={pdfOpenLinkClassName}>
          <a href={directFileUrl(item)} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>
            <ExternalLinkIcon />
            Open file
          </a>
        </Button>
      ) : null}
    </>
  );
}

function usePdfInlinePagesLimited() {
  const [limited, setLimited] = useState(() => typeof window !== "undefined" && window.matchMedia?.(PDF_INLINE_PAGES_LIMITED_QUERY).matches === true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PDF_INLINE_PAGES_LIMITED_QUERY);
    const sync = () => setLimited(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return limited;
}

export function UrlPreview({ item }: { item: EagleItem }) {
  const [externalUrl, setExternalUrl] = useState(() => safeExternalUrl(item.url));

  useEffect(() => {
    let cancelled = false;
    const itemUrl = safeExternalUrl(item.url);
    setExternalUrl(itemUrl);
    if (itemUrl) return;
    (async () => {
      try {
        const data = await getJson<{ url?: unknown }>(`/api/items/${encodeURIComponent(String(item.id || ""))}/url-preview`);
        const nextExternalUrl = safeExternalUrl(data.url);
        if (!cancelled) setExternalUrl(nextExternalUrl);
      } catch {
        if (!cancelled) setExternalUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.url]);

  return (
    <section className={urlThumbPreviewClassName} aria-label="Link preview">
      <div className={urlThumbPreviewPanelClassName}>
        {hasNoThumbnail(item) ? (
          <div className={urlThumbPreviewPlaceholderClassName}>No thumbnail</div>
        ) : (
          <img
            className={urlThumbPreviewImageClassName}
            src={mediaUrl(String(item.id || ""), "thumb")}
            alt={item.name || item.id || ""}
            decoding="async"
          />
        )}
        {externalUrl ? (
          <a className={urlThumbPreviewLinkClassName} href={externalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon aria-hidden="true" />
            このページを開く
          </a>
        ) : (
          <PreviewNotice message="URL is unavailable" />
        )}
      </div>
    </section>
  );
}

export function safeExternalUrl(value: unknown) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function UnsupportedPreview({ item }: { item: EagleItem }) {
  return (
    <>
      {hasNoThumbnail(item) ? null : (
        <img className={unsupportedThumbClassName} src={mediaUrl(String(item.id || ""), "thumb")} alt={item.name || item.id || ""} />
      )}
      <PreviewNotice message={`${(item.ext || "This format").toUpperCase()} is not supported in this browser.`} />
    </>
  );
}
