// server/behavior.js — Phase 2: Giả lập hành vi FB thật
// v3.3: Multi-provider AI per session (Gemini / OpenAI / Groq)
//        Mỗi account chọn provider riêng, chạy song song không conflict

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

// ─── ĐÓNG TAB FB BÊN PROFILE DIR ─────────────────────────────

async function closeProfileFbTab(profileDir) {
  const debugPort = getDebugPort(profileDir);
  let tempBrowser = null;
  try {
    const isOpen = await isPortOpen(debugPort);
    if (!isOpen) {
      console.log(`[Behavior] ℹ️  Chrome profile ${profileDir} không mở, bỏ qua đóng tab`);
      return false;
    }
    tempBrowser = await puppeteer.connect({ browserURL: `http://localhost:${debugPort}`, defaultViewport: null });
    const pages = await tempBrowser.pages();
    let closedCount = 0;
    for (const page of pages) {
      try {
        if (page.url().includes('facebook.com')) { await page.close(); closedCount++; }
      } catch {}
    }
    await tempBrowser.disconnect();
    console.log(closedCount > 0
      ? `[Behavior] ✅ Đã đóng ${closedCount} tab FB bên profile ${profileDir}`
      : `[Behavior] ℹ️  Không tìm thấy tab FB nào bên profile ${profileDir}`);
    return closedCount > 0;
  } catch (err) {
    console.log(`[Behavior] ⚠️  Không thể đóng tab FB profile ${profileDir}: ${err.message}`);
    if (tempBrowser) { try { await tempBrowser.disconnect(); } catch {} }
    return false;
  }
}

// ─── COOKIES ─────────────────────────────────────────────────

async function readCookiesFromFile(profileDir) {
  const userDataDir = getChromeUserDataDir();
  const profilePath = path.join(userDataDir, profileDir);
  const cookieFile  = path.join(profilePath, 'Cookies');
  const cookieCopy  = path.join(profilePath, 'Cookies_behavior_copy');

  if (!fs.existsSync(cookieFile)) {
    console.log(`[Behavior] ⚠️  Không tìm thấy file Cookies: ${cookieFile}`);
    return null;
  }
  try { fs.copyFileSync(cookieFile, cookieCopy); }
  catch (err) { console.log(`[Behavior] ⚠️  Không copy được file Cookies: ${err.message}`); return null; }

  const pythonScript = `
import sqlite3, json, sys
db_path = sys.argv[1]
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT name, value, encrypted_value, host_key, path,
               expires_utc, is_secure, is_httponly, samesite
        FROM cookies WHERE host_key LIKE '%facebook.com%'
    """)
    rows = cursor.fetchall()
    conn.close()
except Exception as e:
    print(json.dumps({"error": str(e)})); sys.exit(1)
cookies = []
for row in rows:
    name, value, encrypted_value, host_key, path_, expires_utc, is_secure, is_httponly, samesite = row
    if not value and encrypted_value:
        try:
            if sys.platform == 'win32':
                import ctypes, ctypes.wintypes
                class DATA_BLOB(ctypes.Structure):
                    _fields_ = [('cbData', ctypes.wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
                p = ctypes.create_string_buffer(encrypted_value, len(encrypted_value))
                blobin = DATA_BLOB(ctypes.sizeof(p), p)
                blobout = DATA_BLOB()
                if encrypted_value[:3] not in [b'v10', b'v11']:
                    if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(blobin), None, None, None, None, 0, ctypes.byref(blobout)):
                        value = ctypes.string_at(blobout.pbData, blobout.cbData).decode('utf-8', errors='ignore')
                        ctypes.windll.kernel32.LocalFree(blobout.pbData)
        except: value = ''
    important = ['c_user','xs','datr','fr','sb','wd','presence','usida','dpr','actppresence','locale','spin']
    if name not in important and not any(kw in name.lower() for kw in ['session','token','auth','user']): continue
    expires = int((expires_utc / 1000000) - 11644473600) if expires_utc > 0 else 0
    samesite_map = {-1:'None',0:'None',1:'Lax',2:'Strict'}
    cookies.append({'name':name,'value':value,'domain':host_key,'path':path_,'expires':expires,
                    'secure':bool(is_secure),'httpOnly':bool(is_httponly),'sameSite':samesite_map.get(samesite,'None')})
print(json.dumps(cookies))
`;
  try {
    const scriptFile = path.join(os.tmpdir(), 'read_cookies_fb.py');
    fs.writeFileSync(scriptFile, pythonScript, 'utf-8');
    let output;
    try { output = execSync(`python "${scriptFile}" "${cookieCopy}"`, { timeout: 10000, encoding: 'utf-8' }); }
    catch { output = execSync(`python3 "${scriptFile}" "${cookieCopy}"`, { timeout: 10000, encoding: 'utf-8' }); }
    try { fs.unlinkSync(scriptFile); } catch {}
    try { fs.unlinkSync(cookieCopy); } catch {}
    const result = JSON.parse(output.trim());
    if (result.error) { console.log(`[Behavior] ⚠️  Lỗi đọc SQLite: ${result.error}`); return null; }
    const validCookies = result.filter(c => c.value && c.value.length > 0);
    console.log(`[Behavior] 🍪 Đọc được ${validCookies.length}/${result.length} cookies từ file`);
    return validCookies.length > 0 ? validCookies : null;
  } catch (err) {
    console.log(`[Behavior] ⚠️  Lỗi đọc cookies từ file: ${err.message}`);
    try { fs.unlinkSync(cookieCopy); } catch {}
    return null;
  }
}

async function getCookiesViaCDP(debugPort) {
  let tempBrowser = null;
  try {
    tempBrowser = await puppeteer.connect({ browserURL: `http://localhost:${debugPort}`, defaultViewport: null });
    const pages = await tempBrowser.pages();
    let page = pages.find(p => { try { return p.url().includes('facebook.com'); } catch { return false; } });
    let opened = false;
    if (!page) { page = await tempBrowser.newPage(); opened = true; await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 10000 }); await sleep(1500); }
    const cookies   = await page.cookies('https://www.facebook.com');
    const fbCookies = cookies.filter(c => c.domain && c.domain.includes('facebook.com') && c.value);
    if (opened) { try { await page.close(); } catch {} }
    await tempBrowser.disconnect();
    return fbCookies.length > 0 ? fbCookies : null;
  } catch (err) {
    console.log(`[Behavior] ⚠️  CDP thất bại: ${err.message}`);
    if (tempBrowser) { try { await tempBrowser.disconnect(); } catch {} }
    return null;
  }
}

async function getCookies(account, settings) {
  const { profileDir } = account;
  const debugPort = getDebugPort(profileDir);
  const fileCookies = await readCookiesFromFile(profileDir);
  if (fileCookies && fileCookies.length >= 2) {
    const hasCUser = fileCookies.some(c => c.name === 'c_user' && c.value);
    const hasXs    = fileCookies.some(c => c.name === 'xs' && c.value);
    if (hasCUser || hasXs) { console.log(`[Behavior] ✅ Dùng cookies từ file`); return fileCookies; }
  }
  console.log(`[Behavior] 🔄 File cookies không đủ, thử CDP...`);
  const isOpen = await isPortOpen(debugPort);
  if (isOpen) { const c = await getCookiesViaCDP(debugPort); if (c) return c; }
  if (!isOpen) {
    console.log(`[Behavior] 🚀 Spawn Chrome tạm để lấy cookies...`);
    try {
      const proc = spawn(settings.chromePath || getDefaultChromePath(), [
        `--user-data-dir=${getChromeUserDataDir()}`, `--profile-directory=${profileDir}`,
        `--remote-debugging-port=${debugPort}`, '--no-first-run', '--start-maximized', '--no-sandbox',
        'https://www.facebook.com',
      ], { detached: true, stdio: 'ignore' });
      proc.unref();
      const opened = await waitForPort(debugPort, 20000);
      if (opened) { await sleep(4000); const c = await getCookiesViaCDP(debugPort); if (c) return c; }
    } catch (err) { console.log(`[Behavior] ⚠️  Spawn Chrome thất bại: ${err.message}`); }
  }
  console.log(`[Behavior] ❌ Không lấy được cookies cho ${account.name}`);
  return null;
}

// ─── MULTI-PROVIDER AI CLIENT ─────────────────────────────────
// Mỗi session tạo client riêng → không conflict khi chạy song song

/**
 * Tạo AI client dựa theo provider
 * @param {string} provider  - 'gemini' | 'openai' | 'groq'
 * @param {string} apiKey    - API key tương ứng
 * @param {string} model     - Override model (optional)
 * @returns {{ provider, call: async (prompt) => string } | null}
 */
function createAIClient(provider, apiKey, model) {
  if (!provider || !apiKey) return null;

  // ── Gemini ──────────────────────────────────────────────────
  if (provider === 'gemini') {
    try {
      const genAI  = new GoogleGenerativeAI(apiKey);
      const gemini = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash' });
      console.log(`[Behavior] ✅ Gemini sẵn sàng (${model || 'gemini-2.0-flash'})`);
      return {
        provider: 'gemini',
        call: async (prompt) => {
          const result = await gemini.generateContent(prompt);
          return result.response.text().trim().toLowerCase();
        },
      };
    } catch (err) {
      console.log(`[Behavior] ❌ Gemini init failed: ${err.message}`);
      return null;
    }
  }

  // ── OpenAI ──────────────────────────────────────────────────
  if (provider === 'openai') {
    const selectedModel = model || 'gpt-3.5-turbo';
    console.log(`[Behavior] ✅ OpenAI sẵn sàng (${selectedModel})`);
    return {
      provider: 'openai',
      call: async (prompt) => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body   : JSON.stringify({
            model   : selectedModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 10,
            temperature: 0.3,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        return (data.choices?.[0]?.message?.content || '').trim().toLowerCase();
      },
    };
  }

  // ── Groq ────────────────────────────────────────────────────
  if (provider === 'groq') {
    const selectedModel = model || 'llama3-8b-8192';
    console.log(`[Behavior] ✅ Groq sẵn sàng (${selectedModel})`);
    return {
      provider: 'groq',
      call: async (prompt) => {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body   : JSON.stringify({
            model   : selectedModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 10,
            temperature: 0.3,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        return (data.choices?.[0]?.message?.content || '').trim().toLowerCase();
      },
    };
  }

  console.log(`[Behavior] ⚠️  Provider không hợp lệ: ${provider}`);
  return null;
}

// ─── ANALYZE EMOTION (dùng client bất kỳ) ────────────────────

async function analyzeEmotion(postText, isAd, config, aiClient, emotionCache) {
  if (isAd) return 'none';
  const rate = config?.reactionRate || 40;
  if (!postText || postText.trim().length < 10) return 'none';
  if (rand(1, 100) > rate) return 'none';

  if (aiClient) {
    const cacheKey = postText.slice(0, 80);
    if (emotionCache.has(cacheKey)) return emotionCache.get(cacheKey);

    try {
      const prompt =
        `FB VN user. Reply 1 word only: like/haha/wow/sad/angry/none\n` +
        `Post: "${postText.slice(0, 200)}"\nAnswer:`;

      const rawText = await Promise.race([
        aiClient.call(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);

      const valid   = ['like','haha','wow','sad','angry','none'];
      const emotion = valid.find(v => rawText.startsWith(v)) || 'like';
      console.log(`[${aiClient.provider}] → ${emotion}: "${postText.slice(0,35)}..."`);
      emotionCache.set(cacheKey, emotion);
      if (emotionCache.size > 500) emotionCache.delete(emotionCache.keys().next().value);
      return emotion;
    } catch (err) {
      console.log(`[Behavior] AI error (${aiClient.provider}): ${err.message}`);
      return 'like'; // fallback
    }
  }

  // Không có AI → random
  const r = rand(1, 10);
  if (r <= 6) return 'like';
  if (r <= 7) return 'haha';
  if (r <= 8) return 'wow';
  if (r <= 9) return 'sad';
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

  const launchOpts = {
    executablePath   : chromePath,
    userDataDir      : behaviorDir,
    args: [
      '--profile-directory=Default', '--no-first-run', '--no-default-browser-check',
      '--disable-infobars', '--disable-blink-features=AutomationControlled',
      '--start-maximized', '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-extensions',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    headless         : false,
    defaultViewport  : null,
  };

  let browser;
  try { browser = await puppeteer.launch(launchOpts); }
  catch {
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

  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1000);

  if (cookies && cookies.length > 0) {
    console.log(`[Behavior] 💉 Inject ${cookies.length} cookies...`);
    for (const cookie of cookies) { try { await page.setCookie(cookie); } catch {} }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
  } else { await sleep(3000); }

  const isLoggedIn = await page.evaluate(() =>
    !document.querySelector('#email, input[name="email"], [data-testid="royal_email"]')
  );

  if (!isLoggedIn) {
    console.log(`[Behavior] ❌ Chưa đăng nhập: ${name}`);
    await browser.close();
    return { browser: null, page: null, needLogin: true };
  }

  const url = page.url();
  if (url.includes('/messages') || url.includes('/watch') || url.includes('/marketplace')) {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
  }

  console.log(`[Behavior] ✅ Ready: ${name} | ${page.url().slice(0,50)}`);
  return { browser, page, needLogin: false };
}

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
      await likeBtn.click(); await sleep(rand(400, 800));
      console.log(`[Behavior] ❤️ Like bài #${postIdx}`);
      return true;
    }
    await likeBtn.hover(); await sleep(rand(1000, 1800));
    const emotionMap = { haha:['[aria-label="Haha"]'], wow:['[aria-label="Wow"]'], sad:['[aria-label="Buồn"]','[aria-label="Sad"]'], angry:['[aria-label="Phẫn nộ"]','[aria-label="Angry"]'] };
    for (const sel of (emotionMap[emotion] || [])) {
      const btns = await page.$$(sel);
      if (btns.length > 0) {
        await btns[btns.length-1].click(); await sleep(rand(400, 700));
        const icons = { haha:'😂', wow:'😮', sad:'😢', angry:'😡' };
        console.log(`[Behavior] ${icons[emotion]} ${emotion} bài #${postIdx}`);
        return true;
      }
    }
    await likeBtn.click(); await sleep(rand(300, 600));
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

  // ── Tạo AI client riêng cho session này ──────────────────────
  // Ưu tiên: config của account > settings toàn cục
  const aiProvider = config.aiProvider || settings.aiProvider || 'gemini';
  const aiKey      = config.aiApiKey   || (
    aiProvider === 'gemini' ? (config.geminiApiKey || settings.geminiApiKey) :
    aiProvider === 'openai' ? (config.openaiApiKey || settings.openaiApiKey) :
    aiProvider === 'groq'   ? (config.groqApiKey   || settings.groqApiKey)   : null
  );
  const aiModel    = config.aiModel || null;

  const aiClient    = createAIClient(aiProvider, aiKey, aiModel);
  const emotionCache = new Map(); // Cache riêng cho từng session

  if (!aiClient) {
    console.log(`[Behavior] ⚠️  ${name}: Không có AI client (${aiProvider}), dùng random cảm xúc`);
  } else {
    console.log(`[Behavior] 🤖 ${name}: Dùng ${aiProvider.toUpperCase()} AI`);
  }

  let setupResult;
  try { setupResult = await setupBrowser(account, settings); }
  catch (err) { return { ok: false, message: `${name}: ${err.message}` }; }

  if (setupResult.needLogin) {
    return {
      ok: false, needLogin: true,
      message: `${name} (${profileDir}): Chưa đăng nhập Facebook!\n\n` +
        `Cách fix:\n1. Bấm "⚡ Mở Facebook"\n2. Đăng nhập thủ công\n3. Đóng Chrome\n4. Chạy lại giả lập`,
    };
  }

  const { browser, page } = setupResult;

  // Đóng tab FB bên profile dir sau 3 giây
  setTimeout(async () => {
    try {
      console.log(`[Behavior] 🔄 Đóng tab FB bên profile dir: ${profileDir}...`);
      await closeProfileFbTab(profileDir);
    } catch (e) { console.log(`[Behavior] ⚠️  Lỗi đóng tab profile: ${e.message}`); }
  }, 3000);

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
    postsViewed: 0, postsReacted: 0, hotPostsRead: 0, adsSkipped: 0,
    startTime  : Date.now(),
    aiProvider : aiProvider,
    reactions  : { like:0, haha:0, wow:0, sad:0, angry:0 },
  };

  const sess = { browser, page, running: true, stats, aiProvider };
  behaviorSessions.set(id, sess);
  browser.on('disconnected', () => {
    const s = behaviorSessions.get(id);
    if (s) s.running = false;
    behaviorSessions.delete(id);
  });

  if (onProgress) onProgress({ accountId: id, name, event: 'start', stats });
  console.log(`[Behavior] ▶ ${name} | ${cfg.durationMinutes}phút | ${cfg.reactionRate}% | AI:${aiProvider.toUpperCase()}`);

  const endTime = Date.now() + cfg.durationMinutes * 60 * 1000;
  let   loop    = 0;
  const seen    = new Set();

  while (sess.running && Date.now() < endTime) {
    loop++;
    try {
      const posts = await getVisiblePosts(page);

      if (!posts.length) { await scrollNaturally(page); await sleep(rand(800, 2000)); continue; }

      const visible   = posts.filter(p => p.inView);
      const realPosts = visible.filter(p => !p.isAd);
      console.log(`[Behavior] Loop#${loop} [${name}]: ${realPosts.length} bài | ${visible.filter(p=>p.isAd).length} QC | 👁${stats.postsViewed} ❤️${stats.postsReacted}`);

      // Phân tích cảm xúc song song (nếu có AI)
      const postAnalysis = new Map();
      if (aiClient) {
        await Promise.race([
          Promise.all(realPosts.filter(p => p.text.length > 10).map(async post => {
            const emotion = await analyzeEmotion(post.text, post.isAd, cfg, aiClient, emotionCache);
            postAnalysis.set(post.idx, emotion);
          })),
          sleep(2500),
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

        if (post.isHot) { stats.hotPostsRead++; if (onProgress) onProgress({ accountId:id, name, event:'reading_hot', post, stats }); }

        stats.postsViewed++;
        if (onProgress) onProgress({ accountId:id, name, event:'reading', stats });
        console.log(`[Behavior] 👁 [${name}] #${post.idx}: "${post.text.slice(0,40)}..." | ${Math.round(readTime/1000)}s`);

        await sleep(readTime);
        if (!sess.running) break;

        let emotion = postAnalysis.get(post.idx);
        if (!emotion && post.text.length > 10)
          emotion = await analyzeEmotion(post.text, post.isAd, cfg, aiClient, emotionCache);

        if (emotion && emotion !== 'none') {
          await sleep(rand(200, 500));
          const reacted = await reactToPost(page, i, emotion);
          if (reacted) {
            stats.postsReacted++;
            stats.reactions[emotion] = (stats.reactions[emotion] || 0) + 1;
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
  const msg = `${name}: Xong! ${elapsed}phút | 👁${stats.postsViewed} | ❤️${stats.postsReacted} | 🚫${stats.adsSkipped} QC | AI:${aiProvider}`;
  console.log(`[Behavior] ✅ ${msg}`);
  if (onProgress) onProgress({ accountId:id, name, event:'done', stats });
  return { ok: true, message: msg, stats };
}

async function scheduledBehavior(account, settings, behaviorConfig) {
  console.log(`[Scheduler+Behavior] ⏰ ${account.name} (${account.profileDir})`);
  return startBehavior(account, settings, behaviorConfig, p => {
    if (p.event === 'reacted' || p.event === 'done')
      console.log(`[Scheduler+Behavior] reacted: ${p.name}`, p.emotion || '');
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
  return { running: s.running, elapsed: Math.round((Date.now()-s.stats.startTime)/1000/60), stats: s.stats, aiProvider: s.aiProvider };
}

function getAllBehaviorStatus() {
  const result = {};
  behaviorSessions.forEach((s, id) => { result[id] = { running: s.running, stats: s.stats, aiProvider: s.aiProvider }; });
  return result;
}

// initGemini giữ lại để backward compat nhưng không làm gì nữa
function initGemini() {}

module.exports = { startBehavior, stopBehavior, getBehaviorStatus, getAllBehaviorStatus, scheduledBehavior, initGemini };