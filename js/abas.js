/* ============================================================
   Abas (pedido do usuário: abrir mais de um arquivo ao mesmo tempo, com a barra de abas dentro do próprio Mola, para
   trabalhar em tela cheia: no navegador a barra some e trocar de aba fica difícil).
   Carregado ANTES do app.js, só declara `ABAS`; usa FILES, S, pause, toast etc. na hora da chamada.

   Como funciona: o documento de cima é a aba principal e também o hospedeiro. Cada aba a mais é um <iframe> do mesmo
   index.html (`?aba=<id>`), então tem o próprio estado, desfazer e palco, sem mexer em nada do editor. A barra só aparece
   com duas ou mais abas (com uma, nada muda na tela). A principal também fecha: grava, solta o arquivo e fica parada atrás das outras (é o documento de cima, não pode sumir); a última aba não fecha.
   Todas as abas (e abas do navegador também) dividem o mesmo banco, então:
   - Trava por arquivo (navigator.locks, 'mola-file:<id>'): um arquivo só abre em uma aba. Sem isso o autosave de uma aba
     sobrescrevia a outra em silêncio. Abrir um arquivo que está em outra aba leva até ela (aba interna) ou oferece uma cópia.
   - O índice de arquivos ('files') é lido, alterado e gravado dentro de uma trava ('mola-index', `idx`), senão duas abas
     salvando ao mesmo tempo perdiam o nome ou a miniatura uma da outra.
   - O arquivo aberto de cada aba fica no sessionStorage (`mola-cur:<aba>`): recarregar a aba volta ao próprio arquivo, não
     ao último que alguma outra aba abriu (o 'currentId' do banco é um valor só, compartilhado).
   - BroadcastChannel avisa as outras abas quando o índice ou os projetos mudam (janela Arquivos atualiza) e quando a pasta de
     salvamento troca (todas recarregam, senão uma continuaria gravando no lugar antigo).
   Teste: testes/abas.js. ============================================================ */
const ABAS = (() => {
  const qs = new URLSearchParams(location.search);
  let embed = false; try { embed = !!qs.get('aba') && window.parent !== window; } catch (e) {}
  const tabId = embed ? qs.get('aba') : 'main';
  const LOCK = 'mola-file:', hasLocks = !!(navigator.locks && navigator.locks.request);
  const tgt = location.protocol === 'file:' || location.origin === 'null' ? '*' : location.origin; // file://: a origem é opaca e o postMessage recusa o endereço
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} },
  };
  const post = (w, m) => { try { w.postMessage({ mola:1, ...m }, tgt); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'html') n.innerHTML = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    for (const c of kids) if (c) n.append(c);
    return n;
  };

  /* ---------- arquivo aberto desta aba ---------- */
  const curKey = 'mola-cur:' + tabId;
  const getCur = () => ss.get(curKey);
  const setCur = id => ss.set(curKey, id || null);

  /* ---------- trava por arquivo ---------- */
  let held = null; // { id, free } = o arquivo que esta aba tem aberto
  async function claim(id, tries = 0) {
    if (!hasLocks || (held && held.id === id)) return true;
    for (let i = 0; ; i++) {
      const got = await new Promise(res => {
        navigator.locks.request(LOCK + id, { ifAvailable:true }, lock => lock ? new Promise(free => res({ id, free })) : (res(null), undefined)).catch(() => res({ id, free() {} }));
      });
      if (got) { const old = held; held = got; if (old) old.free(); return true; }
      if (i >= tries) return false;
      await sleep(250); // recarregando: a trava da página que está saindo solta em instantes
    }
  }
  async function openIds() { // ids de arquivos abertos em alguma aba (inclusive esta)
    const out = new Set(); if (!hasLocks) return out;
    try { const q = await navigator.locks.query(); for (const l of q.held || []) if (l.name && l.name.startsWith(LOCK)) out.add(l.name.slice(LOCK.length)); } catch (e) {}
    return out;
  }
  const busy = async id => !!id && !(held && held.id === id) && (await openIds()).has(id); // aberto em OUTRA aba
  async function othersOpen() { const s = await openIds(); if (held) s.delete(held.id); return s.size > 0; }
  // ler, mudar e gravar o índice de arquivos sem outra aba no meio (não chamar dentro de outra `idx`: a trava não é reentrante)
  const idx = fn => hasLocks ? navigator.locks.request('mola-index', fn) : fn();

  /* ---------- avisos entre abas ---------- */
  const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mola-abas') : null;
  let pingT = null;
  function ping(k) { if (bc) try { bc.postMessage({ k }); } catch (e) {} }
  function reloadAll() { if (bc) try { bc.postMessage({ k:'reload' }); } catch (e) {} location.reload(); }
  if (bc) bc.onmessage = async e => {
    const k = e.data && e.data.k;
    if (k === 'reload') { try { if (saveT) await flushSave(); } catch (x) {} location.reload(); return; }
    if (k === 'files' || k === 'projects') {
      clearTimeout(pingT);
      pingT = setTimeout(async () => { try { if (k === 'projects') await projSync(); if (!$('#files').hidden) renderFiles(); } catch (x) {} }, 150);
    }
  };

  /* ---------- escolher o arquivo no começo (boot) ---------- */
  // a aba lembra o próprio arquivo; aba nova pode vir com `abrir=<id>` ou `novo=1`; o resto cai no último arquivo aberto no banco.
  // Arquivo ocupado em outra aba: arquivo novo aqui (id = null), nunca o mesmo arquivo em duas abas
  async function pick(list) {
    const has = i => !!i && list.some(f => f.id === i);
    let id = getCur(), explicit = has(id);
    if (!explicit) id = null;
    if (!id && embed && has(qs.get('abrir'))) { id = qs.get('abrir'); explicit = true; }
    if (!id && !(embed && qs.get('novo'))) { id = await DB.get('currentId'); if (!has(id)) id = list[0] && list[0].id; }
    if (!id) return { id:null };
    if (await claim(id, explicit ? 8 : 0)) return { id };
    return { id:null, busy:true };
  }
  const newProject = () => embed && !getCur() ? qs.get('proj') || null : null; // aba criada em "Nova aba": projeto do arquivo que a abriu
  const takeBrand = () => { const k = 'mola-nb:' + tabId, v = ss.get(k); ss.set(k, null); return v; }; // marca mandada pela aba que abriu esta (arquivo novo em Rascunhos)
  function freshName(list) { let n = 1; while (list.some(f => f.name === (n === 1 ? 'Sem título' : `Sem título ${n}`))) n++; return n === 1 ? 'Sem título' : `Sem título ${n}`; }

  /* ---------- abas (barra) ---------- */
  const tabs = []; // só no hospedeiro: { id, file, name, project, frame }
  let active = 'main', bar = null, wrap = null, mainClosed = false; // mainClosed: a principal foi fechada (o documento de cima continua vivo, parado e escondido)
  const mainTab = { id:'main', file:null, name:'', project:null, frame:null };
  if (!embed) tabs.push(mainTab);
  const newTabId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const findByWin = w => tabs.find(t => t.frame && t.frame.contentWindow === w);

  function persist() { ss.set('mola-tabs', tabs.length > 1 || mainClosed ? JSON.stringify({ ids:tabs.filter(t => t.id !== 'main').map(t => t.id), active }) : null); }
  function title() {
    const t = tabs.find(x => x.id === active) || mainTab;
    document.title = `${t.name || 'Mola'} · Mola Studio`;
  }
  function render() {
    if (!bar) return;
    const many = tabs.length > 1 || mainClosed;
    bar.hidden = !many; document.body.classList.toggle('has-tabs', many);
    if (!many) return;
    bar.querySelectorAll('.tab').forEach(n => n.remove());
    const plus = bar.querySelector('.tab-new');
    tabs.forEach((t, i) => {
      const label = t.name || (t.id === 'main' ? 'Mola' : 'Carregando…');
      const on = t.id === active;
      const node = el('div', { class:'tab', role:'tab', 'aria-selected':String(on), tabindex:on ? '0' : '-1', 'data-id':t.id,
        title:`${label}${t.project ? ' · ' + t.project : ''} (Alt + ${i + 1})`,
        onclick:() => go(t.id),
        onauxclick:e => { if (e.button === 1) { e.preventDefault(); close(t.id); } },
        onkeydown:e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(t.id); }
          else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; go(n.id); }
        } }, [
        el('span', { class:'tab-nm', text:label }),
        tabs.length < 2 ? null : el('button', { class:'tab-x', title:'Fechar aba', 'aria-label':`Fechar a aba ${label}`, onclick:e => { e.stopPropagation(); close(t.id); },
          html:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>' }),
      ]);
      bar.insertBefore(node, plus);
    });
    const cur = bar.querySelector('.tab[aria-selected="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block:'nearest', inline:'nearest' });
  }
  function build() {
    if (bar || embed) return;
    bar = el('div', { id:'tabbar', class:'tabbar', role:'tablist', 'aria-label':'Abas', hidden:true }, [
      el('button', { class:'icon-btn tab-new', title:'Nova aba', 'aria-label':'Nova aba', onclick:() => add({ novo:true, project:projOfActive() }),
        html:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>' })]);
    wrap = el('div', { id:'tabframes', class:'tabframes' });
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.append(wrap);
  }
  const projOfActive = () => { const t = tabs.find(x => x.id === active); return t && t.projectId !== undefined ? t.projectId : (typeof FILES !== 'undefined' ? FILES.project : null); };

  function mount(id, o = {}) {
    build();
    const u = new URL(location.href); u.hash = ''; u.search = '';
    const q = new URLSearchParams({ aba:id });
    if (o.file) q.set('abrir', o.file);
    if (o.novo) { q.set('novo', '1'); if (o.project) q.set('proj', o.project); if (o.brand) ss.set('mola-nb:' + id, o.brand); }
    const frame = el('iframe', { class:'aba-frame', title:'Aba do Mola', src:u.href + '?' + q });
    frame.addEventListener('load', () => { if (active === id) focusTab(id); });
    wrap.append(frame);
    const t = { id, file:o.file || null, name:'', project:null, frame };
    tabs.push(t);
    return t;
  }
  function add(o = {}) {
    if (embed) { post(window.parent, { k:'add', ...o }); return; }
    const t = mount(newTabId(), o);
    go(t.id);
  }
  function focusTab(id) {
    const t = tabs.find(x => x.id === id); if (!t) return;
    try {
      if (t.frame) { t.frame.focus(); t.frame.contentWindow.focus(); }
      else { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); window.focus(); }
    } catch (e) {}
  }
  // quem sai da vista para de tocar e solta o cache do palco (refaz sozinho ao voltar)
  function leave(t) {
    if (!t) return;
    if (t.frame) post(t.frame.contentWindow, { k:'leave' });
    else tidy();
  }
  function tidy() {
    try { pause(); closeMenu(); } catch (e) {}
    try { FC.pre = FC.suf = null; FC.sigs = null; LCACHE.clear(); LCACHE_PX = 0; } catch (e) {}
  }
  function go(id) {
    if (embed) { post(window.parent, { k:'go', id }); return; }
    const t = tabs.find(x => x.id === id); if (!t) return;
    if (id !== active) leave(tabs.find(x => x.id === active));
    active = id;
    tabs.forEach(x => { if (x.frame) x.frame.classList.toggle('on', x.id === id); });
    const app = document.getElementById('app'); if (app) app.inert = id !== 'main';
    render(); title(); persist();
    if (t.frame) post(t.frame.contentWindow, { k:'enter' }); else { try { needs = true; } catch (e) {} }
    focusTab(id);
  }
  const waitClose = new Map();
  async function close(id) {
    if (embed || tabs.length < 2) return; // a última aba não fecha
    const i = tabs.findIndex(x => x.id === id); if (i < 0) return;
    const t = tabs[i];
    if (id === 'main') { // o documento de cima não some: grava, solta o arquivo e fica parado atrás das outras abas
      try { if (saveT) await flushSave(); } catch (e) {}
      const j = tabs.indexOf(t); if (j < 0) return;
      tabs.splice(j, 1); mainClosed = true;
      tidy(); if (held) { held.free(); held = null; }
      if (active === 'main') go(tabs[Math.max(0, j - 1)].id); else { render(); persist(); }
      return;
    }
    await new Promise(res => { // a aba termina de salvar antes de sumir (tirar o iframe não espera o autosave)
      const to = setTimeout(res, 3000); waitClose.set(id, () => { clearTimeout(to); res(); });
      post(t.frame.contentWindow, { k:'close' });
    });
    waitClose.delete(id);
    const j = tabs.indexOf(t); if (j < 0) return;
    tabs.splice(j, 1);
    t.frame.src = 'about:blank'; t.frame.remove();
    ss.set('mola-cur:' + id, null);
    if (active === id) go((tabs[Math.max(0, j - 1)] || mainTab).id); else { render(); persist(); }
  }
  // leva até a aba que tem esse arquivo aberto (aba interna). Devolve se achou
  async function goTo(file) {
    if (embed) {
      return new Promise(res => { const req = Math.random().toString(36).slice(2); pend.set(req, res); post(window.parent, { k:'goto', file, req }); setTimeout(() => { if (pend.delete(req)) res(false); }, 700); });
    }
    const t = tabs.find(x => x.file === file); if (!t) return false;
    go(t.id); return true;
  }
  const pend = new Map();

  // avisa o hospedeiro do arquivo desta aba (nome na barra de abas)
  function report() {
    let f; try { f = { file:FILES.id, name:FILES.name, project:FILES.project ? (PROJ_NAMES.get(FILES.project) || null) : null, projectId:FILES.project || null }; } catch (e) { return; }
    if (embed) post(window.parent, { k:'tab', ...f });
    else { Object.assign(mainTab, f); render(); title(); }
  }

  window.addEventListener('message', async e => {
    const m = e.data; if (!m || !m.mola) return;
    if (embed) { // do hospedeiro
      if (e.source !== window.parent) return;
      if (m.k === 'leave') tidy();
      else if (m.k === 'enter') { try { needs = true; } catch (x) {} }
      else if (m.k === 'close') { try { if (saveT) await flushSave(); } catch (x) {} post(window.parent, { k:'closed' }); }
      else if (m.k === 'goto-r') { const r = pend.get(m.req); if (r) { pend.delete(m.req); r(!!m.ok); } }
      return;
    }
    const t = findByWin(e.source); if (!t) return; // só as abas que o próprio hospedeiro criou
    if (m.k === 'tab') { t.file = m.file; t.name = m.name; t.project = m.project; t.projectId = m.projectId; render(); if (active === t.id) title(); }
    else if (m.k === 'add') add({ file:m.file, novo:m.novo, project:m.project, brand:m.brand });
    else if (m.k === 'go') { const o = m.n ? tabs[m.n - 1] : tabs.find(x => x.id === m.id); if (o) go(o.id); }
    else if (m.k === 'goto') { const o = tabs.find(x => x.file === m.file && x !== t); if (o) go(o.id); post(e.source, { k:'goto-r', req:m.req, ok:!!o }); }
    else if (m.k === 'closed') { const w = waitClose.get(t.id); if (w) w(); }
  });

  // Alt + 1…9: vai para a aba (a fileira de cima; o teclado numérico com Alt digita códigos no Windows)
  window.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const m = /^Digit([1-9])$/.exec(e.code); if (!m) return;
    if (embed) { e.preventDefault(); post(window.parent, { k:'go', n:+m[1] }); return; }
    if (tabs.length < 2 || !tabs[+m[1] - 1]) return;
    e.preventDefault(); go(tabs[+m[1] - 1].id);
  }, true);

  // abrir um arquivo que outra aba já tem: ir até ela (aba interna) ou oferecer uma cópia (aba do navegador)
  async function openBusy(id) {
    if (await goTo(id)) { try { closeFiles(); } catch (e) {} toast('Esse arquivo já está aberto em outra aba. Fui até ela.'); return; }
    if (!(await askConfirm('Arquivo aberto em outra aba do navegador', 'Abrir aqui também pode fazer uma das abas apagar o trabalho da outra. Quer abrir uma cópia dele?', 'Abrir uma cópia'))) return;
    const nid = await duplicateFile(id); if (nid) await openFile(nid);
  }

  function init() {
    const b = document.getElementById('tabBtn');
    if (b) b.addEventListener('click', () => add({ novo:true, project:typeof FILES !== 'undefined' ? FILES.project : null }));
    if (embed) return;
    build();
    let st = null; try { st = JSON.parse(ss.get('mola-tabs') || 'null'); } catch (e) {}
    if (st && Array.isArray(st.ids) && st.ids.length) { // recarregou: as abas voltam, cada uma com o próprio arquivo
      st.ids.forEach(id => mount(id));
      active = st.active === 'main' || st.ids.includes(st.active) ? st.active : 'main';
      tabs.forEach(x => { if (x.frame) x.frame.classList.toggle('on', x.id === active); });
      const app = document.getElementById('app'); if (app) app.inert = active !== 'main';
      render(); title();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { embed, tabId, getCur, setCur, claim, busy, openIds, othersOpen, idx, ping, reloadAll, pick, newProject, takeBrand, freshName,
    add, go, goTo, openBusy, report, get count() { return embed ? 0 : tabs.length; }, get active() { return active; }, tabs };
})();
