# FB Account Manager v3.0
> Quản lý nhiều tài khoản Facebook — Mở Chrome Profile thật, lịch tự động, giả lập hành vi AI, không bị CAPTCHA

---

## Mục lục
- [Tính năng](#tính-năng)
- [Cấu trúc project](#cấu-trúc-project)
- [Cài đặt & Chạy](#cài-đặt--chạy)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
- [API Endpoints](#api-endpoints)
- [Lịch sử phát triển](#lịch-sử-phát-triển)
- [Roadmap](#roadmap)
- [Lưu ý quan trọng](#lưu-ý-quan-trọng)

---

## Tính năng

### ✅ Đã hoàn thành (v3.0)

| Tính năng | Mô tả |
|---|---|
| 🗂 Quản lý tài khoản | Thêm, sửa, xóa tài khoản Facebook |
| 👥 Nhóm tài khoản | Phân loại theo chiến dịch / dự án |
| 🚀 Mở Chrome Profile | Mở đúng profile Chrome riêng cho từng tài khoản |
| 🔍 Quét Chrome Profile | Tự động đọc danh sách profile có trên máy |
| ⏰ Lịch tự động | Đặt giờ tự động mở tài khoản theo khung giờ |
| 🔴 Tự đóng Chrome | Tự động đóng Chrome khi hết khung giờ lịch |
| 🤖 Giả lập hành vi AI | Tự động scroll, đọc bài, thả cảm xúc bằng Gemini AI |
| 📋 Lịch sử hoạt động | Theo dõi các thao tác đã thực hiện |
| 📦 Export / Import JSON | Backup và restore dữ liệu |
| 🌙 Dark / Light mode | Chuyển đổi giao diện |
| 🔒 Không bị CAPTCHA | Dùng Chrome Profile thật, không dùng Puppeteer để đăng nhập |

---

## Cấu trúc project

```
fb-manager-v2/
├── server/
│   ├── index.js          ← Backend Express API
│   ├── autologin.js      ← Mở/đóng Chrome Profile (spawn process, lưu PID)
│   ├── scheduler.js      ← Hệ thống lên lịch (mở + tự đóng Chrome)
│   └── behavior.js       ← Giả lập hành vi FB (Puppeteer + Gemini AI)
├── public/
│   ├── index.html        ← Giao diện chính
│   ├── css/
│   │   ├── variables.css ← CSS variables (màu sắc, spacing)
│   │   ├── layout.css    ← Layout tổng thể, sidebar
│   │   └── components.css← Buttons, cards, modals, toasts
│   └── js/
│       ├── api.js        ← Gọi REST API từ server
│       ├── utils.js      ← Helpers, Toast, Confirm dialog
│       ├── accounts.js   ← Module quản lý tài khoản
│       └── pages.js      ← Module nhóm, lịch sử, cài đặt
├── data/
│   └── db.json           ← File lưu dữ liệu (tự tạo khi chạy)
├── package.json
└── README.md
```

---

## Cài đặt & Chạy

### Yêu cầu
- Node.js v18+ (tải tại https://nodejs.org — chọn LTS)
- Google Chrome đã cài trên máy

### Bước 1 — Cài dependencies
```bash
cd fb-manager-v2
npm install
```

### Bước 2 — Chạy server
```bash
npm start
```

### Bước 3 — Mở trình duyệt
```
http://localhost:3000
```

> Muốn tự reload khi sửa code: `npm run dev`

---

## Hướng dẫn sử dụng

### 1. Thêm tài khoản mới

#### Bước 1: Tạo Chrome Profile mới
1. Mở Chrome → click **avatar góc trên phải** → chọn **"Thêm"**
2. Đặt tên profile (VD: "FB Account 1") → Chrome tạo thư mục `Profile 1`, `Profile 2`...

#### Bước 2: Đăng nhập Facebook trong profile đó
1. Vào `facebook.com` trong profile vừa tạo
2. Đăng nhập thủ công bằng tài khoản FB muốn quản lý
3. Để FB load hoàn toàn (thấy newsfeed)

#### Bước 3: Tìm tên Profile Directory
- Vào `chrome://version` trong Chrome → xem dòng **"Profile Path"**
- Lấy tên thư mục cuối: VD `Profile 1`, `Profile 2`, `Default`

#### Bước 4: Thêm vào FB Manager
1. Bấm **"+ Thêm tài khoản"**
2. Điền: Tên, Email, Mật khẩu, SĐT
3. Ô **Profile Directory** → nhập `Profile 1` hoặc bấm **🔍 Chọn** để tự quét
4. Chọn màu, nhãn, nhóm → bấm **Lưu**

> ⚠️ Mỗi tài khoản FB phải dùng **1 Profile Chrome riêng biệt** — không dùng chung profile cho 2 tài khoản.

---

### 2. Mở Facebook

- Bấm **"⚡ Mở Facebook"** trên card tài khoản
- Chrome mở đúng profile được gán, vào thẳng Facebook

> Chrome mở bằng lệnh: `chrome.exe --profile-directory="Profile 1" --remote-debugging-port=9223 https://www.facebook.com`

---

### 3. Giả lập hành vi (🤖 AI)

Tính năng tự động scroll newsfeed, đọc bài, và thả cảm xúc bằng Gemini AI.

#### Cách dùng:
1. **Bấm "⚡ Mở Facebook" trước** để Chrome đang chạy với profile đó
2. Bấm **"🤖 Giả lập hành vi"**
3. Điền Gemini API Key (lấy miễn phí tại https://aistudio.google.com/apikey)
4. Cấu hình thời gian chạy, tỉ lệ thả cảm xúc
5. Bấm **"🤖 Bắt đầu giả lập"**

#### Cơ chế hoạt động:
- Kết nối CDP vào Chrome thật đang chạy → lấy cookies session FB
- Launch Chrome riêng (Puppeteer) với cookies đã inject → vào FB đã đăng nhập
- Scroll newsfeed tốc độ ngẫu nhiên
- Đọc từng bài theo thời gian ngẫu nhiên (3–10 giây bài thường, 15–40 giây bài hot)
- Bỏ qua quảng cáo tự động
- Gemini AI phân tích nội dung → chọn cảm xúc phù hợp (Like/Haha/Wow/Buồn/Phẫn nộ)

#### Cấu hình chi tiết:
| Tham số | Mô tả | Mặc định |
|---|---|---|
| Thời gian chạy | Bao nhiêu phút giả lập | 10 phút |
| Tỉ lệ thả cảm xúc | % bài được thả cảm xúc | 40% |
| Thời gian đọc tối thiểu | ms dừng đọc mỗi bài | 3000ms |
| Thời gian đọc tối đa | ms dừng đọc mỗi bài | 10000ms |

---

### 4. Đặt lịch tự động

1. Bấm **"⏰ Lịch"** trên card tài khoản
2. Bật toggle **"Bật lịch tự động"**
3. Chọn ngày trong tuần (T2–CN)
4. Thêm khung giờ hoạt động (VD: 8:00–11:00, 14:00–17:00)
5. Đặt tần suất mở lại (VD: mỗi 30 phút)
6. Bật **"🤖 Kết hợp giả lập hành vi"** nếu muốn AI chạy tự động
7. Bấm **"💾 Lưu lịch"**

#### Hành vi khi hết khung giờ (tính năng mới):

Khi đến giờ kết thúc khung giờ (VD: 14:00), hệ thống sẽ **tự động**:
1. Dừng giả lập hành vi nếu đang chạy
2. Đóng Chrome của tài khoản đó (`taskkill /T /F` trên Windows)
3. Cập nhật trạng thái tài khoản về **Offline**
4. Ghi vào lịch sử: `scheduler_close`

> Lịch sẽ tự restore khi restart server nhờ `schedulerConfig` lưu trong `db.json`

#### Ví dụ khung giờ 13:00–14:00, interval 10 phút:
```
13:00 → Mở Chrome + chạy behavior
13:10 → Mở lại Chrome + chạy behavior
13:20 → ...
14:00 → Hết khung giờ → TỰ ĐÓNG Chrome ✅
```

---

### 5. Mở nhiều tài khoản cùng lúc

1. Tick chọn các tài khoản muốn mở
2. Bấm **"⚡ Mở tất cả"** trong thanh bulk action
3. Các tài khoản sẽ mở tuần tự theo độ trễ đã cài (Settings)

---

### 6. Quản lý nhóm

- Vào tab **Nhóm** → thêm nhóm với icon và màu sắc
- Khi thêm/sửa tài khoản → gán vào nhóm tương ứng
- Có thể filter tài khoản theo nhóm

---

### 7. Export / Import dữ liệu

- **Xuất JSON**: Header → "⬇ Xuất JSON" → tải file `db.json`
- **Nhập JSON**: Bấm "⬆ Nhập JSON" → chọn file backup
- Dữ liệu lưu tại `data/db.json` — không mất khi tắt server

---

### 8. Cài đặt Chrome Path

Vào **Cài đặt** → điền đường dẫn Chrome:

| OS | Đường dẫn mặc định |
|---|---|
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Linux | `/usr/bin/google-chrome` |

---

## API Endpoints

### Accounts
| Method | URL | Mô tả |
|---|---|---|
| GET | /api/accounts | Lấy danh sách tài khoản |
| POST | /api/accounts | Thêm tài khoản |
| PUT | /api/accounts/:id | Sửa tài khoản |
| DELETE | /api/accounts/:id | Xóa tài khoản |

### Groups
| Method | URL | Mô tả |
|---|---|---|
| GET | /api/groups | Lấy danh sách nhóm |
| POST | /api/groups | Thêm nhóm |
| PUT | /api/groups/:id | Sửa nhóm |
| DELETE | /api/groups/:id | Xóa nhóm |

### History & Settings
| Method | URL | Mô tả |
|---|---|---|
| GET | /api/history | Lấy lịch sử |
| DELETE | /api/history | Xóa lịch sử |
| GET | /api/settings | Lấy cài đặt |
| PUT | /api/settings | Lưu cài đặt |

### Chrome Control
| Method | URL | Mô tả |
|---|---|---|
| POST | /api/autologin | Mở Chrome 1 tài khoản (lưu PID) |
| POST | /api/open-many | Mở nhiều tài khoản |
| POST | /api/close-chrome | Đóng Chrome 1 tài khoản |
| POST | /api/close-all-chrome | Đóng tất cả Chrome |
| GET | /api/chrome-profiles | Quét Chrome Profile trên máy |
| GET | /api/sessions | Xem sessions đang chạy |

### Scheduler
| Method | URL | Mô tả |
|---|---|---|
| GET | /api/scheduler/:id | Lấy lịch + log của 1 tài khoản |
| POST | /api/scheduler/:id | Đặt lịch cho 1 tài khoản |
| DELETE | /api/scheduler/:id | Xóa lịch |
| GET | /api/scheduler | Lấy tất cả lịch |

### Behavior (Giả lập hành vi)
| Method | URL | Mô tả |
|---|---|---|
| POST | /api/behavior/start | Bắt đầu giả lập |
| POST | /api/behavior/stop | Dừng giả lập |
| GET | /api/behavior/status/:id | Trạng thái 1 tài khoản |
| GET | /api/behavior/status | Trạng thái tất cả |

### Data
| Method | URL | Mô tả |
|---|---|---|
| GET | /api/export | Tải file JSON |
| POST | /api/import | Nhập file JSON |
| DELETE | /api/clear-all | Xóa toàn bộ dữ liệu |

---

## Lịch sử phát triển

### v1.0 — In-memory
- Quản lý tài khoản cơ bản, lưu RAM (mất khi tắt)

### v2.0 — JSON Storage
- Chuyển sang lưu `data/db.json`
- Thêm nhóm, lịch sử, cài đặt
- Mở Chrome Profile bằng `exec()`
- Tích hợp Puppeteer tự đăng nhập (bị CAPTCHA)

### v3.0 — Stable + Scheduler + AI Behavior *(hiện tại)*
- **Bỏ Puppeteer đăng nhập** → dùng `spawn()` mở Chrome Profile thật
- **Lưu PID process** → có thể đóng Chrome từ xa
- **Không bị CAPTCHA**, không bị Facebook detect
- **🔍 Quét Chrome Profile** tự động
- **⏰ Scheduler** đặt lịch theo khung giờ
- **🔴 Tự đóng Chrome** khi hết khung giờ (`taskkill /T /F`)
- **🤖 Giả lập hành vi AI**: scroll, đọc bài, thả cảm xúc bằng Gemini
  - Lấy cookies từ Chrome thật qua CDP → inject vào Puppeteer riêng
  - Bỏ qua quảng cáo tự động
  - Phân tích nội dung bài bằng Gemini 2.0 Flash
  - Hỗ trợ bài "hot" (đọc lâu hơn)
- Fix lỗi EPERM (Windows file lock) trong `writeDB`
- Fix duplicate modal, cấu trúc HTML chuẩn

---

## Roadmap

### Phase 2 — Giả lập hành vi nâng cao
- Comment thông minh bằng AI
- Warm-up tài khoản mới theo lộ trình
- Keyword/Hashtag targeting

### Phase 3 — Dashboard & Analytics
- Dashboard realtime theo dõi hoạt động
- Health score từng tài khoản
- Báo cáo tuần tự động

---

## Lưu ý quan trọng

### Về Chrome Profile
- Mỗi tài khoản Facebook **phải gán đúng Profile Directory** riêng
- Không dùng chung 1 profile cho 2 tài khoản khác nhau
- Lần đầu mở profile mới → đăng nhập Facebook thủ công 1 lần → lần sau tự động

### Về Giả lập hành vi
- **Cần bấm "⚡ Mở Facebook" trước** để Chrome đang chạy, sau đó mới chạy giả lập
- Gemini AI sẽ đọc nội dung bài và chọn cảm xúc phù hợp
- Không có Gemini API Key → vẫn chạy được nhưng cảm xúc random
- Lấy API Key miễn phí tại https://aistudio.google.com/apikey (model: gemini-2.0-flash)

### Về Lịch tự động
- Scheduler chạy ngầm — **không tắt terminal** khi đang dùng scheduler
- Khi hết khung giờ, Chrome **tự động đóng** (tính năng mới v3.0)
- Lịch tự restore khi restart server
- Nên đặt khung giờ giống giờ người thật dùng FB (8–11h, 14–17h, 20–22h)

### Về bảo mật
- Mật khẩu lưu dạng plain text trong `db.json` — **không chia sẻ file này**
- Backup thường xuyên bằng chức năng "Xuất JSON"
- Không commit `db.json` lên Git

### Về proxy
- Với 1–5 tài khoản cá nhân: **không cần proxy**
- Với 5–15 tài khoản: nên dùng sim 4G riêng cho mỗi tài khoản
- Với 15+ tài khoản: cần residential proxy VN

---

## Troubleshooting

**Lỗi `Cannot find module './autologin'`**
→ Kiểm tra tên file: phải là `autologin.js` (toàn chữ thường)

**Lỗi `EPERM: operation not permitted`**
→ Chuột phải `db.json` → Properties → bỏ tick Read-only

**Chrome không mở được**
→ Vào Cài đặt → kiểm tra đường dẫn Chrome có đúng không

**Giả lập hành vi báo "Chưa đăng nhập"**
→ Bấm "⚡ Mở Facebook" trước → đăng nhập thủ công trong profile đó → chạy lại giả lập

**Chrome không tự đóng khi hết khung giờ**
→ Kiểm tra đã dùng file `autologin.js` mới chưa (cần `detached: false`, không có `unref()`)
→ Trên Windows cần quyền `taskkill` — thử chạy terminal với quyền Admin

**Không thấy nút 🔍 Chọn Profile**
→ Xóa cache trình duyệt: `Ctrl + Shift + R`

---

*Developed by Tùng — FB Account Manager v3.0*