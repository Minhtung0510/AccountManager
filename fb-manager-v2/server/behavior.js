// server/behavior.js — Phase 2: Giả lập hành vi FB thật
// Fix: Đọc cookies từ file SQLite trực tiếp — không cần Chrome đang mở
// Flow mới: profile thật (file Cookies) → copy → decrypt → inject Puppeteer

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { execSync, spawn } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

puppeteer.use(StealthPlugin());

// ─── HELPERS ──────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getDefaultChromePath() {
  const p = os.platform();
  if (p === 'win32')  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (p === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/google-chrome';
}

function getChromeUserDataDir() {
  const home = os.homedir();
  const p    = os.platform();
  if (p === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  if (p === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

function getBehaviorDir(profileDir) {
  const home = os.homedir();
  const p    = os.platform();
  const name = 'FB-Behavior-' + profileDir.replace(/\s+/g, '-');
  if (p === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', name);
  if (p === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', name);
  return path.join(home, '.config', name);
}

function clearLocks(dir) {
  ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
    try {
      const fp = path.join(dir, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {}
  });
}

const BASE_PORT = 9222;
function getDebugPort(profileDir) {
  const num = parseInt((profileDir || '').replace(/\D/g, '')) || 0;
  return BASE_PORT + num;
}

// ─── ĐỌC COOKIES TỪ FILE SQLITE ──────────────────────────────
// Đọc trực tiếp file Cookies của Chrome profile (SQLite database)
// Trên Windows: cookies được mã hóa bằng DPAPI — cần decrypt

async function readCookiesFromFile(profileDir) {
  const userDataDir  = getChromeUserDataDir();
  const profilePath  = path.join(userDataDir, profileDir);
  const cookieFile   = path.join(profilePath, 'Cookies');
  const cookieCopy   = path.join(profilePath, 'Cookies_behavior_copy');

  if (!fs.existsSync(cookieFile)) {
    console.log(`[Behavior] ⚠️  Không tìm thấy file Cookies: ${cookieFile}`);
    return null;
  }

  // Copy file cookies để tránh lock (Chrome có thể đang dùng)
  try {
    fs.copyFileSync(cookieFile, cookieCopy);
  } catch (err) {
    console.log(`[Behavior] ⚠️  Không copy được file Cookies: ${err.message}`);
    return null;
  }

  console.log(`[Behavior] 📂 Đọc cookies từ file: ${cookieFile}`);

  // Dùng Python script để đọc SQLite và decrypt DPAPI
  const pythonScript = `
import sqlite3, json, sys, os

db_path = sys.argv[1]

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT name, value, encrypted_value, host_key, path, 
               expires_utc, is_secure, is_httponly, samesite
        FROM cookies 
        WHERE host_key LIKE '%facebook.com%'
    """)
    rows = cursor.fetchall()
    conn.close()
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)

cookies = []
for row in rows:
    name, value, encrypted_value, host_key, path_, expires_utc, is_secure, is_httponly, samesite = row
    
    # Thử decrypt nếu value rỗng
    if not value and encrypted_value:
        try:
            import sys
            if sys.platform == 'win32':
                import ctypes
                import ctypes.wintypes
                
                class DATA_BLOB(ctypes.Structure):
                    _fields_ = [('cbData', ctypes.wintypes.DWORD),
                                ('pbData', ctypes.POINTER(ctypes.c_char))]
                
                p = ctypes.create_string_buffer(encrypted_value, len(encrypted_value))
                blobin = DATA_BLOB(ctypes.sizeof(p), p)
                blobout = DATA_BLOB()
                
                # Thử v10 prefix (Chrome 80+)
                if encrypted_value[:3] == b'v10' or encrypted_value[:3] == b'v11':
                    # Cần local state key — bỏ qua, dùng CDP fallback
                    value = ''
                else:
                    retval = ctypes.windll.crypt32.CryptUnprotectData(
                        ctypes.byref(blobin), None, None, None, None, 0,
                        ctypes.byref(blobout))
                    if retval:
                        value = ctypes.string_at(blobout.pbData, blobout.cbData).decode('utf-8', errors='ignore')
                        ctypes.windll.kernel32.LocalFree(blobout.pbData)
        except:
            value = ''
    
    # Chỉ lấy cookies quan trọng của FB
    important = ['c_user', 'xs', 'datr', 'fr', 'sb', 'wd', 'presence', 
                 'usida', 'dpr', 'actppresence', 'locale', 'spin']
    if name not in important and not any(kw in name.lower() for kw in ['session', 'token', 'auth', 'user']):
        continue
    
    # Convert expires (Chrome uses microseconds since 1601-01-01)
    expires = 0
    if expires_utc > 0:
        # Chrome epoch offset: 11644473600 seconds
        expires = (expires_utc / 1000000) - 11644473600
    
    samesite_map = {-1: 'None', 0: 'None', 1: 'Lax', 2: 'Strict'}
    
    cookies.append({
        'name': name,
        'value': value,
        'domain': host_key,
        'path': path_,
        'expires': int(expires),
        'secure': bool(is_secure),
        'httpOnly': bool(is_httponly),
        'sameSite': samesite_map.get(samesite, 'None'),
    })

print(json.dumps(cookies))
`;

  try {
    // Chạy Python script
    const scriptFile = path.join(os.tmpdir(), 'read_cookies_fb.py');
    fs.writeFileSync(scriptFile, pythonScript, 'utf-8');

    let output;
    try {
      output = execSync(`python "${scriptFile}" "${cookieCopy}"`, {
        timeout: 10000,
        encoding: 'utf-8',
      });
    } catch {
      // Thử python3
      try {
        output = execSync(`python3 "${scriptFile}" "${cookieCopy}"`, {
          timeout: 10000,
          encoding: 'utf-8',
        });
      } catch (err2) {
        console.log(`[Behavior] ⚠️  Python không có: ${err2.message}`);
        return null;
      }
    }

    // Xóa file tạm
    try { fs.unlinkSync(scriptFile); } catch {}
    try { fs.unlinkSync(cookieCopy); } catch {}

    const result = JSON.parse(output.trim());
    if (result.error) {
      console.log(`[Behavior] ⚠️  Lỗi đọc SQLite: ${result.error}`);
      return null;
    }

    // Lọc cookies có value
    const validCookies = result.filter(c => c.value && c.value.length > 0);
    console.log(`[Behavior] 🍪 Đọc được ${validCookies.length}/${result.length} cookies từ file`);
    return validCookies.length > 0 ? validCookies : null;

  } catch (err) {
    console.log(`[Behavior] ⚠️  Lỗi đọc cookies từ file: ${err.message}`);
    try { fs.unlinkSync(cookieCopy); } catch {}
    return null;
  }
}

// ─── FALLBACK: LẤY COOKIES TỪ CHROME ĐANG CHẠY (CDP) ────────
// Dùng khi đọc file thất bại (v10 encryption cần key từ Local State)

async function getCookiesViaCDP(debugPort) {
  let tempBrowser = null;
  try {
    console.log(`[Behavior] 🔌 Thử lấy cookies qua CDP port ${debugPort}...`);
    tempBrowser = await puppeteer.connect({
      browserURL     : `http://localhost:${debugPort}`,
      defaultViewport: null,
    });

    const pages = await tempBrowser.pages();
    let page = pages.find(p => { try { return p.url().includes('facebook.com'); } catch { return false; } });

    let opened = false;
    if (!page) {
      page   = await tempBrowser.newPage();
      opened = true;
      await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(1500);
    }

    const cookies    = await page.cookies('https://www.facebook.com');
    const fbCookies  = cookies.filter(c => c.domain && c.domain.includes('facebook.com') && c.value);
    console.log(`[Behavior] 🍪 CDP: ${fbCookies.length} cookies`);

    if (opened) { try { await page.close(); } catch {} }
    await tempBrowser.disconnect();
    return fbCookies.length > 0 ? fbCookies : null;
  } catch (err) {
    console.log(`[Behavior] ⚠️  CDP thất bại: ${err.message}`);
    if (tempBrowser) { try { await tempBrowser.disconnect(); } catch {} }
    return null;
  }
}

// ─── LẤY COOKIES: THỬ FILE TRƯỚC, CDP SAU ────────────────────

async function getCookies(account, settings) {
  const { profileDir } = account;
  const debugPort = getDebugPort(profileDir);

  // Bước 1: Thử đọc từ file SQLite (không cần Chrome mở)
  const fileCookies = await readCookiesFromFile(profileDir);
  if (fileCookies && fileCookies.length >= 2) {
    // Kiểm tra có cookie quan trọng không (c_user = FB user ID)
    const hasCUser = fileCookies.some(c => c.name === 'c_user' && c.value);
    const hasXs    = fileCookies.some(c => c.name === 'xs'     && c.value);
    if (hasCUser || hasXs) {
      console.log(`[Behavior] ✅ Dùng cookies từ file (c_user:${hasCUser}, xs:${hasXs})`);
      return fileCookies;
    }
  }

  // Bước 2: Fallback — lấy qua CDP nếu Chrome đang chạy
  console.log(`[Behavior] 🔄 File cookies không đủ, thử CDP...`);
  const isOpen = await isPortOpen(debugPort);
  if (isOpen) {
    const cdpCookies = await getCookiesViaCDP(debugPort);
    if (cdpCookies) return cdpCookies;
  }

  // Bước 3: Nếu Chrome chưa mở → spawn Chrome để lấy cookies
  if (!isOpen) {
    console.log(`[Behavior] 🚀 Spawn Chrome tạm để lấy cookies...`);
    try {
      const chromePath  = settings.chromePath || getDefaultChromePath();
      const userDataDir = getChromeUserDataDir();

      const proc = spawn(chromePath, [
        `--user-data-dir=${userDataDir}`,
        `--profile-directory=${profileDir}`,
        `--remote-debugging-port=${debugPort}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        '--no-sandbox',
        'https://www.facebook.com',
      ], { detached: true, stdio: 'ignore' });
      proc.unref();

      // Chờ port mở
      const opened = await waitForPort(debugPort, 20000);
      if (opened) {
        await sleep(4000); // Chờ FB load
        const cdpCookies = await getCookiesViaCDP(debugPort);
        if (cdpCookies) return cdpCookies;
      }
    } catch (err) {
      console.log(`[Behavior] ⚠️  Spawn Chrome thất bại: ${err.message}`);
    }
  }

  console.log(`[Behavior] ❌ Không lấy được cookies cho ${account.name}`);
  return null;
}

// ─── CDP PORT CHECK ───────────────────────────────────────────

async function isPortOpen(port) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res   = await fetch(`http://localhost:${port}/json/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch { return false; }
}

async function waitForPort(port, timeout) {
  timeout     = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortOpen(port)) return true;
    await sleep(500);
  }
  return false;
}

// ─── GEMINI AI ────────────────────────────────────────────────

let geminiClient = null;
const emotionCache = new Map();

function initGemini(apiKey) {
  if (!apiKey) { geminiClient = null; return null; }
  try {
    geminiClient = new GoogleGenerativeAI(apiKey)
      .getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('[Behavior] ✅ Gemini sẵn sàng');
    return geminiClient;
  } catch { geminiClient = null; return null; }
}

async function analyzeEmotion(postText, isAd, config) {
  if (isAd) return 'none';
  const rate = (config && config.reactionRate) || 40;
  if (!postText || postText.trim().length < 10) return 'none';
  if (rand(1, 100) > rate) return 'none';

  if (geminiClient) {
    const cacheKey = postText.slice(0, 80);
    if (emotionCache.has(cacheKey)) return emotionCache.get(cacheKey);

    try {
      const emotion = await Promise.race([
        (async () => {
          const prompt =
            `FB VN user. 1 word: like/haha/wow/sad/angry/none\n` +
            `Post: "${postText.slice(0, 200)}"\nAnswer:`;
          const result = await geminiClient.generateContent(prompt);
          const text   = result.response.text().trim().toLowerCase().split(/[\s\n]/)[0];
          const valid  = ['like','haha','wow','sad','angry','none'];
          return valid.find(v => text.startsWith(v)) || 'like';
        })(),
        new Promise(r => setTimeout(() => r('like'), 2000)),
      ]);

      emotionCache.set(cacheKey, emotion);
      if (emotionCache.size > 500) emotionCache.delete(emotionCache.keys().next().value);
      console.log(`[Gemini] → ${emotion}: "${postText.slice(0,35)}..."`);
      return emotion;
    } catch { return 'like'; }
  }

  const r = rand(1,10);
  if (r<=6) return 'like';
  if (r<=7) return 'haha';
  if (r<=8) return 'wow';
  if (r<=9) return 'sad';
  return 'angry';
}

// ─── SESSION MANAGER ──────────────────────────────────────────

const behaviorSessions = new Map();

// ─── LAUNCH PUPPETEER + INJECT COOKIES ───────────────────────

async function launchWithCookies(account, settings, cookies) {
  const { profileDir, name } = account;
  const chromePath  = settings.chromePath || getDefaultChromePath();
  const behaviorDir = getBehaviorDir(profileDir);

  clearLocks(behaviorDir);
  clearLocks(path.join(behaviorDir, 'Default'));

  console.log(`[Behavior] 🚀 Launch Puppeteer: ${name}`);

  let browser;
  const launchOpts = {
    executablePath   : chromePath,
    userDataDir      : behaviorDir,
    args: [
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    headless         : false,
    defaultViewport  : null,
  };

  try {
    browser = await puppeteer.launch(launchOpts);
  } catch {
    clearLocks(behaviorDir);
    await sleep(1000);
    browser = await puppeteer.launch({
      ...launchOpts,
      args: ['--profile-directory=Default','--no-first-run','--start-maximized','--no-sandbox','--disable-setuid-sandbox'],
    });
  }

  const pages = await browser.pages();
  const page  = pages[0] || await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // Navigate đến FB
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1000);

  // Inject cookies nếu có
  if (cookies && cookies.length > 0) {
    console.log(`[Behavior] 💉 Inject ${cookies.length} cookies...`);
    for (const cookie of cookies) {
      try { await page.setCookie(cookie); } catch {}
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
  } else {
    await sleep(3000);
  }

  // Kiểm tra đăng nhập
  const isLoggedIn = await page.evaluate(() =>
    !document.querySelector('#email, input[name="email"], [data-testid="royal_email"]')
  );

  if (!isLoggedIn) {
    console.log(`[Behavior] ❌ Chưa đăng nhập: ${name}`);
    await browser.close();
    return { browser: null, page: null, needLogin: true };
  }

  // Về newsfeed
  const url = page.url();
  if (url.includes('/messages') || url.includes('/watch') || url.includes('/marketplace')) {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
  }

  console.log(`[Behavior] ✅ Ready: ${name} | ${page.url().slice(0,50)}`);
  return { browser, page, needLogin: false };
}

// ─── SETUP BROWSER ────────────────────────────────────────────

async function setupBrowser(account, settings) {
  const cookies = await getCookies(account, settings);
  return await launchWithCookies(account, settings, cookies);
}

// ─── LẤY BÀI VIẾT ────────────────────────────────────────────

async function getVisiblePosts(page) {
  try { await page.bringToFront(); } catch {}
  return await page.evaluate(() => {
    const results  = [];
    let   elements = [];
    for (const sel of ['[role="article"]', '[data-pagelet*="FeedUnit"]']) {
      elements = [...document.querySelectorAll(sel)];
      if (elements.length) break;
    }
    elements.slice(0, 10).forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight + 300 || rect.bottom < -300) return;
      let isAd = false;
      try {
        for (const sp of el.querySelectorAll('span')) {
          const t = (sp.textContent || '').trim();
          if (t === 'Được tài trợ' || t === 'Sponsored' || t === 'Quảng cáo') { isAd = true; break; }
        }
      } catch {}
      if (!isAd) { try { isAd = !!el.querySelector('[data-ad-comet-preview],[data-ad-preview]'); } catch {} }
      let text = '';
      el.querySelectorAll('[dir="auto"]').forEach(n => {
        const t = (n.innerText || '').trim();
        if (t && t.length > 5 && !t.includes('Được tài trợ') && !t.includes('Sponsored')) text += t + ' ';
      });
      text = text.trim().slice(0, 400);
      let reactions = 0, comments = 0;
      for (const s of ['[aria-label*="reaction"]','[aria-label*="cảm xúc"]','[aria-label*="người"]']) {
        const e = el.querySelector(s);
        if (e) { const m = (e.getAttribute('aria-label')||'').match(/[\d,.]+/); if (m) { reactions = parseInt(m[0].replace(/[,.]/g,'')); break; } }
      }
      for (const s of ['[aria-label*="comment"]','[aria-label*="bình luận"]']) {
        const e = el.querySelector(s);
        if (e) { const m = (e.getAttribute('aria-label')||'').match(/[\d,.]+/); if (m) { comments = parseInt(m[0].replace(/[,.]/g,'')); break; } }
      }
      results.push({ idx, text, reactions, comments, isAd,
        isHot : !isAd && (reactions > 50 || comments > 15),
        inView: rect.top >= -50 && rect.top < window.innerHeight + 50,
      });
    });
    return results;
  });
}

// ─── SCROLL ───────────────────────────────────────────────────

async function scrollNaturally(page) {
  try { await page.bringToFront(); } catch {}
  const dist  = rand(500, 1000);
  const steps = rand(4, 7);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(a => window.scrollBy({ top: a, behavior: 'smooth' }), Math.floor(dist/steps) + rand(-30,30));
    await sleep(rand(80, 200));
  }
  await sleep(rand(800, 1500));
}

// ─── THẢ CẢM XÚC ─────────────────────────────────────────────

async function reactToPost(page, postIdx, emotion) {
  if (emotion === 'none') return false;
  try {
    await page.bringToFront();
    const articles = await page.$$('[role="article"]');
    const article  = articles[postIdx];
    if (!article) return false;
    const likeSelectors = ['[aria-label="Thích"][role="button"]','[aria-label="Like"][role="button"]','[data-testid="like_button"]'];
    let likeBtn = null;
    for (const sel of likeSelectors) {
      const btns = await article.$$(sel);
      if (btns.length > 0) { likeBtn = btns[0]; break; }
    }
    if (!likeBtn) return false;
    if (emotion === 'like') {
      await likeBtn.click();
      await sleep(rand(400, 800));
      console.log(`[Behavior] ❤️ Like bài #${postIdx}`);
      return true;
    }
    await likeBtn.hover();
    await sleep(rand(1000, 1800));
    const emotionMap = {
      haha : ['[aria-label="Haha"]'],
      wow  : ['[aria-label="Wow"]'],
      sad  : ['[aria-label="Buồn"]','[aria-label="Sad"]'],
      angry: ['[aria-label="Phẫn nộ"]','[aria-label="Angry"]'],
    };
    for (const sel of (emotionMap[emotion] || [])) {
      const btns = await page.$$(sel);
      if (btns.length > 0) {
        await btns[btns.length-1].click();
        await sleep(rand(400, 700));
        const icons = { haha:'😂', wow:'😮', sad:'😢', angry:'😡' };
        console.log(`[Behavior] ${icons[emotion]} ${emotion} bài #${postIdx}`);
        return true;
      }
    }
    await likeBtn.click();
    await sleep(rand(300, 600));
    console.log(`[Behavior] ❤️ Fallback like #${postIdx}`);
    return true;
  } catch (err) {
    console.error(`[Behavior] React error #${postIdx}:`, err.message);
    return false;
  }
}

// ─── MAIN LOOP ────────────────────────────────────────────────

async function startBehavior(account, settings, config, onProgress) {
  const { id, name, profileDir } = account;

  if (behaviorSessions.has(id)) return { ok: false, message: `${name}: Đang chạy rồi!` };

  if (settings.geminiApiKey) initGemini(settings.geminiApiKey);
  else if (config.geminiApiKey) initGemini(config.geminiApiKey);
  else geminiClient = null;

  let setupResult;
  try {
    setupResult = await setupBrowser(account, settings);
  } catch (err) {
    return { ok: false, message: `${name}: ${err.message}` };
  }

  if (setupResult.needLogin) {
    return {
      ok       : false,
      needLogin: true,
      message  :
        `${name} (${profileDir}): Chưa đăng nhập Facebook!\n\n` +
        `Cách fix:\n` +
        `1. Bấm "⚡ Mở Facebook"\n` +
        `2. Đăng nhập thủ công trong profile đó\n` +
        `3. Đóng Chrome\n` +
        `4. Chạy lại giả lập — lần sau tự động`,
    };
  }

  const { browser, page } = setupResult;
  const cfg = {
    durationMinutes: config.durationMinutes || 10,
    reactionRate   : config.reactionRate    || 40,
    readTimeMin    : config.readTimeMin     || 800,
    readTimeMax    : config.readTimeMax     || 3000,
    hotReadTimeMin : config.hotReadTimeMin  || 3000,
    hotReadTimeMax : config.hotReadTimeMax  || 8000,
    pauseMin       : config.pauseMin        || 500,
    pauseMax       : config.pauseMax        || 1500,
  };

  const stats = {
    postsViewed:0, postsReacted:0, hotPostsRead:0, adsSkipped:0,
    startTime: Date.now(),
    reactions: { like:0, haha:0, wow:0, sad:0, angry:0 },
  };

  const sess = { browser, page, running: true, stats };
  behaviorSessions.set(id, sess);
  browser.on('disconnected', () => {
    const s = behaviorSessions.get(id);
    if (s) s.running = false;
    behaviorSessions.delete(id);
  });

  if (onProgress) onProgress({ accountId:id, name, event:'start', stats });
  console.log(`[Behavior] ▶ ${name} | ${cfg.durationMinutes}phút | ${cfg.reactionRate}% | Gemini:${!!geminiClient}`);

  const endTime = Date.now() + cfg.durationMinutes * 60 * 1000;
  let   loop    = 0;
  const seen    = new Set();

  while (sess.running && Date.now() < endTime) {
    loop++;
    try {
      const posts = await getVisiblePosts(page);

      if (!posts.length) {
        await scrollNaturally(page);
        await sleep(rand(800, 2000));
        continue;
      }

      const visible   = posts.filter(p => p.inView);
      const realPosts = visible.filter(p => !p.isAd);
      console.log(`[Behavior] Loop#${loop} [${name}]: ${realPosts.length} bài | ${visible.filter(p=>p.isAd).length} QC | 👁${stats.postsViewed} ❤️${stats.postsReacted}`);

      // Phân tích Gemini song song
      const postAnalysis = new Map();
      if (geminiClient) {
        await Promise.race([
          Promise.all(realPosts.filter(p => p.text.length > 10).map(async post => {
            const emotion = await analyzeEmotion(post.text, post.isAd, cfg);
            postAnalysis.set(post.idx, emotion);
          })),
          sleep(2000),
        ]);
      }

      for (let i = 0; i < posts.length; i++) {
        if (!sess.running) break;
        const post = posts[i];
        if (!post.inView) continue;

        const hash = post.text.slice(0, 50);
        if (seen.has(hash)) continue;
        seen.add(hash);
        if (seen.size > 200) seen.delete(seen.values().next().value);

        if (post.isAd) { stats.adsSkipped++; continue; }

        const readTime = post.isHot
          ? rand(cfg.hotReadTimeMin, cfg.hotReadTimeMax)
          : rand(cfg.readTimeMin, cfg.readTimeMax);

        if (post.isHot) {
          stats.hotPostsRead++;
          if (onProgress) onProgress({ accountId:id, name, event:'reading_hot', post, stats });
        }

        stats.postsViewed++;
        if (onProgress) onProgress({ accountId:id, name, event:'reading', stats });
        console.log(`[Behavior] 👁 [${name}] #${post.idx}: "${post.text.slice(0,40)}..." | ${Math.round(readTime/1000)}s`);

        await sleep(readTime);
        if (!sess.running) break;

        let emotion = postAnalysis.get(post.idx);
        if (!emotion && post.text.length > 10) emotion = await analyzeEmotion(post.text, post.isAd, cfg);

        if (emotion && emotion !== 'none') {
          await sleep(rand(200, 500));
          const reacted = await reactToPost(page, i, emotion);
          if (reacted) {
            stats.postsReacted++;
            stats.reactions[emotion] = (stats.reactions[emotion]||0) + 1;
            if (onProgress) onProgress({ accountId:id, name, event:'reacted', emotion, stats });
            await sleep(rand(600, 1500));
          }
        }

        if (rand(1,8) === 1) await sleep(rand(1500, 4000));
        if (!sess.running) break;
      }

      await scrollNaturally(page);
      await sleep(rand(cfg.pauseMin, cfg.pauseMax));

    } catch (err) {
      if (err.message && (err.message.includes('Session closed') || err.message.includes('Target closed') || err.message.includes('disconnected'))) break;
      console.error('[Behavior] Loop error:', err.message);
      await sleep(2000);
    }
  }

  sess.running = false;
  behaviorSessions.delete(id);
  try { await browser.close(); } catch {}

  const elapsed = Math.round((Date.now() - stats.startTime) / 1000 / 60);
  const msg = `${name}: Xong! ${elapsed}phút | 👁${stats.postsViewed} | ❤️${stats.postsReacted} | 🚫${stats.adsSkipped} QC`;
  console.log(`[Behavior] ✅ ${msg}`);
  if (onProgress) onProgress({ accountId:id, name, event:'done', stats });
  return { ok: true, message: msg, stats };
}

async function scheduledBehavior(account, settings, behaviorConfig) {
  console.log(`[Scheduler+Behavior] ⏰ ${account.name} (${account.profileDir})`);
  return startBehavior(account, settings, behaviorConfig, p => {
    if (p.event === 'reacted' || p.event === 'done')
      console.log(`[Scheduler+Behavior] ${p.event}: ${p.name}`, p.emotion||'');
  });
}

function stopBehavior(accountId) {
  const s = behaviorSessions.get(accountId);
  if (s) {
    s.running = false;
    try { s.browser && s.browser.close(); } catch {}
    behaviorSessions.delete(accountId);
    return true;
  }
  return false;
}

function getBehaviorStatus(accountId) {
  const s = behaviorSessions.get(accountId);
  if (!s) return { running: false };
  return { running: s.running, elapsed: Math.round((Date.now()-s.stats.startTime)/1000/60), stats: s.stats };
}

function getAllBehaviorStatus() {
  const result = {};
  behaviorSessions.forEach((s, id) => { result[id] = { running: s.running, stats: s.stats }; });
  return result;
}

module.exports = { startBehavior, stopBehavior, getBehaviorStatus, getAllBehaviorStatus, scheduledBehavior, initGemini };