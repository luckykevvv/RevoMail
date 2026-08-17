import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { ZodError } from "zod";
import { ensureEncryptionKey } from "./secret-store.js";
import { DesktopSettingsStore } from "./settings-store.js";
import { ServiceController } from "./service-controller.js";
import { resolveBackendLaunch } from "./backend-launch.js";
import { loadDesktopEnvironment } from "./runtime-environment.js";
import { isAllowedNavigation } from "./navigation-policy.js";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked") : app.getAppPath();
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let launcherWindow;
let mailWindow;
let settingsStore;
let serviceController;
let quitting = false;

if (!gotSingleInstanceLock) app.quit();

function isAllowedWebUrl(target) {
  const serviceUrl = serviceController?.snapshot().url;
  if (!serviceUrl) return false;
  try {
    return new URL(target).origin === new URL(serviceUrl).origin;
  } catch {
    return false;
  }
}

function secureWindowOptions(overrides = {}) {
  const { webPreferences = {}, ...windowOverrides } = overrides;
  return {
    show: false,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...webPreferences
    },
    ...windowOverrides
  };
}

function protectNavigation(window, { allowAppOrigin = false, allowProviderAuth = false } = {}) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const appOrigin = allowAppOrigin ? serviceController?.snapshot().url : null;
    if (isAllowedNavigation(url, { appOrigin, allowProviderAuth })) return;
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow(secureWindowOptions({
    width: 1080,
    height: 760,
    minWidth: 780,
    minHeight: 640,
    title: "RevoMail Desktop",
    webPreferences: { preload: path.join(desktopDirectory, "preload.cjs") }
  }));
  protectNavigation(launcherWindow);
  void launcherWindow.loadFile(path.join(desktopDirectory, "renderer", "index.html"));
  launcherWindow.once("ready-to-show", () => launcherWindow.show());
  launcherWindow.on("closed", () => { launcherWindow = null; });
}

async function openMailWindow() {
  const snapshot = serviceController.snapshot();
  if (snapshot.phase !== "running" || !snapshot.url) throw new Error("Start RevoMail before opening the workspace.");
  if (mailWindow && !mailWindow.isDestroyed()) {
    mailWindow.focus();
    return snapshot;
  }
  mailWindow = new BrowserWindow(secureWindowOptions({
    width: 1440,
    height: 920,
    minWidth: 360,
    minHeight: 600,
    title: "RevoMail",
    webPreferences: { partition: "persist:revomail" }
  }));
  protectNavigation(mailWindow, { allowAppOrigin: true, allowProviderAuth: true });
  mailWindow.once("ready-to-show", () => mailWindow.show());
  mailWindow.on("closed", () => { mailWindow = null; });
  await mailWindow.loadURL(snapshot.url);
  return snapshot;
}

function desktopSnapshot() {
  return {
    service: serviceController.snapshot(),
    settings: settingsStore.get(),
    version: app.getVersion(),
    platform: process.platform
  };
}

function broadcastSnapshot() {
  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.webContents.send("desktop:snapshot", desktopSnapshot());
}

function registerIpc() {
  ipcMain.handle("desktop:get-snapshot", () => desktopSnapshot());
  ipcMain.handle("desktop:start-service", () => serviceController.start(settingsStore.get()));
  ipcMain.handle("desktop:stop-service", () => serviceController.stop());
  ipcMain.handle("desktop:restart-service", () => serviceController.restart(settingsStore.get()));
  ipcMain.handle("desktop:open-revomail", () => openMailWindow());
  ipcMain.handle("desktop:update-settings", (_event, candidate) => {
    try {
      const previous = settingsStore.get();
      const settings = settingsStore.update(candidate);
      return { settings, restartRequired: serviceController.snapshot().phase === "running" && (previous.host !== settings.host || previous.port !== settings.port) };
    } catch (error) {
      if (error instanceof ZodError) throw new Error("One or more desktop settings are invalid.");
      throw error;
    } finally {
      broadcastSnapshot();
    }
  });
  ipcMain.handle("desktop:reset-settings", () => {
    const settings = settingsStore.reset();
    broadcastSnapshot();
    return settings;
  });
}

app.on("second-instance", () => {
  if (!launcherWindow) return;
  if (launcherWindow.isMinimized()) launcherWindow.restore();
  launcherWindow.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const userDataPath = app.getPath("userData");
  loadDesktopEnvironment({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
    userDataPath
  });
  process.env.DATABASE_URL = `file:${path.join(userDataPath, "revomail.db").replaceAll("\\", "/")}`;
  const serverKey = ensureEncryptionKey(path.join(userDataPath, "server.key"));
  process.env.TOKEN_ENCRYPTION_KEY ||= serverKey;
  process.env.SECRET_KEY ||= serverKey;
  if (app.isPackaged) process.env.REVOMAIL_ENV ||= "production";
  settingsStore = new DesktopSettingsStore(path.join(userDataPath, "desktop-settings.json"));
  const backendLaunch = resolveBackendLaunch({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot
  });
  serviceController = new ServiceController({
    spawn,
    ...backendLaunch,
    projectRoot
  });
  serviceController.on("state", async (state) => {
    broadcastSnapshot();
    if (state.phase === "running" && settingsStore.get().launchOnReady) {
      try { await openMailWindow(); } catch { /* The launcher exposes the retry action. */ }
    }
  });
  registerIpc();
  createLauncherWindow();
  if (settingsStore.get().autoStart) await serviceController.start(settingsStore.get());
});

app.on("activate", () => {
  if (!launcherWindow) createLauncherWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting || !settingsStore?.get().stopOnExit || !serviceController?.child) return;
  event.preventDefault();
  quitting = true;
  void serviceController.stop().finally(() => app.quit());
});
