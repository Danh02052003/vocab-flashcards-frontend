# Vocab Flashcards Frontend (CRA)

Frontend React (Create React App, JavaScript + JSX) cho backend FastAPI vocabulary app.

## 1. Yêu cầu
- Node.js 18+
- Backend đang chạy (mặc định `http://localhost:8000`)
- Backend phải truy cập được:
  - `GET /openapi.json`
  - `GET /docs`

## 2. Cấu hình môi trường
Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Nội dung:

```env
REACT_APP_API_BASE_URL=http://localhost:8000
```

## 3. Chạy ứng dụng

```bash
npm install
npm start
```

Mở: `http://localhost:3000`

## 4. Build production

```bash
npm run build
```

## 5. Kiến trúc chính

```text
src/
  api/
    base.js
    openapi.js
    client.js
  pages/
    Add.jsx
    Review.jsx
    List.jsx
    Sync.jsx
    Advanced.jsx
  components/
    Nav.jsx
    Toast.jsx
    Spinner.jsx
    ErrorState.jsx
    ChipInput.jsx
    GradeBar.jsx
    Modal.jsx
  utils/
    fuzzy.js
    date.js
    storage.js
  App.jsx
  index.js
```

## 6. Cách hoạt động OpenAPI-driven
- App tự fetch `{{BASE_URL}}/openapi.json` khi mở.
- Tự discover các endpoint core (`vocab`, `review`, `session`, `ai`, `sync`) theo tag/path/operationId.
- Nếu fetch OpenAPI lỗi: hiển thị lỗi thân thiện + nút `Retry` + BASE_URL hiện tại.
- Trang `Advanced` auto-generate explorer/try-it để gọi toàn bộ endpoint backend (kể cả endpoint mới).

## 7. Mô tả trang
- `Add`: thêm từ, AI enrich, merge gợi ý AI an toàn.
- `Review`: session hôm nay, mode flip/mcq/typing, phím `0..5` để chấm nhanh.
- `List`: search/filter, xem chỉ số SRS, edit/delete.
- `Sync`: export/import JSON sync.
- `Advanced`: OpenAPI explorer + execute request.

## 8. Lưu ý debug nhanh
- Nếu báo không tải được OpenAPI:
  1. Kiểm tra backend có chạy không.
  2. Mở thử `http://localhost:8000/openapi.json` trực tiếp.
  3. Kiểm tra `REACT_APP_API_BASE_URL` trong `.env`.
- Nếu CORS lỗi: xác nhận backend đã allow `http://localhost:3000`.

## 9. Không commit secrets
- `.env` đã nằm trong `.gitignore`.
- Chỉ commit `.env.example`.
