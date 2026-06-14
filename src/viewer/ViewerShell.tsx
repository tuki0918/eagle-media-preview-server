import iconOnUrl from "../assets/icon_on.svg";
import { shellClasses } from "./shellClasses";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "./shellConfig";

function LoginView() {
  return (
    <section id="loginView" className={shellClasses.loginView}>
      <form id="connectForm" className={shellClasses.loginPanel}>
        <div className={shellClasses.loginHead}>
          <img className={shellClasses.appLogo} src={iconOnUrl} alt="" aria-hidden="true" />
          <h1>Media Preview Server</h1>
          <p className={shellClasses.loginText}>A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className={shellClasses.formActions}>
            <button id="connectButton" className={shellClasses.connectButton} type="submit">
              <span>Connect</span>
            </button>
          </div>
        </div>
        <p id="connectMessage" className={shellClasses.connectMessage} aria-live="polite" />
      </form>
    </section>
  );
}

function SearchControls() {
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

function ResultsStatus() {
  return (
    <section className={shellClasses.statusLine} aria-live="polite">
      <span id="resultCount">0 items</span>
      <span className={shellClasses.statusActions}>
        <span className={shellClasses.viewToggle} aria-label="View mode">
          <button id="tilesViewButton" type="button" aria-pressed="true">
            Tiles
          </button>
          <button id="gridViewButton" type="button" aria-pressed="false">
            Grid
          </button>
          <button id="tableViewButton" type="button" aria-pressed="false">
            Table
          </button>
        </span>
      </span>
    </section>
  );
}

function Pager() {
  return (
    <nav className={shellClasses.pager} aria-label="Pagination">
      <button id="prevButton" type="button">
        <span data-lucide="chevron-left" />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className={shellClasses.pageButtons} aria-label="Page shortcuts" />
      <button id="nextButton" type="button">
        <span>Next</span>
        <span data-lucide="chevron-right" />
      </button>
    </nav>
  );
}

function PreviewDialog() {
  return (
    <dialog id="previewDialog" className={shellClasses.dialog}>
      <div className={shellClasses.dialogHeader}>
        <button id="backPreview" className={shellClasses.textIconButton} type="button" aria-label="Back to results">
          <span data-lucide="chevron-left" />
          <span>Back to Results</span>
        </button>
        <div>
          <strong>Media Preview Server</strong>
          <span id="previewMeta" />
        </div>
        <div className={shellClasses.dialogActions}>
          <button id="toggleInfoPreview" className={shellClasses.iconButton} aria-label="Media information" title="Media information">
            <span data-lucide="panel-left" />
          </button>
          <button id="fullscreenPreview" className={shellClasses.iconButton} aria-label="Fullscreen" title="Fullscreen">
            <span data-lucide="maximize" />
          </button>
          <button id="closePreview" className={shellClasses.iconButton} aria-label="Close" title="Close">
            <span data-lucide="x" />
          </button>
        </div>
      </div>
      <div className={shellClasses.previewLayout}>
        <div id="previewBody" className={shellClasses.previewBody} />
        <aside className={shellClasses.previewInfo} aria-label="Media info">
          <section className={shellClasses.previewOriginalNameSection}>
            <div id="previewOriginalName" className={shellClasses.previewOriginalNameValue} />
          </section>
          <section className={shellClasses.previewRatingSection}>
            <span className={shellClasses.infoLabel}>Rating</span>
            <div id="previewRating" className={shellClasses.ratingControl} aria-label="Rating" />
          </section>
          <div id="previewDetails" className={shellClasses.previewDetails} />
          <div id="previewActions" className={shellClasses.previewInfoActions} />
        </aside>
      </div>
    </dialog>
  );
}

function CardTemplate() {
  return (
    <template
      id="cardTemplate"
      dangerouslySetInnerHTML={{
        __html: `
          <article class="media-card">
            <button class="thumb-button" type="button">
              <img alt="" loading="lazy" decoding="async">
              <span class="thumb-overlay" aria-hidden="true">
                <span class="thumb-overlay-icon"></span>
              </span>
              <span class="file-badge"></span>
              <span class="duration-badge"></span>
            </button>
            <div class="card-meta">
              <strong></strong>
              <span></span>
              <div class="rating-control" aria-label="Rating"></div>
            </div>
          </article>
        `,
      }}
    />
  );
}

function ViewerShell() {
  return (
    <div id="viewerShell" hidden>
      <main>
        <SearchControls />
        <ResultsStatus />
        <section id="grid" className="media-grid" aria-label="Eagle assets" />
        <div id="tilesSentinel" className={shellClasses.tilesSentinel} hidden>
          Loading more
        </div>
        <Pager />
        <p id="libraryFooterName" className={shellClasses.libraryFooterName}>
          Connecting to Eagle
        </p>
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}

export function ViewerAppShell() {
  return (
    <>
      <LoginView />
      <ViewerShell />
    </>
  );
}
