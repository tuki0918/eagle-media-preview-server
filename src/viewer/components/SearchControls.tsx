import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, FunnelXIcon, Search, SearchSlashIcon, XIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { parseRatingFilter, ratingFilterSummary, toggleRatingFilter } from "../filters";
import { MEDIA_TYPE_OPTIONS, RATING_OPTIONS } from "../shellConfig";
import { getTagListState, setTagSearchQuery, subscribeTagListState } from "../tagListState";
import {
  getSearchControlsState,
  subscribeSearchControlsState,
} from "../searchControlsState";
import {
  changeMediaType,
  changeRating,
  changeSearchQuery,
  focusSearch,
  handleSearchKeyDown,
  handleSearchOutsidePointerDown,
  resetFilters,
  toggleFilters,
} from "../shellActions";
import { SearchIcon } from "./Icons";
import { TagChips } from "./TagChips";
import { TagSuggestions } from "./TagSuggestions";

interface SearchControlsProps {
  availableExts?: readonly string[];
  filtersOpen?: boolean;
  hasActiveFilters?: boolean;
  hasResettableFilters?: boolean;
  searchQuery?: string;
  selectedExt?: string;
  selectedRating?: string;
}

const selectClassName =
  "select-arrow h-11 w-full appearance-none rounded-xl border border-input bg-card py-0 pl-3 pr-10 text-base text-foreground shadow-sm hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-[720px]:text-sm";

export function SearchControls({
  filtersOpen,
  hasActiveFilters,
  hasResettableFilters,
  searchQuery,
  selectedExt,
  selectedRating,
}: SearchControlsProps) {
  const state = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const displayFiltersOpen = filtersOpen ?? state.filtersOpen;
  const displayHasActiveFilters = hasActiveFilters ?? state.hasActiveFilters;
  const displayHasResettableFilters = hasResettableFilters ?? (hasActiveFilters === undefined ? state.hasResettableFilters : displayHasActiveFilters);
  const displaySearchQuery = searchQuery ?? state.searchQuery;
  const displaySelectedExt = selectedExt ?? state.selectedExt;
  const displaySelectedRating = selectedRating ?? state.selectedRating;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      handleSearchOutsidePointerDown(event.target);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <section
      className="controls pointer-events-auto grid w-full gap-3 rounded-lg border border-border bg-[color-mix(in_srgb,var(--popover)_80%,transparent)] p-3 text-popover-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 min-[720px]:rounded-2xl"
      aria-label="Search and filters"
      hidden={!displayFiltersOpen}
    >
      <div className="search-row grid items-stretch gap-3 max-[540px]:gap-2">
        <InputGroup className="search-box min-h-[46px] rounded-xl transition-colors hover:bg-muted/20 max-[540px]:min-h-11">
          <SearchInput value={displaySearchQuery} />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <TagSuggestions />
        </InputGroup>
        <TagChips />
      </div>

      <AdvancedFilters
        availableExts={state.availableExts}
        filtersOpen={displayFiltersOpen}
        hasActiveFilters={displayHasActiveFilters}
        hasResettableFilters={displayHasResettableFilters}
        selectedExt={displaySelectedExt}
        selectedRating={displaySelectedRating}
      />
    </section>
  );
}

export function SearchInput({ value = "" }: { value?: string }) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
    <>
      <InputGroupInput
        id="searchInput"
        className={cn("unified-search-input min-w-0 pl-10", inputValue ? "pr-12" : "pr-3")}
        type="search"
        placeholder="Search title or tag"
        autoComplete="off"
        aria-label="Search text or tag"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.currentTarget.value);
          changeSearchQuery(event);
        }}
        onFocus={focusSearch}
        onKeyDown={handleSearchKeyDown}
      />
      {inputValue ? (
        <SearchClearButton
          id="clearSearchButton"
          label="Clear search text"
          onClear={() => {
            setInputValue("");
            changeSearchQuery({ currentTarget: { value: "" } });
            focusInputById("searchInput");
          }}
        />
      ) : null}
    </>
  );
}

// Our own clear button replaces the browser's "×" (missing in Firefox, tiny on touch screens) so every search box behaves the same.
function SearchClearButton({ id, label, onClear }: { id: string; label: string; onClear: () => void }) {
  return (
    <InputGroupAddon align="inline-end" className="right-1.5">
      <Button
        id={id}
        className="size-8 rounded-full text-muted-foreground hover:text-foreground max-[540px]:size-9"
        variant="ghost"
        size="icon-sm"
        type="button"
        aria-label={label}
        title={label}
        onClick={onClear}
      >
        <XIcon />
      </Button>
    </InputGroupAddon>
  );
}

// The shared Input primitive doesn't forward refs (React 18), so look the box up by id.
function focusInputById(id: string) {
  document.getElementById(id)?.focus();
}

export function AdvancedFilters({
  availableExts = [],
  filtersOpen = false,
  hasActiveFilters = false,
  hasResettableFilters = hasActiveFilters,
  selectedExt = "",
  selectedRating = "",
}: Pick<SearchControlsProps, "availableExts" | "filtersOpen" | "hasActiveFilters" | "hasResettableFilters" | "selectedExt" | "selectedRating">) {
  const extOptions = mediaTypeOptions(availableExts, selectedExt);
  return (
    <div id="advancedFilters" className="filter-row grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 max-[540px]:grid-cols-[minmax(0,1fr)_auto] max-[540px]:gap-3" hidden={!filtersOpen}>
      <label className="grid gap-2 max-[540px]:col-span-2">
        <select id="extSelect" className={selectClassName} aria-label="Type" value={selectedExt} onChange={changeMediaType}>
          <option value="">All types</option>
          {extOptions.map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <RatingFilter selectedRating={selectedRating} />
      <div className="flex justify-end">
        <ResetFiltersButton hasResettableFilters={hasResettableFilters} />
      </div>
    </div>
  );
}

function RatingFilter({ selectedRating }: { selectedRating: string }) {
  const selected = parseRatingFilter(selectedRating);
  const summary = ratingFilterSummary(selectedRating);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          id="ratingSelect"
          type="button"
          className={cn(selectClassName, "flex min-w-0 items-center text-left")}
          aria-label={`Rating: ${summary}`}
          title={summary}
        >
          <RatingFilterSummary ratings={selected} summary={summary} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent id="ratingFilterMenu" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl p-1.5">
        {RATING_OPTIONS.map((rating) => (
          <DropdownMenuPrimitive.CheckboxItem
            key={rating}
            data-slot="dropdown-menu-checkbox-item"
            className="group/rating flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
            checked={selected.includes(rating)}
            aria-label={rating === 0 ? "No rating" : `${rating} stars`}
            // Keep the menu open so several ratings can be picked in one go.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => changeRating(toggleRatingFilter(selectedRating, rating))}
          >
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-input bg-background text-primary-foreground transition-colors group-data-[state=checked]/rating:border-primary group-data-[state=checked]/rating:bg-primary"
              aria-hidden="true"
            >
              <DropdownMenuPrimitive.ItemIndicator>
                <CheckIcon className="size-3" strokeWidth={3} />
              </DropdownMenuPrimitive.ItemIndicator>
            </span>
            <RatingFilterLabel rating={rating} />
          </DropdownMenuPrimitive.CheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RatingFilterSummary({ ratings, summary }: { ratings: readonly number[]; summary: string }) {
  if (ratings.length === 1) return <RatingFilterLabel rating={ratings[0]} />;
  if (ratings.length > 1 && summary.startsWith("★")) {
    return (
      <span className="truncate">
        <span className="mr-1.5 text-foreground">★</span>
        {summary.slice(1)}
      </span>
    );
  }
  return <span className="truncate">{summary}</span>;
}

function RatingFilterLabel({ rating }: { rating: number }) {
  if (rating === 0) return <span className="shrink-0">None</span>;
  return (
    <span className="shrink-0 tracking-[0.08em]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className={value <= rating ? "text-foreground" : "text-[color-mix(in_srgb,var(--muted-foreground)_35%,transparent)]"}>
          ★
        </span>
      ))}
    </span>
  );
}

// Only offer extensions that exist in the library; fall back to the defaults until they load.
function mediaTypeOptions(availableExts: readonly string[], selectedExt: string): readonly string[] {
  const options = availableExts.length ? [...availableExts] : [...MEDIA_TYPE_OPTIONS];
  if (selectedExt && !options.includes(selectedExt)) options.push(selectedExt);
  return options;
}

function ResetFiltersButton({ hasResettableFilters = false }: Pick<SearchControlsProps, "hasResettableFilters">) {
  return (
    <Button
      id="resetFiltersButton"
      className="icon-button filter-reset-button size-10 min-w-10 rounded-full disabled:opacity-50 max-[540px]:size-11 max-[540px]:min-w-11"
      variant="outline"
      size="icon-sm"
      type="button"
      aria-label="Reset filters"
      title="Reset filters"
      disabled={!hasResettableFilters}
      onClick={resetFilters}
    >
      <FunnelXIcon data-icon="inline-start" />
    </Button>
  );
}

export const SMART_FOLDER_FILTERS_UNAVAILABLE_LABEL = "Search and filters aren't available in smart folders";

// All Tags only has a text search, so its panel is just the search box (with its clear button).
export function TagSearchControls({ filtersOpen, query }: { filtersOpen?: boolean; query?: string }) {
  const tagState = useSyncExternalStore(subscribeTagListState, getTagListState, getTagListState);
  const searchState = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const displayFiltersOpen = filtersOpen ?? searchState.filtersOpen;
  const displayQuery = query ?? tagState.query;
  // Opening the panel is a request to search, so put the caret straight in the box.
  useEffect(() => {
    if (displayFiltersOpen) focusInputById("tagSearchInput");
  }, [displayFiltersOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      handleSearchOutsidePointerDown(event.target);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <section
      id="tagSearchControls"
      className="controls pointer-events-auto grid w-full rounded-lg border border-border bg-[color-mix(in_srgb,var(--popover)_80%,transparent)] p-3 text-popover-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 min-[720px]:rounded-2xl"
      aria-label="Search tags"
      hidden={!displayFiltersOpen}
    >
      <InputGroup className="search-box min-h-[46px] rounded-xl transition-colors hover:bg-muted/20 max-[540px]:min-h-11">
        <InputGroupInput
          id="tagSearchInput"
          className={cn("min-w-0 pl-10", displayQuery ? "pr-12" : "pr-3")}
          type="search"
          placeholder="Search tags"
          aria-label="Search tags"
          autoComplete="off"
          value={displayQuery}
          onChange={(event) => setTagSearchQuery(event.currentTarget.value)}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {displayQuery ? (
          <SearchClearButton
            id="clearTagSearchButton"
            label="Clear tag search"
            onClear={() => {
              setTagSearchQuery("");
              focusInputById("tagSearchInput");
            }}
          />
        ) : null}
      </InputGroup>
    </section>
  );
}

export function SearchFiltersButton({
  activeFilters = [],
  filtersOpen = false,
  unavailableLabel,
}: Pick<SearchControlsProps, "filtersOpen"> & {
  activeFilters?: readonly string[];
  /** Set where search and filters have no effect (smart folders, All Tags); explains why the button is disabled. */
  unavailableLabel?: string;
}) {
  if (unavailableLabel) {
    return (
      <Button
        id="toggleFiltersButton"
        className="icon-button filter-toggle-button size-9 cursor-not-allowed rounded-full text-muted-foreground opacity-50 hover:bg-transparent hover:text-muted-foreground"
        variant="ghost"
        size="icon-sm"
        type="button"
        // aria-disabled (not disabled) keeps the hover title explaining why it can't be used.
        aria-disabled="true"
        aria-label={unavailableLabel}
        title={unavailableLabel}
      >
        <SearchSlashIcon className="size-[18px]" aria-hidden="true" />
      </Button>
    );
  }
  const baseLabel = filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  const activeCount = activeFilters.length;
  const label = activeCount
    ? `${baseLabel} (${activeCount} ${activeCount === 1 ? "filter" : "filters"} active: ${activeFilters.join(", ")})`
    : baseLabel;
  return (
    <Button
      id="toggleFiltersButton"
      className={cn(
        "icon-button filter-toggle-button relative size-9 rounded-full text-muted-foreground hover:text-foreground",
        (filtersOpen || activeCount > 0) && "bg-muted text-foreground",
      )}
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label={label}
      aria-expanded={filtersOpen}
      aria-controls="advancedFilters"
      title={label}
      onClick={toggleFilters}
    >
      <SearchIcon />
      {activeCount ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground [font-variant-numeric:tabular-nums]"
          aria-hidden="true"
        >
          {activeCount}
        </span>
      ) : null}
    </Button>
  );
}
