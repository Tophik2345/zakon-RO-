const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, fn) {
  if (typeof fn !== "function") return () => {};
  const listener = (_event, value) => fn(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("homeApi", {
  localChangelog: ipcRenderer.sendSync("get-local-changelog"),
  getAppUpdateState: () => ipcRenderer.invoke("get-app-update-state"),
  onUpdateState: (fn) => subscribe("app-update-state", fn),
  minimize: () => ipcRenderer.send("home-min"),
  close: () => ipcRenderer.send("home-close"),
  openUrl: (url) => ipcRenderer.send("open-url", url),
  getHotkey: () => ipcRenderer.invoke("get-hotkey"),
  captureHotkey: (enabled) => ipcRenderer.send("hotkey-capture", enabled),
  setHotkey: (accelerator) => ipcRenderer.send("set-hotkey", accelerator),
  getUpdate: () => ipcRenderer.invoke("get-update"),
  getServers: () => ipcRenderer.invoke("get-servers"),
  setServer: (id) => ipcRenderer.invoke("set-server", id),
  getDbChanges: () => ipcRenderer.invoke("get-db-changes"),
  getTheme: () => ipcRenderer.invoke("get-theme"),
  setTheme: (theme) => ipcRenderer.invoke("set-theme", theme),
  resetTheme: () => ipcRenderer.invoke("reset-theme"),
  onTheme: (fn) => subscribe("theme-updated", fn),
  onServer: (fn) => subscribe("server-updated", fn),
  onDbChanges: (fn) => subscribe("db-changes", fn),
  installUpdate: () => ipcRenderer.send("install-update"),
  checkUpdate: () => ipcRenderer.send("check-update"),
  onUpdateReady: (fn) => subscribe("app-update-ready", fn),
  onUpdateInfo: (fn) => subscribe("app-update-info", fn),
});

