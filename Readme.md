# FB Account Manager v3.0
> Quản lý nhiều tài khoản Facebook — Mở Chrome Profile thật, lịch tự động, không bị CAPTCHA

---

## Mục lục
- [Tính năng](#tính-năng)
- [Cấu trúc project](#cấu-trúc-project)
- [Cài đặt & Chạy](#cài-đặt--chạy)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
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
│   ├── autologin.js      ← Mở Chrome Profile (spawn process)
│   └── scheduler.js      ← Hệ thống lên lịch tự động (node-cron)
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

### 1. Thêm tài khoản

1. Bấm **"+ Thêm tài khoản"**
2. Điền thông tin: Tên, Email, Mật khẩu, SĐT
3. Ở ô **Profile Directory** → bấm **🔍 Chọn** để chọn đúng Chrome Profile
4. Chọn màu, nhãn, nhóm → bấm **Lưu**

### 2. Tìm Profile Directory của Chrome Profile

**Cách 1 — Dùng nút 🔍 Chọn trong app** (khuyên dùng)
- Bấm "🔍 Chọn" → app tự quét và hiện danh sách profile trên máy

**Cách 2 — Tìm thủ công**
- Mở Chrome → vào profile muốn dùng → truy cập `chrome://version`
- Xem dòng **"Profile Path"** → lấy tên thư mục cuối (VD: `Profile 3`)

**Cách 3 — Xem trong File Explorer**
```
Windows: C:\Users\<tên>\AppData\Local\Google\Chrome\User Data\
```
Các thư mục như `Default`, `Profile 1`, `Profile 2`... chính là profileDir

### 3. Mở Facebook

- Bấm **"⚡ Mở Facebook"** trên card tài khoản
- Chrome sẽ mở đúng profile được gán
- Nếu đã đăng nhập sẵn → vào thẳng Facebook
- Nếu chưa → đăng nhập thủ công 1 lần → lần sau tự động

### 4. Đặt lịch tự động

1. Bấm **"⏰ Lịch tự động"** trên card tài khoản
2. Bật toggle **"Bật lịch tự động"**
3. Chọn ngày trong tuần (T2-CN)
4. Thêm khung giờ hoạt động (VD: 8:00 - 11:00, 14:00 - 17:00)
5. Đặt tần suất mở lại (VD: mỗi 30 phút)
6. Bấm **"💾 Lưu lịch"**

> Lịch sẽ tự restore khi restart server

### 5. Mở nhiều tài khoản cùng lúc

1. Tick chọn các tài khoản muốn mở
2. Bấm **"⚡ Mở tất cả"** trong thanh bulk action
3. Các tài khoản sẽ mở tuần tự theo độ trễ đã cài (Settings)

### 6. Quản lý nhóm

- Vào tab **Nhóm** → thêm nhóm với icon và màu sắc
- Khi thêm/sửa tài khoản → gán vào nhóm tương ứng
- Có thể filter tài khoản theo nhóm

### 7. Export / Import dữ liệu

- **Xuất JSON**: Cài đặt → "Xuất toàn bộ dữ liệu" → tải file `db.json`
- **Nhập JSON**: Bấm "⬆ Nhập JSON" → chọn file backup
- Dữ liệu lưu tại `data/db.json` — không mất khi tắt server

### 8. Cài đặt Chrome Path

Vào **Cài đặt** → điền đường dẫn Chrome:

| OS | Đường dẫn mặc định |
|---|---|
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Linux | `/usr/bin/google-chrome` |

---

## API Endpoints

| Method | URL | Mô tả |
|---|---|---|
| GET | /api/accounts | Lấy danh sách tài khoản |
| POST | /api/accounts | Thêm tài khoản |
| PUT | /api/accounts/:id | Sửa tài khoản |
| DELETE | /api/accounts/:id | Xóa tài khoản |
| GET | /api/groups | Lấy danh sách nhóm |
| POST | /api/groups | Thêm nhóm |
| PUT | /api/groups/:id | Sửa nhóm |
| DELETE | /api/groups/:id | Xóa nhóm |
| GET | /api/history | Lấy lịch sử |
| DELETE | /api/history | Xóa lịch sử |
| GET | /api/settings | Lấy cài đặt |
| PUT | /api/settings | Lưu cài đặt |
| POST | /api/autologin | Mở 1 tài khoản |
| POST | /api/open-many | Mở nhiều tài khoản |
| GET | /api/chrome-profiles | Quét Chrome Profile trên máy |
| GET | /api/scheduler/:id | Lấy lịch của 1 tài khoản |
| POST | /api/scheduler/:id | Đặt lịch cho 1 tài khoản |
| DELETE | /api/scheduler/:id | Xóa lịch |
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

### v3.0 — Stable + Scheduler *(hiện tại)*
- **Bỏ Puppeteer** → dùng `spawn()` mở Chrome Profile thật
- Không bị CAPTCHA, không bị Facebook detect
- Thêm **🔍 Quét Chrome Profile** tự động
- Thêm **⏰ Scheduler** đặt lịch theo khung giờ
- Fix lỗi EPERM (Windows file lock) trong `writeDB`
- Fix duplicate modal, cấu trúc HTML chuẩn

---

## Roadmap

### Phase 2 — Giả lập hành vi (đang lên kế hoạch)
- Scroll newsfeed tốc độ ngẫu nhiên
- Dừng đọc bài theo độ hot (like/comment)
- Thả cảm xúc thông minh bằng AI (Claude API)
- Đọc comment theo thời gian tuỳ chỉnh

### Phase 3 — Định hướng nội dung
- Keyword/Hashtag targeting
- Comment thông minh bằng AI
- Warm-up tài khoản mới theo lộ trình

### Phase 4 — Dashboard & Analytics
- Dashboard realtime theo dõi hoạt động
- Health score từng tài khoản
- Báo cáo tuần tự động

---

## Lưu ý quan trọng

### Về Chrome Profile
- Mỗi tài khoản Facebook **phải gán đúng Profile Directory** riêng
- Không dùng chung 1 profile cho 2 tài khoản khác nhau
- Lần đầu mở profile mới → đăng nhập Facebook thủ công 1 lần → lần sau tự động

### Về bảo mật
- Mật khẩu lưu dạng plain text trong `db.json` — **không chia sẻ file này**
- Backup thường xuyên bằng chức năng "Xuất JSON"
- Không commit `db.json` lên Git

### Về proxy
- Với 1-5 tài khoản cá nhân: **không cần proxy**
- Với 5-15 tài khoản: nên dùng sim 4G riêng cho mỗi tài khoản
- Với 15+ tài khoản: cần residential proxy VN

### Về lịch tự động
- Scheduler chạy ngầm — **không tắt terminal** khi đang dùng scheduler
- Lịch tự restore khi restart server nhờ `schedulerConfig` lưu trong `db.json`
- Nên đặt khung giờ giống giờ người thật dùng FB (8-11h, 14-17h, 20-22h)

---

## Troubleshooting

**Lỗi `Cannot find module './autologin'`**
→ Kiểm tra tên file: phải là `autologin.js` (toàn chữ thường)

**Lỗi `EPERM: operation not permitted`**
→ Chuột phải `db.json` → Properties → bỏ tick Read-only
→ Hoặc tắt Windows Defender Real-time Protection tạm thời

**Lỗi `Cannot find module './scheduler'`**
→ Kiểm tra tên file: phải là `scheduler.js` (toàn chữ thường, không phải `Scheduler.JS`)
→ Đổi tên bằng lệnh:
```powershell
Rename-Item "server\Scheduler.JS" "server\scheduler_temp.js"
Rename-Item "server\scheduler_temp.js" "server\scheduler.js"
```

**Chrome không mở được**
→ Vào Cài đặt → kiểm tra đường dẫn Chrome có đúng không
→ Thử chạy thủ công: `"C:\Program Files\Google\Chrome\Application\chrome.exe"`

**Không thấy nút 🔍 Chọn Profile**
→ Xóa cache trình duyệt: `Ctrl + Shift + R`

---

*Developed by Tùng — FB Account Manager v3.0*