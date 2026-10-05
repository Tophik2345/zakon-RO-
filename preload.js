const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("memo", {
  pointer: (down) => ipcRenderer.send("overlay-pointer", !!down),
  ready: () => ipcRenderer.send("overlay-ready"),
  hide: () => ipcRenderer.send("overlay-hide"),
  setAutohide: (v) => ipcRenderer.send("set-autohide", v),
  getDb: () => ipcRenderer.invoke("get-db"),
  getServers: () => ipcRenderer.invoke("get-servers"),
  setServer: (id) => ipcRenderer.invoke("set-server", id),
  addServer: (value) => ipcRenderer.invoke("add-server", value),
  deleteServer: (id) => ipcRenderer.invoke("delete-server", id),
  validateDb: () => ipcRenderer.invoke("validate-db"),
  getDbChanges: () => ipcRenderer.invoke("get-db-changes"),
  getBackups: () => ipcRenderer.invoke("get-backups"),
  restoreLastBackup: () => ipcRenderer.invoke("restore-last-backup"),
  setCompact: (enabled) => ipcRenderer.send("set-compact", enabled),
  setGlass: (v) => ipcRenderer.send("set-glass", v),
  ping: () => ipcRenderer.send("overlay-ping"),
  getTheme: () => ipcRenderer.invoke("get-theme"),
  setTheme: (theme) => ipcRenderer.invoke("set-theme", theme),
  resetTheme: () => ipcRenderer.invoke("reset-theme"),
  onTheme: (fn) => {
    if (typeof fn !== "function") return () => {};
    const listener = (_event, value) => fn(value);
    ipcRenderer.on("theme-updated", listener);
    return () => ipcRenderer.removeListener("theme-updated", listener);
  },
  onDb: (fn) => {
    if (typeof fn !== "function") return () => {};
    const listener = () => fn();
    ipcRenderer.on("db-updated", listener);
    return () => ipcRenderer.removeListener("db-updated", listener);
  },
  onDbChanges: (fn) => {
    if (typeof fn !== "function") return () => {};
    const listener = (_event, value) => fn(value);
    ipcRenderer.on("db-changes", listener);
    return () => ipcRenderer.removeListener("db-changes", listener);
  },
});
