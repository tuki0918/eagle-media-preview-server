import { useEffect, useRef, useState } from "react";
import { FolderIcon } from "lucide-react";
import { mediaUrl } from "../api";
import { loadFolderCover } from "../folderCovers";
import { thumbnailMediaType } from "../media";
import type { EagleItem } from "../types";

interface FolderCoverProps {
  folderId: string;
  smart?: boolean;
  empty?: boolean;
}

export function FolderCover({ folderId, smart = false, empty = false }: FolderCoverProps) {
  // Reset visibility and image fallback state when a card is reused for another folder.
  return <FolderCoverImage key={JSON.stringify([folderId, smart, empty])} folderId={folderId} smart={smart} empty={empty} />;
}

function FolderCoverImage({ folderId, smart, empty }: Required<FolderCoverProps>) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<EagleItem | null>(null);
  const [sourceKind, setSourceKind] = useState<"file" | "thumb">("thumb");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || empty) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [empty]);

  useEffect(() => {
    if (!visible || empty) return;
    let cancelled = false;
    void loadFolderCover(folderId, smart).then((cover) => {
      if (cancelled) return;
      setItem(cover);
      setSourceKind(cover?.noThumbnail === true && thumbnailMediaType(cover) === "image" ? "file" : "thumb");
      if (!cover) setMissing(true);
    });
    return () => { cancelled = true; };
  }, [folderId, smart, visible, empty]);

  return (
    <span ref={ref} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
      {item?.id && !missing ? (
        <img
          className="size-full object-cover"
          alt=""
          decoding="async"
          loading="lazy"
          src={mediaUrl(String(item.id), sourceKind)}
          onError={() => {
            if (sourceKind === "thumb" && thumbnailMediaType(item) === "image") {
              setSourceKind("file");
              return;
            }
            setMissing(true);
          }}
        />
      ) : <FolderIcon className="size-5" aria-hidden="true" />}
    </span>
  );
}
