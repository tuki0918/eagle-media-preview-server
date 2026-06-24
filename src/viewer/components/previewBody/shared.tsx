const previewNoticeClassName = "preview-notice m-0 max-w-[560px] text-center text-[13px] leading-normal text-muted-foreground";

export function PreviewNotice({ message }: { message: string }) {
  return <p className={previewNoticeClassName}>{message}</p>;
}
