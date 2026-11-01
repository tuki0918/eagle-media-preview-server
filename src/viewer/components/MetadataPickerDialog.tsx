import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MetadataSuggestion } from "../metadata";
import { showErrorToast } from "../toasts";
import { settingsDialogClassName, settingsDialogCloseClassName, settingsDialogHeaderClassName, settingsDialogTitleClassName } from "./settingsDialogStyles";

export interface MetadataPickerDialogProps {
  /** Tags accept typed values; folders must come from the suggestion list. */
  allowCreate: boolean;
  /** localStorage key that remembers which sections are collapsed; without it they reset on every open. */
  collapsedStorageKey?: string;
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  initialValues: readonly string[];
  labelFor: (value: string) => string;
  onApply: (values: string[]) => void | Promise<void>;
  onClose: () => void;
  onSuggestions: (query: string, selectedValues: string[]) => Promise<MetadataSuggestion[]> | MetadataSuggestion[];
  placeholder: string;
  title: string;
}

const pickerOptionClassName =
  "metadata-picker-option group flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none data-[active=true]:bg-accent data-[active=true]:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-45";
const pickerCheckClassName =
  "grid size-[18px] flex-none place-items-center rounded-[5px] border border-input bg-background text-transparent [&_svg]:size-3.5 group-aria-selected:border-primary group-aria-selected:bg-primary group-aria-selected:text-primary-foreground";
const pickerChipClassName =
  "metadata-picker-chip inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary py-0 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground [&>svg]:size-3.5";

export function MetadataPickerDialog({
  allowCreate,
  collapsedStorageKey,
  disabled = false,
  icon,
  id,
  initialValues,
  labelFor,
  onApply,
  onClose,
  onSuggestions,
  placeholder,
  title,
}: MetadataPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);
  // The query the rendered suggestions were loaded for; it lags behind the input while a search is pending.
  const loadedQuery = useRef<string | null>(null);
  const [draft, setDraft] = useState<string[]>(() => [...initialValues]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MetadataSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [collapsedSections, setCollapsedSections] = useState(() => readCollapsedSections(collapsedStorageKey));
  const titleId = `${id}Title`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    // Only focus the search field with a precise pointer; on touch it would open the keyboard over the list.
    if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const loadSuggestions = async (nextQuery: string) => {
    const currentRequest = ++requestId.current;
    try {
      // Request every candidate so already-selected values stay visible and can be unchecked.
      const items = await onSuggestions(nextQuery.trim(), []);
      if (currentRequest !== requestId.current) return;
      loadedQuery.current = nextQuery.trim();
      setSuggestions(items);
    } catch {
      if (currentRequest !== requestId.current) return;
      loadedQuery.current = nextQuery.trim();
      setSuggestions([]);
    }
  };

  useEffect(() => {
    loadSuggestions("");
    return () => {
      requestId.current += 1;
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [onSuggestions]);

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(-1);
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      loadSuggestions(nextQuery);
    }, 120);
  };

  /** Suggestions for exactly this query, fetching them when the list on screen is stale. */
  const suggestionsFor = async (value: string) => {
    if (loadedQuery.current === value) return suggestions;
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const currentRequest = ++requestId.current;
    let items: MetadataSuggestion[] = [];
    try {
      items = await onSuggestions(value, []);
    } catch {
      // Treat a failed lookup as no matches.
    }
    if (currentRequest === requestId.current) {
      loadedQuery.current = value;
      setSuggestions(items);
    }
    return items;
  };

  const trimmedQuery = query.trim();
  const createValue = allowCreate && trimmedQuery && !trimmedQuery.includes(",")
    && !draft.includes(trimmedQuery)
    && !suggestions.some((item) => item.value === trimmedQuery)
    ? trimmedQuery
    : "";
  const options: MetadataSuggestion[] = createValue
    ? [{ value: createValue, label: `Create "${createValue}"`, meta: "New" }, ...suggestions]
    : suggestions;
  const sections = optionSections(options);
  // Searching opens every section so no match is hidden inside a collapsed one.
  const isCollapsed = (section: OptionSection) => Boolean(section.group) && !trimmedQuery && collapsedSections.has(section.id);
  const visibleIndices = sections.flatMap((section) => isCollapsed(section) ? [] : section.entries.map((entry) => entry.index));

  const toggleSection = (section: OptionSection) => {
    if (section.entries.some((entry) => entry.index === activeIndex)) setActiveIndex(-1);
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(section.id)) next.delete(section.id);
      else next.add(section.id);
      writeCollapsedSections(collapsedStorageKey, next);
      return next;
    });
  };

  const toggleValue = (value: string) => {
    if (!value || disabled) return;
    setDraft((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]);
  };

  const addValues = (values: string[]) => {
    setDraft((current) => [...current, ...values.filter((value, index) => value && !current.includes(value) && values.indexOf(value) === index)]);
  };

  const clearQuery = () => {
    if (inputRef.current) inputRef.current.value = "";
    changeQuery("");
    inputRef.current?.focus({ preventScroll: true });
  };

  const submitTypedValue = async () => {
    if (!trimmedQuery) return;
    if (allowCreate) {
      addValues(trimmedQuery.split(",").map((value) => value.trim()).filter(Boolean));
      clearQuery();
      return;
    }
    const submittedQuery = trimmedQuery;
    const currentSuggestions = await suggestionsFor(submittedQuery);
    // Ignore the result if the user kept typing while the suggestions loaded.
    if ((inputRef.current?.value.trim() ?? submittedQuery) !== submittedQuery) return;
    const lowerQuery = submittedQuery.toLowerCase();
    const match = currentSuggestions.find((item) => item.value.toLowerCase() === lowerQuery || item.label.toLowerCase() === lowerQuery)
      || currentSuggestions.find((item) => !item.disabled && !draft.includes(item.value));
    if (!match) {
      showErrorToast("Unable to add folder", {
        description: "Choose an existing folder.",
      });
      return;
    }
    addValues([match.value]);
    clearQuery();
  };

  const moveActive = (step: number) => {
    if (!visibleIndices.length) return;
    const position = visibleIndices.indexOf(activeIndex);
    const nextPosition = position < 0 ? (step > 0 ? 0 : visibleIndices.length - 1) : (position + step + visibleIndices.length) % visibleIndices.length;
    const nextIndex = visibleIndices[nextPosition];
    setActiveIndex(nextIndex);
    listRef.current?.querySelector<HTMLElement>(`#${id}Option${nextIndex}`)?.scrollIntoView?.({ block: "nearest" });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const active = loadedQuery.current === trimmedQuery ? options[activeIndex] : undefined;
    if (active) {
      toggleValue(active.value);
      return;
    }
    submitTypedValue();
  };

  const apply = () => {
    if (disabled) return;
    onApply(draft);
  };

  const emptyMessage = trimmedQuery ? "No matches" : allowCreate ? "No tags yet. Type to create one." : "No folders";

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      aria-busy={disabled}
      className={`metadata-picker-dialog ${settingsDialogClassName} h-[min(600px,calc(100dvh-24px))] flex-col open:flex`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      // Keep these events from reaching the preview dialog (its close handler, swipe and arrow-key navigation).
      onClose={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className={settingsDialogHeaderClassName}>
        <h2 id={titleId} className={`${settingsDialogTitleClassName} [&_svg]:size-5`}>{icon}{title}</h2>
        <Button variant="ghost" size="icon" className={settingsDialogCloseClassName} aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><XIcon className="size-4" aria-hidden="true" /></Button>
      </header>
      <div className="grid shrink-0 gap-3 border-b border-border px-5 py-3">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            className="metadata-picker-input min-h-10 w-full min-w-0 rounded-xl border border-input bg-background pl-9 pr-10 text-base text-foreground min-[720px]:text-sm"
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls={`${id}Options`}
            aria-activedescendant={activeIndex >= 0 ? `${id}Option${activeIndex}` : undefined}
            autoComplete="off"
            enterKeyHint="done"
            role="combobox"
            aria-expanded="true"
            disabled={disabled}
            onInput={(event) => changeQuery(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
          />
          {query ? (
            <Button type="button" variant="ghost" size="icon-xs" className="absolute right-2 top-1/2 size-6 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground" aria-label="Clear search" title="Clear search" disabled={disabled} onClick={clearQuery}>
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </label>
        {draft.length ? (
          <div className="metadata-picker-selected flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected">
            {draft.map((value) => (
              <span key={value} className={pickerChipClassName}>
                {icon}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{labelFor(value)}</span>
                <Button className="size-[18px] rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:h-[13px] [&_svg]:w-[13px]" variant="ghost" size="icon-xs" type="button" aria-label={`Remove ${labelFor(value)}`} title={`Remove ${labelFor(value)}`} disabled={disabled} onClick={() => toggleValue(value)}>
                  <XIcon aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={listRef} id={`${id}Options`} className="metadata-picker-options grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto overscroll-contain p-2" role="listbox" aria-multiselectable="true" aria-label={title}>
        {options.length ? sections.map((section) => {
          const collapsed = isCollapsed(section);
          const rows = collapsed ? null : section.entries.map(({ item, index }) => {
            const isCreate = Boolean(createValue) && index === 0;
            const checked = !isCreate && draft.includes(item.value);
            return (
              <button
                key={isCreate ? `create:${item.value}` : `${section.key}\u0000${item.value}`}
                id={`${id}Option${index}`}
                type="button"
                role="option"
                aria-selected={checked}
                data-active={index === activeIndex}
                className={pickerOptionClassName}
                disabled={disabled}
                style={{ paddingLeft: `${10 + Math.min(Math.max(Number(item.depth || 0), 0), 8) * 16}px` }}
                onClick={() => {
                  setActiveIndex(index);
                  toggleValue(item.value);
                  if (isCreate) clearQuery();
                }}
              >
                {isCreate ? (
                  <span className="grid size-[18px] flex-none place-items-center text-muted-foreground [&_svg]:size-4" aria-hidden="true"><PlusIcon /></span>
                ) : (
                  <span className={pickerCheckClassName} aria-hidden="true"><CheckIcon /></span>
                )}
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
                {item.meta ? <span className="metadata-picker-option-meta flex-none rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.meta}</span> : null}
              </button>
            );
          });
          if (!section.group) return rows;
          const headingId = `${id}Group${section.entries[0].index}`;
          return (
            <div key={section.key} className="metadata-picker-group grid gap-0.5 pt-2 first:pt-0" role="group" aria-labelledby={headingId}>
              <button
                id={headingId}
                type="button"
                className="metadata-picker-group-heading flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 pb-1 pt-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                aria-expanded={!collapsed}
                aria-controls={`${headingId}Options`}
                disabled={Boolean(trimmedQuery)}
                onClick={() => toggleSection(section)}
              >
                <ChevronDownIcon className={`size-3.5 shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
                {section.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: section.color }} aria-hidden="true" /> : null}
                <span className="min-w-0 truncate">{section.group}</span>
                <span className="font-normal tabular-nums">({section.entries.length.toLocaleString()})</span>
              </button>
              {rows ? <div id={`${headingId}Options`} className="grid gap-0.5">{rows}</div> : null}
            </div>
          );
        }) : (
          <p className="metadata-picker-empty m-0 px-3 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <span className="text-xs tabular-nums text-muted-foreground">{draft.length.toLocaleString()} selected</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="h-9 rounded-full px-4" disabled={disabled} onClick={onClose}>Cancel</Button>
          <Button className="primary-action-button h-9 rounded-full px-4" disabled={disabled} onClick={apply}><CheckIcon className="size-4" aria-hidden="true" />Done</Button>
        </div>
      </footer>
    </dialog>
  );
}

interface OptionSection {
  color: string;
  entries: Array<{ index: number; item: MetadataSuggestion }>;
  group: string;
  id: string;
  key: string;
}

/** Splits options into runs that share a group heading, keeping each option's index in the flat list. */
function optionSections(options: readonly MetadataSuggestion[]) {
  const sections: OptionSection[] = [];
  options.forEach((item, index) => {
    const group = item.group || "";
    // Split on the section id, not the heading, so same-named sections never merge.
    const id = item.groupId || group;
    const last = sections[sections.length - 1];
    if (last && last.id === id) last.entries.push({ index, item });
    else sections.push({ color: item.groupColor || "", entries: [{ index, item }], group, id, key: `${id}\u0000${index}` });
  });
  return sections;
}

function readCollapsedSections(storageKey: string | undefined) {
  if (!storageKey) return new Set<string>();
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((key): key is string => typeof key === "string") : []);
  } catch {
    // Keep every section open when storage is unavailable or corrupted.
    return new Set<string>();
  }
}

function writeCollapsedSections(storageKey: string | undefined, collapsed: ReadonlySet<string>) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
  } catch {
    // Ignore unavailable storage; the in-memory state still updates.
  }
}
