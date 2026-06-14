import iconOnUrl from "../assets/icon_on.svg";

const mediaTypeOptions = [
  "jpg",
  "png",
  "gif",
  "webp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "m4a",
];

function LoginView() {
  return (
    <section id="loginView" className="login-view">
      <form id="connectForm" className="login-panel">
        <div className="login-head">
          <img className="app-logo" src={iconOnUrl} alt="" aria-hidden="true" />
          <h1>Media Preview Server</h1>
          <p>A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className="form-actions">
            <button id="connectButton" type="submit">
              <span>Connect</span>
            </button>
          </div>
        </div>
        <p id="connectMessage" className="connect-message" aria-live="polite" />
      </form>
    </section>
  );
}

function SearchControls() {
  return (
    <section className="controls" aria-label="Search and filters">
      <div className="search-row">
        <div className="search-box">
          <span data-lucide="search" />
          <div className="search-composer">
            <div id="tagChips" className="tag-chips" aria-label="Selected tag filters" />
            <input
              id="searchInput"
              className="unified-search-input"
              type="search"
              placeholder="Search title or tag"
              autoComplete="off"
              aria-label="Search text or tag"
            />
          </div>
          <div id="tagSuggestions" className="tag-suggestions" role="listbox" aria-label="Tag suggestions" hidden />
        </div>
        <button
          id="resetFiltersButton"
          className="icon-button filter-reset-button"
          type="button"
          aria-label="Reset filters"
          title="Reset filters"
          disabled
        >
          <span data-lucide="funnel-x" />
        </button>
        <button
          id="toggleFiltersButton"
          className="icon-button filter-toggle-button"
          type="button"
          aria-label="Show advanced search options"
          aria-expanded="false"
          aria-controls="advancedFilters"
          title="Show advanced search options"
        >
          <span data-lucide="sliders-horizontal" />
        </button>
      </div>

      <div id="advancedFilters" className="filter-row" hidden>
        <label>
          <select id="folderSelect" aria-label="Folder">
            <option value="">All folders</option>
          </select>
        </label>
        <label>
          <select id="extSelect" aria-label="Type">
            <option value="">All types</option>
            {mediaTypeOptions.map((type) => (
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
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                ★ {rating}
              </option>
            ))}
          </select>
        </label>
        <label>
          <select id="pageSizeSelect" aria-label="Page size" defaultValue="30">
            <option value="30">30 items</option>
            <option value="60">60 items</option>
            <option value="120">120 items</option>
            <option value="240">240 items</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function ResultsStatus() {
  return (
    <section className="status-line" aria-live="polite">
      <span id="resultCount">0 items</span>
      <span className="status-actions">
        <span className="view-toggle" aria-label="View mode">
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
    <nav className="pager" aria-label="Pagination">
      <button id="prevButton" type="button">
        <span data-lucide="chevron-left" />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className="page-buttons" aria-label="Page shortcuts" />
      <button id="nextButton" type="button">
        <span>Next</span>
        <span data-lucide="chevron-right" />
      </button>
    </nav>
  );
}

function PreviewDialog() {
  return (
    <dialog id="previewDialog">
      <div className="dialog-header">
        <button id="backPreview" className="text-icon-button" type="button" aria-label="Back to results">
          <span data-lucide="chevron-left" />
          <span>Back to Results</span>
        </button>
        <div>
          <strong>Media Preview Server</strong>
          <span id="previewMeta" />
        </div>
        <div className="dialog-actions">
          <button id="toggleInfoPreview" className="icon-button" aria-label="Media information" title="Media information">
            <span data-lucide="panel-left" />
          </button>
          <button id="fullscreenPreview" className="icon-button" aria-label="Fullscreen" title="Fullscreen">
            <span data-lucide="maximize" />
          </button>
          <button id="closePreview" className="icon-button" aria-label="Close" title="Close">
            <span data-lucide="x" />
          </button>
        </div>
      </div>
      <div className="preview-layout">
        <div id="previewBody" className="preview-body" />
        <aside className="preview-info" aria-label="Media info">
          <section className="preview-original-name-section">
            <div id="previewOriginalName" className="preview-original-name-value" />
          </section>
          <section className="preview-rating-section">
            <span className="info-label">Rating</span>
            <div id="previewRating" className="rating-control" aria-label="Rating" />
          </section>
          <div id="previewDetails" className="preview-details" />
          <div id="previewActions" className="preview-info-actions" />
        </aside>
      </div>
    </dialog>
  );
}

function CardTemplate() {
  return (
    <template id="cardTemplate">
      <article className="media-card">
        <button className="thumb-button" type="button">
          <img alt="" loading="lazy" decoding="async" />
          <span className="thumb-overlay" aria-hidden="true">
            <span className="thumb-overlay-icon" />
          </span>
          <span className="file-badge" />
          <span className="duration-badge" />
        </button>
        <div className="card-meta">
          <strong />
          <span />
          <div className="rating-control" aria-label="Rating" />
        </div>
      </article>
    </template>
  );
}

function ViewerShell() {
  return (
    <div id="viewerShell" hidden>
      <main>
        <SearchControls />
        <ResultsStatus />
        <section id="grid" className="media-grid" aria-label="Eagle assets" />
        <div id="tilesSentinel" className="tiles-sentinel" hidden>
          Loading more
        </div>
        <Pager />
        <p id="libraryFooterName" className="library-footer-name">
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
