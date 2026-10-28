(() => {
  const fail = () => {
    if (document.body.dataset.appState === "ready") return;
    document.body.dataset.appState = "failed";
    document.getElementById("startupFallback").setAttribute("aria-busy", "false");
    document.getElementById("startupTitle").textContent = "Media Library is offline";
    document.getElementById("startupMessage").textContent = "The server may be stopped. Start Media Preview Server in Eagle, then tap Retry. If it is already running, check that both devices are on the same network.";
  };
  const timer = window.setTimeout(fail, 8000);
  window.addEventListener("media-library-ready", () => {
    window.clearTimeout(timer);
    document.body.dataset.appState = "ready";
    document.getElementById("startupFallback").setAttribute("aria-busy", "false");
  });
  window.addEventListener("media-library-startup-error", fail);
  window.addEventListener("error", fail, true);
  window.addEventListener("offline", fail);
  if (document.body.dataset.appState === "failed" || window.navigator.onLine === false) fail();
})();
