// server/Autologin.js — Phase 1: Puppeteer Stealth + Remote Debugging
// Mở Chrome Profile thật → kết nối Puppeteer qua CDP (không bị detect)

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

// Port bắt đầu cho remote debugging — mỗi profile dùng 1 port riêng
const BASE_PORT = 9222;

// Lấy port theo profileDir (VD: "Profile 1" → 9222, "Profile 2" → 9223)
function getDebugPort(profileDir) {
  const num = parseInt((profileDir || '').replace(/\D/g, '')) || 0;
  return BASE_PORT + num;
}

// ─── SESSION MANAGER ──────────────────────────────────────────

const sessions = new Map();
// sessions[id] = { process, browser, port, profileDir, name }

// ─── OPEN CHROME ──────────────────────────────────────────────

/**
 * Mở Chrome Profile với remote debugging port
 * → Sau đó Puppeteer kết nối qua CDP để điều khiển
 */
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
    `--remote-debugging-port=${debugPort}`,   // ← Cho phép Puppeteer kết nối
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--start-maximized',
    'https://www.facebook.com',
  ];

  let chromeProcess;
  try {
    chromeProcess = spawn(chromePath, args, {
      detached : true,
      stdio    : 'ignore',
    });
    chromeProcess.unref();
  } catch (err) {
    return { ok: false, status: 'launch_error', message: `${name}: Không thể mở Chrome — ${err.message}` };
  }

  sessions.set(id, {
    process   : chromeProcess,
    browser   : null,           // Sẽ được gán khi connectToSession()
    port      : debugPort,
    profileDir: profileDir,
    name      : name,
  });

  chromeProcess.on('close', () => {
    const s = sessions.get(id);
    if (s) { s.process = null; s.browser = null; }
    sessions.delete(id);
  });
  chromeProcess.on('error', () => sessions.delete(id));

  return { ok: true, status: 'opened', message: `${name}: Đã mở Facebook ✅` };
}

// ─── KẾT NỐI PUPPETEER ────────────────────────────────────────

/**
 * Kết nối Puppeteer vào Chrome đang chạy qua CDP
 * Dùng cho Phase 2+ (điều khiển hành vi)
 */
async function connectToSession(accountId) {
  const s = sessions.get(accountId);
  if (!s) throw new Error('Tài khoản chưa được mở. Hãy mở trước!');

  // Nếu đã có browser instance → dùng lại
  if (s.browser) {
    try {
      const pages = await s.browser.pages();
      if (pages.length > 0) return { browser: s.browser, page: pages[0] };
    } catch {
      s.browser = null;
    }
  }

  // Chờ Chrome khởi động xong
  await sleep(2000);

  // Kết nối vào Chrome đang chạy qua CDP
  const browser = await puppeteer.connect({
    browserURL        : `http://localhost:${s.port}`,
    defaultViewport   : null,
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

// ─── SESSION CONTROLS ─────────────────────────────────────────

async function closeSession(accountId) {
  if (sessions.has(accountId)) {
    const s = sessions.get(accountId);
    try { if (s.browser) await s.browser.disconnect(); } catch {}
    try { if (s.process) s.process.kill(); } catch {}
    sessions.delete(accountId);
    return true;
  }
  return false;
}

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
    connected : !!s.browser,
    running   : s.process && !s.process.killed,
  };
}

module.exports = {
  autoLogin,
  autoLoginMany,
  connectToSession,
  closeSession,
  getActiveSessions,
  getSessionInfo,
};