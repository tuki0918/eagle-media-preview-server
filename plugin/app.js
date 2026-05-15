(() => {
let manager = null;
let currentStatus = null;
let qrcodeFactory = null;
let isBusy = false;
let busyStoppedTimer = null;
let busyStoppedFrameIndex = 0;
const busyStoppedFrames = Object.freeze([".", "..", "...", "....", "....."]);
const passwordToggleIcons = Object.freeze({
  hidden: '<path d="M3 3l18 18" /><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-3.2 4.1" /><path d="M6.7 6.7C4.1 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.4 4.9-1" /><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />',
  visible: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" />',
});
const qrEmptyIcon = '<path d="m15 18-.722-3.25"/><path d="M2 8a10.645 10.645 0 0 0 20 0"/><path d="m20 15-1.726-2.05"/><path d="m4 15 1.726-2.05"/><path d="m9 18 .722-3.25"/>';

const els = {
  statusBadge: document.querySelector("#statusBadge"),
  windowIcon: document.querySelector("#windowIcon"),
  serverPowerInput: document.querySelector("#serverPowerInput"),
  closeWindowButton: document.querySelector("#closeWindowButton"),
  accessUrl: document.querySelector("#accessUrl"),
  copyUrlButton: document.querySelector("#copyUrlButton"),
  qrCode: document.querySelector("#qrCode"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsBody: document.querySelector("#settingsBody"),
  autoStartInput: document.querySelector("#autoStartInput"),
  authEnabledInput: document.querySelector("#authEnabledInput"),
  publicNetworkInput: document.querySelector("#publicNetworkInput"),
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  userInput: document.querySelector("#userInput"),
  lanAddressInput: document.querySelector("#lanAddressInput"),
  passwordInput: document.querySelector("#passwordInput"),
  togglePasswordButton: document.querySelector("#togglePasswordButton"),
  confirmPasswordInput: document.querySelector("#confirmPasswordInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  message: document.querySelector("#message"),
};

try {
  if (typeof require !== "function") {
    throw new Error("Node require() is not available in this Eagle plugin window");
  }
  const runtimePath = pluginRequirePath("service/runtime.cjs");
  const qrcodePath = pluginRequirePath("vendor/qrcode-generator.cjs");
  const runtime = require(runtimePath);
  qrcodeFactory = require(qrcodePath);
  manager = runtime.createServerManager();
  wireEvents();
} catch (error) {
  const message = error.message || String(error);
  setMessage(message, true);
  disableControls();
  return;
}

if (globalThis.eagle?.onPluginCreate) {
  eagle.onPluginCreate(() => {
    init();
  });
  eagle.onPluginShow(() => {
    refreshStatus();
  });
} else {
  init();
}

function wireEvents() {
  syncPasswordToggleButton();
  els.serverPowerInput.addEventListener("change", async () => {
    if (isBusy) return;
    if (els.serverPowerInput.checked) {
      await saveSettings({ restartRunning: false });
      await runCommand(() => manager.start());
    } else {
      await runCommand(() => manager.stop());
    }
  });
  els.closeWindowButton.addEventListener("click", closeWindow);
  els.accessUrl.addEventListener("click", openEndpointUrl);
  els.copyUrlButton.addEventListener("click", copyAccessUrl);
  els.togglePasswordButton.addEventListener("click", togglePasswordVisibility);
  els.settingsForm.addEventListener("submit", async (event) => {
    if (isBusy) return;
    event.preventDefault();
    await saveSettings();
  });
  els.authEnabledInput.addEventListener("change", () => {
    if (isBusy) return;
    if (els.authEnabledInput.checked && !currentStatus?.settings?.passwordHash && !els.passwordInput.value) {
      setMessage("Enter a password to enable BasicAuth protection.", true);
      els.passwordInput.focus();
      return;
    }
    saveSettings();
  });
  for (const input of [
    els.autoStartInput,
    els.publicNetworkInput,
    els.portInput,
    els.userInput,
  ]) {
    input.addEventListener("change", () => {
      if (isBusy) return;
      saveSettings();
    });
  }
  els.passwordInput.addEventListener("change", () => {
    if (isBusy) return;
    saveSettings();
  });
}

async function init() {
  await runCommand(() => manager.init(), { quiet: true });
}

async function refreshStatus() {
  await runCommand(() => manager.status(), { quiet: true });
}

async function runCommand(command, { quiet = false } = {}) {
  setBusy(true);
  try {
    const status = await command();
    renderStatus(status);
    if (status.state === "error") {
      setMessage(status.lastError || "Server failed to start", true);
    } else if (!quiet) {
      setMessage("");
    }
  } catch (error) {
    setMessage(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

async function saveSettings({ restartRunning = true } = {}) {
  const payload = {
    autoStart: els.autoStartInput.checked,
    host: els.publicNetworkInput.checked ? "0.0.0.0" : "127.0.0.1",
    port: els.portInput.value,
    authEnabled: els.authEnabledInput.checked,
    basicAuthUser: els.userInput.value,
    preferredLanAddress: els.lanAddressInput.value,
  };

  els.confirmPasswordInput.value = els.passwordInput.value;
  if (els.passwordInput.value) {
    payload.password = els.passwordInput.value;
    payload.confirmPassword = els.confirmPasswordInput.value;
  }

  if (restartRunning) {
    if (willRestartServer(payload)) {
      renderTransientStatus("stopped");
    }
    await runCommand(() => manager.saveSettings(payload), { quiet: true });
  } else {
    await manager.saveSettings(payload);
    setMessage("");
  }
}

function renderStatus(status) {
  stopBusyStoppedAnimation();
  currentStatus = status;
  const state = status.state || "stopped";
  const settings = status.settings || {};

  els.statusBadge.querySelector("strong").textContent = titleCase(state);
  els.statusBadge.className = `status-pill ${state}`;
  els.windowIcon.src = state === "running" ? "./assets/icon_on.svg" : "./assets/icon_off.svg";
  els.serverPowerInput.checked = state === "running";
  els.accessUrl.value = status.url || "";

  els.autoStartInput.checked = Boolean(settings.autoStart);
  els.authEnabledInput.checked = Boolean(settings.authEnabled);
  els.publicNetworkInput.checked = (settings.host || "0.0.0.0") === "0.0.0.0";
  els.hostInput.value = settings.host || "0.0.0.0";
  els.portInput.value = settings.port || 41532;
  els.userInput.value = settings.basicAuthUser || "eagle";
  if (!els.passwordInput.value && settings.authEnabled && settings.passwordHash) {
    els.passwordInput.placeholder = "••••••••";
  } else if (!settings.passwordHash) {
    els.passwordInput.placeholder = "";
  }
  els.confirmPasswordInput.value = els.passwordInput.value;
  renderLanOptions(status.lanAddresses || [], settings.preferredLanAddress || "");
  renderQr(status.url || "");
}

function renderLanOptions(addresses, selected) {
  const existing = [...els.lanAddressInput.options].map((option) => option.value).join("|");
  const next = ["", ...addresses.map((entry) => entry.address)].join("|");
  if (existing === next) {
    els.lanAddressInput.value = selected;
    return;
  }

  els.lanAddressInput.replaceChildren();
  els.lanAddressInput.append(new Option("Auto", ""));
  for (const entry of addresses) {
    els.lanAddressInput.append(new Option(`${entry.address} (${entry.label})`, entry.address));
  }
  els.lanAddressInput.value = selected;
}

async function copyAccessUrl() {
  if (isBusy) return;
  const value = els.accessUrl.value;
  if (!value) return;

  try {
    if (!globalThis.eagle?.clipboard?.writeText) {
      throw new Error("Clipboard API is unavailable in this Eagle window");
    }
    await eagle.clipboard.writeText(value);
    setMessage("");
  } catch (error) {
    setMessage(error.message || String(error), true);
  }
}

async function openEndpointUrl() {
  if (isBusy) return;
  const value = els.accessUrl.value;
  if (!value) return;
  try {
    if (globalThis.eagle?.shell?.openExternal) {
      await eagle.shell.openExternal(value);
      return;
    }
    window.open(value, "_blank", "noopener");
  } catch (error) {
    setMessage(error.message || String(error), true);
  }
}

function renderQr(value) {
  els.qrCode.replaceChildren();
  els.qrCode.classList.toggle("is-empty", !value || currentStatus?.state !== "running");
  if (!value || currentStatus?.state !== "running") {
    els.qrCode.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${qrEmptyIcon}</svg>`;
    return;
  }
  els.qrCode.append(createQrSvg(value));
}

function createQrSvg(value) {
  const qr = qrcodeFactory(0, "M");
  qr.addData(value);
  qr.make();
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: value }),
    "image/svg+xml",
  );
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute("aria-label", value);
  svg.removeAttribute("aria-labelledby");
  return svg;
}

function setBusy(value) {
  isBusy = value;
  const interactiveControls = [
    els.serverPowerInput,
    els.copyUrlButton,
    els.autoStartInput,
    els.authEnabledInput,
    els.publicNetworkInput,
    els.portInput,
    els.userInput,
    els.passwordInput,
    els.togglePasswordButton,
  ];
  if (!value) {
    stopBusyStoppedAnimation();
    if (currentStatus) renderStatus(currentStatus);
    for (const control of [...interactiveControls, els.saveSettingsButton]) {
      if (control) control.disabled = false;
    }
    return;
  }
  for (const control of [...interactiveControls, els.saveSettingsButton]) {
    if (control) control.disabled = true;
  }
}

function willRestartServer(nextSettings) {
  const current = currentStatus?.settings;
  if (!current || currentStatus?.state !== "running") return false;
  if ((nextSettings.host ?? current.host) !== current.host) return true;
  if (Number(nextSettings.port ?? current.port) !== Number(current.port)) return true;
  if (Boolean(nextSettings.authEnabled ?? current.authEnabled) !== Boolean(current.authEnabled)) return true;
  if ((nextSettings.basicAuthUser ?? current.basicAuthUser) !== current.basicAuthUser) return true;
  if (Boolean(nextSettings.password)) return true;
  return false;
}

function renderTransientStatus(state) {
  stopBusyStoppedAnimation();
  if (state === "stopped") {
    startBusyStoppedAnimation();
  } else {
    els.statusBadge.querySelector("strong").textContent = titleCase(state);
  }
  els.statusBadge.className = `status-pill ${state}`;
  els.serverPowerInput.checked = state === "running";
  if (state !== "running") {
    els.qrCode.replaceChildren();
    els.qrCode.classList.add("is-empty");
    els.qrCode.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${qrEmptyIcon}</svg>`;
  }
}

function startBusyStoppedAnimation() {
  const label = els.statusBadge.querySelector("strong");
  busyStoppedFrameIndex = 0;
  label.textContent = busyStoppedFrames[busyStoppedFrameIndex];
  busyStoppedTimer = setInterval(() => {
    busyStoppedFrameIndex = (busyStoppedFrameIndex + 1) % busyStoppedFrames.length;
    label.textContent = busyStoppedFrames[busyStoppedFrameIndex];
  }, 650);
}

function stopBusyStoppedAnimation() {
  if (!busyStoppedTimer) return;
  clearInterval(busyStoppedTimer);
  busyStoppedTimer = null;
}

function disableControls() {
  for (const button of [
    els.saveSettingsButton,
    els.copyUrlButton,
  ]) {
    if (button) button.disabled = true;
  }
  if (els.serverPowerInput) els.serverPowerInput.disabled = true;
}

function setMessage(value, isError = false) {
  els.message.textContent = value;
  els.message.hidden = !value || !isError;
}

function pluginRequirePath(relativePath) {
  const path = require("path");
  const scriptUrl = document.currentScript?.src || location.href;
  let pluginDir = "";
  if (scriptUrl.startsWith("file://")) {
    pluginDir = decodeURIComponent(new URL(".", scriptUrl).pathname);
  } else {
    pluginDir = decodeURIComponent(location.pathname);
    if (!/[\\/]$/.test(pluginDir)) pluginDir = path.dirname(pluginDir);
  }
  pluginDir = pluginDir.replace(/^[\\/]+([A-Za-z]:[\\/])/, "$1");
  return path.join(pluginDir, relativePath);
}

function closeWindow() {
  try {
    if (globalThis.eagle?.window?.hide) {
      eagle.window.hide();
      return;
    }
    if (globalThis.eagle?.window?.close) {
      eagle.window.close();
      return;
    }
  } catch (error) {
    setMessage(error.message || String(error), true);
  }
  window.close();
}

function togglePasswordVisibility() {
  els.passwordInput.type = els.passwordInput.type === "text" ? "password" : "text";
  syncPasswordToggleButton();
}

function syncPasswordToggleButton() {
  const visible = els.passwordInput.type === "text";
  const label = visible ? "Hide password" : "Show password";
  els.togglePasswordButton.setAttribute("aria-label", label);
  els.togglePasswordButton.setAttribute("title", label);
  els.togglePasswordButton.querySelector("svg").innerHTML = visible ? passwordToggleIcons.visible : passwordToggleIcons.hidden;
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
})();
