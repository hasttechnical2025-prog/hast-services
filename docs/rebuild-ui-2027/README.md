# Rebuild UI 2027 — Tài liệu kế hoạch

Phiên bản giao diện mới cho "Sổ công tác" (mục tiêu golive ~2027), **giữ nguyên database + toàn bộ nghiệp vụ / API**, chỉ **làm mới lớp UI** theo kiến trúc **route-based** (mỗi module có URL riêng → chuột phải mở tab mới được), trên một **Design System thống nhất**.

## Mục lục
1. [00-ke-hoach-tong.md](./00-ke-hoach-tong.md) — Mục tiêu, nguyên tắc, chiến lược, quy trình an toàn, lộ trình.
2. [01-design-system.md](./01-design-system.md) — Token + thư viện component dùng chung + quy tắc hiển thị "đóng khung".
3. [02-modules-va-route.md](./02-modules-va-route.md) — Kiểm kê module, cây route đề xuất, thứ tự port, checklist parity.

## Bối cảnh đã chốt với chủ dự án (để session mới nắm nhanh)
- **Giữ nguyên**: Supabase (mọi bảng `soct_*`), toàn bộ `src/app/api/*` + `src/lib/*` (nghiệp vụ + các fix xương máu). **KHÔNG rewrite lớp này.**
- **Làm mới**: chỉ lớp UI/component.
- **Dữ liệu liên tục**: app không reset theo năm; "2027" chỉ là UI mới trên **cùng một DB** → **không có migrate dữ liệu, không có cutover dữ liệu**.
- **Cách làm**: KHÔNG big-bang rewrite. Dựng Design System → vỏ route → **port từng module**, **chạy song song** bản cũ (`/admin`) và bản mới (`/v2`) trên production, **đổi mặc định khi đủ parity**, rồi khoá bản cũ.
- **Không ép deadline 31/12**: cutover theo từng module khi đã chứng minh đúng (vì dữ liệu đã liên tục).
- Quy ước repo: "**commit là push lên production**" → **mọi việc rebuild phải nằm trên NHÁNH riêng**, không làm trên `main`. Tài liệu này có thể ở `main` (chỉ là docs).

## Tiếp tục ở session mới
Tài liệu nằm trong repo nên session mới mở tại thư mục dự án này đọc được ngay. Gợi ý câu mở đầu session mới:
> "Đọc `docs/rebuild-ui-2027/` và memory `rebuild-ui-2027`, rồi tiếp tục hoàn thiện kế hoạch / bắt đầu Giai đoạn 0 (Design System) trên nhánh `feat/ui-2027`."

## Trạng thái
- [x] Khung kế hoạch (3 tài liệu) — bản nháp đầu, **chờ chủ dự án duyệt**.
- [ ] Hoàn thiện kiểm kê module cấp 3 bằng khảo sát code (session mới).
- [ ] Chốt cây route + tên URL.
- [ ] Bắt đầu Giai đoạn 0: Design System + vỏ route (nhánh `feat/ui-2027`).
