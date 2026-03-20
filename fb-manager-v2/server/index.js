// server/index.js — Express backend, lưu dữ liệu vào data/db.json

const { autoLogin, autoLoginMany, closeSession, getActiveSessions } = require('./autologin');
const scheduler = require('./scheduler');

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const { exec }   = require('child_process');
const os         = require('os');

const app     = express();
const PORT    = 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── DB HELPERS ───────────────────────────────────────────────
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return getDefaultDB();
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return getDefaultDB();
  }
}

function writeDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmpPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    setTimeout(() => {
      try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.error('writeDB retry failed:', e.message);
      }
    }, 100);
  }
}

function getDefaultDB() {
  return {
    accounts: [
      { id:1, name:'Nguyễn Văn A', email:'nguyenvana@gmail.com', password:'Pass@1234', phone:'0901234567', tag:'Page',      groupId:1, status:'offline', browser:'Chrome', profileDir:'Profile 1', lastLogin:null, notes:'Trang chủ thẩm mỹ', color:'#1877F2' },
      { id:2, name:'Trần Thị B',   email:'tranthib@gmail.com',   password:'Pass@5678', phone:'0912345678', tag:'Affiliate', groupId:1, status:'offline', browser:'Chrome', profileDir:'Profile 2', lastLogin:null, notes:'Affiliate skincare', color:'#22c55e' },
      { id:3, name:'Lê Văn C',     email:'levanc@gmail.com',     password:'Pass@9012', phone:'0923456789', tag:'Cá nhân',   groupId:2, status:'offline', browser:'Chrome', profileDir:'Profile 3', lastLogin:null, notes:'', color:'#8b5cf6' },
    ],
    groups: [
      { id:1, name:'Thẩm mỹ viện A', icon:'💆', color:'#1877F2' },
      { id:2, name:'Skincare B',     icon:'✨', color:'#22c55e' },
    ],
    history: [],
    settings: {
      theme          : 'light',
      openDelay      : 500,
      defaultBrowser : 'Chrome',
      autoStatus     : true,
      chromePath     : getDefaultChromePath(),
    }
  };
}

function getDefaultChromePath() {
  const platform = os.platform();
  if (platform === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

function getChromeUserDataDir() {
  const platform = os.platform();
  const home     = os.homedir();
  if (platform === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function nextId(list) {
  return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


// ─── ROUTES: ACCOUNTS ─────────────────────────────────────────
app.get('/api/accounts', (req, res) => {
  res.json(readDB().accounts);
});

app.post('/api/accounts', (req, res) => {
  const db  = readDB();
  const acc = { id: nextId(db.accounts), status: 'offline', lastLogin: null, ...req.body };
  db.accounts.push(acc);
  writeDB(db);
  res.json(acc);
});

app.put('/api/accounts/:id', (req, res) => {
  const db  = readDB();
  const idx = db.accounts.findIndex(a => a.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.accounts[idx] = { ...db.accounts[idx], ...req.body };
  writeDB(db);
  res.json(db.accounts[idx]);
});

app.delete('/api/accounts/:id', (req, res) => {
  const db = readDB();
  db.accounts = db.accounts.filter(a => a.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});


// ─── ROUTES: GROUPS ───────────────────────────────────────────
app.get('/api/groups', (req, res) => res.json(readDB().groups));

app.post('/api/groups', (req, res) => {
  const db  = readDB();
  const grp = { id: nextId(db.groups), ...req.body };
  db.groups.push(grp);
  writeDB(db);
  res.json(grp);
});

app.put('/api/groups/:id', (req, res) => {
  const db  = readDB();
  const idx = db.groups.findIndex(g => g.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.groups[idx] = { ...db.groups[idx], ...req.body };
  writeDB(db);
  res.json(db.groups[idx]);
});

app.delete('/api/groups/:id', (req, res) => {
  const db = readDB();
  db.groups   = db.groups.filter(g => g.id !== Number(req.params.id));
  db.accounts = db.accounts.map(a => a.groupId === Number(req.params.id) ? { ...a, groupId: null } : a);
  writeDB(db);
  res.json({ ok: true });
});


// ─── ROUTES: HISTORY ──────────────────────────────────────────
app.get('/api/history', (req, res) => res.json(readDB().history));

app.post('/api/history', (req, res) => {
  const db    = readDB();
  const entry = { ...req.body, time: new Date().toISOString() };
  db.history.unshift(entry);
  if (db.history.length > 300) db.history.splice(300);
  writeDB(db);
  res.json(entry);
});

app.delete('/api/history', (req, res) => {
  const db   = readDB();
  db.history = [];
  writeDB(db);
  res.json({ ok: true });
});


// ─── ROUTES: SETTINGS ─────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json(readDB().settings));

app.put('/api/settings', (req, res) => {
  const db    = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json(db.settings);
});


// ─── ROUTE: MỞ CHROME PROFILE ─────────────────────────────────
app.post('/api/open', (req, res) => {
  const { accountId } = req.body;
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const settings   = db.settings;
  const chromePath = settings.chromePath || getDefaultChromePath();
  const profileDir = acc.profileDir || 'Default';
  const platform   = os.platform();

  let cmd;
  if (platform === 'win32') {
    cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
  } else if (platform === 'darwin') {
    cmd = `open -a "Google Chrome" --args --profile-directory="${profileDir}" "https://www.facebook.com"`;
  } else {
    cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
  }

  exec(cmd, (error) => {
    if (error) {
      console.error('Lỗi mở Chrome:', error.message);
      const fallback = platform === 'win32' ? `start chrome "https://www.facebook.com"`
        : platform === 'darwin' ? `open "https://www.facebook.com"`
        : `xdg-open "https://www.facebook.com"`;
      exec(fallback);
    }
  });

  if (settings.autoStatus !== false) {
    const idx = db.accounts.findIndex(a => a.id === Number(accountId));
    db.accounts[idx].status    = 'online';
    db.accounts[idx].lastLogin = new Date().toISOString();
  }

  db.history.unshift({ accountId: acc.id, accountName: acc.name, action: 'open', color: acc.color, time: new Date().toISOString() });
  if (db.history.length > 300) db.history.splice(300);
  writeDB(db);
  res.json({ ok: true, account: acc.name, profileDir });
});

// Mở nhiều tài khoản
app.post('/api/open-many', async (req, res) => {
  const { accountIds, delay = 500 } = req.body;
  res.json({ ok: true, count: accountIds.length });

  for (let i = 0; i < accountIds.length; i++) {
    if (i > 0) await sleep(delay);
    const db  = readDB();
    const acc = db.accounts.find(a => a.id === Number(accountIds[i]));
    if (!acc) continue;

    const chromePath = db.settings.chromePath || getDefaultChromePath();
    const profileDir = acc.profileDir || 'Default';
    const platform   = os.platform();
    let cmd;
    if (platform === 'win32') {
      cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
    } else if (platform === 'darwin') {
      cmd = `open -a "Google Chrome" --args --profile-directory="${profileDir}" "https://www.facebook.com"`;
    } else {
      cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
    }
    exec(cmd, err => { if (err) console.error('Open error:', err.message); });

    if (db.settings.autoStatus !== false) {
      const idx = db.accounts.findIndex(a => a.id === Number(accountIds[i]));
      db.accounts[idx].status    = 'online';
      db.accounts[idx].lastLogin = new Date().toISOString();
    }
    db.history.unshift({ accountId: acc.id, accountName: acc.name, action: 'open', color: acc.color, time: new Date().toISOString() });
    writeDB(db);
  }
});


// ─── ROUTE: EXPORT / IMPORT JSON ──────────────────────────────
app.get('/api/export', (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', `attachment; filename="fb-accounts-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/import', (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming.accounts) return res.status(400).json({ error: 'Invalid format' });
    const db = readDB();
    let added = 0;
    incoming.accounts.forEach(a => {
      if (!db.accounts.find(x => x.email === a.email)) {
        db.accounts.push({ ...a, id: nextId(db.accounts) });
        added++;
      }
    });
    writeDB(db);
    res.json({ ok: true, added });
  } catch {
    res.status(400).json({ error: 'Import failed' });
  }
});

// ─── ROUTE: CLEAR ALL ─────────────────────────────────────────
app.delete('/api/clear-all', (req, res) => {
  writeDB(getDefaultDB());
  res.json({ ok: true });
});


// ─── ROUTE: QUÉT CHROME PROFILES ──────────────────────────────
app.get('/api/chrome-profiles', (req, res) => {
  const userDataDir = getChromeUserDataDir();
  try {
    if (!fs.existsSync(userDataDir)) {
      return res.status(404).json({ error: 'Không tìm thấy Chrome User Data' });
    }
    const entries  = fs.readdirSync(userDataDir);
    const profiles = [];
    for (const entry of entries) {
      if (entry !== 'Default' && !/^Profile \d+$/.test(entry)) continue;
      const prefPath = path.join(userDataDir, entry, 'Preferences');
      if (!fs.existsSync(prefPath)) continue;
      try {
        const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
        const name  = prefs?.profile?.name || entry;
        const email = prefs?.account_info?.[0]?.email || '';
        profiles.push({ dir: entry, name, email });
      } catch {
        profiles.push({ dir: entry, name: entry, email: '' });
      }
    }
    profiles.sort((a, b) => {
      if (a.dir === 'Default') return -1;
      if (b.dir === 'Default') return 1;
      return (parseInt(a.dir.replace('Profile ', '')) || 0) - (parseInt(b.dir.replace('Profile ', '')) || 0);
    });
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── ROUTE: AUTO LOGIN ─────────────────────────────────────────
app.post('/api/autologin', async (req, res) => {
  const { accountId } = req.body;
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  try {
    const result = await autoLogin(acc, db.settings);
    if (result.ok) {
      const idx = db.accounts.findIndex(a => a.id === Number(accountId));
      db.accounts[idx].status    = 'online';
      db.accounts[idx].lastLogin = new Date().toISOString();
    }
    db.history.unshift({
      accountId  : acc.id,
      accountName: acc.name,
      action     : result.ok ? 'autologin' : 'autologin_fail',
      color      : acc.color,
      time       : new Date().toISOString(),
    });
    if (db.history.length > 300) db.history.splice(300);
    writeDB(db);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});


// ─── ROUTE: SCHEDULER ─────────────────────────────────────────
app.get('/api/scheduler/:id', (req, res) => {
  res.json(scheduler.getStatus(Number(req.params.id)));
});

app.get('/api/scheduler', (req, res) => {
  res.json(scheduler.getAllStatus());
});

app.post('/api/scheduler/:id', (req, res) => {
  const accountId = Number(req.params.id);
  const config    = req.body;
  if (typeof config.enabled === 'undefined') {
    return res.status(400).json({ error: 'Thiếu trường enabled' });
  }
  scheduler.setSchedule(accountId, config);
  const db  = readDB();
  const idx = db.accounts.findIndex(a => a.id === accountId);
  if (idx !== -1) {
    db.accounts[idx].schedulerConfig = config;
    writeDB(db);
  }
  res.json({ ok: true, message: config.enabled ? 'Đã bật lịch tự động' : 'Đã tắt lịch' });
});

app.delete('/api/scheduler/:id', (req, res) => {
  scheduler.removeSchedule(Number(req.params.id));
  res.json({ ok: true });
});


// ─── ROUTE: SESSIONS ──────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  const active = getActiveSessions();
  res.json({ activeSessions: active });
});


// ─── SCHEDULER CALLBACK ───────────────────────────────────────
// Gán callback TRƯỚC khi restore
scheduler.onTick = async (accountId, config) => {
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return;

  const result = await autoLogin(acc, db.settings);

  db.history.unshift({
    accountId  : acc.id,
    accountName: acc.name,
    action     : 'scheduler_open',
    color      : acc.color,
    time       : new Date().toISOString(),
  });
  if (db.history.length > 300) db.history.splice(300);

  if (result.ok) {
    const idx = db.accounts.findIndex(a => a.id === Number(accountId));
    db.accounts[idx].status    = 'online';
    db.accounts[idx].lastLogin = new Date().toISOString();
  }
  writeDB(db);
};

// Restore scheduler SAU khi gán callback
(function restoreSchedulers() {
  try {
    const db = readDB();
    db.accounts.forEach(acc => {
      if (acc.schedulerConfig?.enabled) {
        scheduler.setSchedule(acc.id, acc.schedulerConfig);
        console.log(`  ♻️  Restored scheduler: ${acc.name}`);
      }
    });
  } catch {}
})();


// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ FB Account Manager đang chạy!`);
  console.log(`   Mở trình duyệt: http://localhost:${PORT}`);
  console.log(`   Dữ liệu lưu tại: ${DB_PATH}\n`);
});