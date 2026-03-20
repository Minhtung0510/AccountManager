// server/behavior.js — Phase 2: Giả lập hành vi FB thật
// Fix: selector thả cảm xúc + bỏ qua quảng cáo

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

function getBehaviorUserDataDir(profileDir) {
  const home       = os.homedir();
  const p          = os.platform();
  const folderName = `Chrome-Behavior-${profileDir.replace(/\s+/g, '-')}`;
  let   baseDir;
  if (p === 'win32')       baseDir = path.join(home, 'AppData', 'Local', 'Google');
  else if (p === 'darwin') baseDir = path.join(home, 'Library', 'Application Support', 'Google');
  else                     baseDir = path.join(home, '.config');
  const dir = path.join(baseDir, folderName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function clearSingletonLock(userDataDir) {
  ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
    try {
      const fp = path.join(userDataDir, f);
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); console.log(`[Behavior] 🔓 Xóa: ${f}`); }
    } catch {}
  });
}

// ─── GEMINI AI ────────────────────────────────────────────────

let geminiClient = null;

function initGemini(apiKey) {
  if (!apiKey) { geminiClient = null; return null; }
  try {
geminiClient = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('[Behavior] ✅ Gemini AI sẵn sàng');
    return geminiClient;
  } catch (err) {
    console.error('[Behavior] Gemini init error:', err.message);
    geminiClient = null;
    return null;
  }
}

async function analyzeEmotion(postText, isAd, config = {}) {
  // Bài quảng cáo → bỏ qua hoàn toàn
  if (isAd) return 'none';

  const reactionRate = config.reactionRate || 40;
  if (!postText || postText.trim().length < 15) return 'none';
  if (rand(1, 100) > reactionRate) return 'none';

  if (geminiClient) {
    try {
      const prompt = `Bạn là người dùng Facebook Việt Nam. Đọc bài viết và trả về ĐÚNG 1 từ:
like / haha / wow / sad / angry / none

Quy tắc:
- like: nội dung tích cực, chia sẻ, thông tin hữu ích
- haha: hài hước, buồn cười, vui
- wow: bất ngờ, ấn tượng, khó tin
- sad: buồn, đau lòng, mất mát, chia buồn
- angry: tức giận, bất công, phẫn nộ, tiêu cực
- none: quảng cáo, không rõ nghĩa, ngôn ngữ nước ngoài, nội dung nhạy cảm

Bài viết: "${postText.slice(0, 400)}"

Trả lời (chỉ 1 từ):`;

      const result   = await geminiClient.generateContent(prompt);
      const response = result.response.text().trim().toLowerCase().split(/[\n\s]/)[0];
      const valid    = ['like', 'haha', 'wow', 'sad', 'angry', 'none'];
      const found    = valid.find(v => response.startsWith(v) || response === v);
      const emotion  = found || 'like';
      console.log(`[Gemini] "${postText.slice(0, 50)}..." → ${emotion}`);
      return emotion;
    } catch (err) {
      console.error('[Gemini] Error:', err.message);
    }
  }

  // Random tự nhiên nếu không có Gemini
  const r = rand(1, 10);
  if (r <= 6) return 'like';
  if (r <= 7) return 'haha';
  if (r <= 8) return 'wow';
  if (r <= 9) return 'sad';
  return 'angry';
}

// ─── SESSION MANAGER ──────────────────────────────────────────

const behaviorSessions = new Map();

// ─── MỞ CHROME ───────────────────────────────────────────────

async function launchBrowser(account, settings) {
  const { profileDir, name } = account;
  const chromePath  = settings.chromePath || getDefaultChromePath();
  const userDataDir = getBehaviorUserDataDir(profileDir);

  clearSingletonLock(userDataDir);
  console.log(`[Behavior] 🚀 Mở Chrome: ${name} | ${profileDir}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath   : chromePath,
      userDataDir      : userDataDir,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreDefaultArgs : ['--enable-automation'],
      headless          : false,
      defaultViewport   : null,
      handleSIGINT      : false,
      handleSIGTERM     : false,
    });
  } catch (err) {
    clearSingletonLock(userDataDir);
    await sleep(1000);
    try {
      browser = await puppeteer.launch({
        executablePath   : chromePath,
        userDataDir      : userDataDir,
        args             : ['--no-first-run', '--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
        ignoreDefaultArgs: ['--enable-automation'],
        headless         : false,
        defaultViewport  : null,
      });
    } catch (err2) {
      throw new Error(`Không mở được Chrome: ${err2.message}`);
    }
  }

  const page = (await browser.pages())[0] || await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  await page.bringToFront();

  try {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    await sleep(2000);
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  await sleep(3000);

  const isLoggedIn = await page.evaluate(() => !document.querySelector('#email, input[name="email"]'));

  if (!isLoggedIn) {
    console.log(`[Behavior] ⚠️ Chưa đăng nhập: ${name}`);
    return { browser, page, needLogin: true };
  }

  // Về newsfeed
  const url = page.url();
  if (url.includes('/messages') || url.includes('/watch') || url.includes('/marketplace')) {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
  }

  console.log(`[Behavior] ✅ Đã vào Facebook: ${name}`);
  return { browser, page, needLogin: false };
}

// ─── LẤY BÀI VIẾT + PHÁT HIỆN QUẢNG CÁO ─────────────────────

async function getVisiblePosts(page) {
  try { await page.bringToFront(); } catch {}

  return await page.evaluate(() => {
    const results   = [];
    const selectors = ['[role="article"]', '[data-pagelet*="FeedUnit"]'];
    let   elements  = [];

    for (const sel of selectors) {
      elements = [...document.querySelectorAll(sel)];
      if (elements.length > 0) break;
    }

    elements.slice(0, 8).forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight + 300 || rect.bottom < -300) return;

      // ── PHÁT HIỆN QUẢNG CÁO ──
      // FB đánh dấu quảng cáo bằng nhiều cách khác nhau
      const adIndicators = [
        // Text "Được tài trợ" / "Sponsored"
        () => {
          const texts = el.querySelectorAll('a[aria-label], span');
          for (const t of texts) {
            const txt = t.textContent?.trim();
            if (txt === 'Được tài trợ' || txt === 'Sponsored' || txt === 'Quảng cáo') return true;
          }
          return false;
        },
        // Có nút "Tìm hiểu thêm" / "Shop now" / "Sign up" kiểu CTA
        () => {
          const ctaBtns = el.querySelectorAll('[data-testid*="cta"], [aria-label*="Tìm hiểu thêm"], [aria-label*="Learn more"], [aria-label*="Shop now"]');
          return ctaBtns.length > 0;
        },
        // Có data attribute của ad
        () => !!el.querySelector('[data-ad-comet-preview], [data-ad-preview]'),
        // URL có chứa /ads/
        () => {
          const links = el.querySelectorAll('a[href*="/ads/"], a[href*="?hc_location=ufi"]');
          return links.length > 0;
        },
      ];

      const isAd = adIndicators.some(fn => { try { return fn(); } catch { return false; } });

      // ── LẤY NỘI DUNG BÀI ──
      let text = '';
      // Lấy text từ các node có dir="auto" (nội dung bài viết FB)
      el.querySelectorAll('[dir="auto"]').forEach(n => {
        const t = n.innerText?.trim();
        if (t && t.length > 5 && !t.includes('Được tài trợ') && !t.includes('Sponsored')) {
          text += t + ' ';
        }
      });
      text = text.trim().slice(0, 600);

      // ── ĐẾM REACTIONS ──
      let reactions = 0, comments = 0;
      // Nhiều selector khác nhau cho số reactions
      const reactionSelectors = [
        '[aria-label*="reaction"]',
        '[aria-label*="cảm xúc"]',
        '[aria-label*="người"]',
        '[data-testid*="like_count"]',
      ];
      for (const sel of reactionSelectors) {
        const el2 = el.querySelector(sel);
        if (el2) {
          const match = el2.getAttribute('aria-label')?.match(/[\d,.]+/);
          if (match) { reactions = parseInt(match[0].replace(/[,.]/g, '')); break; }
          // Thử innerText
          const num = parseInt(el2.innerText?.replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num > 0) { reactions = num; break; }
        }
      }

      const commentSelectors = [
        '[aria-label*="comment"]',
        '[aria-label*="bình luận"]',
      ];
      for (const sel of commentSelectors) {
        const el2 = el.querySelector(sel);
        if (el2) {
          const match = el2.getAttribute('aria-label')?.match(/[\d,.]+/);
          if (match) { comments = parseInt(match[0].replace(/[,.]/g, '')); break; }
        }
      }

      results.push({
        idx,
        text,
        reactions,
        comments,
        isAd,
        isHot : !isAd && (reactions > 30 || comments > 10),
        inView: rect.top >= -50 && rect.top < window.innerHeight + 50,
      });
    });

    return results;
  });
}

// ─── SCROLL TỰ NHIÊN ─────────────────────────────────────────

async function scrollNaturally(page, config) {
  try { await page.bringToFront(); } catch {}

  // Scroll nhiều hơn để load bài mới
  const total = rand(800, 1500);
  const steps = rand(8, 15);

  for (let i = 0; i < steps; i++) {
    await page.evaluate((a) => window.scrollBy({ top: a, behavior: 'smooth' }), Math.floor(total / steps) + rand(-30, 30));
    await sleep(rand(150, 350));
  }

  // Chờ FB load bài mới
  await sleep(rand(1500, 3000));
}

// ─── THẢ CẢM XÚC (FIX SELECTOR) ─────────────────────────────

async function reactToPost(page, postIdx, emotion) {
  if (emotion === 'none') return false;

  try {
    await page.bringToFront();

    // Nhiều selector cho nút Like/Thích của FB
    const likeSelectors = [
      '[aria-label="Thích"][role="button"]',
      '[aria-label="Like"][role="button"]',
      '[data-testid="like_button"]',
      // Selector theo text nếu aria-label không tìm được
      'div[role="button"] span[data-testid*="like"]',
    ];

    let likeBtn = null;
    let btnList = [];

    for (const sel of likeSelectors) {
      btnList = await page.$$(sel);
      if (btnList.length > 0) break;
    }

    if (!btnList[postIdx]) {
      // Thử tìm trong article thứ postIdx
      const articles = await page.$$('[role="article"]');
      if (articles[postIdx]) {
        for (const sel of likeSelectors) {
          const btns = await articles[postIdx].$$(sel);
          if (btns.length > 0) { likeBtn = btns[0]; break; }
        }
      }
      if (!likeBtn) return false;
    } else {
      likeBtn = btnList[postIdx];
    }

    if (emotion === 'like') {
      await likeBtn.click();
      await sleep(rand(500, 1000));
      console.log(`[Behavior] ❤️ Like bài #${postIdx}`);
      return true;
    }

    // Cảm xúc khác → hover để hiện popup
    await likeBtn.hover();
    await sleep(rand(1200, 1800));

    // Selector cho từng cảm xúc trong popup
    const emotionSelectors = {
      haha : ['[aria-label="Haha"]', '[aria-label="haha"]'],
      wow  : ['[aria-label="Wow"]', '[aria-label="wow"]'],
      sad  : ['[aria-label="Buồn"]', '[aria-label="Sad"]', '[aria-label="sad"]'],
      angry: ['[aria-label="Phẫn nộ"]', '[aria-label="Angry"]', '[aria-label="angry"]'],
    };

    const targets = emotionSelectors[emotion] || [];
    for (const sel of targets) {
      const btns = await page.$$(sel);
      if (btns.length > 0) {
        await btns[btns.length - 1].click();
        await sleep(rand(500, 900));
        const icons = { haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
        console.log(`[Behavior] ${icons[emotion]} ${emotion} bài #${postIdx}`);
        return true;
      }
    }

    // Popup không hiện → fallback like
    await likeBtn.click();
    await sleep(rand(400, 700));
    console.log(`[Behavior] ❤️ Fallback like bài #${postIdx}`);
    return true;

  } catch (err) {
    console.error(`[Behavior] React error bài #${postIdx}:`, err.message);
    return false;
  }
}

// ─── MAIN BEHAVIOR LOOP ───────────────────────────────────────

async function startBehavior(account, settings, config, onProgress) {
  const { id, name } = account;

  if (behaviorSessions.has(id)) {
    return { ok: false, message: `${name}: Đang chạy rồi!` };
  }

  if (settings.geminiApiKey) initGemini(settings.geminiApiKey);
  else { geminiClient = null; console.log('[Behavior] ⚠️ Không có Gemini → random cảm xúc'); }

  let browser, page, needLogin;
  try {
    ({ browser, page, needLogin } = await launchBrowser(account, settings));
  } catch (err) {
    return { ok: false, message: err.message };
  }

  if (needLogin) {
    return {
      ok       : false,
      message  : `${name}: Cần đăng nhập FB lần đầu!\nChrome đang mở → đăng nhập thủ công → lần sau tự động.`,
      needLogin: true,
    };
  }

  const stats = {
    postsViewed : 0,
    postsSkipped: 0, // bài quảng cáo bị bỏ qua
    postsReacted: 0,
    hotPostsRead: 0,
    adsSkipped  : 0,
    startTime   : Date.now(),
    reactions   : { like: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
  };

  const sessionObj = { browser, page, running: true, stats };
  behaviorSessions.set(id, sessionObj);

  browser.on('disconnected', () => {
    const s = behaviorSessions.get(id);
    if (s) s.running = false;
    behaviorSessions.delete(id);
  });

  if (onProgress) onProgress({ accountId: id, name, event: 'start', stats });
  console.log(`[Behavior] ▶ ${name} | ${config.durationMinutes}phút | ${config.reactionRate}% cảm xúc | Gemini: ${!!geminiClient}`);

  const endTime  = Date.now() + (config.durationMinutes || 10) * 60 * 1000;
  let   loopCount = 0;
const seenPosts = new Set(); // Lưu hash bài đã đọc

  while (sessionObj.running && Date.now() < endTime) {
    loopCount++;
    try {
      const posts = await getVisiblePosts(page);

      if (!posts.length) {
        await scrollNaturally(page, config);
        await sleep(rand(2000, 4000));
        continue;
      }

      const visiblePosts = posts.filter(p => p.inView);
      const adCount      = visiblePosts.filter(p => p.isAd).length;
      const realCount    = visiblePosts.filter(p => !p.isAd).length;

      console.log(`[Behavior] Loop#${loopCount}: ${realCount} bài thật, ${adCount} QC bỏ qua | 👁${stats.postsViewed} ❤️${stats.postsReacted}`);

      for (let i = 0; i < posts.length; i++) {
        if (!sessionObj.running) break;
        const post = posts[i];
        if (!post.inView) continue;
// Bỏ qua bài đã đọc rồi
const postHash = post.text.slice(0, 50);
if (seenPosts.has(postHash)) continue;
seenPosts.add(postHash);

// Giữ Set không quá lớn
if (seenPosts.size > 100) {
  const first = seenPosts.values().next().value;
  seenPosts.delete(first);
}
        // ── BỎ QUA QUẢNG CÁO ──
        if (post.isAd) {
          stats.adsSkipped++;
          console.log(`[Behavior] 🚫 Bỏ qua QC #${post.idx}`);
          continue;
        }

        // ── ĐỌC BÀI ──
        let readTime;
        if (post.isHot) {
          readTime = rand(config.hotReadTimeMin || 15000, config.hotReadTimeMax || 40000);
          stats.hotPostsRead++;
          console.log(`[Behavior] 🔥 Bài hot: ${post.reactions}❤️ ${post.comments}💬 → đọc ${Math.round(readTime/1000)}s`);
          if (onProgress) onProgress({ accountId: id, name, event: 'reading_hot', post, stats });
        } else {
          readTime = rand(config.readTimeMin || 3000, config.readTimeMax || 10000);
        }

        stats.postsViewed++;
        if (onProgress) onProgress({ accountId: id, name, event: 'reading', stats });
        console.log(`[Behavior] 👁 Đọc bài #${post.idx}: "${post.text.slice(0, 50)}..." | ${Math.round(readTime/1000)}s`);

        await sleep(readTime);
        if (!sessionObj.running) break;

        // ── PHÂN TÍCH & THẢ CẢM XÚC ──
        if (post.text.length > 15) {
          const emotion = await analyzeEmotion(post.text, post.isAd, config);

          if (emotion !== 'none') {
            await sleep(rand(300, 800));
            const reacted = await reactToPost(page, i, emotion);
            if (reacted) {
              stats.postsReacted++;
              stats.reactions[emotion] = (stats.reactions[emotion] || 0) + 1;
              if (onProgress) onProgress({ accountId: id, name, event: 'reacted', emotion, stats });
              await sleep(rand(800, 2000));
            }
          } else {
            console.log(`[Behavior] ⏭ Bỏ qua bài #${post.idx} (none)`);
          }
        }

        // Random dừng lâu hơn
        if (rand(1, 5) === 1) await sleep(rand(3000, 8000));
        if (!sessionObj.running) break;
      }

      await scrollNaturally(page, config);
      await sleep(rand(config.pauseMin || 2000, config.pauseMax || 6000));

    } catch (err) {
      if (err.message.includes('Session closed') || err.message.includes('Target closed')) break;
      console.error(`[Behavior] Loop error:`, err.message);
      await sleep(3000);
    }
  }

  sessionObj.running = false;
  behaviorSessions.delete(id);
  try { await browser.close(); } catch {}

  // Xóa lock sau khi đóng
  clearSingletonLock(getBehaviorUserDataDir(account.profileDir));

  const elapsed = Math.round((Date.now() - stats.startTime) / 1000 / 60);
  const msg = `${name}: Xong! ${elapsed}phút | 👁${stats.postsViewed} bài | ❤️${stats.postsReacted} cảm xúc | 🚫${stats.adsSkipped} QC bỏ qua`;
  console.log(`[Behavior] ✅ ${msg}`);
  console.log(`[Behavior] 📊`, stats.reactions);

  if (onProgress) onProgress({ accountId: id, name, event: 'done', stats });
  return { ok: true, message: msg, stats };
}

// ─── SCHEDULER INTEGRATION ───────────────────────────────────

async function scheduledBehavior(account, settings, behaviorConfig) {
  console.log(`[Scheduler+Behavior] ⏰ ${account.name}`);
  return startBehavior(account, settings, behaviorConfig, (progress) => {
    if (['reacted', 'done'].includes(progress.event)) {
      console.log(`[Scheduler+Behavior] ${progress.event}: ${progress.name}`, progress.emotion || '', progress.stats || '');
    }
  });
}

// ─── CONTROLS ─────────────────────────────────────────────────

function stopBehavior(accountId) {
  const s = behaviorSessions.get(accountId);
  if (s) {
    s.running = false;
    try { s.browser?.close(); } catch {}
    behaviorSessions.delete(accountId);
    return true;
  }
  return false;
}

function getBehaviorStatus(accountId) {
  const s = behaviorSessions.get(accountId);
  if (!s) return { running: false };
  return {
    running : s.running,
    elapsed : Math.round((Date.now() - s.stats.startTime) / 1000 / 60),
    stats   : s.stats,
  };
}

function getAllBehaviorStatus() {
  const result = {};
  for (const [id, s] of behaviorSessions) {
    result[id] = { running: s.running, stats: s.stats };
  }
  return result;
}

module.exports = { startBehavior, stopBehavior, getBehaviorStatus, getAllBehaviorStatus, scheduledBehavior, initGemini };