import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { errorMessage, getJson, mediaUrl } from "../../api";
import { hasNoThumbnail } from "../../media";
import type { EagleItem } from "../../types";
import { PreviewNotice } from "./shared";

const textPreviewClassName =
  "text-preview m-0 min-w-0 overflow-auto rounded-md border border-border bg-card p-[18px] font-mono text-[13px] leading-[1.55] text-card-foreground shadow-sm [overflow-wrap:anywhere] [white-space:pre-wrap]";
const pdfPreviewClassName = "pdf-preview h-full min-h-0 w-full border-0 bg-background";
const urlThumbPreviewClassName = "url-thumb-preview grid h-full min-h-0 place-items-center bg-[#05070a] p-5";
const urlThumbPreviewPanelClassName = "grid w-[min(760px,calc(100vw_-_40px))] gap-4";
const urlThumbPreviewImageClassName = "url-thumb-preview-image max-h-[min(66dvh,680px)] w-full max-w-full rounded-md object-contain shadow-[0_24px_80px_rgba(0,0,0,0.42)]";
const urlThumbPreviewPlaceholderClassName = "url-thumb-preview-placeholder grid min-h-[220px] place-items-center rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] px-5 text-center text-sm font-[680] text-white/70";
const urlThumbPreviewLinkClassName = "inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 justify-self-center rounded-md bg-primary px-4 text-sm font-[720] text-primary-foreground no-underline hover:bg-primary/90 [&_svg]:size-4";
const unsupportedThumbClassName = "unsupported-thumb max-h-[min(62dvh,640px)] w-[min(640px,calc(100vw_-_48px))] max-w-full object-contain";
const previewNoticeClassName = "preview-notice m-0 max-w-[560px] text-center text-[13px] leading-normal text-muted-foreground";
export function TextPreview({ item }: { item: EagleItem }) {
  const [text, setText] = useState("Loading...");

  useEffect(() => {
    let cancelled = false;
    setText("Loading...");
    (async () => {
      try {
        const response = await fetch(mediaUrl(String(item.id || ""), "file"));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextText = await response.text();
        if (!cancelled) setText(nextText);
      } catch (error) {
        if (!cancelled) setText(`Unable to load preview: ${errorMessage(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <pre className={textPreviewClassName}>
      <code>{text}</code>
    </pre>
  );
}

export function PdfPreview({ item }: { item: EagleItem }) {
  const title = item.name || item.id || "PDF preview";
  return (
    <iframe
      className={pdfPreviewClassName}
      src={mediaUrl(String(item.id || ""), "file")}
      title={title}
    />
  );
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
