// public/js/api.js — gọi REST API từ server Node.js

const API_BASE = 'http://localhost:3000/api';

const API = {

  async _fetch(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(API_BASE + path, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`API ${method} ${path} failed:`, err);
      throw err;
    }
  },

  // Accounts
  getAccounts()           { return this._fetch('GET',    '/accounts'); },
  addAccount(data)        { return this._fetch('POST',   '/accounts', data); },
  updateAccount(id, data) { return this._fetch('PUT',    `/accounts/${id}`, data); },
  deleteAccount(id)       { return this._fetch('DELETE', `/accounts/${id}`); },

  // Groups
  getGroups()             { return this._fetch('GET',    '/groups'); },
  addGroup(data)          { return this._fetch('POST',   '/groups', data); },
  updateGroup(id, data)   { return this._fetch('PUT',    `/groups/${id}`, data); },
  deleteGroup(id)         { return this._fetch('DELETE', `/groups/${id}`); },

  // History
  getHistory()            { return this._fetch('GET',    '/history'); },
  addHistory(data)        { return this._fetch('POST',   '/history', data); },
  clearHistory()          { return this._fetch('DELETE', '/history'); },

  // Settings
  getSettings()           { return this._fetch('GET',    '/settings'); },
  saveSettings(data)      { return this._fetch('PUT',    '/settings', data); },

  // Mở Chrome profile (không tự đăng nhập)
  openAccount(id)         { return this._fetch('POST', '/open',      { accountId: id }); },
  openMany(ids, delay)    { return this._fetch('POST', '/open-many', { accountIds: ids, delay }); },

  // Tự động đăng nhập Facebook
  autoLogin(id)           { return this._fetch('POST', '/autologin',      { accountId: id }); },
  autoLoginMany(ids, d)   { return this._fetch('POST', '/autologin-many', { accountIds: ids, delay: d }); },
  closeSession(id)        { return this._fetch('POST', '/close-session',  { accountId: id }); },
  getSessions()           { return this._fetch('GET',  '/sessions'); },

  // Export / Import
  exportJSON() { window.open(API_BASE + '/export', '_blank'); },
  async importJSON(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    return this._fetch('POST', '/import', data);
  },

  clearAll() { return this._fetch('DELETE', '/clear-all'); },
};
