const { contextBridge, ipcRenderer } = require("electron");

const allowedEvents = new Set(["snapshot"]);

contextBridge.exposeInMainWorld("revoDesktop", Object.freeze({
  getSnapshot: () => ipcRenderer.invoke("desktop:get-snapshot"),
  startService: () => ipcRenderer.invoke("desktop:start-service"),
  stopService: () => ipcRenderer.invoke("desktop:stop-service"),
  restartService: () => ipcRenderer.invoke("desktop:restart-service"),
  openRevoMail: () => ipcRenderer.invoke("desktop:open-revomail"),
  updateSettings: (settings) => ipcRenderer.invoke("desktop:update-settings", settings),
  resetSettings: () => ipcRenderer.invoke("desktop:reset-settings"),
  on: (eventName, callback) => {
    if (!allowedEvents.has(eventName) || typeof callback !== "function") return () => {};
    const channel = `desktop:${eventName}`;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
}));
