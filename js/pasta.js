/* ============================================================
   Pasta de salvamento (pedido do usuário: escolher onde os arquivos e o salvamento automático ficam, em vez do navegador).
   Carregado antes do app.js; só declara. O `DB` do app.js pergunta ao `DISK` se a chave vai para a pasta:
     files → indice.json · projects → projetos.json · elements → meus-elementos.json (Rascunhos) · elements:<projeto> → elementos/<projeto>.json
     file:<id> → arquivos/<id>.json · pbrand:<projeto> → marcas/<projeto>.json · media:<id> → midia/<id>.<ext>
   O resto (currentId, fontes em cache, modelo da IA) continua no IndexedDB, que também é o que vale sem pasta.
   Usa a File System Access API (Chrome/Edge). O Chrome guarda a pasta escolhida, mas pede para liberar o acesso de novo
   em cada sessão (às vezes ele mesmo lembra): `init` mostra uma janela com o botão "Liberar".
   ============================================================ */
const MEDIA_EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/svg+xml':'svg', 'image/avif':'avif',
  'video/mp4':'mp4', 'video/quicktime':'mov', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/mp4':'m4a', 'audio/ogg':'ogg' };
const DISK = {
  dir:null, mediaIdx:null, q:new Map(),
  supported: typeof window !== 'undefined' && !!window.showDirectoryPicker,
  get name() { return this.dir ? this.dir.name : ''; },
  // para onde vai a chave: { d: subpasta ('' = raiz), f: arquivo, kind: 'json' | 'text' | 'blob' }, ou null (fica no navegador)
  route(k) {
    if (typeof k !== 'string') return null;
    if (k === 'files') return { d:'', f:'indice.json', kind:'json' };
    if (k === 'projects') return { d:'', f:'projetos.json', kind:'json' };
    if (k === 'elements') return { d:'', f:'meus-elementos.json', kind:'json' };
    if (k.startsWith('elements:')) return { d:'elementos', f:k.slice(9) + '.json', kind:'json' };
    if (k.startsWith('file:')) return { d:'arquivos', f:k.slice(5) + '.json', kind:'text' };
    if (k.startsWith('pbrand:')) return { d:'marcas', f:k.slice(7) + '.json', kind:'text' };
    if (k.startsWith('media:')) return { d:'midia', f:k.slice(6), kind:'blob' };
    return null;
  },
  async folder(d, create) { return d ? this.dir.getDirectoryHandle(d, { create }) : this.dir; },
  queue(key, fn) { const p = (this.q.get(key) || Promise.resolve()).catch(() => {}).then(fn); this.q.set(key, p); return p; },
  async mediaIndex() {
    if (this.mediaIdx) return this.mediaIdx;
    const idx = new Map();
    try { const d = await this.folder('midia', false); for await (const [n] of d.entries()) idx.set(n.replace(/\.[^.]+$/, ''), n); } catch (e) { /* ainda não existe */ }
    return this.mediaIdx = idx;
  },
  async read(k) {
    const r = this.route(k); if (!r) return undefined;
    try {
      const d = await this.folder(r.d, false);
      let name = r.f;
      if (r.kind === 'blob') { name = (await this.mediaIndex()).get(r.f); if (!name) return undefined; }
      const file = await (await d.getFileHandle(name)).getFile();
      if (r.kind === 'blob') return file;
      const txt = await file.text();
      return r.kind === 'json' ? JSON.parse(txt) : txt;
    } catch (e) { return undefined; }
  },
  write(k, v) {
    const r = this.route(k); if (!r) return Promise.resolve(false);
    return this.queue(k, async () => {
      try {
        const d = await this.folder(r.d, true);
        let name = r.f;
        if (r.kind === 'blob') {
          const idx = await this.mediaIndex(), old = idx.get(r.f);
          name = r.f + '.' + (MEDIA_EXT[v.type] || 'bin');
          if (old && old !== name) { try { await d.removeEntry(old); } catch (e) {} }
          idx.set(r.f, name);
        }
        const w = await (await d.getFileHandle(name, { create:true })).createWritable();
        await w.write(r.kind === 'json' ? JSON.stringify(v) : v); await w.close();
        return true;
      } catch (e) { console.warn('Pasta: não gravou', k, e); return false; }
    });
  },
  remove(k) {
    const r = this.route(k); if (!r) return Promise.resolve(true);
    return this.queue(k, async () => {
      try {
        const d = await this.folder(r.d, false);
        let name = r.f;
        if (r.kind === 'blob') { const idx = await this.mediaIndex(); name = idx.get(r.f); idx.delete(r.f); if (!name) return true; }
        await d.removeEntry(name); return true;
      } catch (e) { return e && e.name === 'NotFoundError'; }
    });
  },
  // chaves que existem na pasta (para o gcMedia e a cópia)
  async keys() {
    const out = [];
    const list = async (d, pre, ext) => { try { const fh = await this.folder(d, false); for await (const [n] of fh.entries()) if (!ext || n.endsWith(ext)) out.push(pre + (ext ? n.slice(0, -ext.length) : n.replace(/\.[^.]+$/, ''))); } catch (e) {} };
    await list('arquivos', 'file:', '.json'); await list('marcas', 'pbrand:', '.json'); await list('elementos', 'elements:', '.json');
    for (const id of (await this.mediaIndex()).keys()) out.push('media:' + id);
    return out;
  },
  /* ---- ligar / desligar ---- */
  // no começo do editor: se tem pasta guardada, usa (pedindo para liberar se precisar)
  async init() {
    if (!this.supported) return;
    let dh; try { dh = await DB._get('diskHandle'); } catch (e) {} if (!dh) return;
    try { if ((await dh.queryPermission({ mode:'readwrite' })) === 'granted') { this.dir = dh; return; } } catch (e) { return; }
    await this.askAccess(dh);
  },
  askAccess(dh) {
    return new Promise(res => {
      const end = ok => { ov.remove(); res(ok); };
      const grant = async () => {
        try { if ((await dh.requestPermission({ mode:'readwrite' })) === 'granted') { this.dir = dh; end(true); return; } } catch (e) {}
        msg.textContent = 'O navegador não liberou o acesso. Tente de novo ou use o navegador por agora.';
      };
      const msg = h('p', { class:'ask-msg', text:`Os arquivos ficam na pasta "${dh.name}". O navegador pede para liberar o acesso a ela a cada vez que o editor abre.` });
      const okB = h('button', { class:'btn small primary', text:'Liberar a pasta', onclick:grant });
      const ov = h('div', { class:'modal ask' }, [h('div', { class:'modal-card', role:'alertdialog', 'aria-modal':'true' }, [
        h('h2', { text:'Liberar a pasta de salvamento' }), msg,
        h('p', { class:'ask-msg', text:'Se você usar o navegador por agora, o que você fizer fica só nele até a próxima vez que liberar a pasta.' }),
        h('div', { class:'row', style:'justify-content:flex-end' }, [h('button', { class:'btn small ghost', text:'Usar o navegador por agora', onclick:() => end(false) }), okB])])]);
      document.body.append(ov); okB.focus();
    });
  },
  // escolhe a pasta e passa a salvar nela. Devolve true se mudou (o chamador recarrega o editor)
  async pick() {
    let ph; try { ph = await window.showDirectoryPicker({ id:'mola-pasta', mode:'readwrite', startIn:'documents' }); } catch (e) { return false; }
    const has = async d => { try { await d.getFileHandle('indice.json'); return true; } catch (e) { return false; } };
    let root = ph, existing = await has(root), where = ph.name;
    if (!existing) { // pasta com outras coisas: o Mola cria uma subpasta, para não misturar
      let busy = false; for await (const _ of root.entries()) { busy = true; break; }
      if (busy) { root = await root.getDirectoryHandle('Mola Studio', { create:true }); where = ph.name + ' / Mola Studio'; existing = await has(root); }
    }
    const ok = existing
      ? await askConfirm(`A pasta "${where}" já tem arquivos do Mola`, 'O editor passa a abrir e salvar os arquivos dela. O que está só no navegador continua lá, mas não aparece enquanto você usar a pasta.', 'Usar esta pasta')
      : await askConfirm(`Salvar em "${where}"?`, 'Os arquivos, projetos e fotos que estão no navegador são copiados para essa pasta. Daí em diante o salvamento automático grava nela.', 'Copiar e usar');
    if (!ok) return false;
    if (saveT) await flushSave();
    if (!existing) { const ok2 = await this.copyIn(root); if (!ok2) { toast('Não consegui copiar para a pasta. Nada mudou.', 4200); return false; } }
    await DB._set('diskHandle', root);
    return true;
  },
  // copia o que está no navegador para a pasta nova
  async copyIn(root) {
    const prev = this.dir, prevIdx = this.mediaIdx;
    this.dir = root; this.mediaIdx = null;
    try {
      const keys = (await DB._keys()).filter(k => this.route(k));
      for (const k of keys) { const v = await DB._get(k); if (v === undefined) continue; if (!(await this.write(k, v))) throw new Error(k); }
      if (!keys.includes('files')) await this.write('files', []);
      return true;
    } catch (e) { console.warn('Pasta: cópia falhou', e); return false; }
    finally { this.dir = prev; this.mediaIdx = prevIdx; }
  },
  async disconnect() { await DB._del('diskHandle'); this.dir = null; },
};
