import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "../shellConfig";

export function SearchControls() {
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
        <button
          id="resetFiltersButton"
          className="icon-button filter-reset-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text disabled:cursor-default disabled:opacity-[0.42]"
          type="button"
          aria-label="Reset filters"
          title="Reset filters"
          disabled
        >
          <span data-lucide="funnel-x" />
        </button>
        <button
          id="toggleFiltersButton"
          className="icon-button filter-toggle-button inline-grid min-h-[50px] w-[50px] min-w-[50px] flex-[0_0_40px] place-items-center self-stretch rounded-app border border-app-border bg-app-surface text-app-text"
          type="button"
          aria-label="Show advanced search options"
          aria-expanded="false"
          aria-controls="advancedFilters"
          title="Show advanced search options"
        >
          <span data-lucide="sliders-horizontal" />
        </button>
      </div>

      <div id="advancedFilters" className="filter-row grid grid-cols-4 gap-6" hidden>
        <label>
          <select id="folderSelect" aria-label="Folder">
            <option value="">All folders</option>
          </select>
        </label>
        <label>
          <select id="extSelect" aria-label="Type">
            <option value="">All types</option>
            {MEDIA_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <select id="ratingSelect" aria-label="Rating">
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
          <select id="pageSizeSelect" aria-label="Page size" defaultValue="30">
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
