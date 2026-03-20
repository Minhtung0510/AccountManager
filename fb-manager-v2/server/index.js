// server/index.js — Express backend

const { autoLogin, autoLoginMany, closeSession, getActiveSessions } = require('./autologin');
const scheduler = require('./scheduler');
const behavior  = require('./behavior');

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const { exec } = require('child_process');
const os       = require('os');

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
  } catch { return getDefaultDB(); }
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
      try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8'); }
      catch (e) { console.error('writeDB retry failed:', e.message); }
    }, 100);
  }
}

function getDefaultDB() {
  return {
    accounts: [
      { id:1, name:'Nguyễn Văn A', email:'nguyenvana@gmail.com', password:'Pass@1234', phone:'0901234567', tag:'Page', groupId:1, status:'offline', browser:'Chrome', profileDir:'Profile 1', lastLogin:null, notes:'Trang chủ thẩm mỹ', color:'#1877F2' },
      { id:2, name:'Trần Thị B',   email:'tranthib@gmail.com',   password:'Pass@5678', phone:'0912345678', tag:'Affiliate', groupId:1, status:'offline', browser:'Chrome', profileDir:'Profile 2', lastLogin:null, notes:'Affiliate skincare', color:'#22c55e' },
    ],
    groups: [
      { id:1, name:'Thẩm mỹ viện A', icon:'💆', color:'#1877F2' },
    ],
    history : [],
    settings: {
      theme: 'light', openDelay: 500, defaultBrowser: 'Chrome',
      autoStatus: true, chromePath: getDefaultChromePath(),
    }
  };
}

function getDefaultChromePath() {
  const p = os.platform();
  if (p === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (p === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

function getChromeUserDataDir() {
  const p    = os.platform();
  const home = os.homedir();
  if (p === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (p === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function nextId(list) {
  return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


// ─── ROUTES: ACCOUNTS ─────────────────────────────────────────
app.get('/api/accounts', (req, res) => res.json(readDB().accounts));

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
  const db = readDB();
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


// ─── ROUTE: MỞ CHROME ─────────────────────────────────────────
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

  exec(cmd, err => { if (err) console.error('Lỗi mở Chrome:', err.message); });

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
    if (platform === 'win32') cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
    else if (platform === 'darwin') cmd = `open -a "Google Chrome" --args --profile-directory="${profileDir}" "https://www.facebook.com"`;
    else cmd = `"${chromePath}" --profile-directory="${profileDir}" "https://www.facebook.com"`;
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


// ─── ROUTE: EXPORT / IMPORT ───────────────────────────────────
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
  } catch { res.status(400).json({ error: 'Import failed' }); }
});

app.delete('/api/clear-all', (req, res) => {
  writeDB(getDefaultDB());
  res.json({ ok: true });
});


// ─── ROUTE: CHROME PROFILES ───────────────────────────────────
app.get('/api/chrome-profiles', (req, res) => {
  const userDataDir = getChromeUserDataDir();
  try {
    if (!fs.existsSync(userDataDir)) return res.status(404).json({ error: 'Không tìm thấy Chrome User Data' });
    const entries  = fs.readdirSync(userDataDir);
    const profiles = [];
    for (const entry of entries) {
      if (entry !== 'Default' && !/^Profile \d+$/.test(entry)) continue;
      const prefPath = path.join(userDataDir, entry, 'Preferences');
      if (!fs.existsSync(prefPath)) continue;
      try {
        const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
        profiles.push({ dir: entry, name: prefs?.profile?.name || entry, email: prefs?.account_info?.[0]?.email || '' });
      } catch { profiles.push({ dir: entry, name: entry, email: '' }); }
    }
    profiles.sort((a, b) => {
      if (a.dir === 'Default') return -1;
      if (b.dir === 'Default') return 1;
      return (parseInt(a.dir.replace('Profile ', '')) || 0) - (parseInt(b.dir.replace('Profile ', '')) || 0);
    });
    res.json(profiles);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── ROUTE: AUTO LOGIN ────────────────────────────────────────
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
  } catch (err) { res.status(500).json({ ok: false, message: err.message }); }
});


// ─── ROUTE: SCHEDULER ─────────────────────────────────────────
app.get('/api/scheduler/:id', (req, res) => res.json(scheduler.getStatus(Number(req.params.id))));
app.get('/api/scheduler',     (req, res) => res.json(scheduler.getAllStatus()));

app.post('/api/scheduler/:id', (req, res) => {
  const accountId = Number(req.params.id);
  const config    = req.body;
  if (typeof config.enabled === 'undefined') return res.status(400).json({ error: 'Thiếu trường enabled' });
  scheduler.setSchedule(accountId, config);
  const db  = readDB();
  const idx = db.accounts.findIndex(a => a.id === accountId);
  if (idx !== -1) { db.accounts[idx].schedulerConfig = config; writeDB(db); }
  res.json({ ok: true, message: config.enabled ? 'Đã bật lịch tự động' : 'Đã tắt lịch' });
});

app.delete('/api/scheduler/:id', (req, res) => {
  scheduler.removeSchedule(Number(req.params.id));
  res.json({ ok: true });
});


// ─── ROUTE: SESSIONS ──────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  res.json({ activeSessions: getActiveSessions() });
});


// ─── ROUTE: BEHAVIOR ──────────────────────────────────────────

// Bắt đầu giả lập — Puppeteer tự mở Chrome
app.post('/api/behavior/start', async (req, res) => {
  const { accountId, config } = req.body;
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return res.status(404).json({ error: 'Account not found' });
 
  // Nếu đang chạy rồi
  const status = behavior.getBehaviorStatus(Number(accountId));
  if (status.running) {
    return res.json({ ok: false, message: `${acc.name}: Đang chạy rồi! Dừng trước rồi thử lại.` });
  }
 
  const behaviorConfig = {
    durationMinutes: config?.durationMinutes || 10,
    reactionRate   : config?.reactionRate    || 40,
    readTimeMin    : config?.readTimeMin     || 3000,
    readTimeMax    : config?.readTimeMax     || 10000,
    hotReadTimeMin : 15000,
    hotReadTimeMax : 40000,
    pauseMin       : 2000,
    pauseMax       : 6000,
    scrollMin      : 400,
    scrollMax      : 800,
  };
 
  // Trả response trước
  res.json({ ok: true, message: `🤖 Đang mở Chrome và bắt đầu giả lập: ${acc.name}...` });
 
  // Chạy nền
  behavior.startBehavior(acc, db.settings, behaviorConfig, (progress) => {
    const icons = { start:'▶', reading:'👁', reading_hot:'🔥', reacted:'❤️', done:'✅' };
    console.log(
      `[Behavior] ${icons[progress.event] || '•'} ${progress.name}: ${progress.event}`,
      progress.emotion ? `→ ${progress.emotion}` : '',
      progress.stats   ? `| 👁${progress.stats.postsViewed} ❤️${progress.stats.postsReacted}` : ''
    );
 
    // Ghi lịch sử khi thả cảm xúc
    if (progress.event === 'reacted') {
      try {
        const fresh = readDB();
        const idx   = fresh.accounts.findIndex(a => a.id === Number(accountId));
        if (idx !== -1) {
          fresh.accounts[idx].status    = 'online';
          fresh.accounts[idx].lastLogin = new Date().toISOString();
          fresh.history.unshift({
            accountId  : acc.id,
            accountName: acc.name,
            action     : `behavior_${progress.emotion}`,
            color      : acc.color,
            time       : new Date().toISOString(),
          });
          if (fresh.history.length > 300) fresh.history.splice(300);
          writeDB(fresh);
        }
      } catch (e) {
        console.error('[Behavior] writeDB error:', e.message);
      }
    }
 
    // Cập nhật trạng thái khi xong
    if (progress.event === 'done') {
      try {
        const fresh = readDB();
        const idx   = fresh.accounts.findIndex(a => a.id === Number(accountId));
        if (idx !== -1) {
          fresh.accounts[idx].status = 'offline';
          writeDB(fresh);
        }
      } catch {}
    }
  }).catch(err => {
    console.error('[Behavior] Fatal error:', err.message);
  });
});
 
// Dừng giả lập
app.post('/api/behavior/stop', (req, res) => {
  const { accountId } = req.body;
  const stopped = behavior.stopBehavior(Number(accountId));
  if (stopped) {
    // Cập nhật status offline
    const db  = readDB();
    const idx = db.accounts.findIndex(a => a.id === Number(accountId));
    if (idx !== -1) {
      db.accounts[idx].status = 'offline';
      writeDB(db);
    }
  }
  res.json({ ok: true, stopped });
});
 
// Trạng thái 1 tài khoản
app.get('/api/behavior/status/:id', (req, res) => {
  res.json(behavior.getBehaviorStatus(Number(req.params.id)));
});
 
// Trạng thái tất cả
app.get('/api/behavior/status', (req, res) => {
  res.json(behavior.getAllBehaviorStatus());
});

// ─── SCHEDULER CALLBACK ───────────────────────────────────────
// Gán callback TRƯỚC khi restore
scheduler.onTick = async (accountId, config) => {
  const db  = readDB();
  const acc = db.accounts.find(a => a.id === Number(accountId));
  if (!acc) return;
 
  console.log(`[Scheduler] ⏰ Tick: ${acc.name}`);
 
  // Nếu account có behaviorConfig → chạy behavior
  // Nếu không → chỉ mở Chrome như cũ
  if (config.behaviorEnabled && config.behaviorConfig) {
    console.log(`[Scheduler] 🤖 Chạy behavior: ${acc.name}`);
 
    // Không chạy nếu đang behavior rồi
    const status = behavior.getBehaviorStatus(Number(accountId));
    if (status.running) {
      console.log(`[Scheduler] ⚠️ ${acc.name} đang chạy behavior rồi, bỏ qua`);
      return;
    }
 
    behavior.scheduledBehavior(acc, db.settings, config.behaviorConfig)
      .then(result => {
        const fresh = readDB();
        const idx   = fresh.accounts.findIndex(a => a.id === Number(accountId));
        if (idx !== -1) {
          fresh.accounts[idx].status    = result.ok ? 'online' : 'offline';
          fresh.accounts[idx].lastLogin = new Date().toISOString();
        }
        fresh.history.unshift({
          accountId  : acc.id,
          accountName: acc.name,
          action     : result.ok ? 'scheduler_behavior' : 'scheduler_behavior_fail',
          color      : acc.color,
          time       : new Date().toISOString(),
        });
        if (fresh.history.length > 300) fresh.history.splice(300);
        writeDB(fresh);
      })
      .catch(err => console.error(`[Scheduler] Behavior error: ${err.message}`));
 
  } else {
    // Chỉ mở Chrome (hành vi cũ)
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
  }
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