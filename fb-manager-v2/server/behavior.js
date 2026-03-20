// server/behavior.js — Phase 2: Giả lập hành vi người dùng FB thật
// Dùng Puppeteer kết nối vào Chrome đang chạy (remote debugging)
// + Gemini AI phân tích nội dung tiếng Việt → thả cảm xúc thông minh

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

puppeteer.use(StealthPlugin());

// ─── HELPERS ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── GEMINI AI ────────────────────────────────────────────────

let geminiClient = null;

function initGemini(apiKey) {
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiClient = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    return geminiClient;
  } catch (err) {
    console.error('Gemini init error:', err.message);
    return null;
  }
}

/**
 * Phân tích nội dung bài viết → trả về cảm xúc phù hợp
 * @returns 'like' | 'haha' | 'wow' | 'sad' | 'angry' | 'none'
 */
async function analyzeEmotion(postContent, config = {}) {
  if (!geminiClient) return 'like';
  if (!postContent || postContent.trim().length < 10) return 'none';

  const reactionRate = config.reactionRate || 40; // % bài được thả cảm xúc
  if (rand(1, 100) > reactionRate) return 'none';

  try {
    const prompt = `Bạn là người dùng Facebook Việt Nam thật. Đọc bài viết sau và quyết định thả cảm xúc nào.

Bài viết: "${postContent.slice(0, 500)}"

Chỉ trả về 1 trong các giá trị sau (không giải thích):
- like (thích, tích cực, bình thường)
- haha (hài hước, buồn cười)
- wow (bất ngờ, ấn tượng, đáng kinh ngạc)
- sad (buồn, đau lòng, mất mát)
- angry (tức giận, bất công, phẫn nộ)
- none (không muốn thả cảm xúc)

Trả lời:`;

    const result   = await geminiClient.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();

    const valid = ['like', 'haha', 'wow', 'sad', 'angry', 'none'];
    const found = valid.find(v => response.includes(v));
    return found || 'like';
  } catch (err) {
    console.error('Gemini analyze error:', err.message);
    return 'like';
  }
}

// ─── SESSION MANAGER ──────────────────────────────────────────

// behaviorSessions[accountId] = { browser, page, running, stats }
const behaviorSessions = new Map();

// ─── KẾT NỐI VÀO CHROME ──────────────────────────────────────

const BASE_DEBUG_PORT = 9222;

function getDebugPort(profileDir) {
  const num = parseInt((profileDir || '').replace(/\D/g, '')) || 0;
  return BASE_DEBUG_PORT + num;
}

async function connectToBrowser(account) {
  const { profileDir } = account;
  const debugPort = getDebugPort(profileDir);

  try {
    const browser = await puppeteer.connect({
      browserURL      : `http://localhost:${debugPort}`,
      defaultViewport : null,
    });

    const pages = await browser.pages();
    const page  = pages.find(p => p.url().includes('facebook')) || pages[0];

    if (!page) throw new Error('Không tìm thấy tab Facebook');

    await page.bringToFront();
    return { browser, page };
  } catch (err) {
    throw new Error(`Không thể kết nối Chrome (port ${debugPort}): ${err.message}\nHãy bấm "⚡ Mở Facebook" trước!`);
  }
}

// ─── HÀNH VI: SCROLL & ĐỌC BÀI ──────────────────────────────

/**
 * Scroll newsfeed tự nhiên
 */
async function scrollNaturally(page, config) {
  const scrollAmount = rand(config.scrollMin || 300, config.scrollMax || 700);
  const scrollSpeed  = rand(3, 8); // số bước scroll

  for (let i = 0; i < scrollSpeed; i++) {
    await page.evaluate((amount) => {
      window.scrollBy(0, amount / 8);
    }, scrollAmount);
    await sleep(rand(50, 150));
  }
}

/**
 * Lấy nội dung bài viết đang hiển thị trên màn hình
 */
async function getVisiblePosts(page) {
  return await page.evaluate(() => {
    const posts = [];
    // Selector cho bài viết trên newsfeed FB
    const selectors = [
      '[data-pagelet="FeedUnit"]',
      '[role="article"]',
      '.x1yztbdb',
    ];

    let elements = [];
    for (const sel of selectors) {
      elements = [...document.querySelectorAll(sel)];
      if (elements.length > 0) break;
    }

    elements.slice(0, 5).forEach((el, idx) => {
      // Kiểm tra có trong viewport không
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;

      // Lấy text content
      const textEl = el.querySelector('[data-ad-comet-preview="message"], [dir="auto"]');
      const text   = textEl?.innerText || el.innerText || '';

      // Đếm reactions và comments
      const reactionEl = el.querySelector('[aria-label*="reaction"], [aria-label*="cảm xúc"]');
      const commentEl  = el.querySelector('[aria-label*="comment"], [aria-label*="bình luận"]');

      const reactionText = reactionEl?.getAttribute('aria-label') || '';
      const commentText  = commentEl?.getAttribute('aria-label') || '';

      // Parse số lượng
      const reactionCount = parseInt(reactionText.match(/\d+/)?.[0] || '0');
      const commentCount  = parseInt(commentText.match(/\d+/)?.[0] || '0');

      // Lấy element id để thả reaction
      const postId = el.getAttribute('data-ft') || `post-${idx}`;

      posts.push({
        idx,
        text        : text.slice(0, 600),
        reactionCount,
        commentCount,
        isHot       : reactionCount > 50 || commentCount > 20,
        element     : null, // Không thể serialize DOM element
        rect        : { top: rect.top, bottom: rect.bottom },
      });
    });

    return posts;
  });
}

/**
 * Thả cảm xúc vào bài viết
 */
async function reactToPost(page, postIdx, emotion) {
  if (emotion === 'none') return false;

  try {
    // Map emotion → aria-label tiếng Việt/Anh của FB
    const emotionMap = {
      like  : ['Thích', 'Like'],
      haha  : ['Haha', 'Haha'],
      wow   : ['Wow', 'Wow'],
      sad   : ['Buồn', 'Sad'],
      angry : ['Phẫn nộ', 'Angry'],
    };

    const labels = emotionMap[emotion] || emotionMap['like'];

    // Click giữ nút Like để hiện menu cảm xúc
    const likeButtons = await page.$$('[aria-label="Thích"][role="button"], [aria-label="Like"][role="button"]');
    if (!likeButtons[postIdx]) return false;

    const btn = likeButtons[postIdx];

    // Hover để hiện popup cảm xúc
    await btn.hover();
    await sleep(rand(800, 1200));

    // Tìm nút cảm xúc trong popup
    let reactionBtn = null;
    for (const label of labels) {
      const btns = await page.$$(`[aria-label="${label}"]`);
      if (btns.length > 0) {
        reactionBtn = btns[btns.length - 1];
        break;
      }
    }

    if (reactionBtn) {
      await reactionBtn.click();
      await sleep(rand(500, 1000));
      return true;
    }

    // Fallback: chỉ like bình thường
    if (emotion === 'like') {
      await btn.click();
      await sleep(rand(300, 700));
      return true;
    }

    return false;
  } catch (err) {
    console.error('React error:', err.message);
    return false;
  }
}

// ─── MAIN BEHAVIOR LOOP ───────────────────────────────────────

/**
 * Chạy hành vi giả lập cho 1 tài khoản
 */
async function startBehavior(account, settings, config, onProgress) {
  const { id, name } = account;

  if (behaviorSessions.has(id)) {
    return { ok: false, message: `${name}: Đang chạy rồi!` };
  }

  // Khởi tạo Gemini
  if (settings.geminiApiKey) {
    initGemini(settings.geminiApiKey);
  }

  // Kết nối vào Chrome
  let browser, page;
  try {
    ({ browser, page } = await connectToBrowser(account));
  } catch (err) {
    return { ok: false, message: err.message };
  }

  // Đảm bảo đang ở newsfeed
  const currentUrl = page.url();
  if (!currentUrl.includes('facebook.com')) {
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
    await sleep(2000);
  }

  const stats = {
    postsViewed  : 0,
    postsReacted : 0,
    hotPostsRead : 0,
    startTime    : Date.now(),
    reactions    : { like: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
  };

  behaviorSessions.set(id, { browser, page, running: true, stats });

  // Thông báo bắt đầu
  if (onProgress) onProgress({ accountId: id, name, event: 'start', stats });

  // ── BEHAVIOR LOOP ──
  const session     = behaviorSessions.get(id);
  const duration    = (config.durationMinutes || 10) * 60 * 1000;
  const endTime     = Date.now() + duration;

  while (session.running && Date.now() < endTime) {
    try {
      // Lấy bài viết đang hiển thị
      const posts = await getVisiblePosts(page);

      for (let i = 0; i < posts.length; i++) {
        if (!session.running) break;
        const post = posts[i];

        // Dừng đọc bài — thời gian ngẫu nhiên
        let readTime = rand(
          config.readTimeMin || 3000,
          config.readTimeMax || 10000
        );

        // Bài hot → đọc lâu hơn
        if (post.isHot) {
          readTime = rand(
            config.hotReadTimeMin || 15000,
            config.hotReadTimeMax || 45000
          );
          stats.hotPostsRead++;
          if (onProgress) onProgress({ accountId: id, name, event: 'reading_hot', post, stats });
        }

        stats.postsViewed++;

        // Simulate đọc bài
        await sleep(readTime);

        // Phân tích cảm xúc bằng Gemini
        if (post.text && post.text.length > 20) {
          const emotion = await analyzeEmotion(post.text, config);

          if (emotion !== 'none') {
            const reacted = await reactToPost(page, i, emotion);
            if (reacted) {
              stats.postsReacted++;
              stats.reactions[emotion] = (stats.reactions[emotion] || 0) + 1;
              if (onProgress) onProgress({ accountId: id, name, event: 'reacted', emotion, post, stats });
              await sleep(rand(500, 1500));
            }
          }
        }

        if (!session.running) break;
      }

      // Scroll xuống tiếp
      await scrollNaturally(page, config);

      // Nghỉ giữa các lần scroll
      await sleep(rand(
        config.pauseMin || 2000,
        config.pauseMax || 5000
      ));

    } catch (err) {
      console.error(`Behavior error [${name}]:`, err.message);
      await sleep(3000);
    }
  }

  // Dọn session
  behaviorSessions.delete(id);

  const result = {
    ok     : true,
    name,
    stats,
    message: `${name}: Hoàn thành! Đã xem ${stats.postsViewed} bài, thả ${stats.postsReacted} cảm xúc`,
  };

  if (onProgress) onProgress({ accountId: id, name, event: 'done', stats });

  return result;
}

/**
 * Dừng hành vi của 1 tài khoản
 */
function stopBehavior(accountId) {
  const session = behaviorSessions.get(accountId);
  if (session) {
    session.running = false;
    return true;
  }
  return false;
}

/**
 * Lấy trạng thái đang chạy
 */
function getBehaviorStatus(accountId) {
  const session = behaviorSessions.get(accountId);
  if (!session) return { running: false };
  return {
    running : true,
    stats   : session.stats,
  };
}

function getAllBehaviorStatus() {
  const result = {};
  for (const [id, session] of behaviorSessions) {
    result[id] = { running: session.running, stats: session.stats };
  }
  return result;
}

module.exports = {
  startBehavior,
  stopBehavior,
  getBehaviorStatus,
  getAllBehaviorStatus,
  initGemini,
};