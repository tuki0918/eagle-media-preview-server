import { createRoot, type Root } from "react-dom/client";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "../shellConfig";
import {
  changeFolder,
  changeMediaType,
  changePageSize,
  changeRating,
  changeSearchQuery,
  focusSearch,
  handleSearchKeyDown,
  resetFilters,
  toggleFilters,
} from "../shellActions";

interface SearchControlButtonProps {
  filtersOpen?: boolean;
  hasActiveFilters?: boolean;
}

const resetButtonRoots = new WeakMap<HTMLElement, Root>();
const toggleButtonRoots = new WeakMap<HTMLElement, Root>();

export function SearchControls({ filtersOpen = false, hasActiveFilters = false }: SearchControlButtonProps) {
  return (
    <section className="controls grid gap-4 pb-2" aria-label="Search and filters">
      <div className="search-row grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch gap-3">
        <div className="search-box relative flex min-h-[50px] items-center gap-2.5 rounded-app border border-app-border bg-app-surface px-4 py-[7px] shadow-app-soft">
          <span data-lucide="search" />
          <div className="search-composer flex min-w-0 flex-auto flex-wrap items-center gap-x-2 gap-y-1.5">
            <div id="tagChips" className="tag-chips flex min-h-6 flex-wrap gap-1.5" aria-label="Selected tag filters" />
            <input
              id="searchInput"
              className="unified-search-input min-h-[34px] min-w-[180px] flex-[1_1_220px] border-0 bg-transparent text-[15px] text-app-text outline-0"
              type="search"
              placeholder="Search title or tag"
              autoComplete="off"
              aria-label="Search text or tag"
              onChange={changeSearchQuery}
              onFocus={focusSearch}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <div
            id="tagSuggestions"
            className="tag-suggestions absolute left-[42px] right-3 top-[calc(100%+6px)] z-20 grid max-h-[280px] overflow-auto rounded-app border border-app-border bg-app-surface p-1.5 shadow-app-soft"
            role="listbox"
            aria-label="Tag suggestions"
            hidden
          />
        </div>
        <div id="resetFiltersButtonHost" className="contents">
          <ResetFiltersButton hasActiveFilters={hasActiveFilters} />
        </div>
        <div id="toggleFiltersButtonHost" className="contents">
          <ToggleFiltersButton filtersOpen={filtersOpen} />
        </div>
      </div>

      <div id="advancedFilters" className="filter-row grid grid-cols-4 gap-6" hidden>
        <label>
          <select id="folderSelect" aria-label="Folder" onChange={changeFolder}>
            <option value="">All folders</option>
          </select>
        </label>
        <label>
          <select id="extSelect" aria-label="Type" onChange={changeMediaType}>
            <option value="">All types</option>
            {MEDIA_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <select id="ratingSelect" aria-label="Rating" onChange={changeRating}>
            <option value="">All ratings</option>
            <option value="0">No rating</option>
            {RATING_OPTIONS.map((rating) => (
              <option key={rating} value={rating}>
                ★ {rating}
              </option>
            ))}
          </select>
        </label>
        <label>
          <select id="pageSizeSelect" aria-label="Page size" defaultValue="30" onChange={changePageSize}>
            {PAGE_SIZE_OPTIONS.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize} items
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function ResetFiltersButton({ hasActiveFilters = false }: Pick<SearchControlButtonProps, "hasActiveFilters">) {
  return (
    <button
      id="resetFiltersButton"
      className="icon-button filter-reset-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text disabled:cursor-default disabled:opacity-[0.42]"
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

function ToggleFiltersButton({ filtersOpen = false }: Pick<SearchControlButtonProps, "filtersOpen">) {
  const label = filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  return (
    <button
      id="toggleFiltersButton"
      className="icon-button filter-toggle-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text"
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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473" />
      <path d="m16.5 3.5 5 5" />
      <path d="m21.5 3.5-5 5" />
    </svg>
  );
}

function SlidersHorizontalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
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

export function renderSearchControlButtonsView(
  resetContainer: HTMLElement,
  toggleContainer: HTMLElement,
  props: Required<SearchControlButtonProps>,
) {
  let resetRoot = resetButtonRoots.get(resetContainer);
  if (!resetRoot) {
    resetContainer.replaceChildren();
    resetRoot = createRoot(resetContainer);
    resetButtonRoots.set(resetContainer, resetRoot);
  }
  resetRoot.render(<ResetFiltersButton hasActiveFilters={props.hasActiveFilters} />);

  let toggleRoot = toggleButtonRoots.get(toggleContainer);
  if (!toggleRoot) {
    toggleContainer.replaceChildren();
    toggleRoot = createRoot(toggleContainer);
    toggleButtonRoots.set(toggleContainer, toggleRoot);
  }
  toggleRoot.render(<ToggleFiltersButton filtersOpen={props.filtersOpen} />);
}
