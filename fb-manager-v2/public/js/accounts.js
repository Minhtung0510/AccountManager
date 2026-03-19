// public/js/accounts.js
const Accounts = {
  list: [],
  groups: [],
  selected: new Set(),
  view: 'grid',
  editingId: null,
  COLORS: ['#1877F2','#22c55e','#ef4444','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'],

  async init() { await this.load(); },

  async load() {
    try {
      [this.list, this.groups] = await Promise.all([API.getAccounts(), API.getGroups()]);
      this.renderFilters();
      this.render();
    } catch {
      Toast.error('Không kết nối được server. Hãy chạy: npm start');
    }
  },

  getFiltered() {
    const q   = (Utils.qs('#searchInput')?.value||'').toLowerCase();
    const st  = Utils.qs('#filterStatus')?.value||'';
    const tag = Utils.qs('#filterTag')?.value||'';
    const grp = Utils.qs('#filterGroup')?.value||'';
    return this.list.filter(a => {
      const mQ = !q   || a.name.toLowerCase().includes(q)||a.email.toLowerCase().includes(q)||(a.notes||'').toLowerCase().includes(q);
      const mS = !st  || a.status===st;
      const mT = !tag || a.tag===tag;
      const mG = !grp || String(a.groupId)===grp;
      return mQ&&mS&&mT&&mG;
    });
  },

  renderFilters() {
    const sel = Utils.qs('#filterGroup');
    if (!sel) return;
    sel.innerHTML = '<option value="">Tất cả nhóm</option>' +
      this.groups.map(g=>`<option value="${g.id}">${Utils.esc(g.name)}</option>`).join('');
  },

  render() {
    this.renderStats();
    const filtered = this.getFiltered();
    const container = Utils.qs('#accountsContainer');
    if (!container) return;

    // Bulk bar
    const bb = Utils.qs('#bulkBar');
    if (this.selected.size > 0) {
      bb.style.display='flex';
      bb.innerHTML=`
        <span class="bulk-label">Đã chọn ${this.selected.size}</span>
        <button class="btn btn-primary btn-sm" onclick="Accounts.autoLoginSelected()">
          ⚡ Tự động đăng nhập (${this.selected.size})
        </button>
        <button class="btn btn-success btn-sm" onclick="Accounts.openSelected()">
          🚀 Chỉ mở Chrome (${this.selected.size})
        </button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.selectAll()">Chọn tất cả</button>
        <button class="btn btn-danger  btn-sm" onclick="Accounts.deleteSelected()">Xóa đã chọn</button>
        <button class="btn btn-ghost   btn-sm" onclick="Accounts.clearSel()">✕ Bỏ chọn</button>`;
    } else { bb.style.display='none'; }

    if (!filtered.length) {
      container.innerHTML=`<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        <p>Không tìm thấy tài khoản</p></div>`;
      return;
    }
    const cls = this.view==='grid' ? 'accounts-grid' : 'accounts-list';
    container.innerHTML = `<div class="${cls}">${filtered.map(a=>this.view==='grid'?this.cardHTML(a):this.rowHTML(a)).join('')}</div>`;
  },

  renderStats() {
    const el = id => Utils.qs('#'+id);
    if(el('sbTotal'))  el('sbTotal').textContent  = this.list.length;
    if(el('sbOnline')) el('sbOnline').textContent = this.list.filter(a=>a.status==='online').length;
    if(el('sbPages'))  el('sbPages').textContent  = this.list.filter(a=>a.tag==='Page').length;
  },

  cardHTML(a) {
    const sel = this.selected.has(a.id);
    const grp = this.groups.find(g=>g.id===a.groupId);
    const isOnline = a.status === 'online';
    return `
    <div class="account-card${sel?' selected':''}" id="card-${a.id}">
      <input type="checkbox" class="card-checkbox" ${sel?'checked':''} onchange="Accounts.toggleSel(${a.id})">
      <div class="card-header">
        <div class="avatar" style="background:${a.color}">${Utils.initials(a.name)}</div>
        <div class="card-info">
          <div class="card-name">${Utils.esc(a.name)}</div>
          <div class="card-email">${Utils.esc(a.email)}</div>
        </div>
        <div class="status-dot ${a.status}" title="${isOnline?'Online':'Offline'}"></div>
      </div>
      <div class="card-tags">
        <span class="badge ${Utils.tagBadge(a.tag)}">${Utils.esc(a.tag)}</span>
        ${grp?`<span class="badge badge-gray">${grp.icon||''} ${Utils.esc(grp.name)}</span>`:''}
      </div>
      <div class="card-meta">
        <span>🌐 ${Utils.esc(a.browser)} · ${Utils.esc(a.profileDir)}</span>
        ${a.notes?`<span>📝 ${Utils.esc(a.notes.slice(0,30))}${a.notes.length>30?'…':''}</span>`:''}
        <span>🕐 ${a.lastLogin?Utils.fmtDate(a.lastLogin):'Chưa mở'}</span>
      </div>
      <div class="card-actions" style="grid-template-columns:1fr 1fr 1fr;gap:5px">
        <button class="btn btn-primary btn-sm" onclick="Accounts.autoLogin(${a.id})" title="Tự động đăng nhập Facebook" style="grid-column:span 3;background:#1877F2">
          ⚡ Tự động đăng nhập
        </button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.copyInfo(${a.id})">Copy</button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.openModal(${a.id})">Sửa</button>
        <button class="btn btn-danger  btn-sm" onclick="Accounts.delete(${a.id})">Xóa</button>
      </div>
    </div>`;
  },

  rowHTML(a) {
    const sel = this.selected.has(a.id);
    return `
    <div class="account-row${sel?' selected':''}">
      <input type="checkbox" style="accent-color:var(--accent)" ${sel?'checked':''} onchange="Accounts.toggleSel(${a.id})">
      <div class="avatar" style="background:${a.color};width:32px;height:32px;font-size:11px">${Utils.initials(a.name)}</div>
      <div><div class="card-name">${Utils.esc(a.name)}</div><div class="card-email">${Utils.esc(a.email)}</div></div>
      <span class="badge ${Utils.tagBadge(a.tag)}">${Utils.esc(a.tag)}</span>
      <span style="font-size:12px;color:var(--text-secondary)">${Utils.esc(a.browser)} · ${Utils.esc(a.profileDir)}</span>
      <span class="status-dot ${a.status}" style="display:inline-block"></span>
      <div class="row-actions">
        <button class="btn-icon" title="Tự động đăng nhập" onclick="Accounts.autoLogin(${a.id})" style="color:#1877F2">⚡</button>
        <button class="btn-icon" title="Copy" onclick="Accounts.copyInfo(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button class="btn-icon" title="Sửa" onclick="Accounts.openModal(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" style="color:var(--red)" title="Xóa" onclick="Accounts.delete(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`;
  },

  // ── AUTO LOGIN ──────────────────────────────────────────────
  async autoLogin(id) {
    const a = this.list.find(x=>x.id===id);
    if (!a) return;

    // Hiển thị loading trên card
    const card = Utils.qs(`#card-${id}`);
    const btn  = card?.querySelector('.btn-primary');
    if (btn) { btn.textContent = '⏳ Đang đăng nhập...'; btn.disabled = true; }

    Toast.info(`Đang mở Chrome và đăng nhập: ${a.name}...`);

    try {
      const res = await API.autoLogin(id);

      if (res.ok) {
        if (res.status === 'logged_in')        Toast.success(`✅ ${res.message}`);
        else if (res.status === 'already_logged_in') Toast.success(`✅ ${res.message}`);
        else if (res.status === 'focused')     Toast.info(`🔍 ${res.message}`);
        else                                   Toast.success(`✅ ${res.message}`);
      } else {
        if (res.status === '2fa_required')     Toast.warning(`🔐 ${res.message}`);
        else if (res.status === 'wrong_password') Toast.error(`❌ ${res.message}`);
        else                                   Toast.error(`❌ ${res.message}`);
      }
      await this.load();
    } catch (err) {
      Toast.error('Lỗi kết nối server: ' + err.message);
      if (btn) { btn.textContent = '⚡ Tự động đăng nhập'; btn.disabled = false; }
    }
  },

  async autoLoginSelected() {
    const ids = [...this.selected];
    if (!ids.length) { Toast.warning('Chưa chọn tài khoản nào'); return; }
    const settings = await API.getSettings();
    try {
      const res = await API.autoLoginMany(ids, settings.openDelay || 2500);
      Toast.info(`⚡ ${res.message}`);
      setTimeout(() => this.load(), ids.length * (settings.openDelay || 2500) + 1000);
    } catch { Toast.error('Lỗi đăng nhập hàng loạt'); }
  },

  // ── MỞ CHROME (không đăng nhập) ────────────────────────────
  async open(id) {
    try {
      const res = await API.openAccount(id);
      Toast.success(`Đã mở Chrome: ${res.account} (${res.profileDir})`);
      await this.load();
    } catch { Toast.error('Lỗi mở tài khoản'); }
  },

  async openSelected() {
    const ids = [...this.selected];
    if (!ids.length) { Toast.warning('Chưa chọn tài khoản nào'); return; }
    const settings = await API.getSettings();
    try {
      await API.openMany(ids, settings.openDelay || 500);
      Toast.success(`Đang mở ${ids.length} Chrome...`);
      setTimeout(() => this.load(), ids.length * (settings.openDelay || 500) + 500);
    } catch { Toast.error('Lỗi mở hàng loạt'); }
  },

  async copyInfo(id) {
    const a = this.list.find(x=>x.id===id);
    if (!a) return;
    const text = `Tên: ${a.name}\nEmail: ${a.email}\nMật khẩu: ${a.password}\nSĐT: ${a.phone||''}\nBrowser: ${a.browser} – ${a.profileDir}`;
    await Utils.copyText(text);
    Toast.success('Đã sao chép thông tin');
  },

  async delete(id) {
    const a = this.list.find(x=>x.id===id);
    if (!a) return;
    const ok = await Confirm.ask('Xóa tài khoản',`Xóa "${a.name}"?`,'Xóa');
    if (!ok) return;
    await API.deleteAccount(id);
    this.selected.delete(id);
    Toast.success(`Đã xóa: ${a.name}`);
    await this.load();
  },

  async deleteSelected() {
    if (!this.selected.size) return;
    const ok = await Confirm.ask('Xóa nhiều tài khoản',`Xóa ${this.selected.size} tài khoản đã chọn?`,'Xóa tất cả');
    if (!ok) return;
    await Promise.all([...this.selected].map(id=>API.deleteAccount(id)));
    this.selected.clear();
    Toast.success('Đã xóa các tài khoản đã chọn');
    await this.load();
  },

  toggleSel(id)  { this.selected.has(id)?this.selected.delete(id):this.selected.add(id); this.render(); },
  selectAll()    { this.getFiltered().forEach(a=>this.selected.add(a.id)); this.render(); },
  clearSel()     { this.selected.clear(); this.render(); },
  setView(v)     {
    this.view=v;
    Utils.qs('#viewGrid')?.classList.toggle('active',v==='grid');
    Utils.qs('#viewList')?.classList.toggle('active',v==='list');
    this.render();
  },

  // ── MODAL ───────────────────────────────────────────────────
  async openModal(id=null) {
    this.editingId = id;
    const a = id ? this.list.find(x=>x.id===id) : null;
    Utils.qs('#accountModal').classList.add('open');
    Utils.qs('#modalTitle').textContent = a ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới';
    Utils.qs('#fName').value      = a?.name      || '';
    Utils.qs('#fEmail').value     = a?.email     || '';
    Utils.qs('#fPassword').value  = a?.password  || '';
    Utils.qs('#fPhone').value     = a?.phone     || '';
    Utils.qs('#fNotes').value     = a?.notes     || '';
    Utils.qs('#fBrowser').value   = a?.browser   || 'Chrome';
    Utils.qs('#fProfile').value   = a?.profileDir|| `Profile ${this.list.length+1}`;
    Utils.qs('#fTag').value       = a?.tag       || 'Cá nhân';
    const fGroup = Utils.qs('#fGroup');
    fGroup.innerHTML = '<option value="">-- Không có nhóm --</option>' +
      this.groups.map(g=>`<option value="${g.id}"${a?.groupId===g.id?' selected':''}>${Utils.esc(g.name)}</option>`).join('');
    const cur = a?.color || this.COLORS[0];
    Utils.qs('#colorInput').value = cur;
    Utils.qs('#colorGrid').innerHTML = this.COLORS.map(c=>
      `<div class="color-dot${c===cur?' active':''}" style="background:${c}" onclick="Accounts.pickColor('${c}',this)"></div>`
    ).join('');
  },

  pickColor(c,el){ Utils.qs('#colorInput').value=c; Utils.qsa('.color-dot').forEach(d=>d.classList.remove('active')); el.classList.add('active'); },
  closeModal()   { Utils.qs('#accountModal').classList.remove('open'); this.editingId=null; },

  async saveModal() {
    const name  = Utils.qs('#fName').value.trim();
    const email = Utils.qs('#fEmail').value.trim();
    if (!name)  { Toast.error('Vui lòng nhập họ tên'); return; }
    if (!email) { Toast.error('Vui lòng nhập email'); return; }
    const data = {
      name, email,
      password  : Utils.qs('#fPassword').value||'',
      phone     : Utils.qs('#fPhone').value.trim(),
      tag       : Utils.qs('#fTag').value,
      browser   : Utils.qs('#fBrowser').value,
      profileDir: Utils.qs('#fProfile').value.trim()||'Profile 1',
      notes     : Utils.qs('#fNotes').value.trim(),
      color     : Utils.qs('#colorInput').value||this.COLORS[0],
      groupId   : Number(Utils.qs('#fGroup').value)||null,
    };
    if (this.editingId) {
      await API.updateAccount(this.editingId, data);
      Toast.success('Đã cập nhật tài khoản');
    } else {
      await API.addAccount(data);
      Toast.success('Đã thêm tài khoản mới');
    }
    this.closeModal();
    await this.load();
  },

  exportJSON() { API.exportJSON(); Toast.info('Đang tải file JSON...'); },
  async importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const res = await API.importJSON(file);
      Toast.success(`Đã nhập ${res.added} tài khoản mới`);
      await this.load();
    } catch { Toast.error('File không hợp lệ'); }
    event.target.value='';
  },
};
