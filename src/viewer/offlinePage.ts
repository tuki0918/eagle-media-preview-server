// Reuses the static startup fallback in index.html so every "offline" state looks the same.
// Its Retry link reloads the page.
export function showOfflinePage({ title, message }: { message: string; title: string }) {
  document.body.dataset.appState = "failed";
  document.getElementById("startupFallback")?.setAttribute("aria-busy", "false");
  const titleElement = document.getElementById("startupTitle");
  if (titleElement) titleElement.textContent = title;
  const messageElement = document.getElementById("startupMessage");
  if (messageElement) messageElement.textContent = message;
}
