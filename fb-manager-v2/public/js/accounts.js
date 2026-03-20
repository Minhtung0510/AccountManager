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

    const bb = Utils.qs('#bulkBar');
    if (this.selected.size > 0) {
      bb.style.display='flex';
      bb.innerHTML=`<span class="bulk-label">Đã chọn ${this.selected.size}</span>
        <button class="btn btn-primary btn-sm" onclick="Accounts.autoLoginSelected()">⚡ Mở tất cả (${this.selected.size})</button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.selectAll()">Chọn tất cả</button>
        <button class="btn btn-danger  btn-sm" onclick="Accounts.deleteSelected()">Xóa đã chọn</button>
        <button class="btn btn-ghost   btn-sm" onclick="Accounts.clearSel()">✕ Bỏ chọn</button>`;
    } else { bb.style.display='none'; }

    if (!filtered.length) {
      container.innerHTML=`<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg><p>Không tìm thấy tài khoản</p></div>`;
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
    const sel      = this.selected.has(a.id);
    const grp      = this.groups.find(g=>g.id===a.groupId);
    const hasTimer = !!a.schedulerConfig?.enabled;
    return `
    <div class="account-card${sel?' selected':''}" id="card-${a.id}">
      <input type="checkbox" class="card-checkbox" ${sel?'checked':''} onchange="Accounts.toggleSel(${a.id})">
      <div class="card-header">
        <div class="avatar" style="background:${a.color}">${Utils.initials(a.name)}</div>
        <div class="card-info">
          <div class="card-name">${Utils.esc(a.name)}</div>
          <div class="card-email">${Utils.esc(a.email)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div class="status-dot ${a.status}"></div>
          ${hasTimer?`<span title="Đang có lịch tự động" style="font-size:12px">⏰</span>`:''}
        </div>
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
      <div class="card-actions" style="grid-template-columns:1fr 1fr;gap:5px">
        <button class="btn btn-primary btn-sm" onclick="Accounts.autoLogin(${a.id})" style="grid-column:span 2">⚡ Mở Facebook</button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.openScheduler(${a.id})">⏰ Lịch tự động</button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.copyInfo(${a.id})">📋 Copy</button>
        <button class="btn btn-outline btn-sm" onclick="Accounts.openModal(${a.id})">✏️ Sửa</button>
        <button class="btn btn-danger  btn-sm" onclick="Accounts.delete(${a.id})">🗑 Xóa</button>
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
        <button class="btn-icon" title="Mở Facebook" onclick="Accounts.autoLogin(${a.id})" style="color:#1877F2">⚡</button>
        <button class="btn-icon" title="Lịch tự động" onclick="Accounts.openScheduler(${a.id})">⏰</button>
        <button class="btn-icon" onclick="Accounts.copyInfo(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button class="btn-icon" onclick="Accounts.openModal(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" style="color:var(--red)" onclick="Accounts.delete(${a.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`;
  },

  // ── AUTO LOGIN ──────────────────────────────────────────────
  async autoLogin(id) {
    const a = this.list.find(x => x.id === id);
    if (!a) return;
    Toast.info(`Đang mở Chrome: ${a.name}...`);
    try {
      const res = await API.autoLogin(id);
      if (res.ok) Toast.success(`✅ ${res.message}`);
      else        Toast.error(`❌ ${res.message}`);
      await this.load();
    } catch (err) {
      Toast.error('Lỗi kết nối server: ' + err.message);
    }
  },

  async autoLoginSelected() {
    const ids = [...this.selected];
    if (!ids.length) { Toast.warning('Chưa chọn tài khoản nào'); return; }
    const settings = await API.getSettings();
    for (const id of ids) {
      const a = this.list.find(x => x.id === id);
      if (!a) continue;
      Toast.info(`Đang mở: ${a.name}...`);
      try { await API.autoLogin(id); } catch {}
      await new Promise(r => setTimeout(r, settings.openDelay || 1500));
    }
    Toast.success(`Đã mở ${ids.length} tài khoản!`);
    await this.load();
  },

  async copyInfo(id) {
    const a = this.list.find(x => x.id === id);
    if (!a) return;
    const text = `Tên: ${a.name}\nEmail: ${a.email}\nMật khẩu: ${a.password}\nSĐT: ${a.phone||''}\nBrowser: ${a.browser} – ${a.profileDir}`;
    await Utils.copyText(text);
    Toast.success('Đã sao chép thông tin');
  },

  async delete(id) {
    const a = this.list.find(x => x.id === id);
    if (!a) return;
    const ok = await Confirm.ask('Xóa tài khoản', `Xóa "${a.name}"?`, 'Xóa');
    if (!ok) return;
    await API.deleteAccount(id);
    this.selected.delete(id);
    Toast.success(`Đã xóa: ${a.name}`);
    await this.load();
  },

  async deleteSelected() {
    if (!this.selected.size) return;
    const ok = await Confirm.ask('Xóa nhiều tài khoản', `Xóa ${this.selected.size} tài khoản đã chọn?`, 'Xóa tất cả');
    if (!ok) return;
    await Promise.all([...this.selected].map(id => API.deleteAccount(id)));
    this.selected.clear();
    Toast.success('Đã xóa các tài khoản đã chọn');
    await this.load();
  },

  toggleSel(id)  { this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id); this.render(); },
  selectAll()    { this.getFiltered().forEach(a => this.selected.add(a.id)); this.render(); },
  clearSel()     { this.selected.clear(); this.render(); },
  setView(v)     {
    this.view = v;
    Utils.qs('#viewGrid')?.classList.toggle('active', v === 'grid');
    Utils.qs('#viewList')?.classList.toggle('active', v === 'list');
    this.render();
  },

  // ── SCHEDULER MODAL ─────────────────────────────────────────
  _schedulerId: null,

  async openScheduler(id) {
    this._schedulerId = id;
    const a = this.list.find(x => x.id === id);
    if (!a) return;

    const modal = Utils.qs('#schedulerModal');
    modal.classList.add('open');
    Utils.qs('#schedulerTitle').textContent = `⏰ Lịch tự động — ${a.name}`;

    // Load config hiện tại
    const cfg = a.schedulerConfig || {
      enabled       : false,
      intervalMinutes: 30,
      daysOfWeek    : [1,2,3,4,5],
      timeRanges    : [
        { from: '08:00', to: '11:00' },
        { from: '14:00', to: '17:00' },
        { from: '20:00', to: '22:00' },
      ],
    };

    Utils.qs('#schEnabled').checked        = cfg.enabled;
    Utils.qs('#schInterval').value         = cfg.intervalMinutes || 30;
    Utils.qs('#schIntervalVal').textContent = (cfg.intervalMinutes || 30) + ' phút';

    // Ngày trong tuần
    const days = cfg.daysOfWeek || [1,2,3,4,5];
    Utils.qsa('.day-btn').forEach(btn => {
      const d = Number(btn.dataset.day);
      btn.classList.toggle('active', days.includes(d));
    });

    // Time ranges
    this._renderTimeRanges(cfg.timeRanges || []);

    // Load logs
    try {
      const status = await API.getScheduler(id);
      const logEl  = Utils.qs('#schedulerLogs');
      if (status.logs?.length) {
        logEl.innerHTML = status.logs.map(l =>
          `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid var(--border);color:var(--text-secondary)">
            <span style="color:var(--text-muted)">${Utils.timeAgo(l.time)}</span> ${Utils.esc(l.message)}
          </div>`
        ).join('');
      } else {
        logEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Chưa có log nào</div>';
      }
    } catch {}
  },

  _renderTimeRanges(ranges) {
    const container = Utils.qs('#timeRanges');
    container.innerHTML = ranges.map((r, i) => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px" id="tr-${i}">
        <input type="time" class="form-input" value="${r.from}" style="flex:1;padding:6px 8px;font-size:12px" id="tr-from-${i}">
        <span style="color:var(--text-muted);font-size:12px">đến</span>
        <input type="time" class="form-input" value="${r.to}"   style="flex:1;padding:6px 8px;font-size:12px" id="tr-to-${i}">
        <button class="btn-icon" style="color:var(--red);flex-shrink:0" onclick="Accounts._removeTimeRange(${i})">✕</button>
      </div>
    `).join('');
    this._timeRangeCount = ranges.length;
    this._timeRanges     = [...ranges];
  },

  _removeTimeRange(i) {
    this._timeRanges.splice(i, 1);
    this._renderTimeRanges(this._timeRanges);
  },

  addTimeRange() {
    this._timeRanges = this._timeRanges || [];
    this._timeRanges.push({ from: '08:00', to: '12:00' });
    this._renderTimeRanges(this._timeRanges);
  },

  toggleDay(btn) {
    btn.classList.toggle('active');
  },

  async saveScheduler() {
    const id = this._schedulerId;
    if (!id) return;

    // Đọc time ranges từ DOM
    const ranges = [];
    const count  = this._timeRanges?.length || 0;
    for (let i = 0; i < count; i++) {
      const from = Utils.qs(`#tr-from-${i}`)?.value;
      const to   = Utils.qs(`#tr-to-${i}`)?.value;
      if (from && to) ranges.push({ from, to });
    }

    // Đọc ngày trong tuần
    const days = [];
    Utils.qsa('.day-btn.active').forEach(btn => days.push(Number(btn.dataset.day)));

    const config = {
      enabled        : Utils.qs('#schEnabled').checked,
      intervalMinutes: Number(Utils.qs('#schInterval').value) || 30,
      daysOfWeek     : days,
      timeRanges     : ranges,
    };

    try {
      await API.setScheduler(id, config);
      Toast.success(config.enabled ? '✅ Đã bật lịch tự động!' : '⏹ Đã tắt lịch');
      this.closeScheduler();
      await this.load();
    } catch {
      Toast.error('Lỗi lưu lịch');
    }
  },

  closeScheduler() {
    Utils.qs('#schedulerModal').classList.remove('open');
    this._schedulerId = null;
  },

  // ── CHROME PROFILE PICKER ────────────────────────────────────
  async openProfilePicker() {
    const modal = Utils.qs('#profilePickerModal');
    const list  = Utils.qs('#profilePickerList');
    if (!modal || !list) return;
    list.innerHTML = '<div class="loading"><div class="spinner"></div> Đang quét...</div>';
    modal.classList.add('open');
    try {
      const profiles = await API.getChromeProfiles();
      if (!profiles.length) {
        list.innerHTML = '<div class="empty-state"><p>Không tìm thấy Chrome Profile nào</p></div>';
        return;
      }
      list.innerHTML = profiles.map(p => `
        <div class="profile-pick-row" onclick="Accounts.selectProfile('${Utils.esc(p.dir)}', '${Utils.esc(p.name)}')"
          style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;margin-bottom:6px;background:var(--bg-card);transition:all 0.15s">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:13px;flex-shrink:0">
            ${p.name[0]?.toUpperCase() || '?'}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${Utils.esc(p.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${Utils.esc(p.email || 'Chưa đăng nhập Google')} · <b>${Utils.esc(p.dir)}</b></div>
          </div>
          <span style="font-size:11px;background:var(--bg-tertiary);padding:3px 8px;border-radius:var(--radius-full);color:var(--text-secondary)">${Utils.esc(p.dir)}</span>
        </div>
      `).join('');
      Utils.qsa('.profile-pick-row').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.borderColor = '#93c5fd');
        row.addEventListener('mouseleave', () => row.style.borderColor = 'var(--border)');
      });
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>Lỗi: ${err.message}</p></div>`;
    }
  },

  selectProfile(dir, name) {
    Utils.qs('#fProfile').value = dir;
    Utils.qs('#profilePickerModal').classList.remove('open');
    Toast.success(`Đã chọn: ${name} (${dir})`);
  },

  closeProfilePicker() { Utils.qs('#profilePickerModal').classList.remove('open'); },

  // ── MODAL TÀI KHOẢN ─────────────────────────────────────────
  async openModal(id = null) {
    this.editingId = id;
    const a = id ? this.list.find(x => x.id === id) : null;
    Utils.qs('#accountModal').classList.add('open');
    Utils.qs('#modalTitle').textContent = a ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới';
    Utils.qs('#fName').value       = a?.name       || '';
    Utils.qs('#fEmail').value      = a?.email      || '';
    Utils.qs('#fPassword').value   = a?.password   || '';
    Utils.qs('#fPhone').value      = a?.phone      || '';
    Utils.qs('#fNotes').value      = a?.notes      || '';
    Utils.qs('#fBrowser').value    = a?.browser    || 'Chrome';
    Utils.qs('#fProfile').value    = a?.profileDir || `Profile ${this.list.length + 1}`;
    Utils.qs('#fTag').value        = a?.tag        || 'Cá nhân';
    const fGroup = Utils.qs('#fGroup');
    fGroup.innerHTML = '<option value="">-- Không có nhóm --</option>' +
      this.groups.map(g => `<option value="${g.id}"${a?.groupId === g.id ? ' selected' : ''}>${Utils.esc(g.name)}</option>`).join('');
    const cur = a?.color || this.COLORS[0];
    Utils.qs('#colorInput').value = cur;
    Utils.qs('#colorGrid').innerHTML = this.COLORS.map(c =>
      `<div class="color-dot${c === cur ? ' active' : ''}" style="background:${c}" onclick="Accounts.pickColor('${c}',this)"></div>`
    ).join('');
  },

  pickColor(c, el) {
    Utils.qs('#colorInput').value = c;
    Utils.qsa('.color-dot').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
  },
  closeModal() { Utils.qs('#accountModal').classList.remove('open'); this.editingId = null; },

  async saveModal() {
    const name  = Utils.qs('#fName').value.trim();
    const email = Utils.qs('#fEmail').value.trim();
    if (!name)  { Toast.error('Vui lòng nhập họ tên'); return; }
    if (!email) { Toast.error('Vui lòng nhập email'); return; }
    const data = {
      name, email,
      password  : Utils.qs('#fPassword').value || '',
      phone     : Utils.qs('#fPhone').value.trim(),
      tag       : Utils.qs('#fTag').value,
      browser   : Utils.qs('#fBrowser').value,
      profileDir: Utils.qs('#fProfile').value.trim() || 'Profile 1',
      notes     : Utils.qs('#fNotes').value.trim(),
      color     : Utils.qs('#colorInput').value || this.COLORS[0],
      groupId   : Number(Utils.qs('#fGroup').value) || null,
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
    event.target.value = '';
  },
};