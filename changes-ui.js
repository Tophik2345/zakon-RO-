window.MemoChanges = {
  show(changes) {
    const dialog=document.createElement('dialog');dialog.className='memo-dialog';
    dialog.innerHTML='<button class="dialog-close">Закрыть</button><h2>Изменения базы</h2><p>Важность определена автоматически по ключевым словам; это не юридическая оценка.</p><label>Показать <select><option value="all">Все изменения</option><option value="critical">🔴 Критические</option><option value="important">🟠 Важные</option><option value="normal">🟡 Обычные</option></select></label><div class="change-list"></div>';
    const list=dialog.querySelector('.change-list');
    function render(){list.replaceChildren();const level=dialog.querySelector('select').value;
      for(const c of changes.filter(c=>level==='all'||c.level===level)){
        const row=document.createElement('details');const title=document.createElement('summary');
        if(typeof c==='string'){title.textContent=c;row.append(title);list.append(row);continue;}
        title.textContent=({critical:'🔴 Критическое',important:'🟠 Важное',normal:'🟡 Обычное'}[c.level]||'Изменение')+' · '+c.type+' · '+c.code+' '+c.title+' · '+new Date(c.time).toLocaleString();
        const diff=MemoEngine.diff(c.before,c.after);const grid=document.createElement('div');grid.className='comparison';
        for(const [label,key,tag] of [['Старая редакция','removed','del'],['Новая редакция','added','ins']]){
          const col=document.createElement('section');const heading=document.createElement('h3');heading.textContent=label;const pre=document.createElement('pre');const highlight=document.createElement(tag);highlight.textContent=diff[key];pre.append(document.createTextNode(diff.prefix),highlight,document.createTextNode(diff.suffix));col.append(heading,pre);grid.append(col);
        }row.append(title,grid);list.append(row);
      }if(!list.children.length)list.textContent='Изменений нет';
    }
    dialog.querySelector('select').onchange=render;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);render();dialog.showModal();
  }
};
