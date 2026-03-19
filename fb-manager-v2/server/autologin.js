// server/autologin.js — Tự động đăng nhập Facebook bằng Puppeteer

const puppeteer = require('puppeteer-core');
const path      = require('path');
const os        = require('os');

function getChromeUserDataDir() {
  const home     = os.homedir();
  const platform = os.platform();
  if (platform === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function getDefaultChromePath() {
  const platform = os.platform();
  if (platform === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

// Lưu browser sessions đang mở (tránh mở trùng)
const activeSessions = new Map();

/**
 * Tự động đăng nhập Facebook cho 1 tài khoản
 */
async function autoLogin(account, settings) {
  const { id, email, password, profileDir, name } = account;

  // Nếu đang có session → focus lại
  if (activeSessions.has(id)) {
    try {
      const existing = activeSessions.get(id);
      const pages = await existing.pages();
      if (pages.length > 0) {
        await pages[0].bringToFront();
        return { ok: true, status: 'focused', message: `Đã focus cửa sổ: ${name}` };
      }
    } catch {
      activeSessions.delete(id);
    }
  }

  const chromePath  = settings.chromePath  || getDefaultChromePath();
  const userDataDir = getChromeUserDataDir();

  const browser = await puppeteer.launch({
    executablePath   : chromePath,
    userDataDir      : userDataDir,
    args: [
      `--profile-directory=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
    ],
    ignoreDefaultArgs : ['--enable-automation'],
    headless          : false,       // Hiện Chrome thật
    defaultViewport   : null,
  });

  activeSessions.set(id, browser);
  browser.on('disconnected', () => activeSessions.delete(id));

  const page = (await browser.pages())[0] || await browser.newPage();

  // Ẩn dấu hiệu tự động hóa
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // Mở Facebook
  await page.goto('https://www.facebook.com/', {
    waitUntil : 'domcontentloaded',
    timeout   : 30000,
  });

  // ── Kiểm tra đã đăng nhập chưa ──
  const alreadyIn = await page.evaluate(() => {
    const hasEmailField = !!document.querySelector('#email, input[name="email"]');
    return !hasEmailField;
  });

  if (alreadyIn) {
    return { ok: true, status: 'already_logged_in', message: `${name}: session còn, đã đăng nhập sẵn` };
  }

  // ── Điền email ──
  const emailSel = '#email, input[name="email"]';
  await page.waitForSelector(emailSel, { timeout: 10000 });
  await page.click(emailSel, { clickCount: 3 });
  await page.type(emailSel, email, { delay: randomDelay(80, 150) });

  // ── Điền mật khẩu ──
  const passSel = '#pass, input[name="pass"], input[type="password"]';
  await page.waitForSelector(passSel, { timeout: 5000 });
  await page.click(passSel);
  await page.type(passSel, password, { delay: randomDelay(80, 150) });

  // Dừng chút như người thật
  await sleep(randomDelay(400, 800));

  // ── Bấm đăng nhập ──
  const loginSel = 'button[name="login"], [data-testid="royal_login_button"], button[type="submit"]';
  await page.waitForSelector(loginSel, { timeout: 5000 });
  await page.click(loginSel);

  // ── Chờ kết quả ──
  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch {
    // Timeout không sao, FB đôi khi không navigate
  }

  // Kiểm tra đăng nhập thành công
  const currentUrl = page.url();

  // Kiểm tra có cần xác nhận 2FA không
  if (currentUrl.includes('checkpoint') || currentUrl.includes('two_step')) {
    return {
      ok     : false,
      status : '2fa_required',
      message: `${name}: Cần xác nhận 2FA — vui lòng hoàn thành thủ công trên cửa sổ Chrome vừa mở`,
    };
  }

  // Kiểm tra sai mật khẩu
  const loginError = await page.evaluate(() => {
    const err = document.querySelector('[data-testid="royal_login_error"], ._9ay7, #error_box');
    return err ? err.innerText : null;
  });

  if (loginError) {
    await browser.close();
    activeSessions.delete(id);
    return { ok: false, status: 'wrong_password', message: `${name}: Sai email/mật khẩu` };
  }

  // Thành công nếu không còn form login
  const success = await page.evaluate(() => !document.querySelector('#email, input[name="email"]'));
  if (success) {
    return { ok: true, status: 'logged_in', message: `${name}: Đăng nhập thành công!` };
  }

  return { ok: true, status: 'opened', message: `${name}: Đã mở Facebook, vui lòng kiểm tra` };
}

/**
 * Mở nhiều tài khoản tuần tự với delay
 */
async function autoLoginMany(accounts, settings, delay = 2000, onProgress) {
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const result = await autoLogin(acc, settings);
      results.push({ id: acc.id, name: acc.name, ...result });
      if (onProgress) onProgress({ index: i + 1, total: accounts.length, ...result });
    } catch (err) {
      const r = { id: acc.id, name: acc.name, ok: false, status: 'error', message: err.message };
      results.push(r);
      if (onProgress) onProgress({ index: i + 1, total: accounts.length, ...r });
    }
    if (i < accounts.length - 1) await sleep(delay);
  }
  return results;
}

/**
 * Đóng session của 1 tài khoản
 */
async function closeSession(accountId) {
  if (activeSessions.has(accountId)) {
    try { await activeSessions.get(accountId).close(); } catch {}
    activeSessions.delete(accountId);
    return true;
  }
  return false;
}

function getActiveSessions() {
  return [...activeSessions.keys()];
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { autoLogin, autoLoginMany, closeSession, getActiveSessions };
