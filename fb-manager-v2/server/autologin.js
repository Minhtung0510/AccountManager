// server/autologin.js — Phase 1: Mở Chrome Profile thật
// Update: Lưu process handle để có thể đóng Chrome từ scheduler

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { spawn }     = require('child_process');
const path          = require('path');
const os            = require('os');

puppeteer.use(StealthPlugin());

// ─── HELPERS ──────────────────────────────────────────────────

function getDefaultChromePath() {
  const platform = os.platform();
  if (platform === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

function getChromeUserDataDir() {
  const home     = os.homedir();
  const platform = os.platform();
  if (platform === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const BASE_PORT = 9222;
function getDebugPort(profileDir) {
  const num = parseInt((profileDir || '').replace(/\D/g, '')) || 0;
  return BASE_PORT + num;
}

// ─── SESSION MANAGER ──────────────────────────────────────────
// sessions[id] = { process, browser, port, profileDir, name, pid }

const sessions = new Map();

// ─── OPEN CHROME ──────────────────────────────────────────────

async function autoLogin(account, settings) {
  const { id, profileDir, name } = account;

  // Nếu session đang mở → không mở trùng
  if (sessions.has(id)) {
    const s = sessions.get(id);
    if (s.process && !s.process.killed) {
      return { ok: true, status: 'focused', message: `${name}: Cửa sổ đã đang mở` };
    }
    sessions.delete(id);
  }

  const chromePath  = settings.chromePath || getDefaultChromePath();
  const userDataDir = getChromeUserDataDir();
  const debugPort   = getDebugPort(profileDir);

  const args = [
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--start-maximized',
    'https://www.facebook.com',
  ];

  let chromeProcess;
  try {
    chromeProcess = spawn(chromePath, args, {
      detached : false,   // ← Đổi thành false để giữ tham chiếu process
      stdio    : 'ignore',
    });
    // KHÔNG gọi unref() nữa → giữ process handle để có thể kill sau
  } catch (err) {
    return { ok: false, status: 'launch_error', message: `${name}: Không thể mở Chrome — ${err.message}` };
  }

  sessions.set(id, {
    process   : chromeProcess,
    pid       : chromeProcess.pid,
    browser   : null,
    port      : debugPort,
    profileDir: profileDir,
    name      : name,
  });

  chromeProcess.on('close', () => {
    const s = sessions.get(id);
    if (s) { s.process = null; s.browser = null; s.pid = null; }
    sessions.delete(id);
    console.log(`[AutoLogin] 🔴 Chrome đóng: ${name}`);
  });

  chromeProcess.on('error', (err) => {
    console.error(`[AutoLogin] Chrome error: ${name}:`, err.message);
    sessions.delete(id);
  });

  console.log(`[AutoLogin] ✅ Mở Chrome: ${name} | ${profileDir} | PID:${chromeProcess.pid}`);
  return { ok: true, status: 'opened', message: `${name}: Đã mở Facebook ✅` };
}

// ─── ĐÓNG CHROME ──────────────────────────────────────────────

async function closeChrome(accountId) {
  const s = sessions.get(accountId);
  if (!s) return { ok: false, message: 'Không tìm thấy session' };

  const name = s.name;

  // Ngắt Puppeteer browser nếu đang kết nối
  if (s.browser) {
    try { await s.browser.disconnect(); } catch {}
    s.browser = null;
  }

  // Kill process Chrome
  if (s.process && !s.process.killed) {
    try {
      if (os.platform() === 'win32' && s.pid) {
        // Windows: dùng taskkill để đóng sạch cả process tree
        const { exec } = require('child_process');
        exec(`taskkill /PID ${s.pid} /T /F`, (err) => {
          if (err) console.log(`[AutoLogin] taskkill error: ${err.message}`);
        });
      } else {
        s.process.kill('SIGTERM');
        await sleep(1000);
        if (!s.process.killed) s.process.kill('SIGKILL');
      }
      console.log(`[AutoLogin] 🔴 Đã đóng Chrome: ${name} (PID:${s.pid})`);
    } catch (err) {
      console.error(`[AutoLogin] Lỗi đóng Chrome ${name}:`, err.message);
    }
  }

  sessions.delete(accountId);
  return { ok: true, message: `Đã đóng Chrome: ${name}` };
}

// Đóng nhiều tài khoản
async function closeManyChrome(accountIds) {
  const results = [];
  for (const id of accountIds) {
    const result = await closeChrome(id);
    results.push({ id, ...result });
  }
  return results;
}

// Đóng tất cả Chrome đang mở
async function closeAllChrome() {
  const ids = [...sessions.keys()];
  return closeManyChrome(ids);
}

// ─── KẾT NỐI PUPPETEER ────────────────────────────────────────

async function connectToSession(accountId) {
  const s = sessions.get(accountId);
  if (!s) throw new Error('Tài khoản chưa được mở. Hãy mở trước!');

  if (s.browser) {
    try {
      const pages = await s.browser.pages();
      if (pages.length > 0) return { browser: s.browser, page: pages[0] };
    } catch {
      s.browser = null;
    }
  }

  await sleep(2000);

  const browser = await puppeteer.connect({
    browserURL     : `http://localhost:${s.port}`,
    defaultViewport: null,
  });

  s.browser = browser;
  sessions.set(accountId, s);

  browser.on('disconnected', () => {
    const current = sessions.get(accountId);
    if (current) current.browser = null;
  });

  const pages = await browser.pages();
  const page  = pages.find(p => p.url().includes('facebook')) || pages[0] || await browser.newPage();

  return { browser, page };
}

// ─── NHIỀU TÀI KHOẢN ──────────────────────────────────────────

async function autoLoginMany(accounts, settings, delay = 1500, onProgress) {
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const result = await autoLogin(acc, settings);
      results.push({ id: acc.id, name: acc.name, ...result });
      if (onProgress) onProgress({ index: i+1, total: accounts.length, id: acc.id, name: acc.name, ...result });
    } catch (err) {
      const r = { id: acc.id, name: acc.name, ok: false, status: 'error', message: err.message };
      results.push(r);
      if (onProgress) onProgress({ index: i+1, total: accounts.length, ...r });
    }
    if (i < accounts.length - 1) await sleep(delay);
  }
  return results;
}

// ─── SESSION INFO ─────────────────────────────────────────────

function getActiveSessions() {
  return [...sessions.keys()];
}

function getSessionInfo(accountId) {
  const s = sessions.get(accountId);
  if (!s) return null;
  return {
    port      : s.port,
    profileDir: s.profileDir,
    name      : s.name,
    pid       : s.pid,
    connected : !!s.browser,
    running   : !!(s.process && !s.process.killed),
  };
}

function isSessionOpen(accountId) {
  const s = sessions.get(accountId);
  return !!(s && s.process && !s.process.killed);
}

module.exports = {
  autoLogin,
  autoLoginMany,
  connectToSession,
  closeChrome,
  closeManyChrome,
  closeAllChrome,
  getActiveSessions,
  getSessionInfo,
  isSessionOpen,
};