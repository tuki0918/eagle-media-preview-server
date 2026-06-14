import { shellClasses } from "../shellClasses";

export function PreviewDialog() {
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
