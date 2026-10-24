import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, StarIcon, TagIcon, TagsIcon } from "lucide-react";
import { mediaUrl } from "../api";
import { TAG_SECTIONS_COLLAPSED_STORAGE_KEY } from "../constants";
import { thumbnailMediaType } from "../media";
import { loadTagCover } from "../tagCovers";
import { getTagListState, subscribeTagListState } from "../tagListState";
import { buildTagSections, type TagEntry } from "../tagOverview";
import type { EagleItem } from "../types";
import { ResultStateView } from "./ResultState";

const tagGridClassName = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-1";

export function TagList() {
  const state = useSyncExternalStore(subscribeTagListState, getTagListState, getTagListState);
  const sections = useMemo(() => buildTagSections(state.overview, state.query), [state.overview, state.query]);
  const { isCollapsed, toggle } = useCollapsedTagSections();

  if (state.status === "loading" && !state.overview) return <ResultStateView kind="message" text="Loading tags" className="loading" />;
  if (state.status === "error") return <ResultStateView kind="message" title="Unable to load tags" text={state.error} className="error" />;

  const hasTags = Boolean(state.overview?.tags?.length);
  const onSelect = state.onSelectTag;

  return (
    <div id="tagList" className="flex flex-col gap-6">
      {!hasTags ? (
        <EmptyTags title="No tags yet" text="Tags added to items show up here." />
      ) : !sections.total ? (
        <EmptyTags title="No tags matched" text="Try a different search." />
      ) : (
        <>
          <TagSection
            collapsed={isCollapsed(STARRED_SECTION_KEY)}
            label="Starred Tags"
            tags={sections.starred}
            starred
            onSelect={onSelect}
            onToggle={() => toggle(STARRED_SECTION_KEY)}
          />
          {sections.groups.map((group) => (
            <TagSection
              key={group.id}
              collapsed={isCollapsed(groupSectionKey(group.id))}
              color={group.color}
              label={group.name}
              tags={group.tags}
              onSelect={onSelect}
              onToggle={() => toggle(groupSectionKey(group.id))}
            />
          ))}
          <TagSection
            collapsed={isCollapsed(UNGROUPED_SECTION_KEY)}
            label="Ungrouped"
            tags={sections.ungrouped}
            onSelect={onSelect}
            onToggle={() => toggle(UNGROUPED_SECTION_KEY)}
          />
        </>
      )}
    </div>
  );
}

function EmptyTags({ text, title }: { text: string; title: string }) {
  return (
    <div className="grid min-h-[clamp(240px,calc(100dvh-300px),420px)] content-center justify-items-center gap-2.5 rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
      <TagsIcon className="mb-1 size-14 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <strong className="text-[17px] font-[760] text-foreground">{title}</strong>
      <p className="m-0 max-w-[420px] text-sm leading-[1.55] text-muted-foreground">{text}</p>
    </div>
  );
}

function TagSection({
  collapsed,
  color = "",
  label,
  onSelect,
  onToggle,
  starred = false,
  tags,
}: {
  collapsed: boolean;
  color?: string;
  label: string;
  onSelect: (tag: string) => void;
  onToggle: () => void;
  starred?: boolean;
  tags: readonly TagEntry[];
}) {
  if (!tags.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <h2 className="m-0">
        <button
          type="button"
          className="flex max-w-full items-center gap-2 rounded-lg border-0 bg-transparent px-1 py-1 text-left text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
          onClick={onToggle}
        >
          <ChevronDownIcon
            className={`size-3.5 shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden="true"
          />
          {color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" /> : null}
          <span className="min-w-0 truncate">{label}</span>
          <span className="[font-variant-numeric:tabular-nums]">{tags.length.toLocaleString()}</span>
        </button>
      </h2>
      {collapsed ? null : (
        <ul className={`m-0 list-none p-0 ${tagGridClassName}`}>
          {tags.map((tag) => (
            <li key={tag.name} className="min-w-0">
              <TagCard tag={tag} starred={starred} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STARRED_SECTION_KEY = "starred";
const UNGROUPED_SECTION_KEY = "ungrouped";

function groupSectionKey(groupId: string) {
  return `group:${groupId}`;
}

// Sections start expanded; only the collapsed ones are remembered so new groups show up open.
function useCollapsedTagSections() {
  const [collapsed, setCollapsed] = useState(readCollapsedTagSections);
  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCollapsedTagSections(next);
      return next;
    });
  }, []);
  return { isCollapsed: (key: string) => collapsed.has(key), toggle };
}

function readCollapsedTagSections() {
  try {
    if (typeof window === "undefined") return new Set<string>();
    const saved = JSON.parse(window.localStorage.getItem(TAG_SECTIONS_COLLAPSED_STORAGE_KEY) || "[]") as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((key): key is string => typeof key === "string") : []);
  } catch {
    // Keep every section open when storage is unavailable or corrupted.
    return new Set<string>();
  }
}

function writeCollapsedTagSections(collapsed: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(TAG_SECTIONS_COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Ignore unavailable storage; the in-memory state still updates.
  }
}

function TagCard({ onSelect, starred, tag }: { onSelect: (tag: string) => void; starred: boolean; tag: TagEntry }) {
  const countLabel = `${tag.count.toLocaleString()} ${tag.count === 1 ? "item" : "items"}`;
  return (
    <button
      type="button"
      className="tag-card flex w-full min-w-0 items-center gap-3 rounded-xl border-0 bg-transparent p-2 text-left text-inherit transition-colors hover:bg-muted focus-visible:bg-muted"
      title={tag.name}
      onClick={() => onSelect(tag.name)}
    >
      <TagCover tag={tag.name} empty={tag.count === 0} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-[15px] font-medium leading-tight text-foreground">{tag.name}</span>
        <span className="text-[13px] leading-tight text-muted-foreground [font-variant-numeric:tabular-nums]">{countLabel}</span>
      </span>
      {starred ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-label="Starred" role="img">
          <StarIcon className="size-4 fill-current" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}

function TagCover({ empty, tag }: { empty: boolean; tag: string }) {
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
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [empty]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setItem(null);
    setMissing(false);
    void loadTagCover(tag).then((cover) => {
      if (cancelled) return;
      setItem(cover);
      setSourceKind(cover?.noThumbnail === true && thumbnailMediaType(cover) === "image" ? "file" : "thumb");
      if (!cover) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tag, visible]);

  const showImage = item?.id && !missing;
  return (
    <span ref={ref} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
      {showImage ? (
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
      ) : (
        <TagIcon className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}
