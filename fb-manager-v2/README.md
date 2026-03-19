# FB Account Manager v2.0
> Lưu dữ liệu vào `data/db.json` + Mở đúng Chrome Profile cho từng tài khoản

---

## Cấu trúc project

```
fb-manager-v2/
├── server/
│   └── index.js          ← Backend Node.js (Express API)
├── public/               ← Frontend (giao diện web)
│   ├── index.html
│   ├── css/
│   │   ├── variables.css
│   │   ├── layout.css
│   │   └── components.css
│   └── js/
│       ├── api.js         ← Gọi REST API từ server
│       ├── utils.js       ← Helpers + Toast + Confirm
│       ├── accounts.js    ← Module tài khoản
│       └── pages.js       ← Nhóm, Lịch sử, Cài đặt, App
├── data/
│   └── db.json            ← FILE LƯU DỮ LIỆU (tự tạo khi chạy)
├── package.json
└── README.md
```

---

## Cách chạy (3 bước)

### Bước 1 — Cài Node.js
Tải tại: https://nodejs.org (chọn LTS)

### Bước 2 — Mở terminal trong VS Code
```
Ctrl + ` (backtick)
```

### Bước 3 — Chạy lệnh
```bash
# Di chuyển vào thư mục project
cd fb-manager-v2

# Cài dependencies (chỉ cần làm 1 lần)
npm install

# Khởi động server
npm start
```

Mở trình duyệt tại: **http://localhost:3000**

> Muốn tự reload khi sửa code: `npm run dev` (dùng nodemon)

---

## Cách mở đúng Chrome Profile

Mỗi tài khoản Facebook được gán một **Profile Directory** riêng (VD: `Profile 1`, `Profile 2`...).

Khi bấm **"Mở"**, server sẽ chạy lệnh:
```
chrome.exe --profile-directory="Profile 1" https://www.facebook.com
```

→ Chrome mở **đúng thẻ riêng**, không dùng chung cookies với tài khoản khác.

### Cách tạo Chrome Profile mới
1. Mở Chrome → click avatar góc trên phải
2. Chọn **"Thêm"** → đặt tên (VD: "Facebook A")
3. Chrome tạo thư mục `Profile 2`, `Profile 3`... trong User Data

### Cấu hình đường dẫn Chrome
Vào **Cài đặt** → nhập đường dẫn Chrome:

| Hệ điều hành | Đường dẫn mặc định |
|---|---|
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Linux | `/usr/bin/google-chrome` |

---

## Dữ liệu lưu ở đâu?

File `data/db.json` — **không mất khi tắt server**.

```json
{
  "accounts": [...],
  "groups": [...],
  "history": [...],
  "settings": {...}
}
```

Backup: **Cài đặt → Xuất JSON** để tải file về máy bất cứ lúc nào.

---

## API Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | /api/accounts | Lấy danh sách tài khoản |
| POST | /api/accounts | Thêm tài khoản |
| PUT | /api/accounts/:id | Sửa tài khoản |
| DELETE | /api/accounts/:id | Xóa tài khoản |
| POST | /api/open | Mở 1 tài khoản (Chrome) |
| POST | /api/open-many | Mở nhiều tài khoản |
| GET | /api/export | Tải file JSON |
| GET/PUT | /api/settings | Đọc/lưu cài đặt |
