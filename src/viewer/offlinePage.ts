// Reuses the static startup fallback in index.html so every "offline" state looks the same.
// Its Retry link reloads the page.
export function showOfflinePage({ reason, title, message }: { message: string; reason: string; title: string }) {
  // Startup reporting (main.tsx) and the bootstrap timeout (bootstrap.js) leave the page alone once a reason is set.
  document.body.dataset.offlineReason = reason;
  document.body.dataset.appState = "failed";
  document.getElementById("startupFallback")?.setAttribute("aria-busy", "false");
  const titleElement = document.getElementById("startupTitle");
  if (titleElement) titleElement.textContent = title;
  const messageElement = document.getElementById("startupMessage");
  if (messageElement) messageElement.textContent = message;
}

export function isOfflinePageShown() {
  return Boolean(document.body.dataset.offlineReason);
}
