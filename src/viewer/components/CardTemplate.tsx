export function CardTemplate() {
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
