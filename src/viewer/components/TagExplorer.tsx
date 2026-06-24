import { PinIcon, SearchIcon, TagIcon, XIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaUrl } from "../api";
import { getTagExplorerState, subscribeTagExplorerState, type TagExplorerGroup, type TagExplorerItem } from "../tagExplorerState";

export function TagExplorer() {
  const state = useSyncExternalStore(subscribeTagExplorerState, getTagExplorerState, getTagExplorerState);
  const items = useMemo(() => sortedTagItems(state.items), [state.items]);
  const pinnedSet = useMemo(() => new Set(state.pinnedTags), [state.pinnedTags]);
  const sections = useMemo(() => tagSections(items, state.groups, state.pinnedTags), [items, state.groups, state.pinnedTags]);

  return (
    <section id="tagExplorer" className="grid content-start gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-sm max-[540px]:rounded-none max-[540px]:border-x-0 max-[540px]:px-3" aria-label="Tag Explorer">
      <label className="relative min-w-0" htmlFor="tagExplorerSearch">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="tagExplorerSearch"
          className="h-9 rounded-lg pl-8 text-sm"
          value={state.query}
          placeholder="Search tags"
          onChange={(event) => state.onSearch(event.currentTarget.value)}
        />
      </label>

      {state.selectedTags.length ? (
        <section className="grid gap-2.5" aria-label="Selected tags">
          <div className="flex min-w-0 items-center gap-2 px-1">
            <h2 className="m-0 min-w-0 truncate text-[11px] font-normal uppercase tracking-normal text-muted-foreground">SELECTED TAG</h2>
            <span className="shrink-0 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">{state.selectedTags.length.toLocaleString()}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {state.selectedTags.map((tag) => (
              <span key={tag} className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-background py-[3px] pl-2.5 pr-1 text-xs text-foreground">
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tag}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-[22px] rounded-sm text-muted-foreground hover:!bg-muted hover:!text-foreground"
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove tag ${tag}`}
                  onClick={() => state.onRemoveSelectedTag(tag)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {state.status === "loading" && !items.length ? (
        <TagExplorerSkeleton />
      ) : state.status === "error" ? (
        <Card className="rounded-lg border border-border bg-card px-4 py-10 text-center shadow-sm">
          <strong className="block text-[15px] font-[760] text-destructive">Tags could not be loaded</strong>
          <p className="mx-auto mt-2 max-w-[420px] text-sm text-muted-foreground">{state.error || "Try refreshing after Eagle is available."}</p>
        </Card>
      ) : sections.length ? (
        <div className="grid gap-5">
          {sections.map((section) => (
            <section key={section.id} className="grid gap-2.5" aria-label={section.name}>
              <div className="flex min-w-0 items-center gap-2 px-1">
                <h2 className="m-0 min-w-0 truncate text-[11px] font-normal uppercase tracking-normal text-muted-foreground">{section.name}</h2>
                <span className="shrink-0 text-xs text-muted-foreground [font-variant-numeric:tabular-nums]">{section.items.length.toLocaleString()}</span>
              </div>
              <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                {section.items.map((item) => (
                  <TagCard
                    key={item.name}
                    item={item}
                    pinned={pinnedSet.has(item.name)}
                    onSelectTag={state.onSelectTag}
                    onTogglePinned={state.onTogglePinned}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="rounded-md border border-sidebar-border bg-transparent px-4 py-12 text-center shadow-none">
          <TagIcon className="mx-auto mb-2 size-12 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <strong className="block text-[15px] font-[760] text-foreground">No items matched these filters</strong>
          <p className="mx-auto mt-2 max-w-[420px] text-sm text-muted-foreground">Try changing the search text, folder, type, or rating to widen the results.</p>
        </Card>
      )}
    </section>
  );
}

function TagCard({
  item,
  pinned,
  onSelectTag,
  onTogglePinned,
}: {
  item: TagExplorerItem;
  pinned: boolean;
  onSelectTag: (tag: string) => void;
  onTogglePinned: (tag: string) => void;
}) {
  const count = Number(item.count);
  const displayCount = Number.isFinite(count) && count >= 0 ? count : 0;
  const thumbnailId = item.thumbnailItem?.id ? String(item.thumbnailItem.id) : "";

  return (
    <article className="group grid min-h-14 min-w-0 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-transparent px-1.5 py-1 transition-colors hover:bg-accent hover:text-accent-foreground">
      <button
        type="button"
        className="relative block size-[42px] touch-manipulation overflow-hidden rounded-md border border-border bg-muted p-0 text-left"
        title={item.name}
        onClick={() => onSelectTag(item.name)}
      >
        {thumbnailId ? (
          <img className="block h-full w-full object-cover" src={mediaUrl(thumbnailId, "thumb")} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <TagIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
      </button>
      <button
        type="button"
        className="grid min-w-0 gap-0.5 border-0 bg-transparent p-0 text-left"
        title={item.name}
        onClick={() => onSelectTag(item.name)}
      >
        <span className="block truncate text-[13px] font-normal leading-[1.25] text-foreground group-hover:text-accent-foreground">{item.name}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground [font-variant-numeric:tabular-nums]">
            {displayCount.toLocaleString()} items
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={[
          "size-8 rounded-md text-muted-foreground hover:!bg-foreground/10 hover:!text-foreground hover:!shadow-sm hover:!ring-1 hover:!ring-border dark:hover:!bg-foreground/15",
          pinned ? "bg-muted text-foreground" : "",
        ].join(" ")}
        aria-label={`${pinned ? "Unpin" : "Pin"} ${item.name}`}
        title={`${pinned ? "Unpin" : "Pin"} ${item.name}`}
        aria-pressed={pinned}
        onClick={() => onTogglePinned(item.name)}
      >
        <PinIcon className={pinned ? "fill-current text-foreground" : "text-muted-foreground"} aria-hidden="true" />
      </Button>
    </article>
  );
}

function TagExplorerSkeleton() {
  return (
    <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]" aria-label="Loading tags">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="grid min-h-14 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1">
          <Skeleton className="size-[42px] rounded-md" />
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="size-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function sortedTagItems(items: readonly TagExplorerItem[]) {
  return [...items].sort((a, b) => {
    const countDiff = Number(b.count || 0) - Number(a.count || 0);
    if (countDiff) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

type TagSection = {
  id: string;
  items: TagExplorerItem[];
  kind: "group" | "pinned" | "ungrouped";
  name: string;
};

function tagSections(items: readonly TagExplorerItem[], groups: readonly TagExplorerGroup[], pinnedTags: readonly string[]): TagSection[] {
  const sections: TagSection[] = [];
  const pinnedSet = new Set(pinnedTags);
  const pinnedItems = pinnedTags
    .map((tag) => items.find((item) => item.name === tag))
    .filter((item): item is TagExplorerItem => Boolean(item));
  if (pinnedItems.length) {
    sections.push({ id: "__pinned__", items: pinnedItems, kind: "pinned", name: "Pinned Tags" });
  }

  const assigned = new Set(pinnedItems.map((item) => item.name));
  for (const group of groups) {
    const groupTagSet = new Set(group.tags);
    const groupItems = items.filter((item) => !assigned.has(item.name) && (item.groups.includes(group.id) || groupTagSet.has(item.name)));
    if (!groupItems.length) continue;
    for (const item of groupItems) assigned.add(item.name);
    sections.push({
      id: group.id,
      items: groupItems,
      kind: "group",
      name: group.name,
    });
  }

  const ungroupedItems = items.filter((item) => !assigned.has(item.name) && !pinnedSet.has(item.name));
  if (ungroupedItems.length) {
    sections.push({
      id: groups.length ? "__ungrouped__" : "__all__",
      items: ungroupedItems,
      kind: "ungrouped",
      name: groups.length ? "Ungrouped" : "All Tags",
    });
  }
  return sections;
}
