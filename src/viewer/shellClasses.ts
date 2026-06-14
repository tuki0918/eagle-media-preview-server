export const shellClasses = {
  loginView: "login-view grid min-h-dvh place-items-center px-4 py-9",
  loginPanel:
    "login-panel grid w-[min(320px,100%)] gap-[18px] rounded-[14px] border border-app-border bg-[rgba(255,255,255,0.95)] px-[30px] pb-[30px] pt-[42px] shadow-app backdrop-blur-xl",
  loginHead: "login-head grid justify-items-center gap-3 text-center",
  appLogo: "app-logo block h-[54px] w-[54px] rounded-xl object-cover shadow-[0_12px_28px_rgba(20,99,243,0.28)]",
  loginText: "m-0 whitespace-nowrap text-xs leading-[1.35] text-app-muted",
  formActions: "form-actions grid grid-cols-1 gap-2.5",
  connectButton:
    "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-app border border-app-accent bg-app-accent text-sm font-[720] text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)]",
  connectMessage:
    "connect-message fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-10 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 px-2 text-center text-app-muted",
  controls: "controls grid gap-4 pb-2",
  searchRow: "search-row grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch gap-3",
  searchBox:
    "search-box relative flex min-h-[50px] items-center gap-2.5 rounded-app border border-app-border bg-app-surface px-4 py-[7px] shadow-app-soft",
  searchComposer: "search-composer flex min-w-0 flex-auto flex-wrap items-center gap-x-2 gap-y-1.5",
  tagChips: "tag-chips flex min-h-6 flex-wrap gap-1.5",
  searchInput: "unified-search-input min-h-[34px] min-w-[180px] flex-[1_1_220px] border-0 bg-transparent text-[15px] text-app-text outline-0",
  tagSuggestions:
    "tag-suggestions absolute left-[42px] right-3 top-[calc(100%+6px)] z-20 grid max-h-[280px] overflow-auto rounded-app border border-app-border bg-app-surface p-1.5 shadow-app-soft",
  iconButton: "icon-button inline-grid min-h-10 w-10 flex-[0_0_40px] place-items-center rounded-app border border-app-border bg-app-surface text-app-text",
  filterResetButton: "filter-reset-button min-h-[50px] w-[50px] min-w-[50px] self-stretch disabled:cursor-default disabled:opacity-[0.42]",
  filterToggleButton: "filter-toggle-button min-h-[50px] w-[50px] min-w-[50px] self-stretch",
  filterRow: "filter-row grid grid-cols-4 gap-6",
  statusLine: "status-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-sm font-[720] text-app-muted",
  statusActions: "status-actions ml-auto inline-flex justify-self-end",
  viewToggle: "view-toggle inline-flex rounded-app border border-app-border bg-app-surface p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
  pager:
    "pager static grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pt-2.5 shadow-none backdrop-blur-none",
  pageButtons: "page-buttons inline-flex items-center justify-center gap-2.5",
  tilesSentinel: "tiles-sentinel mt-3 grid min-h-[52px] place-items-center text-[13px] font-[680] text-app-muted",
  libraryFooterName: "library-footer-name mt-2 text-center text-xs leading-[1.4] text-app-muted",
  dialog:
    "h-dvh max-h-dvh w-screen max-w-full rounded-none border-0 bg-app-surface p-0 text-app-text",
  dialogHeader:
    "dialog-header fixed right-2.5 top-[calc(10px+env(safe-area-inset-top))] z-[4] flex items-center justify-end gap-3 border-0 bg-transparent p-0",
  dialogActions: "dialog-actions flex items-center justify-end gap-2",
  textIconButton:
    "text-icon-button inline-flex min-h-10 items-center gap-2 border-0 bg-transparent px-2 text-sm font-[680] text-app-text",
  previewLayout: "preview-layout relative grid h-full max-h-full grid-cols-[minmax(0,1fr)] overflow-hidden",
  previewBody:
    "preview-body relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#f8fafc] p-0",
  previewInfo:
    "preview-info absolute inset-y-0 left-0 z-[3] grid max-w-full content-start gap-3.5 overflow-auto border-0 border-r border-app-border bg-[rgba(255,255,255,0.96)] p-3.5 shadow-[18px_0_44px_rgba(15,23,42,0.14)] backdrop-blur-[18px]",
  previewOriginalNameSection:
    "preview-original-name-section grid min-h-8 grid-cols-[minmax(0,1fr)] items-center border-b border-[rgba(148,163,184,0.18)] px-2 pb-3.5 pt-2",
  previewOriginalNameValue:
    "preview-original-name-value w-full min-w-0 whitespace-normal text-sm leading-[1.4] text-app-text [overflow-wrap:anywhere]",
  previewRatingSection:
    "preview-rating-section grid min-h-8 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-center gap-[18px] px-2",
  infoLabel: "info-label text-xs font-normal text-app-muted",
  ratingControl: "rating-control inline-flex items-center gap-px",
  previewDetails: "preview-details grid gap-2.5",
  previewInfoActions:
    "preview-info-actions border-t border-[rgba(148,163,184,0.22)] px-2 pt-3",
} as const;
