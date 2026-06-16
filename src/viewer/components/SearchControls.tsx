import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { FunnelXIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "../shellConfig";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
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

const selectClassName =
  "h-12 w-full appearance-none rounded-lg border border-input bg-card py-0 pl-3 pr-10 text-base text-foreground shadow-sm hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-[720px]:text-sm";

const selectArrowStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 18px center",
  backgroundRepeat: "no-repeat",
};

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
  const loginState = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const showAccountMenuTrigger = loginState.authRequired && loginState.authenticated;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      handleSearchOutsidePointerDown(event.target);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <section className="controls grid gap-4 pb-2" aria-label="Search and filters">
      <div
        className={cn(
          "search-row grid items-stretch gap-3 max-[540px]:gap-2",
          showAccountMenuTrigger ? "grid-cols-[auto_minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto_auto]",
        )}
      >
        {showAccountMenuTrigger ? <AccountMenuTrigger /> : null}
        <div className="search-box relative flex min-h-[50px] items-center gap-2.5 rounded-lg border border-input bg-card px-3 py-1.5 shadow-sm transition-colors hover:bg-muted/20 max-[540px]:min-h-11 max-[540px]:gap-2 max-[540px]:px-2.5 max-[540px]:py-[5px]">
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

function AccountMenuTrigger() {
  return (
    <SidebarTrigger
      id="accountMenuButton"
      className="icon-button size-[50px] min-w-[50px] flex-[0_0_40px] self-stretch rounded-lg max-[540px]:size-11 max-[540px]:min-w-11"
      variant="outline"
      size="icon-lg"
      aria-controls="accountSideMenu"
    />
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
      className="unified-search-input h-9 min-w-[180px] flex-[1_1_220px] border-0 bg-transparent px-0 text-base text-foreground shadow-none focus-visible:border-transparent focus-visible:ring-0 min-[720px]:text-sm max-[540px]:min-w-0 max-[540px]:basis-[72px]"
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
        <select id="folderSelect" className={selectClassName} style={selectArrowStyle} aria-label="Folder" value={selectedFolderId} onChange={changeFolder}>
          <FolderOptions folders={folders} />
        </select>
      </label>
      <label className="grid gap-2">
        <select id="extSelect" className={selectClassName} style={selectArrowStyle} aria-label="Type" value={selectedExt} onChange={changeMediaType}>
          <option value="">All types</option>
          {MEDIA_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <select id="ratingSelect" className={selectClassName} style={selectArrowStyle} aria-label="Rating" value={selectedRating} onChange={changeRating}>
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
        <select id="pageSizeSelect" className={selectClassName} style={selectArrowStyle} aria-label="Page size" value={selectedLimit} onChange={changePageSize}>
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
    <Button
      id="resetFiltersButton"
      className="icon-button filter-reset-button size-[50px] min-w-[50px] flex-[0_0_40px] self-stretch rounded-lg disabled:opacity-[0.42] max-[540px]:size-11 max-[540px]:w-11 max-[540px]:min-w-11"
      variant="outline"
      size="icon-lg"
      type="button"
      aria-label="Reset filters"
      title="Reset filters"
      disabled={!hasActiveFilters}
      onClick={resetFilters}
    >
      <FunnelXIcon data-icon="inline-start" />
    </Button>
  );
}

function ToggleFiltersButton({ filtersOpen = false }: Pick<SearchControlsProps, "filtersOpen">) {
  const label = filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  return (
    <Button
      id="toggleFiltersButton"
      className={cn(
        "icon-button filter-toggle-button size-[50px] min-w-[50px] flex-[0_0_40px] self-stretch rounded-lg max-[540px]:size-11 max-[540px]:min-w-11",
        filtersOpen && "bg-muted text-foreground",
      )}
      variant="outline"
      size="icon-lg"
      type="button"
      aria-label={label}
      aria-expanded={filtersOpen}
      aria-controls="advancedFilters"
      title={label}
      onClick={toggleFilters}
    >
      <SlidersHorizontalIcon data-icon="inline-start" />
    </Button>
  );
}
