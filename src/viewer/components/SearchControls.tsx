import { useEffect, useState, useSyncExternalStore } from "react";
import { FunnelXIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { MEDIA_TYPE_OPTIONS, RATING_OPTIONS } from "../shellConfig";
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
    <InputGroupInput
      id="searchInput"
      className="unified-search-input min-w-0 pl-10 pr-3"
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
  );
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
      <label className="grid gap-2">
        <select id="ratingSelect" className={selectClassName} aria-label="Rating" value={selectedRating} onChange={changeRating}>
          <option value="">All ratings</option>
          <option value="0">No rating</option>
          {RATING_OPTIONS.map((rating) => (
            <option key={rating} value={rating}>
              ★ {rating}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end">
        <ResetFiltersButton hasResettableFilters={hasResettableFilters} />
      </div>
    </div>
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
      className="icon-button filter-reset-button size-10 min-w-10 rounded-full disabled:opacity-[0.42] max-[540px]:size-11 max-[540px]:min-w-11"
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

export function SearchFiltersButton({
  activeFilters = [],
  filtersOpen = false,
}: Pick<SearchControlsProps, "filtersOpen"> & { activeFilters?: readonly string[] }) {
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
