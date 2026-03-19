// server/index.js — Express backend, lưu dữ liệu vào data/db.json
const { autoLogin, autoLoginMany, closeSession, getActiveSessions } = require('./Autologin');
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');
const os      = require('os');

const app  = express();
const PORT = 3000;
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
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
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
      theme: 'light',
      openDelay: 500,
      defaultBrowser: 'Chrome',
      autoStatus: true,
      chromePath: getDefaultChromePath(),
    }
  };
}

function getDefaultChromePath() {
  const platform = os.platform();
  if (platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

function nextId(list) {
  return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}


// ─── ROUTES: ACCOUNTS ─────────────────────────────────────────
app.get('/api/accounts', (req, res) => {
  res.json(readDB().accounts);
});

app.post('/api/accounts', (req, res) => {
  const db = readDB();
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
  const db = readDB();
  const entry = { ...req.body, time: new Date().toISOString() };
  db.history.unshift(entry);
  if (db.history.length > 300) db.history.splice(300);
  writeDB(db);
  res.json(entry);
});

app.delete('/api/history', (req, res) => {
  const db = readDB();
  db.history = [];
  writeDB(db);
  res.json({ ok: true });
});


// ─── ROUTES: SETTINGS ─────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json(readDB().settings));

app.put('/api/settings', (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  writeDB(db);
  res.json(db.settings);
});


// ─── ROUTE: MỞ CHROME PROFILE ────────────────────────────────
// Mở đúng profile Chrome riêng cho từng tài khoản
app.post('/api/open', (req, res) => {
  const { accountId } = req.body;
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const settings    = db.settings;
  const chromePath  = settings.chromePath || getDefaultChromePath();
  const profileDir  = acc.profileDir || 'Default';
  const userDataDir = getChromeUserDataDir();
  const platform    = os.platform();

  // Lệnh mở Chrome với --profile-directory riêng
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
      // Fallback: mở Chrome không có profile cụ thể
      const fallback = platform === 'win32'
        ? `start chrome "https://www.facebook.com"`
        : platform === 'darwin'
        ? `open "https://www.facebook.com"`
        : `xdg-open "https://www.facebook.com"`;
      exec(fallback);
    }
  });

  // Cập nhật trạng thái nếu autoStatus bật
  if (settings.autoStatus !== false) {
    const idx = db.accounts.findIndex(a => a.id === Number(accountId));
    db.accounts[idx].status    = 'online';
    db.accounts[idx].lastLogin = new Date().toISOString();
  }

  // Ghi lịch sử
  db.history.unshift({ accountId: acc.id, accountName: acc.name, action: 'open', color: acc.color, time: new Date().toISOString() });
  if (db.history.length > 300) db.history.splice(300);

  writeDB(db);
  res.json({ ok: true, account: acc.name, profileDir });
});

// Mở nhiều tài khoản cùng lúc
app.post('/api/open-many', async (req, res) => {
  const { accountIds, delay = 500 } = req.body;
  res.json({ ok: true, count: accountIds.length });

  // Mở tuần tự với delay (không block response)
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

function getChromeUserDataDir() {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


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


// ─── START ────────────────────────────────────────────────────
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
    db.history.unshift({ accountId: acc.id, accountName: acc.name, action: result.ok ? 'autologin' : 'autologin_fail', color: acc.color, time: new Date().toISOString() });
    if (db.history.length > 300) db.history.splice(300);
    writeDB(db);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});
// ─── ROUTE: QUÉT CHROME PROFILES ─────────────────────────────  
app.get('/api/chrome-profiles', (req, res) => {
  const userDataDir = getChromeUserDataDir();
 
  try {
    if (!fs.existsSync(userDataDir)) {
      return res.status(404).json({ error: 'Không tìm thấy thư mục Chrome User Data' });
    }
 
    const entries = fs.readdirSync(userDataDir);
    const profiles = [];
 
    for (const entry of entries) {
      // Chỉ lấy "Default" và "Profile X"
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
 
    // Sắp xếp: Default trước, rồi Profile 1, 2, 3...
    profiles.sort((a, b) => {
      if (a.dir === 'Default') return -1;
      if (b.dir === 'Default') return 1;
      const numA = parseInt(a.dir.replace('Profile ', '')) || 0;
      const numB = parseInt(b.dir.replace('Profile ', '')) || 0;
      return numA - numB;
    });
 
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Các route khác như /api/open, /api/open-many vẫn giữ nguyên để mở Chrome bình thường mà không auto-login
app.listen(PORT, () => {
  console.log(`\n✅ FB Account Manager đang chạy!`);
  console.log(`   Mở trình duyệt: http://localhost:${PORT}`);
  console.log(`   Dữ liệu lưu tại: ${DB_PATH}\n`);
});
