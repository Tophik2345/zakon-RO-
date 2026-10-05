/* Renderer additions use only the local database and browser storage. */
const selectedPoints = new Map();
const selectionMode = new Set();
let lastScrolled = '', seenVersions = {};
try { seenVersions = JSON.parse(localStorage.getItem('fsb-seen-versions') || '{}'); } catch {}
function articleSignature(a) {
  let h=2166136261;for(const c of [a.title,a.text,a.punish].join('\n')) h=Math.imul(h^c.charCodeAt(0),16777619);
  return String(h>>>0);
}
function seenKey(a) { return (document.getElementById('server').value || 'kutuz')+':'+a.id; }
function articleBody(a) {
  const selection=selectedPoints.get(a.id)||new Set();
  const view=MemoEngine.resultView(a,currentSearch.parsed);
  return view.points.map(p=>p.number
    ? `<div class="point-row ${selection.has(p.index)?'selected':''} ${view.path.length?'search-target':''}" data-point="${p.index}">${selectionMode.has(a.id)?`<input type="checkbox" ${selection.has(p.index)?'checked':''} aria-label="Выбрать пункт ${esc(p.path.join('.'))}">`:''}<span>${hi(view.path.length?MemoEngine.pointText(p):p.text,currentSearch.highlightQuery,a)}</span><button type="button" class="copy-point" title="Копировать пункт ${esc(p.path.join('.'))}" aria-label="Копировать пункт ${esc(p.path.join('.'))}">⧉</button></div>`
    : `<div>${hi(p.text,currentSearch.highlightQuery)}</div>`).join('');
}
function articleTools(a) {
  const prior=seenVersions[seenKey(a)];
  const changed=prior && prior!==articleSignature(a);
  const pts=MemoEngine.points(a);const view=MemoEngine.resultView(a,currentSearch.parsed);const match=view.path.length?view.points[0]?.index??-1:-1;
  return `<div class="article-tools">${changed?'<div class="changed-note">Изменено после последнего просмотра <button data-action="ack">Отметить прочитанным</button></div>':''}
    <button data-action="all-copy">Копировать всю статью</button>
    ${view.path.length?'<button data-action="result-copy">Копировать результат</button>':''}
    ${pts.some(p=>p.number)?`<button data-action="selection-mode">${selectionMode.has(a.id)?'Завершить выбор':'Выбрать несколько пунктов'}</button>`:''}
    ${selectionMode.has(a.id)?`<span class="selection-help">Отметьте нужные пункты: в буфер попадут только они.</span><button data-action="selected-copy" ${(selectedPoints.get(a.id)?.size||0)?'':'disabled'}>Копировать выбранное (${selectedPoints.get(a.id)?.size||0})</button><button data-action="select-all">Выбрать всё</button><button data-action="clear-selection">Снять выбор</button>`:''}
    ${match>=0?`<button data-action="point-copy" data-index="${match}">Копировать пункт ${esc(searchPoint)}</button>`:''}
    <span class="copy-status" role="status"></span></div>`;
}
async function copyArticleText(card,text) {
  const status=card.querySelector('.copy-status');
  try { await navigator.clipboard.writeText(text);status.textContent='Скопировано ✓'; }
  catch { status.textContent='Не удалось скопировать. Выделите текст и нажмите Ctrl+C.'; }
}
function enhanceArticles() {
  const corrected=currentSearch.corrected;const hint=document.getElementById('searchHint');
  hint.hidden=!corrected||corrected===MemoEngine.norm($q.value.trim());hint.textContent='Ищем как: '+corrected;
  for(const card of $feed.querySelectorAll('.card.open')){
    const a=db.articles.find(a=>a.id===card.dataset.id)||[STATUS_WHO,HELP_LETTERS,HELP_MIRANDA].find(a=>a.id===card.dataset.id);if(!a)continue;
    if(!seenVersions[seenKey(a)]){seenVersions[seenKey(a)]=articleSignature(a);localStorage.setItem('fsb-seen-versions',JSON.stringify(seenVersions));}
    const pts=MemoEngine.points(a);
    for(const row of card.querySelectorAll('.point-row'))row.querySelector('.copy-point').onclick=e=>{e.preventDefault();e.stopPropagation();copyArticleText(card,MemoEngine.copyPoints(a,[pts[Number(row.dataset.point)]]));};
    for(const row of card.querySelectorAll('.point-row')) { const checkbox=row.querySelector('input');if(!checkbox)continue;checkbox.onchange=e=>{
      const values=selectedPoints.get(a.id)||new Set();const i=Number(row.dataset.point);
      if(e.target.checked)values.add(i);else values.delete(i);selectedPoints.set(a.id,values);row.classList.toggle('selected',e.target.checked);
      const copy=card.querySelector('[data-action="selected-copy"]');copy.disabled=!values.size;copy.textContent=`Копировать выбранное (${values.size})`;
    }; }
    for(const button of card.querySelectorAll('[data-action]'))button.onclick=e=>{
      e.stopPropagation();const action=button.dataset.action;
      if(action==='selection-mode'){if(selectionMode.has(a.id)){selectionMode.delete(a.id);selectedPoints.delete(a.id);}else selectionMode.add(a.id);render();}
      if(action==='ack'){seenVersions[seenKey(a)]=articleSignature(a);localStorage.setItem('fsb-seen-versions',JSON.stringify(seenVersions));render();}
      if(action==='all-copy')copyArticleText(card,MemoEngine.copyResult(a,{article:MemoEngine.num(a),pointPath:[],documents:[],text:''}));
      if(action==='result-copy')copyArticleText(card,MemoEngine.copyResult(a,currentSearch.parsed));
      if(action==='point-copy')copyArticleText(card,MemoEngine.copyPoints(a,[pts[Number(button.dataset.index)]]));
      if(action==='selected-copy'){
        const values=selectedPoints.get(a.id)||new Set();const chosen=pts.filter((p,i)=>values.has(i));
        if(!chosen.length)card.querySelector('.copy-status').textContent='Выберите хотя бы один пункт';
        else copyArticleText(card,MemoEngine.copyPoints(a,chosen));
      }
      if(action==='select-all'||action==='clear-selection'){selectedPoints.set(a.id,new Set(action==='select-all'?MemoEngine.resultView(a,currentSearch.parsed).points.filter(p=>p.number).map(p=>p.index):[]));render();}
    };
    const target=card.querySelector('.search-target');const key=$q.value+'|'+a.id;
    if(target&&lastScrolled!==key){lastScrolled=key;requestAnimationFrame(()=>target.scrollIntoView({block:'center'}));}
  }
}
