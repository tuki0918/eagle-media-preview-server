import { useEffect, useState, useSyncExternalStore } from "react";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "../shellConfig";
import {
  getSearchControlsState,
  subscribeSearchControlsState,
} from "../searchControlsState";
import {
  changeFolder,
  changeMediaType,
  changePageSize,
  changeRating,
  changeSearchQuery,
  focusSearch,
  handleSearchKeyDown,
  handleSearchOutsidePointerDown,
  resetFilters,
  toggleFilters,
} from "../shellActions";
import type { EagleFolder } from "../types";
import { FolderOptions } from "./FolderOptions";
import { SearchIcon } from "./Icons";
import { TagChips } from "./TagChips";
import { TagSuggestions } from "./TagSuggestions";

interface SearchControlsProps {
  filtersOpen?: boolean;
  folders?: readonly EagleFolder[];
  hasActiveFilters?: boolean;
  searchQuery?: string;
  selectedExt?: string;
  selectedFolderId?: string;
  selectedLimit?: number;
  selectedRating?: string;
}

export function SearchControls({
  filtersOpen,
  folders,
  hasActiveFilters,
  searchQuery,
  selectedExt,
  selectedFolderId,
  selectedLimit,
  selectedRating,
}: SearchControlsProps) {
  const state = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const displayFiltersOpen = filtersOpen ?? state.filtersOpen;
  const displayFolders = folders ?? state.folders;
  const displayHasActiveFilters = hasActiveFilters ?? state.hasActiveFilters;
  const displaySearchQuery = searchQuery ?? state.searchQuery;
  const displaySelectedExt = selectedExt ?? state.selectedExt;
  const displaySelectedFolderId = selectedFolderId ?? state.selectedFolderId;
  const displaySelectedLimit = selectedLimit ?? state.selectedLimit;
  const displaySelectedRating = selectedRating ?? state.selectedRating;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      handleSearchOutsidePointerDown(event.target);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <section className="controls grid gap-4 pb-2" aria-label="Search and filters">
      <div className="search-row grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch gap-3 max-[540px]:gap-2">
        <div className="search-box relative flex min-h-[50px] items-center gap-2.5 rounded-app border border-app-border bg-app-surface px-4 py-[7px] shadow-app-soft hover:border-app-border-strong max-[540px]:min-h-11 max-[540px]:gap-2 max-[540px]:px-2.5 max-[540px]:py-[5px]">
          <SearchIcon />
          <div className="search-composer flex min-w-0 flex-auto flex-wrap items-center gap-x-2 gap-y-1.5 max-[540px]:flex-nowrap max-[540px]:overflow-hidden max-[540px]:gap-1.5">
            <TagChips />
            <SearchInput value={displaySearchQuery} />
          </div>
          <TagSuggestions />
        </div>
        <ResetFiltersButton hasActiveFilters={displayHasActiveFilters} />
        <ToggleFiltersButton filtersOpen={displayFiltersOpen} />
      </div>

      <AdvancedFilters
        filtersOpen={displayFiltersOpen}
        folders={displayFolders}
        selectedExt={displaySelectedExt}
        selectedFolderId={displaySelectedFolderId}
        selectedLimit={displaySelectedLimit}
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
    <input
      id="searchInput"
      className="unified-search-input min-h-[34px] min-w-[180px] flex-[1_1_220px] border-0 bg-transparent text-[15px] text-app-text outline-0 max-[540px]:min-w-0 max-[540px]:basis-[72px]"
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
  filtersOpen = false,
  folders = [],
  selectedExt = "",
  selectedFolderId = "",
  selectedLimit = 30,
  selectedRating = "",
}: Pick<SearchControlsProps, "filtersOpen" | "folders" | "selectedExt" | "selectedFolderId" | "selectedLimit" | "selectedRating">) {
  return (
    <div id="advancedFilters" className="filter-row grid grid-cols-4 gap-6 max-[540px]:grid-cols-1 max-[540px]:gap-3" hidden={!filtersOpen}>
      <label className="grid gap-2">
        <select id="folderSelect" aria-label="Folder" value={selectedFolderId} onChange={changeFolder}>
          <FolderOptions folders={folders} />
        </select>
      </label>
      <label className="grid gap-2">
        <select id="extSelect" aria-label="Type" value={selectedExt} onChange={changeMediaType}>
          <option value="">All types</option>
          {MEDIA_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <select id="ratingSelect" aria-label="Rating" value={selectedRating} onChange={changeRating}>
          <option value="">All ratings</option>
          <option value="0">No rating</option>
          {RATING_OPTIONS.map((rating) => (
            <option key={rating} value={rating}>
              ★ {rating}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <select id="pageSizeSelect" aria-label="Page size" value={selectedLimit} onChange={changePageSize}>
          {PAGE_SIZE_OPTIONS.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} items
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ResetFiltersButton({ hasActiveFilters = false }: Pick<SearchControlsProps, "hasActiveFilters">) {
  return (
    <button
      id="resetFiltersButton"
      className="icon-button filter-reset-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text disabled:cursor-default disabled:opacity-[0.42] max-[540px]:min-h-11 max-[540px]:w-11 max-[540px]:min-w-11"
      type="button"
      aria-label="Reset filters"
      title="Reset filters"
      disabled={!hasActiveFilters}
      onClick={resetFilters}
    >
      <FunnelXIcon />
    </button>
  );
}

function ToggleFiltersButton({ filtersOpen = false }: Pick<SearchControlsProps, "filtersOpen">) {
  const label = filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  return (
    <button
      id="toggleFiltersButton"
      className="icon-button filter-toggle-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text max-[540px]:min-h-11 max-[540px]:w-11 max-[540px]:min-w-11"
      type="button"
      aria-label={label}
      aria-expanded={filtersOpen}
      aria-controls="advancedFilters"
      title={label}
      onClick={toggleFilters}
    >
      <SlidersHorizontalIcon />
    </button>
  );
}

function FunnelXIcon() {
  return (
    <svg className="h-5 w-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473" />
      <path d="m16.5 3.5 5 5" />
      <path d="m21.5 3.5-5 5" />
    </svg>
  );
}

function SlidersHorizontalIcon() {
  return (
    <svg className="h-5 w-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </svg>
  );
}
