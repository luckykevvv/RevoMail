const desktop = window.revoDesktop;
const elements = Object.fromEntries([
  "platform-chip", "status-pulse", "status-badge", "status-track-fill", "service-url", "service-pid", "service-error",
  "start-button", "open-button", "restart-button", "stop-button", "settings-form", "save-status", "reset-button", "app-version"
].map((id) => [id, document.getElementById(id)]));

let snapshot;

function setBusy(busy) {
  const service = snapshot?.service;
  const active = ["starting", "running", "stopping"].includes(service?.phase);
  elements["start-button"].disabled = busy || active;
  elements["open-button"].disabled = busy || service?.phase !== "running";
  elements["restart-button"].disabled = busy || service?.phase === "stopped";
  elements["stop-button"].disabled = busy || !service?.pid;
}

function applyTheme(settings) {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.reduceMotion = String(settings.reducedMotion);
}

function render(nextSnapshot) {
  snapshot = nextSnapshot;
  const { service, settings } = snapshot;
  const active = ["starting", "running", "stopping"].includes(service.phase);
  const busy = ["starting", "stopping"].includes(service.phase);
  const phaseLabel = service.phase.charAt(0).toUpperCase() + service.phase.slice(1);
  elements["status-badge"].textContent = phaseLabel;
  elements["status-badge"].dataset.phase = service.phase;
  elements["status-pulse"].dataset.phase = service.phase;
  elements["status-track-fill"].dataset.phase = service.phase;
  elements["service-url"].textContent = service.url || "Not running";
  elements["service-pid"].textContent = service.pid ? `PID ${service.pid}` : "—";
  elements["service-error"].hidden = !service.error;
  elements["service-error"].textContent = service.error || "";
  elements["start-button"].textContent = service.phase === "failed" ? "Try again" : service.phase === "running" ? "Service running" : "Start service";
  elements["start-button"].disabled = active;
  elements["open-button"].disabled = service.phase !== "running";
  elements["restart-button"].disabled = busy || service.phase === "stopped";
  elements["stop-button"].disabled = busy || !service.pid;
  elements["platform-chip"].textContent = snapshot.platform === "win32" ? "Windows" : snapshot.platform === "darwin" ? "macOS" : "Linux";
  elements["app-version"].textContent = `RevoMail Desktop v${snapshot.version}`;
  applyTheme(settings);
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = document.getElementById(key);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
}

function formSettings() {
  const form = new FormData(elements["settings-form"]);
  return {
    host: form.get("host"),
    port: Number(form.get("port")),
    autoStart: form.has("autoStart"),
    launchOnReady: form.has("launchOnReady"),
    stopOnExit: form.has("stopOnExit"),
    theme: form.get("theme"),
    language: form.get("language"),
    reducedMotion: form.has("reducedMotion")
  };
}

async function runAction(action) {
  setBusy(true);
  elements["save-status"].textContent = "Working…";
  try {
    await action();
    snapshot = await desktop.getSnapshot();
    render(snapshot);
    elements["save-status"].textContent = "Ready.";
  } catch (error) {
    elements["save-status"].textContent = error.message || "The action could not be completed.";
  } finally {
    setBusy(false);
  }
}

elements["start-button"].addEventListener("click", () => runAction(() => desktop.startService()));
elements["stop-button"].addEventListener("click", () => runAction(() => desktop.stopService()));
elements["restart-button"].addEventListener("click", () => runAction(() => desktop.restartService()));
elements["open-button"].addEventListener("click", () => runAction(() => desktop.openRevoMail()));
elements["settings-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await desktop.updateSettings(formSettings());
    fillForm(result.settings);
    elements["save-status"].textContent = result.restartRequired ? "Saved. Restart the service to apply the host or port." : "Settings saved.";
  } catch (error) {
    elements["save-status"].textContent = error.message || "Settings could not be saved.";
  }
});
elements["reset-button"].addEventListener("click", async () => {
  const settings = await desktop.resetSettings();
  fillForm(settings);
  applyTheme(settings);
  elements["save-status"].textContent = "Defaults restored.";
});

desktop.on("snapshot", render);
desktop.getSnapshot().then((initialSnapshot) => {
  render(initialSnapshot);
  fillForm(initialSnapshot.settings);
}).catch((error) => {
  elements["save-status"].textContent = error.message || "Desktop controls are unavailable.";
});
