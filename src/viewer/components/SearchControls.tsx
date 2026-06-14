import { shellClasses } from "../shellClasses";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "../shellConfig";

export function SearchControls() {
  return (
    <section className={shellClasses.controls} aria-label="Search and filters">
      <div className={shellClasses.searchRow}>
        <div className={shellClasses.searchBox}>
          <span data-lucide="search" />
          <div className={shellClasses.searchComposer}>
            <div id="tagChips" className={shellClasses.tagChips} aria-label="Selected tag filters" />
            <input
              id="searchInput"
              className={shellClasses.searchInput}
              type="search"
              placeholder="Search title or tag"
              autoComplete="off"
              aria-label="Search text or tag"
            />
          </div>
          <div id="tagSuggestions" className={shellClasses.tagSuggestions} role="listbox" aria-label="Tag suggestions" hidden />
        </div>
        <button
          id="resetFiltersButton"
          className={`${shellClasses.iconButton} ${shellClasses.filterResetButton}`}
          type="button"
          aria-label="Reset filters"
          title="Reset filters"
          disabled
        >
          <span data-lucide="funnel-x" />
        </button>
        <button
          id="toggleFiltersButton"
          className={`${shellClasses.iconButton} ${shellClasses.filterToggleButton}`}
          type="button"
          aria-label="Show advanced search options"
          aria-expanded="false"
          aria-controls="advancedFilters"
          title="Show advanced search options"
        >
          <span data-lucide="sliders-horizontal" />
        </button>
      </div>

      <div id="advancedFilters" className={shellClasses.filterRow} hidden>
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
