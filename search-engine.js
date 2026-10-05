/* Shared, offline retrieval and change analysis. No network or Electron dependency. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MemoEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const words = s => norm(s).match(/[а-яa-z]{3,}/g) || [];
  const stop = new Set(words('как что какие какой можно нужно когда этот статьи статья пункт закон для при или это его она они мне есть будет быть которые такой основание'));
  const synonyms = { машина: ['транспортн', 'автомобил'], наручники: ['спецсредств', 'специальных средств', 'наручник'], задержать: ['задержан'], обыск: ['обыск', 'досмотр'], оружие: ['оружи'], адвокат: ['адвокат', 'защитник'] };
  const corrections = { задержанее: 'задержание', коапп: 'коап', фсбб: 'фсб' };
  function stem(word) {
    const w = norm(word);
    if (w.length < 6 || w === 'казино') return w;
    const base = w.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|иях|ах|ях|ую|юю|ая|яя|ое|ее|ые|ие|ия|ии|ий|ый|ой|ов|ев|ам|ям|ом|ем|а|я|ы|и|у|ю|е)$/, '');
    return base.length >= 4 ? base : w;
  }
  function matchesTerm(text, term, article) {
    const tokens = words(text), base = stem(term);
    if (tokens.some(w => w === term || stem(w) === base)) return true;
    // Explicit topic link requested for the FSB charter; do not broaden casino
    // to every incidental mention of gambling in unrelated project rules.
    if (term === 'казино' && article?.tab === 'Устав ФСБ' && /азартн(?:ых|ые) игр/.test(norm(text))) return true;
    const key = Object.keys(synonyms).find(k => stem(k) === base);
    return key ? synonyms[key].some(s => s.includes(' ')
      ? norm(text).includes(s)
      : tokens.some(w => w.startsWith(s))) : false;
  }
  const num = a => (String(a.code || '').match(/\d+(?:\.\d+)*/) || [''])[0];
  const groupCache = new WeakMap();
  function groupArticles(articles) {
    if (groupCache.has(articles)) return groupCache.get(articles);
    const groups = new Map();
    for (const a of articles) {
      const code = String(a.code || '').replace(/\s*[([][УФСРВ](?:\s*\/\s*[УФСРВ])*[)\]]\s*$/u, '').trim();
      // The same generic FZ code can belong to different laws.
      const key = num(a) ? JSON.stringify([a.kind,a.tab,a.url || a.src,code]) : a;
      if (!groups.has(key)) groups.set(key, {code, rows:[]});
      groups.get(key).rows.push(a);
    }
    const result = [...groups.values()].map(({code,rows}) => {
      if (rows.length === 1 && (rows[0].members || (code === rows[0].code && !jurisdiction(rows[0]) && !/^\s*\d+(?:\.\d+)*[.)]?\s/.test(rows[0].title || '')))) return rows[0];
      const blocks = rows.map(a => {
        const mark = String(a.code || '').slice(code.length).trim();
        const title = [mark && !String(a.title || '').includes(mark) ? mark : '', a.title].filter(Boolean).join(' ');
        const text = [title,a.text,a.punish && !String(a.text || '').includes(a.punish) ? a.punish : ''].filter(Boolean).join('\n');
        const points = structuredPoints({text}).map(p => ({...p}));
        return {text,points};
      });
      const merged = {...rows[0],code,title:'',text:blocks.map(b=>b.text).join('\n\n'),punish:'',members:rows,
        sourceIds:rows.flatMap(a=>a.sourceIds || [a.id]),tags:[...new Set(rows.flatMap(a=>a.tags || []))]};
      const points = [];
      for (const block of blocks) {
        const offset = points.length;
        points.push(...block.points.map(p=>({...p,index:p.index+offset,endIndex:p.endIndex+offset})));
      }
      pointCache.set(merged,points);
      return merged;
    });
    groupCache.set(articles,result);
    groupCache.set(result,result);
    return result;
  }
  const blob = a => norm([a.code, a.tab, a.title, a.text, a.punish, ...(a.tags || [])].join(' '));
  function points(a) { return structuredPoints(a); }
  function distance(a,b) {
    if (Math.abs(a.length-b.length)>1) return 2;
    let row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){let next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]!==b[j-1]));row=next;}return row[b.length];
  }
  function createIndex(articles) {
    const entries=articles.map(a=>({a,text:blob(a)})); const vocabulary=new Map();
    for(const {a} of entries) for(const w of words(a.title+' '+a.tab+' '+(a.tags||[]).join(' '))) vocabulary.set(w,(vocabulary.get(w)||0)+1);
    function correct(q) {
      return norm(q).replace(/[а-яa-z]+/g,w=>{
        if(corrections[w])return corrections[w];
        if(w.length<5||vocabulary.has(w)||entries.some(e=>e.text.includes(w)))return w;
        return [...vocabulary.keys()].filter(v=>distance(w,v)===1).sort((a,b)=>vocabulary.get(b)-vocabulary.get(a))[0]||w;
      });
    }
    function rank(q, limit=8) {
      return search(articles,q,correct).results.filter(row=>row.score>=20000||!parseQuery(q).text)
        .slice(0,limit).map(row=>({...row,coverage:1}));
    }
    return {correct,rank};
  }
  function resolve(articles, query) { return resolveReference(articles, parseQuery(query)); }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lex = s => norm(s).match(/[а-яa-z0-9]+/g) || [];
  const serviceWords = new Set(['в','во','на','и','или','с','со','к','ко','о','об','от','по','из','за','у','а','но','для','при','не','же']);
  const documentAliases = [
    ['фз фсб','ФЗ ФСБ'],['устав фсб','Устав ФСБ'],['уголовный кодекс','Уголовный'],
    ['трудовой кодекс','Трудовой'],['уголовно-процессуальный кодекс','Процессуальный'],
    ['ук рф','Уголовный'],['ук ро','Уголовный'],['тк ро','Трудовой'],['упк ро','Процессуальный'],
    ['конституция','Конституция'],['конст','Конституция'],['коап','Административный'],
    ['уголовный','Уголовный'],['уголовка','Уголовный'],['административный','Административный'],
    ['процессуальный','Процессуальный'],['трудовой','Трудовой'],['дорожный','Дорожный'],
    ['пдд','Дорожный'],['упк','Процессуальный'],['устав','Устав ФСБ'],['ук','Уголовный'],
    ['тк','Трудовой'],['фз','ФЗ'],['пк','Процессуальный'],['дк','Дорожный'],
    ['пго','Гос. организации'],['госы','Гос. организации'],['форум','Форум'],['криминал','Криминал'],
  ].sort((a,b) => b[0].length-a[0].length);
  const regexEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function parseQuery(query) {
    let rest = norm(query).replace(/[,;]/g,' ').trim();
    const documents = [];
    for (const [alias, tab] of documentAliases) {
      const re = new RegExp('(^|\\s)'+regexEscape(alias).replace(/ /g,'\\s+')+'(?=\\s|$|[.,])','g');
      rest = rest.replace(re, () => { if (!documents.includes(tab)) documents.push(tab); return ' '; });
    }
    const pointPath = [];
    rest = rest.replace(/(^|\s)(?:подпункт|пункт|часть|п\s*\.\s*п|пп|п|ч)\.?\s*(\d+(?:\.\d+)*)(?=\s|$|[.,])/g,
      (_all, _space, value) => { pointPath.push(...value.split('.')); return ' '; });
    let article = '';
    rest = rest.replace(/(?:^|\s)(?:ст(?:атья)?\.?\s*)?(\d+(?:\.\d+)*)(?=\s|$)/, (_all, value) => { article=value;return ' '; });
    return {raw:String(query||''), documents, article, pointPath, text:rest.replace(/\s+/g,' ').trim()};
  }
  function inDocument(a, parsed) { return !parsed.documents.length || parsed.documents.includes(a.tab); }
  const pointCache = new WeakMap();
  function structuredPoints(a) {
    if (pointCache.has(a)) return pointCache.get(a);
    const lines=String(a.text||'').split('\n'), out=[], stack=[];
    for (let index=0; index<lines.length; index++) {
      const line=lines[index];
      const m=line.match(/^(\s*)(?:(подпункт|п\s*\.\s*п|пп|ч(?:асть)?|п(?:ункт)?)\.?\s*)?(\d+(?:\.\d+)*)([.)]|\s*[-–]|(?=\s))\s+(.*)$/i);
      if (!m) {
        // A chapter heading belongs to the document, never to the preceding point.
        if (/^\s*(?:ГЛАВА|РАЗДЕЛ)\s+[IVXLC\d]+\b/i.test(line) || !out.length) {
          out.push({number:'',path:[],text:line,start:index,indent:0,style:''}); stack.length=0;
        } else out[out.length-1].text+='\n'+line;
        continue;
      }
      const indent=m[1].replace(/\t/g,'    ').length, number=m[3], explicit=number.split('.');
      const prefix=(m[2]||'').toLowerCase().replace(/[\s.]/g,'');
      const subpoint=prefix==='пп'||prefix==='подпункт';
      const style=subpoint?'subpoint':m[4].trim();
      let parent=null;
      if (explicit.length===1 && (!m[2] || subpoint)) {
        while (stack.length) {
          const last=stack[stack.length-1];
          if (indent>last.indent || (indent===last.indent && style!==last.style && (subpoint || /:\s*$/.test(last.text)))) {parent=last;break;}
          // Continue a child list with its established punctuation style.
          if (indent===last.indent && style===last.style) {stack.pop();parent=stack[stack.length-1]||null;break;}
          stack.pop();
        }
      } else stack.length=0;
      const p={number,path:explicit.length>1?explicit:(parent?[...parent.path,number]:[number]),text:line,start:index,indent,style};
      // Switching back to a parent's marker/indent closes the nested list.
      out.push(p);stack.push(p);
    }
    out.forEach((p,i)=>{
      p.index=i;
      let end=i+1;
      while (p.path.length && end<out.length && out[end].path.length>p.path.length && p.path.every((v,n)=>out[end].path[n]===v)) end++;
      p.endIndex=end;
      p.subtreeText=out.slice(i,end).map(row=>row.text).join('\n').trim();
    });
    pointCache.set(a,out);return out;
  }
  function pointAt(a, path) { return structuredPoints(a).find(p=>p.path.join('.')===path.join('.')); }
  function pointText(p) {
    return p.text.replace(/^\s*(?:(?:подпункт|п\s*\.\s*п|пп|ч(?:асть)?|п(?:ункт)?)\.?\s*)?\d+(?:\.\d+)*(?:[.)]|\s*[-–]|(?=\s))\s+/i,p.number+'. ');
  }
  function subtreeText(a,p) { return structuredPoints(a).slice(p.index,p.endIndex).map(pointText).join('\n').trim(); }
  function resolveReference(articles, parsed) {
    if (!parsed.article) return null;
    const candidates=groupArticles(articles).filter(a=>inDocument(a,parsed));
    const documents=new Map();
    for(const a of candidates){
      const key=JSON.stringify([a.kind,a.tab,a.url || a.src || '',String(a.code||'').replace(/\d.*$/,'').trim()]);
      if(!documents.has(key)) documents.set(key,[]);
      documents.get(key).push(a);
    }
    const references=[...documents.values()].map(rows=>resolveDocumentReference(rows,parsed)).filter(ref=>ref.rows.length);
    if(references.length===1) return references[0];
    const matches=new Set(references.flatMap(ref=>ref.rows));
    const path=references.length && references.every(ref=>ref.point===references[0].point) ? references[0].path : [];
    return {rows:candidates.filter(a=>matches.has(a)),point:path.join('.'),path,article:parsed.article};
  }
  function resolveDocumentReference(articles, parsed) {
    if (!parsed.article) return null;
    const candidates=groupArticles(articles).filter(a=>inDocument(a,parsed));
    let base=parsed.article, path=parsed.pointPath;
    let rows=candidates.filter(a=>num(a)===base);
    if (!rows.length && !path.length) {
      const titled=candidates.filter(a=>{ const p=String(a.title||'').match(/^\s*(\d+(?:\.\d+)*)\s/);return p&&num(a)+'.'+p[1]===base; });
      if(titled.length)return {rows:titled,point:'',path:[],titlePoint:base.split('.').slice(1).join('.')};
      const parts=base.split('.');
      for(let cut=parts.length-1;cut>0;cut--){
        const testBase=parts.slice(0,cut).join('.'), testPath=parts.slice(cut);
        const matches=candidates.filter(a=>num(a)===testBase && (pointAt(a,testPath)||pointAt(a,parts)));
        if(matches.length){base=testBase;path=testPath;rows=matches;break;}
      }
    }
    if(path.length) rows=rows.filter(a=>pointAt(a,path)||pointAt(a,[...base.split('.'),...path]));
    return {rows,point:path.join('.'),path,article:base};
  }
  function resultView(a, query) {
    const parsed=typeof query==='object'?query:parseQuery(query);
    const resolved=resolveReference([a],parsed);
    const path=resolved?.path||[];
    const all=structuredPoints(a);
    const targets=path.length ? all.filter(p=>p.path.join('.')===path.join('.') || p.path.join('.')===[...num(a).split('.'),...path].join('.')) : [];
    let pts=path.length ? targets.flatMap(p=>all.slice(p.index,p.endIndex)) : all;
    const title=String(a.title||'').trim();
    const includeTitle=!!parsed.article && !path.length && title && !String(a.text||'').includes(title);
    if(includeTitle) pts=[{number:'',path:[],text:title},...pts];
    const marks=path.length ? targets.map(p=>jurisdiction({title:p.text}))
      : a.members ? (a.members.length===1 ? [jurisdiction(a.members[0])] : []) : [jurisdiction(a)];
    return {reference:!!parsed.article,path,points:pts,label:formatLabel(a,path),jurisdiction:[...new Set(marks.filter(Boolean))].join(' '),
      text:path.length?targets.map(p=>subtreeText(a,p)).join('\n\n'):[includeTitle && title,a.text].filter(Boolean).join('\n')};
  }
  function formatLabel(a, path=[]) {
    const code=String(a.code||'').replace(/^Устав(?:\s+ФСБ)?(?=\s|$)/iu,'УСТАВ ФСБ');
    if (/^УК\s/iu.test(code) && path.length) {
      const base=num(a).split('.');
      const suffix=base.every((part,i)=>path[i]===part) && path.length>base.length ? path.slice(base.length) : path;
      return code+'.'+suffix.join('.');
    }
    return code+path.map((part,i)=>(i===0?' · п. ':' · пп. ')+part).join('');
  }
  function jurisdiction(a) {
    // Metadata is stored at the beginning of article titles, after their numeric suffix.
    const m=String(a.title||'').match(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?([([]\s*[А-ЯЁ](?:\s*\/\s*[А-ЯЁ])*\s*[)\]])/u);
    return m ? m[1] : '';
  }
  function copyLabel(a,path=[]) {
    const code=a.tab==='Устав ФСБ' ? String(a.code||'').replace(/^Устав(?:\s+ФСБ)?(?=\s|$)/iu,'УСТАВ ФСБ') : a.code;
    return formatLabel({...a,code},path);
  }
  function copyResult(a, query='', selectedPaths=null) {
    if(selectedPaths){
      const sorted=structuredPoints(a).filter(p=>p.path.length&&selectedPaths.some(path=>path.join('.')===p.path.join('.')));
      return copyPoints(a,sorted);
    }
    const v=resultView(a,query);
    if(v.path.length) return copyPoints(a,v.points.filter(p=>p.path.length===v.points[0]?.path.length));
    const text=String(a.text||'');
    const title=String(a.title||'').trim();
    return [copyLabel(a),title && !text.includes(title) && title,text,a.punish && !text.includes(a.punish) && a.punish].filter(Boolean).join('\n');
  }
  function copyPoints(a, points) {
    const chosen=points.filter(p=>!points.some(parent=>parent.index<p.index && p.index<parent.endIndex));
    return chosen.map(p=>copyLabel(a,p.path)+' '+p.subtreeText
      .replace(/^\s*(?:(?:подпункт|п\s*\.\s*п|пп|ч(?:асть)?|п(?:ункт)?)\.?\s*)?\d+(?:\.\d+)*(?:[.)]|\s*[-–]|(?=\s))\s+/i,'')
      .replace(/\s*\r?\n\s*/g,' ').trim()).join('\n');
  }
  function exactWords(text, query) {
    const tokens=lex(text), wanted=lex(query);
    return wanted.length && tokens.some((_t,i)=>wanted.every((t,j)=>tokens[i+j]===t));
  }
  function textScore(a, textQuery) {
    if(!textQuery)return 1;
    const parts=[a.title,a.text,a.punish].filter(Boolean), terms=lex(textQuery).filter(w=>!serviceWords.has(w));
    if(parts.some(text=>exactWords(text,textQuery))) return 50000+(exactWords(a.title,textQuery)?100:0);
    if(!terms.length)return 0;
    const tokenLists=parts.map(lex), all=tokenLists.flat(), literal=terms.filter(t=>all.includes(t)).length;
    const ordered=tokenLists.some(tokens=>tokens.some((w,start)=>{
      if(w!==terms[0])return false;
      let at=start;
      for(const term of terms.slice(1)){const next=tokens.indexOf(term,at+1);if(next<0||next-at>3)return false;at=next;}
      return true;
    }));
    if(literal===terms.length)return ordered?40000:30000;
    const content=parts.join('\n');
    if(terms.every(t=>all.some(w=>stem(w)===stem(t))))return 25000;
    if(terms.every(t=>matchesTerm(content,t,a)))return 20000;
    if(terms.length>=3 && literal>=2 && literal/terms.length>=0.67)return 10000+literal;
    return 0;
  }
  function search(articles, query, correct=null) {
    articles=groupArticles(articles);
    let parsed=parseQuery(query);
    // Explicit document scope is immutable even when correction is attempted.
    let scoped=articles.filter(a=>inDocument(a,parsed));
    const reference=resolveReference(scoped,parsed);
    if(reference) {
      // In All, a dotted number denotes an article. Only UK uses that notation for its grouped entries.
      if(!parsed.documents.length && !parsed.pointPath.length && parsed.article.includes('.'))
        reference.rows=reference.rows.filter(a=>/^УК\s/iu.test(a.code||'') || num(a)===parsed.article);
      scoped=reference.rows;
    }
    const rank=text=>scoped.map(article=>{
      const view=resultView(article,parsed);
      const content=view.path.length?{...article,title:'',text:view.text,punish:''}:article;
      return {article,score:textScore(content,text)};
    }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
    let results=rank(parsed.text), corrected='';
    if(!results.length&&correct){
      corrected=correct(parsed.text);
      if(corrected!==norm(parsed.text)){results=rank(corrected);if(!results.length)corrected='';}
      else corrected='';
      // A mistyped document name is corrected only after the original query has no results.
      if(!results.length&&!parsed.documents.length){
        const fixed=correct(String(query));
        if(fixed!==norm(query)){
          const retry=search(articles,fixed,null);
          if(retry.results.length)return {...retry,corrected:fixed};
        }
      }
    }
    return {results,parsed,reference,corrected,highlightQuery:corrected||parsed.text};
  }
  function highlight(text, query, article) {
    const raw=String(text||''), wanted=lex(query), tokens=[...raw.matchAll(/[а-яёa-z0-9]+/gi)], ranges=[];
    if(!wanted.length)return escapeHtml(raw);
    for(let i=0;i<tokens.length;i++){
      if(article?.tab==='Устав ФСБ' && wanted.includes('казино') && /^азартн(?:ых|ые)$/.test(norm(tokens[i][0])) && norm(tokens[i+1]?.[0]).startsWith('игр')){
        ranges.push([tokens[i].index,tokens[i+1].index+tokens[i+1][0].length]);i++;
      }else if(wanted.every((word,j)=>tokens[i+j]&&norm(tokens[i+j][0])===word)){
        ranges.push([tokens[i].index,tokens[i+wanted.length-1].index+tokens[i+wanted.length-1][0].length]);i+=wanted.length-1;
      }else if(wanted.filter(w=>!serviceWords.has(w)).some(w=>matchesTerm(tokens[i][0],w,article))){ranges.push([tokens[i].index,tokens[i].index+tokens[i][0].length]);}
    }
    let end=0, html='';
    for(const [start,finish]of ranges){html+=escapeHtml(raw.slice(end,start))+'<mark>'+escapeHtml(raw.slice(start,finish))+'</mark>';end=finish;}
    return html+escapeHtml(raw.slice(end));
  }

  function compare(before,after,server='kutuz',time=new Date().toISOString()) {
    const old=new Map((before.articles||[]).map(a=>[a.id,a])), next=new Map((after.articles||[]).map(a=>[a.id,a]));const result=[];
    for(const id of new Set([...old.keys(),...next.keys()])){
      const a=old.get(id),b=next.get(id);if(JSON.stringify(a)===JSON.stringify(b))continue;
      const content=x=>x?[x.code,x.title,x.text,x.punish].filter(Boolean).join('\n'):'';
      const beforeText=content(a),afterText=content(b); if(beforeText===afterText)continue;
      const significant=/запрещ|обязан|задерж|лишени|штраф|срок|оружи|неприкоснов|полномоч|наказан/i.test(beforeText+' '+afterText);
      const level=!b||significant?'critical':!a?'important':'normal';
      result.push({id,server,time,level,type:!a?'Добавлено':!b?'Удалено':'Изменено',code:(b||a).code,title:(b||a).title,before:beforeText,after:afterText});
    }return result;
  }
  function diff(a,b){const x=String(a).split(/(\s+)/),y=String(b).split(/(\s+)/);let l=0,r=0;while(l<x.length&&l<y.length&&x[l]===y[l])l++;while(r<x.length-l&&r<y.length-l&&x[x.length-1-r]===y[y.length-1-r])r++;return {prefix:x.slice(0,l).join(''),removed:x.slice(l,x.length-r).join(''),added:y.slice(l,y.length-r).join(''),suffix:r?x.slice(-r).join(''):''};}
  return {groupArticles,copyPoints,jurisdiction,parseQuery,inDocument,search,resultView,formatLabel,copyResult,highlight,structuredPoints,pointAt,pointText,norm,words,stop,synonyms,stem,matchesTerm,num,blob,points,createIndex,resolve,compare,diff};
});
