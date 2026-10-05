const hot = document.getElementById("hot");
const api = window.homeApi;
let currentTheme = { color: "#6d7b8c", brightness: 50, saturation: 70, textColor: "#e6edf5" };

function mixColor(base, tint, amount) {
  const parse = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const a = parse(base); const b = parse(tint);
  const rgb = a.map((value, i) => Math.round(value * (1 - amount) + b[i] * amount));
  return "#" + rgb.map(value => value.toString(16).padStart(2, "0")).join("");
}

function applyTheme(theme) {
  currentTheme = { ...currentTheme, ...(theme || {}) };
  const color = /^#[0-9a-f]{6}$/i.test(String(currentTheme.color || "")) ? String(currentTheme.color).toLowerCase() : "#6d7b8c";
  const brightness = Math.min(100, Math.max(0, Number(currentTheme.brightness ?? 50)));
  const saturation = Math.min(100, Math.max(0, Number(currentTheme.saturation ?? 70)));
  const textColor = /^#[0-9a-f]{6}$/i.test(String(currentTheme.textColor || "")) ? String(currentTheme.textColor).toLowerCase() : "#e6edf5";
  const accent = mixColor("#6d737c", color, saturation / 100);
  const strength = .06 + brightness / 100 * .28;
  currentTheme = { color, brightness, saturation, textColor };
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--text", textColor);
  root.style.setProperty("--bg", mixColor("#0e1218", accent, strength));
  root.style.setProperty("--card", mixColor("#141a22", accent, strength * .7));
  root.style.setProperty("--panel", mixColor("#10151c", accent, strength * .85));
  root.style.setProperty("--line", mixColor("#29313c", accent, Math.min(.55, strength * 1.7)));
  root.style.setProperty("--active", mixColor("#202833", accent, Math.min(.65, strength * 1.9)));
  root.style.setProperty("--hover", mixColor("#1b222c", accent, strength));
  const picker = document.getElementById("themeHomeColor");
  const value = document.getElementById("themeHomeColorValue");
  if (picker) picker.value = color;
  if (value) value.textContent = color;
  const brightnessInput = document.getElementById("themeHomeBrightness");
  const saturationInput = document.getElementById("themeHomeSaturation");
  const textInput = document.getElementById("themeHomeTextColor");
  if (brightnessInput) brightnessInput.value = brightness;
  if (saturationInput) saturationInput.value = saturation;
  if (textInput) textInput.value = textColor;
  document.getElementById("themeHomeBrightnessValue").textContent = brightness + "%";
  document.getElementById("themeHomeSaturationValue").textContent = saturation + "%";
  document.getElementById("themeHomeTextColorValue").textContent = textColor;
  document.querySelectorAll(".home-theme-swatch").forEach((button) => {
    button.classList.toggle("selected", button.dataset.color.toLowerCase() === color);
  });
}

api.getTheme().then(applyTheme).catch(() => applyTheme({}));
api.onTheme(applyTheme);

const homeThemePanel = document.getElementById("homeThemePanel");
const homeThemeColor = document.getElementById("themeHomeColor");
document.getElementById("themeHomeOpen").onclick = () => { homeThemePanel.hidden = false; };
document.getElementById("themeHomeClose").onclick = () => { homeThemePanel.hidden = true; };
document.querySelectorAll(".home-theme-swatch").forEach((button) => {
  button.onclick = async () => applyTheme(await api.setTheme({ ...currentTheme, color: button.dataset.color }));
});
if (homeThemeColor) {
  homeThemeColor.oninput = () => applyTheme({ color: homeThemeColor.value });
  homeThemeColor.onchange = async () => applyTheme(await api.setTheme({ ...currentTheme, color: homeThemeColor.value }));
}
for (const [id, key] of [["themeHomeBrightness", "brightness"], ["themeHomeSaturation", "saturation"]]) {
  const input = document.getElementById(id);
  input.oninput = () => applyTheme({ [key]: Number(input.value) });
  input.onchange = async () => applyTheme(await api.setTheme(currentTheme));
}
const homeTextColor = document.getElementById("themeHomeTextColor");
homeTextColor.oninput = () => applyTheme({ textColor: homeTextColor.value });
homeTextColor.onchange = async () => applyTheme(await api.setTheme(currentTheme));
document.getElementById("themeHomeReset").onclick = async () => applyTheme(await api.resetTheme());

const serverSelect = document.getElementById("server");
async function renderServers(state) {
  if (!serverSelect || !state || !Array.isArray(state.servers)) return;
  serverSelect.replaceChildren(...state.servers.map((server) => {
    const option = document.createElement("option");
    option.value = server.id;
    option.textContent = server.name;
    option.selected = server.id === state.active;
    return option;
  }));
}
api.getServers().then(renderServers).catch(() => {});
if (serverSelect) serverSelect.onchange = () => api.setServer(serverSelect.value).then(renderServers).catch(() => {});
api.onServer(() => api.getServers().then(renderServers).catch(() => {}));

const dbChangeInfo = document.getElementById("dbChangeInfo");
let lastDbChanges = [];
function renderDbChanges(changes) {
  lastDbChanges = Array.isArray(changes) ? changes : [];
  dbChangeInfo.hidden = !lastDbChanges.length;
  if (lastDbChanges.length) dbChangeInfo.textContent = `Изменения в законах: ${lastDbChanges.length}`;
}
api.getDbChanges().then(renderDbChanges).catch(() => {});
api.onDbChanges(renderDbChanges);
dbChangeInfo.onclick = () => MemoChanges.show(lastDbChanges);

document.getElementById("min").onclick = () => api.minimize();
document.getElementById("cls").onclick = () => api.close();
document.getElementById("tg").onclick = () => api.openUrl("https://t.me/Khazb1");
document.getElementById("ds").onclick = () => api.openUrl("https://discord.com/users/linyks3");

api.getHotkey().then((k) => { if (k) hot.textContent = k; });

let wait = false;
function stopWait(label) {
  wait = false;
  hot.classList.remove("wait");
  if (label) hot.textContent = label;
  api.captureHotkey(false);
}

hot.onclick = (e) => {
  e.stopPropagation();
  wait = true;
  hot.classList.add("wait");
  hot.textContent = "Нажмите сочетание… Esc отмена";
  api.captureHotkey(true);
};

setTimeout(() => {
  document.addEventListener("click", () => {
    if (wait) api.getHotkey().then((k) => stopWait(k || "Control+Shift+F"));
  });
}, 0);

window.addEventListener("keydown", (e) => {
  if (!wait) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") {
    api.getHotkey().then((k) => stopWait(k || "Control+Shift+F"));
    return;
  }
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Control");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  const code = e.code || "";
  let key = "";
  if (code.startsWith("Key")) key = code.slice(3);
  else if (code.startsWith("Digit")) key = code.slice(5);
  else if (code.startsWith("F") && code.length <= 3) key = code;
  else return;
  parts.push(key);
  const acc = parts.join("+");
  api.setHotkey(acc);
  stopWait(acc.replace("CommandOrControl", "Control"));
});

const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const bannerBtn = document.getElementById("bannerBtn");

function setStatusLines(element, first, second) {
  if (!element) return;
  element.replaceChildren(document.createTextNode(first), document.createElement("br"), document.createTextNode(second));
}

function updateChangelog(update) {
  const local = Array.isArray(api.localChangelog) ? api.localChangelog : [];
  const remote = Array.isArray(update?.remote?.log) ? update.remote.log : [];
  const version = value => /^\d+\.\d+\.\d+$/.test(String(value || '')) ? String(value).split('.').map(Number) : null;
  const current = version(update?.local?.app), incoming = version(update?.remote?.app);
  // An older remote manifest must never erase release notes bundled with this app.
  if (!incoming || (current && incoming.some((n,i) => n < current[i] && incoming.slice(0,i).every((v,j) => v === current[j])))) {
    renderLog(local);
    return;
  }
  const missing = local.filter(block => block.version && !remote.some(row => row.version === block.version));
  const newer = current && incoming.some((n,i) => n > current[i] && incoming.slice(0,i).every((v,j) => v === current[j]));
  renderLog(newer ? [...remote, ...missing] : [...missing, ...remote]);
}

let displayedLog = "";
let pendingLog = null;
const logPanel = document.querySelector(".right");
let readingLog = false;

function renderLog(log, initial = false) {
  const box = document.querySelector(".log");
  if (!box || !Array.isArray(log) || !log.length) return;
  const normalized = log.map(block => ({ date: String(block?.date || ""), items: Array.isArray(block?.items) ? block.items.map(String) : [] }));
  const signature = JSON.stringify(normalized);
  if (signature === displayedLog) { pendingLog = null; return; }
  if (!initial && readingLog) { pendingLog = normalized; return; }
  pendingLog = null;
  const top = logPanel.scrollTop;
  const panelTop = logPanel.getBoundingClientRect().top;
  const oldRows = [...box.children];
  const anchor = oldRows.find(row => row.getBoundingClientRect().bottom > panelTop);
  const anchorOffset = anchor ? anchor.getBoundingClientRect().top - panelTop : 0;
  const reusable = new Map();
  for (const row of oldRows) {
    const key = row.dataset.logKey;
    if (!reusable.has(key)) reusable.set(key, []);
    reusable.get(key).push(row);
  }
  const rows = normalized.map(block => {
    const key = JSON.stringify(block);
    const existing = reusable.get(key)?.shift();
    if (existing) return existing;
    const row = document.createElement("li");
    row.dataset.logKey = key;
    const date = document.createElement("b");
    date.textContent = block.date;
    const items = document.createElement("ul");
    for (const item of block.items) {
      const li = document.createElement("li");
      li.textContent = item;
      items.appendChild(li);
    }
    row.append(date, items);
    return row;
  });
  rows.forEach((row, index) => {
    if (box.children[index] !== row) box.insertBefore(row, box.children[index] || null);
  });
  while (box.children.length > rows.length) box.lastElementChild.remove();
  if (!initial && anchor && rows.includes(anchor)) {
    logPanel.scrollTop += anchor.getBoundingClientRect().top - panelTop - anchorOffset;
  } else logPanel.scrollTop = top;
  displayedLog = signature;
}

logPanel.addEventListener("pointerenter", () => { readingLog = true; });
logPanel.addEventListener("pointerleave", () => {
  readingLog = false;
  if (pendingLog) renderLog(pendingLog);
});
// The preload obtains bundled data from main's already loaded version.json.
// Render synchronously during page parsing, before the first frame; no network wait.
renderLog(api.localChangelog, true);

api.getUpdate().then((u) => {
  const el = document.getElementById("upd");
  const txt = document.getElementById("updTxt") || el;
  if (el && txt) {
    if (!u || !u.remote) {
      setStatusLines(txt, "Законодательная база обновляется автоматически.", "Нет связи с GitHub — локальная версия");
    } else if (u.appOut) {
      setStatusLines(txt, "Вышла новая версия программы " + String(u.remote.app || ""), "Состояние скачивания показано в уведомлении");
      el.style.color = "#e7c27a";
    } else {
      const raw = String(u.remote.db || u.local.db || "");
      const db = raw.replace(/^(\d{4})-(\d{2})-(\d{2}).*/, "$3.$2.$1");
      setStatusLines(txt, "Законодательная база обновляется автоматически.", "Последнее изменение сервера: " + db);
    }
  }
  if (!u || !u.remote) return;
  updateChangelog(u);
}).catch(() => {});
if (bannerBtn) bannerBtn.onclick = () => {
  api.installUpdate();
};
api.onUpdateReady(() => {
  if (bannerText) bannerText.textContent = "Обновление скачано";
  if (bannerBtn) {
    bannerBtn.textContent = "Перезапустить и обновить";
    bannerBtn.disabled = false;
  }
  if (banner) banner.hidden = false;
});

setInterval(() => {
  api.getUpdate().then((u) => {
    if (!u || !u.remote) return;
    updateChangelog(u);
  }).catch(() => {});
}, 2 * 60 * 1000);

const chk = document.getElementById("chkUpd");
if (chk) chk.onclick = () => {
  chk.textContent = "Проверка…";
  api.checkUpdate();
};
api.onUpdateInfo((msg) => {
  if (chk) chk.textContent = msg || "Проверить обновление лоадера";
});

function renderAppUpdate(state) {
  const labels = {idle: "", checking: "Проверяем обновления…", current: "Установлена последняя версия", downloading: "Скачивание: " + Math.round(state.percent || 0) + "%", ready: "Обновление скачано", installing: "Перезапуск…", error: "Не удалось обновить: " + (state.error || "нет связи")};
  if (bannerText) bannerText.textContent = labels[state.status] || "";
  if (banner) banner.hidden = ["idle", "current"].includes(state.status);
  if (bannerBtn) { bannerBtn.disabled = state.status !== "ready"; bannerBtn.textContent = state.status === "ready" ? "Перезапустить и обновить" : "Ожидание…"; }
}
api.onUpdateState(renderAppUpdate);
api.getAppUpdateState().then(renderAppUpdate).catch(() => {});
