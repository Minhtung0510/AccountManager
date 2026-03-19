// public/js/pages.js — Groups, History, Settings

/* ═══════════ GROUPS ═══════════ */
const Groups = {
  editingId: null,

  async load() {
    Accounts.groups = await API.getGroups();
    this.render();
    Accounts.renderFilters();
  },

  render() {
    const groups   = Accounts.groups;
    const accounts = Accounts.list;
    const container = Utils.qs('#groupsContainer');
    if (!container) return;
    if (!groups.length) {
      container.innerHTML='<div class="empty-state"><p>Chưa có nhóm nào</p></div>'; return;
    }
    container.innerHTML = groups.map(g => {
      const count = accounts.filter(a=>a.groupId===g.id).length;
      return `
      <div class="group-card">
        <div class="group-card-icon" style="background:${g.color}22">${g.icon||'📁'}</div>
        <div class="group-card-name">${Utils.esc(g.name)}</div>
        <div class="group-card-count">${count} tài khoản</div>
        <div style="display:flex;gap:6px;margin-top:12px">
          <button class="btn btn-outline btn-sm" onclick="Groups.openModal(${g.id})">Sửa</button>
          <button class="btn btn-danger  btn-sm" onclick="Groups.delete(${g.id})">Xóa</button>
        </div>
      </div>`;
    }).join('');
  },

  openModal(id=null) {
    this.editingId = id;
    const g = id ? Accounts.groups.find(x=>x.id===id) : null;
    Utils.qs('#groupModal').classList.add('open');
    Utils.qs('#groupModalTitle').textContent = g ? 'Sửa nhóm' : 'Thêm nhóm';
    Utils.qs('#fGroupName').value  = g?.name  || '';
    Utils.qs('#fGroupIcon').value  = g?.icon  || '';
    Utils.qs('#fGroupColor').value = g?.color || '#1877F2';
  },

  closeModal() { Utils.qs('#groupModal').classList.remove('open'); this.editingId=null; },

  async save() {
    const name = Utils.qs('#fGroupName').value.trim();
    if (!name) { Toast.error('Vui lòng nhập tên nhóm'); return; }
    const data = { name, icon: Utils.qs('#fGroupIcon').value.trim()||'📁', color: Utils.qs('#fGroupColor').value||'#1877F2' };
    if (this.editingId) {
      await API.updateGroup(this.editingId, data);
      Toast.success('Đã cập nhật nhóm');
    } else {
      await API.addGroup(data);
      Toast.success('Đã thêm nhóm mới');
    }
    this.closeModal();
    await this.load();
    await Accounts.load();
  },

  async delete(id) {
    const g = Accounts.groups.find(x=>x.id===id);
    if (!g) return;
    const ok = await Confirm.ask('Xóa nhóm',`Xóa nhóm "${g.name}"?`,'Xóa');
    if (!ok) return;
    await API.deleteGroup(id);
    Toast.success('Đã xóa nhóm');
    await this.load();
    await Accounts.load();
  },
};


/* ═══════════ HISTORY ═══════════ */
const History = {
  async load() {
    const list = await API.getHistory();
    const container = Utils.qs('#historyContainer');
    if (!container) return;
    const labels = { open:'Mở Facebook', add:'Thêm tài khoản', edit:'Sửa tài khoản', delete:'Xóa tài khoản', autologin:'Tự động đăng nhập ✅', autologin_fail:'Đăng nhập thất bại ❌' };
    if (!list.length) { container.innerHTML='<div class="empty-state"><p>Chưa có lịch sử</p></div>'; return; }
    container.innerHTML = list.map(h=>`
      <div class="history-row">
        <div class="history-avatar" style="background:${h.color||'#1877F2'}">${(h.accountName||'?')[0].toUpperCase()}</div>
        <div class="history-action"><b>${Utils.esc(h.accountName||'—')}</b> — ${labels[h.action]||h.action}</div>
        <div class="history-time">${Utils.timeAgo(h.time)}</div>
      </div>`).join('');
  },

  async clear() {
    const ok = await Confirm.ask('Xóa lịch sử','Xóa toàn bộ lịch sử?','Xóa');
    if (!ok) return;
    await API.clearHistory();
    Toast.success('Đã xóa lịch sử');
    await this.load();
  },
};


/* ═══════════ SETTINGS ═══════════ */
const Settings = {
  async load() {
    const s = await API.getSettings();
    const el = id => Utils.qs('#'+id);
    if(el('sAutoStatus'))    el('sAutoStatus').checked     = s.autoStatus !== false;
    if(el('sOpenDelay'))     el('sOpenDelay').value        = s.openDelay || 500;
    if(el('sOpenDelayVal'))  el('sOpenDelayVal').textContent = (s.openDelay||500)+'ms';
    if(el('sDefaultBrowser'))el('sDefaultBrowser').value  = s.defaultBrowser || 'Chrome';
    if(el('sTheme'))         el('sTheme').value            = s.theme || 'light';
    if(el('sChromePath'))    el('sChromePath').value       = s.chromePath || '';
  },

  async save(key, value) {
    await API.saveSettings({ [key]: value });
    if (key === 'theme') document.documentElement.setAttribute('data-theme', value);
    Toast.success('Đã lưu cài đặt');
  },
};


/* ═══════════ APP ═══════════ */
function showPage(name, el) {
  Utils.qsa('.page').forEach(p=>p.classList.remove('active'));
  Utils.qsa('.nav-item').forEach(n=>n.classList.remove('active'));
  const page = Utils.qs('#page-'+name);
  if (page) page.classList.add('active');
  if (el)   el.classList.add('active');
  if (name==='accounts') Accounts.load();
  if (name==='groups')   { Accounts.load().then(()=>Groups.render()); }
  if (name==='history')  History.load();
  if (name==='settings') Settings.load();
}

document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  Confirm.init();

  // Áp dụng theme sớm
  try {
    const s = await API.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme||'light');
  } catch {}

  await Accounts.init();

  // Đóng modal khi click overlay
  Utils.qs('#accountModal')?.addEventListener('click', e=>{ if(e.target===e.currentTarget)Accounts.closeModal(); });
  Utils.qs('#groupModal')?.addEventListener('click', e=>{ if(e.target===e.currentTarget)Groups.closeModal(); });
  Utils.qs('#accountModal')?.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey)Accounts.saveModal(); });
});

async function confirmClearAll() {
  const ok = await Confirm.ask('Xóa toàn bộ','Xóa tất cả tài khoản, nhóm, lịch sử?','Xóa tất cả');
  if (!ok) return;
  await API.clearAll();
  Toast.success('Đã xóa toàn bộ dữ liệu');
  Accounts.load(); Groups.render(); History.load();
}
