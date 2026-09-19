let searchIndex = null, searchPoint = "", autoOpenSearch = false;
let db = { articles: [] };

let mode = "laws";
let cat = "Все";
let extra = "";
let openId = null;
let shown = 24;
let specialView = "";
let compactMode = localStorage.getItem("fsb-compact") === "1";

function readStoredList(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function writeStoredList(key, value, limit = 100) {
  localStorage.setItem(key, JSON.stringify([...new Set(value)].slice(0, limit)));
}
let favorites = readStoredList("fsb-favorites");
let pinned = readStoredList("fsb-pinned");
let articleHistory = readStoredList("fsb-article-history");
let queryHistory = readStoredList("fsb-query-history");

const RP_COMMANDS = [
  ["Предъявить удостоверение", "/me достал служебное удостоверение сотрудника ФСБ и показал его гражданину"],
  ["Надеть наручники", "/me снял наручники с пояса, завёл руки задержанного за спину и зафиксировал наручники"],
  ["Провести обыск", "/me надел перчатки и провёл поверхностный обыск задержанного на наличие запрещённых предметов"],
  ["Изъять предмет", "/me аккуратно изъял обнаруженный предмет, поместил его в пакет для вещественных доказательств и опечатал"],
  ["Посадить в автомобиль", "/me открыл заднюю дверь служебного автомобиля и сопроводил задержанного внутрь"],
  ["Миранда", "Вы имеете право хранить молчание. Всё сказанное вами может быть использовано против вас. Вы имеете право на адвоката. Вам понятны ваши права?"],
  ["Рация", "/r Докладывает сотрудник ФСБ: задержание произведено, направляюсь для дальнейшего разбирательства."],
  ["Фотофиксация", "/me включил нагрудную камеру и зафиксировал происходящее"],
];

const $q = document.getElementById("q");
const $feed = document.getElementById("feed");
const $cats = document.getElementById("cats");
const $app = document.getElementById("app");
const $extra = document.getElementById("extra");

const LAW_CHIPS = ["Все", "Уголовный", "Административный", "Дорожный", "Процессуальный"];
const LAW_CORE = ["Уголовный","Административный","Дорожный","Процессуальный"];
const LAW_MORE = ["Миранда", "Памятка", "ФЗ ФСБ", "Устав ФСБ", "ФЗ", "Конституция", "Этика", "Трудовой", "Неприкосновенность"];
function lawMore() {
  const extra = [...new Set((db.articles || []).filter(a => a.kind === "law" && a.tab && !LAW_CORE.includes(a.tab)).map(a => a.tab))];
  extra.sort((a,b) => {
    const ia = LAW_MORE.indexOf(a); const ib = LAW_MORE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return extra.length ? extra : LAW_MORE;
}
const RULE_CHIPS = ["Все", "Основные", "Мероприятия", "Организации"];
const RULE_EVENTS = ["Ограбления", "Форт", "Поставки", "Военное положение", "Цеха"];
const RULE_ORGS = ["Гос. организации", "Криминал", "Лидеры", "Форум", "Проверки ПО"];
const STATUS_WHO = {
  id: "status-who",
  kind: "law",
  tab: "Неприкосновенность",
  code: "Список",
  title: "Кто обладает процессуальной неприкосновенностью",
  text: "По ФЗ неприк. ст. 7:\n1) Премьер-министр РО\n2) Вице-премьер РО\n3) Председатель Госдумы РО\n4) Федеральные министры и заместители\n5) Председатель ВС РО, судьи ВС, судьи Кутузовского районного суда, мировые судьи\n6) Генеральный прокурор РО и заместители\n7) Глава СК РО и заместители\n8) Директор ФСБ РО и заместители\n9) Руководитель ГУ МВД РО и заместители\n10) Начальник ГИБДД РО и заместители\n11) Руководитель ВС РФ/ВС РО и заместители\n12) Главврач ЦГБ и заместители\n13) Глава коллегий адвокатов и заместители\n14) Начальник ФСО и заместители\n15) Сотрудники ФСО на время охраны первых лиц",
  punish: "",
  tags: ["неприкосновенность"]
};
const HELP_LETTERS = {
  id: "help-letters",
  kind: "law",
  tab: "Памятка",
  code: "УК 5.12",
  title: "Что значат буквы Р Ф В С у статьи",
  text: "Подследственность (УК ст. 5.12).\n\n[Р] — МВД. Дело ведёт полиция.\n[Ф] — ФСБ. Дело ведёт ФСБ.\n[В] — Военная полиция.\n[С] — Следственный комитет.\n\nНесколько букв сразу (например Ф/С или Ф/Р/С) — задерживать и вести может любое из этих ведомств.\n\nЗадержание по подозрению делает дознаватель того ведомства, чья буква стоит у статьи. Человека из розыска может задержать любой дознаватель, потом передать тому ведомству, которое объявило розыск.",
  punish: "",
  tags: ["подследственность","миранда","ф","р","в","с"]
};
const HELP_MIRANDA = {
  id: "help-miranda",
  kind: "law",
  tab: "Миранда",
  code: "Миранда",
  title: "Права задержанного (Миранда)",
  text: "Зачитал вслух при задержании:\n\n1. Вы имеете право хранить молчание.\n2. Всё, что вы скажете, может быть использовано против вас.\n3. Вы имеете право на адвоката. Если нет возможности пригласить своего — адвокат будет предоставлен.\n4. Вы можете отказаться отвечать на вопросы до прибытия адвоката.\n\nСпроси: «Вам понятны ваши права?»\nОтвет занеси в протокол / рапорт.",
  punish: "",
  tags: ["миранда","права","задержание"]
};

function chips() { return mode === "laws" ? LAW_CHIPS : RULE_CHIPS; }
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function hi(text, q) {
  const t = esc(text || "");
  if (!q) return t;
  const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
  return t.replace(re, "<mark>$1</mark>");
}
function norm(s) { return (s || "").toLowerCase(); }
function preview(text) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function queryPointPath(query) {
  const raw = String(query || "").toLowerCase().trim();
  return [...raw.matchAll(/(?:^|\\s)п(?:ункт)?\\.?\\s*(\\d+(?:\\.\\d+)*)/gi)].map((m) => m[1]);
}

function displayCode(article, query) {
  const points = queryPointPath(query);
  if (!points.length) return String(article && article.code || "");
  const labels = points.map((point, index) => index === 0 ? `п. ${point}` : `пп. ${point}`);
  return `${String(article && article.code || "")} · ${labels.join(" · ")}`;
}

function inGroup(a) {
  if (mode === "laws") {
    if (cat === "Все" && !extra) return ["Уголовный","Административный","Дорожный","Процессуальный"].includes(a.tab);
    if (extra === "Неприкосновенность") {
      const c = String(a.code||"");
      const ti = String(a.title||"");
      if (/^ФЗ неприк/i.test(c)) return true;
      if (/^(УПК 2\.8|УПК 3\.4|ФЗ 30|ФЗ 26|ФЗ 28|ФЗ 24|Конст\. 40)$/i.test(c)) return true;
      if (/Неприкосновенность судьи|Неприкосновенность Генерального прокурора|Неприкосновенность Премьер|процессуальной неприкосновенност|сняти[ея] неприкосновенност|без снятия неприкосновенност|специальным процессуальным статусом|Лица со специальным процессуальным статусом/i.test(ti)) return true;
      return false;
    }
    if (extra) return a.tab === extra;
    return a.tab === cat;
  }
  if (a.kind !== "rule") return false;
  if (extra) return a.tab === extra;
  if (cat === "Все") return true;
  if (cat === "Основные") return a.tab === "Основные";
  if (cat === "Мероприятия") return RULE_EVENTS.includes(a.tab);
  if (cat === "Организации") return RULE_ORGS.includes(a.tab);
  return a.tab === cat;
}

const ALIAS = {
  ук:"уголовный", "ук рф":"уголовный", уголовка:"уголовный",
  упк:"процессуальный", пк:"процессуальный", "упк ро":"процессуальный",
  коап:"административный", админ:"административный",
  пдд:"дорожный", дк:"дорожный",
  тк:"трудовой", "тк ро":"трудовой", труд:"трудовой", трудовой:"трудовой",
  фз:"фз", "фз фсб":"фз фсб", устав:"устав фсб",
  конституция:"конституция",
  пго:"гос. организации", гос:"гос. организации", госы:"гос. организации",
  форум:"форум", криминал:"криминал", основные:"основные"
};
const BOOK = {
  уголовный:"Уголовный",
  административный:"Административный",
  дорожный:"Дорожный",
  процессуальный:"Процессуальный",
  трудовой:"Трудовой",
  фз:"ФЗ",
  "фз фсб":"ФЗ ФСБ",
  "устав фсб":"Устав ФСБ",
  конституция:"Конституция",
  "гос. организации":"Гос. организации",
  форум:"Форум",
  криминал:"Криминал",
  основные:"Основные"
};
function tokens(q) {
  let source = norm(q).replace(/[\/,;]+/g, " ").replace(/\s+/g, " ").trim();
  const phrases = [];
  for (const [alias, value] of Object.entries(ALIAS).filter(([key]) => key.includes(" ")).sort((a, b) => b[0].length - a[0].length)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g");
    if (re.test(source)) {
      phrases.push(value);
      source = source.replace(re, " ");
    }
  }
  return [...phrases, ...source.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map(t => ALIAS[t] || t)];
}
function articleNum(a) {
  const m = String(a.code || "").match(/(\d+(?:\.\d+)*)/);
  return m ? m[1] : "";
}
function articlePoint(a) {
  const m = String(a.title || "").match(/^\s*(\d+(?:\.\d+)*)\b/);
  return m ? m[1] : "";
}
function numHit(num, t, point) {
  if (!num || !t) return false;
  const full = point ? num + "." + point : num;
  if (t === full || t === num) return true;
  if (num.startsWith(t + ".") || full.startsWith(t + ".")) return true;
  return false;
}
function hit(a, qraw) {
  if (!qraw) return true;
  const num = articleNum(a);
  const point = articlePoint(a);
  const dotted = point ? num + "." + point : "";
  const blob = norm([a.code, a.title, a.text, a.punish, a.tab, a.kind, dotted, ...(a.tags || [])].join(" "));
  const compact = blob.replace(/\s+/g, "");
  const code = norm(a.code || "").replace(/\s+/g, "");
  const parts = tokens(qraw);
  const nums = parts.filter(t => /^\d+(?:\.\d+)*$/.test(t));
  const rest = parts.filter(t => !/^\d+(?:\.\d+)*$/.test(t));
  if (nums.length) {
    const art = nums.filter(t => t.includes("."));
    const pts = nums.filter(t => !t.includes("."));
    const check = art.length ? art : nums;
    if (!check.every(t => numHit(num, t, point))) return false;
    if (art.length && pts.length && point && !pts.includes(point)) return false;
  }
  const books = rest.filter(t => BOOK[t]);
  const words = rest.filter(t => !BOOK[t]);
  if (books.length) {
    const tabn = norm(a.tab || "");
    const okBook = books.some(t => tabn === norm(BOOK[t]) || tabn.includes(t));
    if (!okBook) return false;
  }
  return words.every(t => {
    if (blob.includes(t)) return true;
    if (compact.includes(t.replace(/\s+/g, ""))) return true;
    if (code.includes(t.replace(/\s+/g, ""))) return true;
    return false;
  });
}
function filtered() {
  const q = $q.value.trim();
  const order = {Уголовный:0,Административный:1,Дорожный:2,Процессуальный:3};
  if (specialView) {
    const ids = specialView === "favorites" ? favorites : specialView === "pinned" ? pinned : articleHistory;
    const rank = new Map(ids.map((id, index) => [id, index]));
    return db.articles.filter((article) => rank.has(article.id) && hit(article, q)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }
  const corrected = searchIndex ? searchIndex.correct(q) : q;
  const scoped = db.articles.filter(a => {
    if (mode === "laws" && a.kind !== "law") return false;
    if (mode === "rules" && a.kind !== "rule") return false;
    if (!(cat === "Все" && !extra && q)) {
      if (!inGroup(a)) return false;
    }
    return true;
  });
  const textQuery = corrected.replace(/(?:^|\s)\d+(?:\.\d+)*(?=\s|$)/g, " ").trim();
  const eligible = scoped.filter(a => hit(a, textQuery));
  const resolved = MemoEngine.resolve(eligible, corrected);
  searchPoint = resolved ? resolved.point : "";
  const rows = resolved ? resolved.rows : scoped.filter(a => hit(a, corrected) || smartHit(a, corrected));
  if (mode === "laws") {
    const qn = norm($q.value.trim());
    if (extra === "Неприкосновенность") {
      if (!qn || norm(STATUS_WHO.title + STATUS_WHO.text).includes(qn)) rows.unshift(STATUS_WHO);
    }
    if (extra === "Миранда") {
      rows.length = 0;
      if (!qn || hit(HELP_MIRANDA, q)) rows.push(HELP_MIRANDA);
    } else if (extra === "Памятка" || /подследствен|что знач|букв/.test(qn)) {
      if (!qn || hit(HELP_LETTERS, q)) rows.unshift(HELP_LETTERS);
    }
    if (!extra && /миранд/.test(qn)) {
      if (hit(HELP_MIRANDA, q)) rows.unshift(HELP_MIRANDA);
    }
  }
  return rows.sort((a,b) => {
    const pinDiff = Number(pinned.includes(b.id)) - Number(pinned.includes(a.id));
    return pinDiff || (order[a.tab]??9) - (order[b.tab]??9);
  });
}

function fillExtra() {
  if (!$extra) return;
  const opts = mode === "laws" ? lawMore() : [...RULE_EVENTS, ...RULE_ORGS];
  $extra.innerHTML = `<option value="">Показать все</option>` +
    opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
  $extra.value = extra;
}

function renderCats() {
  $cats.innerHTML = chips().map(c =>
    `<button class="cat ${c === cat && !extra ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`
  ).join("");
  $cats.querySelectorAll(".cat").forEach(b => {
    b.onclick = () => { specialView = ""; renderUtilityState(); cat = b.dataset.c; extra = ""; shown = 40; fillExtra(); render(); };
  });
}

function render() {
  if (typeof syncClear === "function") syncClear();
  if (!chips().includes(cat)) cat = "Все";
  renderCats();
  const q = $q.value.trim();
  const rows = filtered();
  if (autoOpenSearch && rows.length && /\d/.test(q)) { openId = rows[0].id; autoOpenSearch = false; }
  const slice = rows.slice(0, shown);
  const historyHead = specialView === "history" && queryHistory.length
    ? `<div class="query-history">${queryHistory.slice(0, 8).map(value => `<button type="button" data-query="${esc(value)}">${esc(value)}</button>`).join("")}</div>`
    : "";
  $feed.innerHTML = historyHead + (slice.map(a => {
    const open = a.id === openId;
    const safeKind = a.kind === "rule" ? "rule" : "law";
    return `<article class="card ${safeKind} ${open ? "open" : ""}" data-id="${esc(a.id)}">
      <div class="top"><span class="code">${esc(displayCode(a, q))}</span><div class="name">${hi(a.title, q)}</div><div class="card-actions"><button type="button" class="card-action favorite ${favorites.includes(a.id) ? "on" : ""}" data-tip="${favorites.includes(a.id) ? "Убрать из избранного" : "Добавить в избранное"}" aria-label="${favorites.includes(a.id) ? "Убрать из избранного" : "Добавить в избранное"}">★</button><button type="button" class="card-action pin ${pinned.includes(a.id) ? "on" : ""}" data-tip="${pinned.includes(a.id) ? "Открепить статью" : "Закрепить статью"}" aria-label="${pinned.includes(a.id) ? "Открепить статью" : "Закрепить статью"}">📌</button><button type="button" class="card-action copy" data-tip="Копировать всю статью" aria-label="Скопировать статью">⧉</button></div></div>
      ${open ? articleTools(a) : ""}
      <div class="preview">${open ? articleBody(a) : hi(preview(a.text), q)}</div>
      ${open ? '<div class="related-norms"></div>' : ''}
      ${open && a.punish ? `<div class="pun">${hi(a.punish, q)}</div>` : ""}
    </article>`;
  }).join("") || `<div class="empty">Ничего не найдено</div>`);
  $feed.querySelectorAll("[data-query]").forEach((button) => {
    button.onclick = () => { $q.value = button.dataset.query; specialView = ""; shown = 24; renderUtilityState(); render(); };
  });
  if (rows.length > shown) {
    $feed.insertAdjacentHTML("beforeend", `<button class="more" id="more">Ещё ${rows.length - shown}</button>`);
    document.getElementById("more").onclick = () => { shown += 40; render(); };
  }
  $feed.querySelectorAll(".card").forEach(el => {
    const article = db.articles.find((item) => item.id === el.dataset.id);
    const btn = el.querySelector(".copy");
    if (btn) btn.onclick = (e) => {
      e.stopPropagation();
      ping();
      const raw = article ? [article.code, article.title, article.text, article.punish].filter(Boolean).join("\n") : el.innerText.trim();
      navigator.clipboard.writeText(raw).catch(()=>{});
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "⧉"; }, 900);
    };
    const favoriteButton = el.querySelector(".favorite");
    if (favoriteButton) favoriteButton.onclick = (e) => {
      e.stopPropagation();
      favorites = favorites.includes(el.dataset.id) ? favorites.filter((id) => id !== el.dataset.id) : [el.dataset.id, ...favorites];
      writeStoredList("fsb-favorites", favorites); render();
    };
    const pinButton = el.querySelector(".pin");
    if (pinButton) pinButton.onclick = (e) => {
      e.stopPropagation();
      pinned = pinned.includes(el.dataset.id) ? pinned.filter((id) => id !== el.dataset.id) : [el.dataset.id, ...pinned];
      writeStoredList("fsb-pinned", pinned); render();
    };
    el.onclick = (event) => {
      if (event.target.closest(".article-tools, .point-row, .related-norms")) return;
      articleHistory = [el.dataset.id, ...articleHistory.filter((id) => id !== el.dataset.id)];
      writeStoredList("fsb-article-history", articleHistory);
      const query = $q.value.trim();
      if (query) { queryHistory = [query, ...queryHistory.filter((item) => item !== query)]; writeStoredList("fsb-query-history", queryHistory, 30); }
      openId = openId === el.dataset.id ? null : el.dataset.id;
      render();
    };
  });
  enhanceArticles();
}

document.querySelectorAll(".mode-btn").forEach(b => {
  b.onclick = () => {
    specialView = "";
    renderUtilityState();
    mode = b.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach(x => x.classList.toggle("on", x === b));
    $q.placeholder = mode === "laws" ? "Поиск по законам" : "Поиск по правилам";
    cat = "Все"; extra = ""; shown = 24;
    fillExtra();
    render();
  };
});
if ($extra) $extra.onchange = () => { specialView = ""; renderUtilityState(); extra = $extra.value; shown = 24; render(); };
function syncClear() {
  const b = document.getElementById("clear");
  if (b) b.hidden = !$q.value.trim();
}
let tmr;
$q.addEventListener("input", () => {
  shown = 24;
  autoOpenSearch = true;
  syncClear();
  clearTimeout(tmr);
  tmr = setTimeout(render, 160);
});
$q.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const query = $q.value.trim();
  if (!query) return;
  queryHistory = [query, ...queryHistory.filter((item) => item !== query)];
  writeStoredList("fsb-query-history", queryHistory, 30);
});

function ping() { if (window.memo && window.memo.ping) window.memo.ping(); }
document.addEventListener("pointerdown", () => window.memo?.pointer(true));
document.addEventListener("pointerup", () => window.memo?.pointer(false));
document.addEventListener("pointercancel", () => window.memo?.pointer(false));
window.addEventListener("blur", () => window.memo?.pointer(false));
document.addEventListener("pointerdown", ping);
document.addEventListener("pointermove", ping);
document.addEventListener("wheel", ping, { passive: true });
document.addEventListener("keydown", ping);
document.addEventListener("copy", ping);
document.addEventListener("selectstart", ping);
function boot(d) {
  if (d && Array.isArray(d.articles) && d.articles.length) db = d;
  searchIndex = MemoEngine.createIndex(db.articles);
  fillExtra();
  render();
  if (!db.articles.length && $feed) {
    $feed.innerHTML = '<div class="empty">База не загрузилась. Закрой ярлык. В папке проекта: npx electron .</div>';
  }
  requestAnimationFrame(() => window.memo?.ready());
}
if (window.memo && window.memo.getDb) {
  window.memo.getDb().then(boot).catch((e) => {
    boot({articles:[]});
    if ($feed) $feed.innerHTML = '<div class="empty">Ошибка базы</div>';
  });
} else boot(db);
if (window.memo && window.memo.onDb) {
  window.memo.onDb(() => {
    if (window.memo.getDb) window.memo.getDb().then(boot).catch(() => {});
  });
}
async function loadServerOptions() {
  if (!window.memo || !window.memo.getServers) return;
  const select = document.getElementById("server");
  const state = await window.memo.getServers();
  select.replaceChildren(...state.servers.map((server) => {
    const option = document.createElement("option");
    option.value = server.id; option.textContent = server.name; option.selected = server.id === state.active;
    return option;
  }));
}
const serverSelect = document.getElementById("server");
if (serverSelect && window.memo && window.memo.setServer) {
  serverSelect.onchange = async () => {
    await window.memo.setServer(serverSelect.value);
    db = await window.memo.getDb();
    specialView = ""; shown = 24; renderUtilityState(); boot(db);
  };
  loadServerOptions().catch(() => {});
}
// база сама придёт по db-updated, не долбим IPC каждые 2 минуты

const $clear = document.getElementById("clear");
if ($clear) $clear.onclick = (e) => {
  e.preventDefault();
  $q.value = "";
  shown = 24;
  syncClear();
  render();
  $q.focus();
};
$feed.addEventListener("click", (e) => {
  ping();
  const card = e.target.closest(".card");
  const code = e.target.closest(".code");
  if (code) {
    e.stopPropagation();
    navigator.clipboard.writeText(code.innerText.trim()).catch(()=>{});
    return;
  }
  if (card && e.detail === 2) {
    const article = db.articles.find(a => a.id === card.dataset.id);
    if (article) navigator.clipboard.writeText([article.code, article.title, article.text, article.punish].filter(Boolean).join("\n")).catch(()=>{});
  }
});

const utilityViews = {
  favoritesView: "favorites",
  historyView: "history",
  pinnedView: "pinned",
};
function renderUtilityState() {
  Object.entries(utilityViews).forEach(([id, view]) => {
    const button = document.getElementById(id);
    if (button) button.classList.toggle("on", specialView === view);
  });
}
Object.entries(utilityViews).forEach(([id, view]) => {
  const button = document.getElementById(id);
  if (button) button.onclick = () => {
    specialView = specialView === view ? "" : view;
    shown = 100;
    renderUtilityState();
    render();
  };
});

const $rpPanel = document.getElementById("rpPanel");
const $toolsPanel = document.getElementById("toolsPanel");
function closeSidePanels(except) {
  const theme = document.getElementById("themePanel");
  if (theme && theme !== except) theme.hidden = true;
  for (const panel of [$rpPanel, $toolsPanel]) if (panel && panel !== except) panel.hidden = true;
}
const rpCommands = document.getElementById("rpCommands");
if (rpCommands) {
  rpCommands.innerHTML = RP_COMMANDS.map(([name, text], index) => `<button type="button" class="rp-command" data-rp="${index}"><b>${esc(name)}</b><span>${esc(text)}</span></button>`).join("");
  rpCommands.querySelectorAll("[data-rp]").forEach((button) => {
    button.onclick = () => {
      navigator.clipboard.writeText(RP_COMMANDS[Number(button.dataset.rp)][1]).catch(() => {});
      const old = button.querySelector("b").textContent;
      button.querySelector("b").textContent = "Скопировано ✓";
      setTimeout(() => { button.querySelector("b").textContent = old; }, 900);
    };
  });
}
document.getElementById("rpOpen").onclick = () => { const next = $rpPanel.hidden; closeSidePanels($rpPanel); $rpPanel.hidden = !next; };
document.getElementById("rpClose").onclick = () => { $rpPanel.hidden = true; };
document.getElementById("toolsOpen").onclick = () => { const next = $toolsPanel.hidden; closeSidePanels($toolsPanel); $toolsPanel.hidden = !next; };
document.getElementById("toolsClose").onclick = () => { $toolsPanel.hidden = true; };

const compactButton = document.getElementById("compactToggle");
function applyCompact() {
  $app.classList.toggle("compact", compactMode);
  compactButton.classList.toggle("on", compactMode);
  compactButton.textContent = compactMode ? "Обычный вид" : "Компактно";
  if (window.memo && window.memo.setCompact) window.memo.setCompact(compactMode);
}
compactButton.onclick = () => {
  compactMode = !compactMode;
  localStorage.setItem("fsb-compact", compactMode ? "1" : "0");
  applyCompact();
};
applyCompact();

const toolsResult = document.getElementById("toolsResult");
function showToolResult(value) { toolsResult.textContent = String(value || "Готово"); }
function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.getElementById("exportSettings").onclick = async () => {
  const stored = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i); if (key && key.startsWith("fsb-")) stored[key] = localStorage.getItem(key);
  }
  const theme = await window.memo.getTheme();
  downloadJson("zakon-ro-settings.json", { version: 1, theme, stored });
  showToolResult("Настройки сохранены в файл zakon-ro-settings.json");
};
const settingsFile = document.getElementById("settingsFile");
document.getElementById("importSettings").onclick = () => settingsFile.click();
settingsFile.onchange = async () => {
  try {
    const value = JSON.parse(await settingsFile.files[0].text());
    for (const [key, item] of Object.entries(value.stored || {})) if (key.startsWith("fsb-") && typeof item === "string") localStorage.setItem(key, item);
    if (value.theme) await window.memo.setTheme(value.theme);
    showToolResult("Настройки импортированы. Перезапусти окно для полного применения.");
  } catch { showToolResult("Не удалось прочитать файл настроек."); }
  settingsFile.value = "";
};
document.getElementById("validateDb").onclick = async () => {
  const report = await window.memo.validateDb();
  showToolResult(report.ok ? `База исправна. Статей: ${report.articles}` : `Найдено проблем: ${report.issues.length}\n${report.issues.join("\n")}`);
};
document.getElementById("restoreBackup").onclick = async () => {
  const result = await window.memo.restoreLastBackup();
  showToolResult(result.ok ? `Восстановлена копия: ${result.file}` : result.error);
};
async function showDbChanges() {
  const changes = await window.memo.getDbChanges();
  MemoChanges.show(changes);
  document.getElementById("changesBadge").hidden = true;
}
document.getElementById("showChanges").onclick = showDbChanges;
window.memo.getDbChanges().then((changes) => { document.getElementById("changesBadge").hidden = !changes.length; }).catch(() => {});
window.memo.onDbChanges((changes) => { document.getElementById("changesBadge").hidden = !changes.length; });

const $hide = document.getElementById("autohide");
if ($hide) {
  const saved = localStorage.getItem("fsb-ah3");
  $hide.checked = saved !== "0";
  if (window.memo) window.memo.setAutohide($hide.checked);
  $hide.onchange = () => {
    localStorage.setItem("fsb-ah3", $hide.checked ? "1" : "0");
    if (window.memo) window.memo.setAutohide($hide.checked);
  };
  // Outside-click hiding is handled in the main process. A renderer blur event
  // also fires during normal control interaction on Windows and used to close
  // the overlay while the user was changing this checkbox.
}
const $x = document.getElementById("ovClose");
if ($x) $x.onclick = () => window.memo && window.memo.hide();
const $glass = document.getElementById("glass");
if ($glass) {
  const g = localStorage.getItem("fsb-glass");
  if (g !== null) $glass.value = g;
  const apply = () => {
    localStorage.setItem("fsb-glass", $glass.value);
    if (window.memo) window.memo.setGlass($glass.value);
    const value = document.getElementById("glassVal");
    if (value) value.textContent = $glass.value + "%";
  };
  $glass.oninput = apply;
  apply();
}

const $themePanel = document.getElementById("themePanel");
const $themeOpen = document.getElementById("themeOpen");
const $themeClose = document.getElementById("themeClose");
const $themeColor = document.getElementById("themeColor");
const $themeColorValue = document.getElementById("themeColorValue");
const $themeReset = document.getElementById("themeReset");
const $themeBrightness = document.getElementById("themeBrightness");
const $themeSaturation = document.getElementById("themeSaturation");
const $themeTextColor = document.getElementById("themeTextColor");
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
  root.style.setProperty("--bg", mixColor("#11161d", accent, strength));
  root.style.setProperty("--card", mixColor("#141a22", accent, strength * .7));
  root.style.setProperty("--panel", mixColor("#10151c", accent, strength * .85));
  root.style.setProperty("--line", mixColor("#29313c", accent, Math.min(.55, strength * 1.7)));
  root.style.setProperty("--active", mixColor("#202833", accent, Math.min(.65, strength * 1.9)));
  root.style.setProperty("--hover", mixColor("#1b222c", accent, strength));
  root.style.setProperty("--mark", mixColor(accent, "#ffffff", .08));
  if ($themeColor) $themeColor.value = color;
  if ($themeColorValue) $themeColorValue.textContent = color;
  if ($themeBrightness) $themeBrightness.value = brightness;
  if ($themeSaturation) $themeSaturation.value = saturation;
  if ($themeTextColor) $themeTextColor.value = textColor;
  const brightnessValue = document.getElementById("themeBrightnessValue");
  const saturationValue = document.getElementById("themeSaturationValue");
  const textValue = document.getElementById("themeTextColorValue");
  if (brightnessValue) brightnessValue.textContent = brightness + "%";
  if (saturationValue) saturationValue.textContent = saturation + "%";
  if (textValue) textValue.textContent = textColor;
  document.querySelectorAll(".theme-swatch").forEach((button) => {
    button.classList.toggle("selected", button.dataset.color.toLowerCase() === color);
  });
}

async function saveTheme(change) {
  const next = typeof change === "string" ? { color: change } : change;
  applyTheme(next);
  if (window.memo && window.memo.setTheme) applyTheme(await window.memo.setTheme(currentTheme));
}

if (window.memo && window.memo.getTheme) {
  window.memo.getTheme().then(applyTheme).catch(() => applyTheme({}));
  window.memo.onTheme(applyTheme);
} else applyTheme({});

if ($themeOpen) $themeOpen.onclick = () => { const next = $themePanel.hidden; closeSidePanels($themePanel); $themePanel.hidden = !next; };
if ($themeClose) $themeClose.onclick = () => { $themePanel.hidden = true; };
document.querySelectorAll(".theme-swatch").forEach((button) => {
  button.onclick = () => saveTheme({ color: button.dataset.color }).catch(() => {});
});
if ($themeColor) {
  $themeColor.oninput = () => applyTheme({ color: $themeColor.value });
  $themeColor.onchange = () => saveTheme($themeColor.value).catch(() => {});
}
for (const input of [$themeBrightness, $themeSaturation]) {
  if (!input) continue;
  const key = input === $themeBrightness ? "brightness" : "saturation";
  input.oninput = () => applyTheme({ [key]: Number(input.value) });
  input.onchange = () => saveTheme({ [key]: Number(input.value) }).catch(() => {});
}
if ($themeTextColor) {
  $themeTextColor.oninput = () => applyTheme({ textColor: $themeTextColor.value });
  $themeTextColor.onchange = () => saveTheme({ textColor: $themeTextColor.value }).catch(() => {});
}
if ($themeReset) $themeReset.onclick = async () => {
  if (window.memo && window.memo.resetTheme) applyTheme(await window.memo.resetTheme());
  else applyTheme({});
};