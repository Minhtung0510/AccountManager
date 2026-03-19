// server/Autologin.js — Mở Chrome Profile thật (giống GemLogin/GoLogin)
// Không dùng Puppeteer → không bị detect bot, không CAPTCHA

const { spawn } = require('child_process');
const path      = require('path');
const os        = require('os');

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

// ─── SESSION MANAGER ──────────────────────────────────────────
// Lưu process đang chạy để tránh mở trùng
const activeSessions = new Map();

// ─── MAIN FUNCTION ────────────────────────────────────────────

/**
 * Mở Chrome Profile thật cho 1 tài khoản.
 * - Dùng đúng Chrome User Data thật → fingerprint thật, cookies thật
 * - Mỗi profile là 1 process Chrome riêng biệt → mở nhiều cùng lúc không conflict
 * - Lần đầu: user đăng nhập thủ công → cookies lưu lại
 * - Lần sau: bấm là vào thẳng Facebook, không cần làm gì
 */
async function autoLogin(account, settings) {
  const { id, profileDir, name } = account;

  // ── Nếu process đang chạy → không mở trùng ──
  if (activeSessions.has(id)) {
    const existing = activeSessions.get(id);
    if (!existing.killed) {
      return {
        ok      : true,
        status  : 'focused',
        message : `${name}: Cửa sổ đã đang mở`,
      };
    }
    activeSessions.delete(id);
  }

  const chromePath  = settings.chromePath || getDefaultChromePath();
  const userDataDir = getChromeUserDataDir();

  // ── Spawn Chrome process riêng với profile thật ──
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
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
    return {
      ok      : false,
      status  : 'launch_error',
      message : `${name}: Không thể mở Chrome — ${err.message}`,
    };
  }

  activeSessions.set(id, chromeProcess);
  chromeProcess.on('close', () => activeSessions.delete(id));
  chromeProcess.on('error', () => activeSessions.delete(id));

  return {
    ok      : true,
    status  : 'opened',
    message : `${name}: Đã mở Facebook ✅`,
  };
}

// ─── NHIỀU TÀI KHOẢN ──────────────────────────────────────────

/**
 * Mở nhiều tài khoản tuần tự với delay
 */
async function autoLoginMany(accounts, settings, delay = 1500, onProgress) {
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const result = await autoLogin(acc, settings);
      results.push({ id: acc.id, name: acc.name, ...result });
      if (onProgress) onProgress({
        index : i + 1,
        total : accounts.length,
        id    : acc.id,
        name  : acc.name,
        ...result,
      });
    } catch (err) {
      const r = {
        id      : acc.id,
        name    : acc.name,
        ok      : false,
        status  : 'error',
        message : err.message,
      };
      results.push(r);
      if (onProgress) onProgress({ index: i + 1, total: accounts.length, ...r });
    }
    if (i < accounts.length - 1) await sleep(delay);
  }
  return results;
}

// ─── SESSION CONTROLS ─────────────────────────────────────────

/**
 * Đóng Chrome process của 1 tài khoản
 */
async function closeSession(accountId) {
  if (activeSessions.has(accountId)) {
    try { activeSessions.get(accountId).kill(); } catch {}
    activeSessions.delete(accountId);
    return true;
  }
  return false;
}

function getActiveSessions() {
  return [...activeSessions.keys()];
}

module.exports = { autoLogin, autoLoginMany, closeSession, getActiveSessions };