const { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const STARTUP_T0 = Date.now();
let startupLogPaths = [];
let startupBuffer = [];

function startupMark(label, extra = "") {
  const line = `[${String(Date.now() - STARTUP_T0).padStart(6, " ")} ms] ${label}${extra ? " | " + extra : ""}`;
  startupBuffer.push(line);
  try { console.log(line); } catch {}
  for (const file of startupLogPaths) {
    try { fs.appendFileSync(file, line + "\r\n", "utf8"); } catch {}
  }
}

function initStartupLog() {
  try {
    startupLogPaths = [
      path.join(app.getPath("desktop"), "startup.log"),
      path.join(app.getPath("userData"), "startup.log"),
    ];
    for (const file of startupLogPaths) {
      try { fs.writeFileSync(file, startupBuffer.join("\r\n") + "\r\n", "utf8"); } catch {}
    }
  } catch {}
}

startupMark("main.js loaded");
try {
  app.commandLine.appendSwitch("wm-window-animations-disabled");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,HardwareMediaKeyHandling");
} catch {}
let autoUpdater = null;
try { autoUpdater = require("electron-updater").autoUpdater; } catch {}
let updateReady = false;
let LOCAL_VER = { app: "0.1.0", db: "2026-08-27" };
try { LOCAL_VER = require("./version.json"); } catch {}
const UPDATE_JSON = "https://raw.githubusercontent.com/Tophik2345/zakon-RO-/main/version.json";
const DB_URL = "https://raw.githubusercontent.com/Tophik2345/zakon-RO-/main/kutuzovsky.json";
function bundledDb() { return path.join(__dirname, "kutuzovsky.json"); }
function serversPath() { return path.join(app.getPath("userData"), "servers.json"); }
function serversDir() { return path.join(app.getPath("userData"), "servers"); }
function backupsDir() { return path.join(app.getPath("userData"), "backups"); }
function dbChangesPath() { return path.join(app.getPath("userData"), "db-changes.json"); }
let activeServerId = "kutuz";
const DEFAULT_SERVERS = [{ id: "kutuz", name: "Кутузовский", builtIn: true }];
function cleanServerId(value) {
  const id = String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return id || "kutuz";
}
function loadServers() {
  try {
    const value = JSON.parse(fs.readFileSync(serversPath(), "utf8"));
    const servers = Array.isArray(value.servers) ? value.servers.filter((s) => s && s.id && s.name) : [];
    const merged = [...DEFAULT_SERVERS, ...servers.filter((s) => s.id !== "kutuz")];
    activeServerId = merged.some((s) => s.id === value.active) ? value.active : "kutuz";
    return { active: activeServerId, servers: merged };
  } catch { return { active: activeServerId, servers: [...DEFAULT_SERVERS] }; }
}
function saveServers(value) {
  const safe = { active: value.active, servers: value.servers.filter((s) => s.id !== "kutuz") };
  fs.writeFileSync(serversPath(), JSON.stringify(safe, null, 2), "utf8");
}
function localDb() {
  if (activeServerId === "kutuz") return path.join(app.getPath("userData"), "kutuzovsky.json");
  return path.join(serversDir(), cleanServerId(activeServerId) + ".json");
}
function themePath() { return path.join(app.getPath("userData"), "theme.json"); }

const DEFAULT_THEME = { color: "#6d7b8c", brightness: 50, saturation: 70, textColor: "#e6edf5" };
function normalizeTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  const color = String(source.color || "").trim().toLowerCase();
  const textColor = String(source.textColor || "").trim().toLowerCase();
  return {
    color: /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_THEME.color,
    brightness: Math.min(100, Math.max(0, Number(source.brightness ?? DEFAULT_THEME.brightness) || 0)),
    saturation: Math.min(100, Math.max(0, Number(source.saturation ?? DEFAULT_THEME.saturation) || 0)),
    textColor: /^#[0-9a-f]{6}$/.test(textColor) ? textColor : DEFAULT_THEME.textColor,
  };
}
function loadTheme() {
  try { return normalizeTheme(JSON.parse(fs.readFileSync(themePath(), "utf8"))); }
  catch { return { ...DEFAULT_THEME }; }
}
function saveTheme(value) {
  const next = normalizeTheme(value);
  fs.writeFileSync(themePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
function sendTheme(value) {
  const payload = normalizeTheme(value);
  for (const win of [home, overlay]) {
    if (win && !win.isDestroyed()) win.webContents.send("theme-updated", payload);
  }
  return payload;
}
let dbCache = null;
let dbChanges = [];
function validateDbValue(value) {
  const articles = value && Array.isArray(value.articles) ? value.articles : [];
  const ids = new Set(); const codes = new Map(); const issues = [];
  articles.forEach((article, index) => {
    const label = String(article && article.code || `Строка ${index + 1}`);
    if (!article || !article.id) issues.push(`${label}: отсутствует id`);
    else if (ids.has(article.id)) issues.push(`${label}: повторяется id ${article.id}`);
    else ids.add(article.id);
    if (!article || !String(article.title || "").trim()) issues.push(`${label}: пустое название`);
    if (!article || !String(article.text || "").trim()) issues.push(`${label}: пустой текст`);
    const code = String(article && article.code || "").trim().toLowerCase();
    if (code) codes.set(code, (codes.get(code) || 0) + 1);
  });
  for (const [code, count] of codes) if (count > 1) issues.push(`${code}: код встречается ${count} раз`);
  return { ok: issues.length === 0, articles: articles.length, issues: issues.slice(0, 100) };
}
function backupDb(source, reason = "auto") {
  try {
    if (!fs.existsSync(source)) return null;
    fs.mkdirSync(backupsDir(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(backupsDir(), `${cleanServerId(activeServerId)}-${stamp}-${reason}.json`);
    fs.copyFileSync(source, target);
    const files = fs.readdirSync(backupsDir()).filter((name) => name.endsWith(".json")).sort().reverse();
    for (const old of files.slice(10)) fs.unlinkSync(path.join(backupsDir(), old));
    return target;
  } catch { return null; }
}
function compareDb(before, after) {
  const key = (a) => String(a.id || `${a.code}|${a.title}`);
  const oldMap = new Map(((before && before.articles) || []).map((a) => [key(a), a]));
  const newMap = new Map(((after && after.articles) || []).map((a) => [key(a), a]));
  const changes = [];
  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) changes.push(`Добавлено: ${item.code || ""} ${item.title || ""}`.trim());
    else if (JSON.stringify(oldMap.get(id)) !== JSON.stringify(item)) changes.push(`Изменено: ${item.code || ""} ${item.title || ""}`.trim());
  }
  for (const [id, item] of oldMap) if (!newMap.has(id)) changes.push(`Удалено: ${item.code || ""} ${item.title || ""}`.trim());
  return changes.slice(0, 200);
}
function ensureLocalDb() {
  try {
    const loc = localDb();
    if (fs.existsSync(loc) && fs.statSync(loc).size > 100000) return loc;
    if (activeServerId !== "kutuz") return loc;
    const bun = bundledDb();
    if (fs.existsSync(bun)) fs.copyFileSync(bun, loc);
    return fs.existsSync(loc) ? loc : bun;
  } catch {
    return bundledDb();
  }
}
function readDb() {
  if (dbCache && Array.isArray(dbCache.articles) && dbCache.articles.length) return dbCache;
  for (const f of [localDb(), bundledDb()]) {
    try {
      dbCache = JSON.parse(fs.readFileSync(f, "utf8"));
      if (dbCache && Array.isArray(dbCache.articles) && dbCache.articles.length) return dbCache;
    } catch {}
  }
  dbCache = { updated: "", articles: [] };
  return dbCache;
}
function warmDbLater() {
  setTimeout(() => { try { readDb(); } catch {} }, 2500);
}
async function refreshDb() {
  try {
    const r = await fetch(DB_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !Array.isArray(j.articles) || !j.articles.length) return;
    // Write atomically so an interrupted download cannot corrupt the working DB.
    const oldServer = activeServerId;
    activeServerId = "kutuz";
    const target = localDb();
    let previous = { articles: [] };
    try { previous = JSON.parse(fs.readFileSync(fs.existsSync(target) ? target : bundledDb(), "utf8")); } catch {}
    backupDb(target, "update");
    const temp = target + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(j));
    fs.renameSync(temp, target);
    dbChanges = compareDb(previous, j);
    try { fs.writeFileSync(dbChangesPath(), JSON.stringify(dbChanges, null, 2), "utf8"); } catch {}
    activeServerId = oldServer;
    dbCache = null;
    if (activeServerId === "kutuz" && overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
    if (home && !home.isDestroyed() && dbChanges.length) home.webContents.send("db-changes", dbChanges);
  } catch {}
}



let home, overlay;
let visible = false;
let overlayReady = false;
let capturing = false;
let autoHide = true;
let shownAt = 0;
let toggling = false;
let windowMoving = false;
let moveTimer = null;
let hotkey = "CommandOrControl+Shift+F";

function cfgPath() {
  return path.join(app.getPath("userData"), "hotkey-v2.txt");
}
function loadHotkey() {
  try {
    const raw = fs.readFileSync(cfgPath(), "utf8").trim();
    const n = toElectron(raw);
    hotkey = n;
  } catch {}
}
function saveHotkey(v) {
  hotkey = v;
  fs.writeFileSync(cfgPath(), v, "utf8");
}
function toElectron(acc) {
  let s = String(acc || "").trim();
  s = s.replace(/CommandOrControl/gi, "Ctrl").replace(/Control/gi, "Ctrl").replace(/Command/gi, "Ctrl");
  s = s.replace(/Ctrl/gi, "CommandOrControl");
  if (/[^A-Za-z0-9+\-]/u.test(s.replace(/CommandOrControl/g, "X"))) return "CommandOrControl+Shift+F";
  return s;
}
let getKey = null;
let pollT = null;
let wasDown = false;
function loadKeysLater() {
  setTimeout(() => {
    if (getKey) return;
    startupMark("koffi load begin");
    try {
      const koffi = require("koffi");
      startupMark("koffi require done");
      const user32 = koffi.load("user32.dll");
      startupMark("user32.dll loaded");
      getKey = user32.func("short __stdcall GetAsyncKeyState(int vKey)");
      startupMark("GetAsyncKeyState ready");
      bindHotkey();
      startupMark("hotkey rebound to native polling");
    } catch (e) {
      startupMark("koffi load error", e && e.message ? e.message : String(e));
    }
  }, 1200);
}

function parseVk(acc) {
  const s = String(acc || "");
  const needCtrl = /Control|Ctrl|Command/i.test(s);
  const needShift = /Shift/i.test(s);
  const needAlt = /Alt/i.test(s);
  const last = s.split("+").pop().trim().toUpperCase();
  let vk = 0x46;
  if (/^F\d{1,2}$/.test(last)) vk = 0x70 + (parseInt(last.slice(1),10)-1);
  else if (last.length === 1 && last >= "A" && last <= "Z") vk = last.charCodeAt(0);
  else if (last.length === 1 && last >= "0" && last <= "9") vk = last.charCodeAt(0);
  return { needCtrl, needShift, needAlt, vk };
}

function bindHotkey() {
  startupMark("bindHotkey", getKey ? "native" : "globalShortcut");
  if (pollT) { clearInterval(pollT); pollT = null; }
  globalShortcut.unregisterAll();
  const spec = parseVk(hotkey);
  if (!getKey) {
    try {
      const ok = globalShortcut.register(toElectron(hotkey), toggleOverlay);
      startupMark("globalShortcut.register", `${toElectron(hotkey)} => ${ok}`);
    } catch (e) {
      startupMark("globalShortcut error", e && e.message ? e.message : String(e));
    }
    return;
  }
  pollT = setInterval(() => {
    if (capturing || !getKey) return;
    const down = (v) => (getKey(v) & 0x8000) !== 0;
    const combo = (!spec.needCtrl || down(0x11)) &&
      (!spec.needShift || down(0x10)) &&
      (!spec.needAlt || down(0x12)) &&
      down(spec.vk);
    if (combo && !wasDown) toggleOverlay();
    wasDown = combo;
    if (!capturing && visible && down(0x1B)) {
      visible = false;
      overlay && overlay.hide();
    }
  }, 70);
}

function createHome() {
  startupMark("createHome begin");
  home = new BrowserWindow({
    width: 760,
    height: 430,
    frame: false,
    backgroundColor: "#0e1218",
    resizable: false,
    icon: path.join(__dirname, "icon.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "home-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  startupMark("BrowserWindow created");
  home.webContents.on("dom-ready", () => startupMark("home dom-ready"));
  home.webContents.on("did-finish-load", () => startupMark("home did-finish-load"));
  home.webContents.on("did-fail-load", (_event, code, description, url) => startupMark("home did-fail-load", `${code} ${description} ${url || ""}`));
  home.webContents.on("render-process-gone", (_event, details) => startupMark("home render-process-gone", JSON.stringify(details || {})));
  home.once("ready-to-show", () => {
    startupMark("home ready-to-show");
    if (home && !home.isDestroyed()) home.show();
  });
  startupMark("home.loadFile begin");
  home.loadFile(path.join(__dirname, "home.html"))
    .then(() => startupMark("home.loadFile resolved"))
    .catch((e) => startupMark("home.loadFile rejected", e && e.message ? e.message : String(e)));
  home.on("closed", () => {
    home = null;
    shutdown();
  });
}

function shutdown() {
  if (pollT) { clearInterval(pollT); pollT = null; }
  try { globalShortcut.unregisterAll(); } catch {}
  visible = false;
  try { overlay && !overlay.isDestroyed() && overlay.destroy(); } catch {}
  overlay = null;
  app.quit();
}

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = 980;
  const h = 640;
  overlay = new BrowserWindow({
    width: w,
    height: h,
    x: width - w - 28,
    y: Math.floor((height - h) / 2),
    minWidth: 980,
    minHeight: 640,
    maxWidth: 980,
    maxHeight: 640,
    resizable: false,
    frame: false,
    backgroundColor: "#14181f",
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.webContents.on("did-finish-load", () => { overlayReady = true; });
  const markWindowMoving = () => {
    windowMoving = true;
    shownAt = Date.now();
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      windowMoving = false;
      shownAt = Date.now();
    }, 650);
  };
  overlay.on("will-move", markWindowMoving);
  overlay.on("move", markWindowMoving);
  overlay.loadFile(path.join(__dirname, "index.html"));
}

function toggleOverlay() {
  if (capturing || toggling) return;
  if (!overlay || overlay.isDestroyed()) {
    toggling = true;
    createOverlay();
    const show = () => {
      overlayReady = true;
      visible = true;
      shownAt = Date.now();
      if (overlay && !overlay.isDestroyed()) {
        overlay.showInactive();
        overlay.setAlwaysOnTop(true, "screen-saver");
      }
      setTimeout(() => { toggling = false; }, 180);
    };
    if (overlayReady) show();
    else overlay.webContents.once("did-finish-load", show);
    return;
  }
  if (!overlayReady) {
    overlay.webContents.once("did-finish-load", () => {
      overlayReady = true;
      visible = true;
      shownAt = Date.now();
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, "screen-saver");
    });
    return;
  }
  toggling = true;
  visible = !visible;
  if (visible) {
    shownAt = Date.now();
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, "screen-saver");
  } else overlay.hide();
  setTimeout(() => { toggling = false; }, 180);
}

app.setAppUserModelId("online.russia.fsb.memo");
app.whenReady().then(async () => {
  initStartupLog();
  startupMark("app.whenReady resolved");
  try { app.setLoginItemSettings({ openAtLogin: false, openAsHidden: false }); } catch {}

  let t = Date.now();
  loadServers();
  startupMark("loadServers done", `${Date.now() - t} ms`);

  t = Date.now();
  loadHotkey();
  startupMark("loadHotkey done", `${Date.now() - t} ms`);

  createHome();
  bindHotkey();
  loadKeysLater();

  startupMark("warmDbLater scheduled");
  warmDbLater();

  setTimeout(() => {
    startupMark("refreshDb begin");
    refreshDb().finally(() => startupMark("refreshDb finished"));
  }, 45000);
  setInterval(() => { refreshDb(); }, 15 * 60 * 1000);
  if (autoUpdater && app.isPackaged) {
    try {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: "Tophik2345",
        repo: "zakon-RO-",
      });
    } catch {}
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-downloaded", () => {
      updateReady = true;
      try {
        if (home && !home.isDestroyed()) home.webContents.send("app-update-ready");
      } catch {}
    });
    setTimeout(() => {
      startupMark("autoUpdater check begin");
      autoUpdater.checkForUpdates()
        .then(() => startupMark("autoUpdater check finished"))
        .catch((e) => startupMark("autoUpdater check error", e && e.message ? e.message : String(e)));
    }, 60000);
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 60 * 60 * 1000);
  }
  let dragFromUi = false;
  let outsideAt = 0;
  let wasLeftDown = false;
  setInterval(() => {
    if (!autoHide || !visible || capturing || windowMoving || !overlay || overlay.isDestroyed()) return;
    if (Date.now() - shownAt < 800) return;
    const pt = screen.getCursorScreenPoint();
    const inWin = (w, pad = 0) => {
      if (!w || w.isDestroyed() || !w.isVisible()) return false;
      const b = w.getBounds();
      return pt.x >= b.x - pad && pt.x <= b.x + b.width + pad && pt.y >= b.y - pad && pt.y <= b.y + b.height + pad;
    };
    const overUi = inWin(overlay, 28) || inWin(home, 8);
    const lb = getKey ? ((getKey(0x01) & 0x8000) !== 0) : false;
    const freshClick = lb && !wasLeftDown;
    wasLeftDown = lb;
    if (overUi) {
      outsideAt = 0;
      if (lb) dragFromUi = true;
      return;
    }
    if (dragFromUi && lb) {
      outsideAt = 0;
      return;
    }
    if (!lb) dragFromUi = false;
    const clickOut = freshClick && !dragFromUi && Date.now() - shownAt > 500;
    if (clickOut) {
      visible = false;
      overlay.hide();
      dragFromUi = false;
      outsideAt = 0;
    }
  }, 50);});

ipcMain.handle("get-db", () => {
  ensureLocalDb();
  return readDb();
});
ipcMain.handle("get-servers", () => loadServers());
ipcMain.handle("set-server", (_event, id) => {
  const state = loadServers();
  const next = cleanServerId(id);
  if (!state.servers.some((server) => server.id === next)) return state;
  activeServerId = next;
  dbCache = null;
  saveServers({ active: activeServerId, servers: state.servers });
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
  if (home && !home.isDestroyed()) home.webContents.send("server-updated", activeServerId);
  return { active: activeServerId, servers: state.servers };
});
ipcMain.handle("add-server", (_event, value) => {
  const state = loadServers();
  const name = String(value && value.name || "").trim().slice(0, 50);
  const data = value && value.data;
  const check = validateDbValue(data);
  if (!name || !data || !Array.isArray(data.articles) || !data.articles.length) return { ok: false, error: "Неверное имя или база", check };
  const id = cleanServerId(`server-${Date.now()}`);
  fs.mkdirSync(serversDir(), { recursive: true });
  fs.writeFileSync(path.join(serversDir(), id + ".json"), JSON.stringify(data), "utf8");
  state.servers.push({ id, name, builtIn: false });
  activeServerId = id;
  dbCache = null;
  saveServers({ active: id, servers: state.servers });
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
  if (home && !home.isDestroyed()) home.webContents.send("server-updated", id);
  return { ok: true, active: id, servers: state.servers, check };
});
ipcMain.handle("delete-server", (_event, id) => {
  const safeId = cleanServerId(id);
  if (safeId === "kutuz") return { ok: false, error: "Встроенный сервер удалить нельзя" };
  const state = loadServers();
  const nextServers = state.servers.filter((server) => server.id !== safeId);
  try { fs.unlinkSync(path.join(serversDir(), safeId + ".json")); } catch {}
  activeServerId = "kutuz";
  dbCache = null;
  saveServers({ active: activeServerId, servers: nextServers });
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
  if (home && !home.isDestroyed()) home.webContents.send("server-updated", activeServerId);
  return { ok: true, active: activeServerId, servers: nextServers };
});
ipcMain.handle("validate-db", () => validateDbValue(readDb()));
ipcMain.handle("get-db-changes", () => {
  if (dbChanges.length) return dbChanges;
  try { const value = JSON.parse(fs.readFileSync(dbChangesPath(), "utf8")); return Array.isArray(value) ? value : []; }
  catch { return []; }
});
ipcMain.handle("get-backups", () => {
  try { return fs.readdirSync(backupsDir()).filter((name) => name.endsWith(".json")).sort().reverse(); }
  catch { return []; }
});
ipcMain.handle("restore-last-backup", () => {
  try {
    const files = fs.readdirSync(backupsDir()).filter((name) => name.startsWith(cleanServerId(activeServerId) + "-") && name.endsWith(".json")).sort().reverse();
    if (!files.length) return { ok: false, error: "Резервных копий пока нет" };
    backupDb(localDb(), "before-restore");
    fs.copyFileSync(path.join(backupsDir(), files[0]), localDb());
    dbCache = null;
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
    return { ok: true, file: files[0] };
  } catch { return { ok: false, error: "Не удалось восстановить базу" }; }
});
ipcMain.handle("get-theme", () => loadTheme());
ipcMain.handle("set-theme", (_event, value) => sendTheme(saveTheme(value)));
ipcMain.handle("reset-theme", () => sendTheme(saveTheme(DEFAULT_THEME)));
ipcMain.handle("get-update", async () => {
  try {
    const r = await fetch(UPDATE_JSON + "?t=" + Date.now(), { cache: "no-store" });
    const remote = await r.json();
    const newer = (a, b) => {
      const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
      const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return true;
        if ((pa[i] || 0) < (pb[i] || 0)) return false;
      }
      return false;
    };
    return {
      local: LOCAL_VER,
      remote,
      appOut: newer(remote.app, LOCAL_VER.app),
      dbOut: remote.db !== LOCAL_VER.db,
    };
  } catch (e) {
    return { local: LOCAL_VER, remote: null, appOut: false, dbOut: false };
  }
});
ipcMain.handle("get-hotkey", () => hotkey.replace("CommandOrControl", "Control"));
ipcMain.on("hotkey-capture", (_e, on) => {
  capturing = !!on;
  if (capturing) {
    globalShortcut.unregisterAll();
    if (overlay) { visible = false; overlay.hide(); }
  } else {
    bindHotkey();
  }
});
ipcMain.on("set-hotkey", (_e, acc) => {
  const s = String(acc||"");
  if (!/Control|Ctrl|Alt|Shift|Command/i.test(s)) return;
  saveHotkey(toElectron(s));
  bindHotkey();
});
ipcMain.on("home-min", () => home && home.minimize());
ipcMain.on("home-close", () => shutdown());
const SAFE_EXTERNAL_URLS = new Set([
  "https://t.me/Khazb1",
  "https://discord.com/users/linyks3",
]);
ipcMain.on("open-url", (_e, url) => {
  const safeUrl = String(url || "");
  if (SAFE_EXTERNAL_URLS.has(safeUrl)) shell.openExternal(safeUrl);
});
ipcMain.on("install-update", () => {
  if (!autoUpdater || !updateReady) {
    try {
      if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Обновление ещё скачивается");
    } catch {}
    return;
  }
  try { autoUpdater.quitAndInstall(false, true); } catch {}
});
ipcMain.on("check-update", () => {
  if (!autoUpdater || !app.isPackaged) {
    try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Проверка лоадера работает только из установленного Setup"); } catch {}
    return;
  }
  autoUpdater.checkForUpdates().then((r) => {
    const ver = r && r.updateInfo && r.updateInfo.version;
    const msg = ver && ver !== app.getVersion()
      ? ("Найдена версия " + ver + " — скачивается")
      : "Лоадер актуален";
    try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", msg); } catch {}
  }).catch(() => {
    try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Нет связи с GitHub Releases"); } catch {}
  });
});
ipcMain.on("overlay-hide", () => {
  visible = false;
  overlay && overlay.hide();
});
ipcMain.on("set-autohide", (_e, v) => { autoHide = !!v; });
ipcMain.on("overlay-ping", () => { shownAt = Date.now(); });
ipcMain.on("set-glass", (_e, v) => {
  const n = Math.min(25, Math.max(0, Number(v) || 0));
  if (overlay && !overlay.isDestroyed()) overlay.setOpacity(1 - n / 100);
});
ipcMain.on("set-compact", (_event, enabled) => {
  if (!overlay || overlay.isDestroyed()) return;
  const compact = !!enabled;
  const size = compact ? { width: 680, height: 420 } : { width: 980, height: 640 };
  if (compact) {
    overlay.setMinimumSize(size.width, size.height);
    overlay.setMaximumSize(size.width, size.height);
  } else {
    overlay.setMaximumSize(size.width, size.height);
    overlay.setMinimumSize(size.width, size.height);
  }
  overlay.setSize(size.width, size.height, true);
});

app.on("window-all-closed", () => shutdown());
app.on("will-quit", () => {
  if (pollT) { clearInterval(pollT); pollT = null; }
  if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; }
  try { globalShortcut.unregisterAll(); } catch {}
});
process.on("uncaughtException", (err) => {
  startupMark("uncaughtException", err && err.stack ? err.stack : String(err));
});
process.on("unhandledRejection", (err) => {
  startupMark("unhandledRejection", err && err.stack ? err.stack : String(err));
});
