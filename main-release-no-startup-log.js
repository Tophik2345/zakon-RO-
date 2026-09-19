const startupAt = performance.now();
const { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
// Startup diagnostics disabled for release build.
function startupLog() {}
startupLog("autohide require begin");
const { createAutoHide } = require("./autohide");
startupLog("autohide require end");
try {
  app.commandLine.appendSwitch("wm-window-animations-disabled");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,HardwareMediaKeyHandling");
} catch {}
let autoUpdater = null;
let compareDbDetailed;
let updateReady = false;
let quittingForUpdate = false;
let updateState = { status: "idle", version: null, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: null };
let LOCAL_VER = { app: "0.1.0", db: "2026-08-27" };
try { LOCAL_VER = require("./version.json"); } catch {}

function sendUpdateState(patch = {}) {
  updateState = { ...updateState, ...patch };
  try {
    if (home && !home.isDestroyed()) home.webContents.send("app-update-state", updateState);
  } catch {}
  return updateState;
}
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
  startupLog("loadServers start");
  try {
    const value = JSON.parse(fs.readFileSync(serversPath(), "utf8"));
    const servers = Array.isArray(value.servers) ? value.servers.filter((s) => s && s.id && s.name) : [];
    const merged = [...DEFAULT_SERVERS, ...servers.filter((s) => s.id !== "kutuz")];
    activeServerId = merged.some((s) => s.id === value.active) ? value.active : "kutuz";
    return { active: activeServerId, servers: merged };
  } catch { return { active: activeServerId, servers: [...DEFAULT_SERVERS] }; }
  finally { startupLog("loadServers end"); }
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
    if (fs.existsSync(loc) && fs.statSync(loc).size > 0) return loc;
    if (activeServerId !== "kutuz") return loc;
    const bun = bundledDb();
    if (fs.existsSync(bun)) fs.copyFileSync(bun, loc);
    return fs.existsSync(loc) ? loc : bun;
  } catch {
    return bundledDb();
  }
}
async function readDb() {
  if (dbCache) return dbCache;
  const server = activeServerId;
  const files = server === "kutuz" ? [localDb(), bundledDb()] : [localDb()];
  for (const f of files) {
    try {
      const value = JSON.parse(await fs.promises.readFile(f, "utf8"));
      if (value && Array.isArray(value.articles) && value.articles.length) {
        if (server === activeServerId) dbCache = value;
        return value;
      }
    } catch {}
  }
  return { updated: "", articles: [] };
}
function warmDbLater() {
  setTimeout(() => { readDb().catch(() => {}) }, 2500);
}
let refreshingDb = false;
async function refreshDb() {
  if (refreshingDb) return;
  refreshingDb = true;
  const refreshAt = performance.now();
  startupLog("refreshDb begin");
  try {
    const r = await fetch(DB_URL + "?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.articles) || !j.articles.length || j.articles.some(a => !a || typeof a.id !== "string" || typeof a.text !== "string" || !a.title) || new Set(j.articles.map(a => a.id)).size !== j.articles.length) throw new Error("Некорректная база");
    const target = path.join(app.getPath("userData"), "kutuzovsky.json");
    let previous;
    try { previous = JSON.parse(await fs.promises.readFile(target, "utf8")); }
    catch { previous = JSON.parse(await fs.promises.readFile(bundledDb(), "utf8")); }
    if (!compareDbDetailed) {
      startupLog("search-engine require begin");
      compareDbDetailed = require("./search-engine").compare;
      startupLog("search-engine require end");
    }
    const changes = compareDbDetailed(previous, j);
    if (!changes.length && previous.updated === j.updated) return;
    await fs.promises.mkdir(backupsDir(), { recursive: true });
    const backup = path.join(backupsDir(), "kutuz-" + new Date().toISOString().replace(/[:.]/g, "-") + "-update.json");
    await fs.promises.writeFile(backup, JSON.stringify(previous));
    let history = [];
    try { history = JSON.parse(await fs.promises.readFile(dbChangesPath(), "utf8")); } catch {}
    if (!Array.isArray(history)) history = [];
    dbChanges = [...changes, ...history];
    await fs.promises.writeFile(dbChangesPath() + ".tmp", JSON.stringify(dbChanges));
    await fs.promises.rename(dbChangesPath() + ".tmp", dbChangesPath());
    await fs.promises.writeFile(target + ".tmp", JSON.stringify(j));
    await fs.promises.rename(target + ".tmp", target);
    const backups = (await fs.promises.readdir(backupsDir())).filter(n => n.startsWith("kutuz-") && n.endsWith(".json")).sort().reverse();
    for (const old of backups.slice(10)) await fs.promises.unlink(path.join(backupsDir(), old)).catch(() => {});
    if (activeServerId === "kutuz") {
      dbCache = null;
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send("db-updated");
    }
    for (const win of [home, overlay]) if (win && !win.isDestroyed() && changes.length) win.webContents.send("db-changes", dbChanges);
  } catch (e) {
    startupLog("refreshDb error", { error: e.message });
    console.warn("DB update:", e.message);
  } finally { refreshingDb = false; startupLog("refreshDb end", { durationMs: +(performance.now() - refreshAt).toFixed(2) }); }
}




let home, overlay;
let visible = false;
let overlayReady = false;
let capturing = false;
let autoHide = true;
let overlayPointerDown = false;
let shownAt = 0;
let toggling = false;
let windowMoving = false;
let moveTimer = null;
let hotkey = "CommandOrControl+Shift+F";

function cfgPath() {
  return path.join(app.getPath("userData"), "hotkey-v2.txt");
}
function loadHotkey() {
  startupLog("loadHotkey start");
  try {
    const raw = fs.readFileSync(cfgPath(), "utf8").trim();
    const n = toElectron(raw);
    hotkey = n;
  } catch {}
  finally { startupLog("loadHotkey end", { hotkey }); }
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
    try {
      startupLog("koffi require begin");
      const koffi = require("koffi");
      startupLog("koffi require end");
      startupLog("user32.dll load begin");
      const user32 = koffi.load("user32.dll");
      startupLog("user32.dll load end");
      getKey = user32.func("short __stdcall GetAsyncKeyState(int vKey)");
      startupLog("GetAsyncKeyState ready");
      bindHotkey();
    } catch (error) { startupLog("native hotkey error", { error: error.stack || String(error) }); }
  }, 0);
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
  startupLog("bindHotkey", { hotkey, backend: getKey ? "GetAsyncKeyState" : "globalShortcut", capturing });
  wasDown = false;
  if (pollT) { clearInterval(pollT); pollT = null; }
  globalShortcut.unregisterAll();
  if (capturing) return;
  const spec = parseVk(hotkey);
  if (!getKey) {
    try { startupLog("globalShortcut register", { success: globalShortcut.register(toElectron(hotkey), toggleOverlay) }); }
    catch (error) { startupLog("globalShortcut error", { error: error.message }); }
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
  startupLog("createHome begin");
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
  startupLog("BrowserWindow created");
  home.webContents.on("dom-ready", () => startupLog("dom-ready"));
  home.webContents.on("did-finish-load", () => startupLog("did-finish-load"));
  home.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => startupLog("did-fail-load", { code, description, url, isMainFrame }));
  home.webContents.on("render-process-gone", (_event, details) => startupLog("render-process-gone", details));
  home.once("ready-to-show", () => {
    startupLog("ready-to-show");
    if (home && !home.isDestroyed()) home.show();
    startupLog("home.show");
    setTimeout(startBackground, 0);
  });
  startupLog("home.loadFile begin");
  home.loadFile(path.join(__dirname, "home.html")).catch(error => startupLog("home.loadFile error", { error: error.message }));
  home.on("closed", () => {
    home = null;
    if (!quittingForUpdate) shutdown();
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
  overlayReady = false;
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
  overlay.webContents.on("memo-ready", () => { overlayReady = true; });
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
    else overlay.webContents.once("memo-ready", show);
    return;
  }
  if (!overlayReady) {
    overlay.webContents.once("memo-ready", () => {
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
  startupLog("app.whenReady");
  loadServers();
  loadHotkey();
  createHome();
  bindHotkey();

  const shouldAutoHide = createAutoHide();
  setInterval(() => {
    const pt = screen.getCursorScreenPoint();
    const inWin = (win, pad = 0) => {
      if (!win || win.isDestroyed() || !win.isVisible()) return false;
      const b = win.getBounds();
      return pt.x >= b.x - pad && pt.x <= b.x + b.width + pad && pt.y >= b.y - pad && pt.y <= b.y + b.height + pad;
    };
    const alive = overlay && !overlay.isDestroyed();
    const hide = shouldAutoHide({
      now: Date.now(), shownAt, enabled: autoHide, visible: !!(visible && alive),
      blocked: capturing || windowMoving,
      overUi: inWin(overlay, 8) || inWin(home, 8),
      leftDown: getKey ? (getKey(0x01) & 0x8000) !== 0 : overlayPointerDown,
    });
    if (hide && alive) { visible = false; overlay.hide(); }
  }, 50);
});

ipcMain.handle("get-db", () => {
  return readDb();
});
ipcMain.on("overlay-ready", event => {
  if (overlay && !overlay.isDestroyed() && event.sender === overlay.webContents) overlay.webContents.emit("memo-ready");
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
ipcMain.handle("validate-db", async () => validateDbValue(await readDb()));
ipcMain.handle("get-db-changes", async () => {
  if (dbChanges.length) return dbChanges;
  try { const value = JSON.parse(await fs.promises.readFile(dbChangesPath(), "utf8")); return Array.isArray(value) ? value : []; }
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
ipcMain.handle("get-app-update-state", () => updateState);

ipcMain.handle("get-update", async () => {
  try {
    const r = await fetch(UPDATE_JSON + "?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(15000) });
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
      local: { ...LOCAL_VER, app: app.getVersion() },
      remote,
      appOut: newer(remote.app, app.getVersion()),
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
      const msg = updateState.status === "downloading"
        ? `Обновление ещё скачивается — ${Math.round(updateState.percent || 0)}%`
        : "Обновление ещё не готово к установке";
      if (home && !home.isDestroyed()) home.webContents.send("app-update-info", msg);
    } catch {}
    return;
  }
  sendUpdateState({ status: "installing", error: null });
  try { quittingForUpdate = true; autoUpdater.quitAndInstall(false, true); } catch (e) {
    quittingForUpdate = false;
    sendUpdateState({ status: "error", error: e && e.message ? String(e.message) : "Не удалось запустить установку" });
  }
});
ipcMain.on("check-update", () => {
  if (!autoUpdater || !app.isPackaged) {
    try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Проверка обновлений работает только в установленной версии"); } catch {}
    return;
  }
  sendUpdateState({ status: "checking", error: null });
  checkAppUpdates().catch(() => {
    try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Нет связи с GitHub Releases"); } catch {}
  });
});
ipcMain.on("overlay-hide", () => {
  visible = false;
  overlay && overlay.hide();
});
ipcMain.on("set-autohide", (_e, v) => { autoHide = !!v; });
ipcMain.on("overlay-pointer", (event, down) => {
  if (overlay && !overlay.isDestroyed() && event.sender === overlay.webContents) overlayPointerDown = !!down;
});
// Pointer movement must not reset the opening grace period.
ipcMain.on("overlay-ping", () => {});
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

app.on("window-all-closed", () => { if (!quittingForUpdate) shutdown(); });
app.on("will-quit", () => {
  if (pollT) { clearInterval(pollT); pollT = null; }
  if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; }
  try { globalShortcut.unregisterAll(); } catch {}
});

let backgroundStarted = false;
function startBackground() {
  if (backgroundStarted) return;
  backgroundStarted = true;
  startupLog("background begin");
  setTimeout(() => { refreshDb(); }, 45000);
  setInterval(() => { refreshDb(); }, 15 * 60 * 1000);
  loadKeysLater();
  warmDbLater();
  setTimeout(() => {
    try { app.setLoginItemSettings({ openAtLogin: false, openAsHidden: false }); } catch {}
    try {
      startupLog("electron-updater require begin");
      autoUpdater = require("electron-updater").autoUpdater;
      startupLog("electron-updater require end");
    } catch (e) { startupLog("electron-updater require error", { error: e.message }); sendUpdateState({status: "error", error: String(e.message)}); }
  if (autoUpdater && app.isPackaged) {
    try {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: "Tophik2345",
        repo: "zakon-RO-",
      });
    } catch {}

    // Variant 1: check automatically, download automatically, install only on explicit user action.
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      sendUpdateState({ status: "checking", error: null });
      try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Проверяем обновления…"); } catch {}
    });

    autoUpdater.on("update-available", (info) => {
      updateReady = false;
      sendUpdateState({
        status: "downloading",
        version: info && info.version ? info.version : null,
        percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: null,
      });
      try {
        const ver = info && info.version ? info.version : "новая версия";
        if (home && !home.isDestroyed()) home.webContents.send("app-update-info", `Найдена версия ${ver} — скачиваем автоматически`);
      } catch {}
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
      const payload = sendUpdateState({
        status: "downloading",
        percent,
        transferred: Number(progress && progress.transferred) || 0,
        total: Number(progress && progress.total) || 0,
        bytesPerSecond: Number(progress && progress.bytesPerSecond) || 0,
        error: null,
      });
      try {
        if (home && !home.isDestroyed()) home.webContents.send("app-update-progress", payload);
      } catch {}
    });

    autoUpdater.on("update-not-available", () => {
      updateReady = false;
      sendUpdateState({ status: "current", version: app.getVersion(), percent: 0, error: null });
      try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Установлена последняя версия"); } catch {}
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateReady = true;
      sendUpdateState({
        status: "ready",
        version: info && info.version ? info.version : updateState.version,
        percent: 100,
        error: null,
      });
      try {
        if (home && !home.isDestroyed()) {
          home.webContents.send("app-update-ready", { version: info && info.version ? info.version : updateState.version });
          home.webContents.send("app-update-info", "Обновление скачано — можно перезапустить и установить");
        }
      } catch {}
    });

    autoUpdater.on("error", (error) => {
      updateReady = false;
      const message = error && error.message ? String(error.message) : "Не удалось скачать обновление";
      sendUpdateState({ status: "error", error: message });
      try { if (home && !home.isDestroyed()) home.webContents.send("app-update-info", "Ошибка обновления. Повторим проверку позже."); } catch {}
    });

    // Quick first check after the window is ready, then periodic checks.
    checkAppUpdates().catch(() => {});
    setInterval(() => { checkAppUpdates().catch(() => {}); }, 30 * 60 * 1000);
  }

  }, 5000);
}
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", event => event.preventDefault());
});

async function checkAppUpdates() {
  const checkAt = performance.now();
  startupLog("autoUpdater check begin");
  try { return await autoUpdater.checkForUpdates(); }
  catch (error) { startupLog("autoUpdater check error", { error: error.message }); throw error; }
  finally { startupLog("autoUpdater check end", { durationMs: +(performance.now() - checkAt).toFixed(2) }); }
}