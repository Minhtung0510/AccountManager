// public/js/utils.js
const Utils = {
  nextId(list) { return list.length ? Math.max(...list.map(x=>x.id))+1 : 1; },
  initials(name='') { return name.trim().split(' ').filter(Boolean).map(w=>w[0]).slice(-2).join('').toUpperCase()||'?'; },
  tagBadge(tag) {
    return {Page:'badge-blue',Affiliate:'badge-green','Cá nhân':'badge-amber',Seeding:'badge-purple'}[tag]||'badge-gray';
  },
  timeAgo(iso) {
    if (!iso) return '—';
    const s = Math.floor((Date.now()-new Date(iso).getTime())/1000);
    if (s<60)    return 'Vừa xong';
    if (s<3600)  return `${Math.floor(s/60)} phút trước`;
    if (s<86400) return `${Math.floor(s/3600)} giờ trước`;
    return `${Math.floor(s/86400)} ngày trước`;
  },
  fmtDate(iso) { return iso ? new Date(iso).toLocaleString('vi-VN') : '—'; },
  qs(sel,ctx=document) { return ctx.querySelector(sel); },
  qsa(sel,ctx=document){ return [...ctx.querySelectorAll(sel)]; },
  esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
  async copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { const el=document.createElement('textarea'); el.value=text; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); return true; }
  },
};

// public/js/toast.js
const Toast = {
  _c: null,
  init() { this._c=document.createElement('div'); this._c.className='toast-container'; document.body.appendChild(this._c); },
  show(msg, type='info', dur=2800) {
    const icons={success:'✓',error:'✕',warning:'⚠',info:'ℹ'};
    const el=document.createElement('div');
    el.className=`toast ${type}`;
    el.innerHTML=`<span style="font-weight:600">${icons[type]||'ℹ'}</span><span>${Utils.esc(msg)}</span>`;
    this._c.appendChild(el);
    setTimeout(()=>{ el.style.cssText='opacity:0;transform:translateX(20px);transition:0.3s ease'; setTimeout(()=>el.remove(),300); },dur);
  },
  success(m,d){ this.show(m,'success',d); },
  error(m,d)  { this.show(m,'error',d);   },
  warning(m,d){ this.show(m,'warning',d); },
  info(m,d)   { this.show(m,'info',d);    },
};

// public/js/confirm.js
const Confirm = {
  _res: null,
  init() {
    document.body.insertAdjacentHTML('beforeend',`
      <div id="confirmOverlay" class="confirm-overlay">
        <div class="confirm-box">
          <div class="confirm-title" id="confirmTitle"></div>
          <div class="confirm-msg"   id="confirmMsg"></div>
          <div class="confirm-actions">
            <button class="btn btn-outline" onclick="Confirm._ans(false)">Hủy</button>
            <button class="btn btn-danger"  id="confirmOk"  onclick="Confirm._ans(true)">Xác nhận</button>
          </div>
        </div>
      </div>`);
  },
  ask(title,msg,okLabel='Xác nhận') {
    document.getElementById('confirmTitle').textContent=title;
    document.getElementById('confirmMsg').textContent=msg;
    document.getElementById('confirmOk').textContent=okLabel;
    document.getElementById('confirmOverlay').classList.add('open');
    return new Promise(r=>{ this._res=r; });
  },
  _ans(v) { document.getElementById('confirmOverlay').classList.remove('open'); if(this._res)this._res(v); this._res=null; },
};
