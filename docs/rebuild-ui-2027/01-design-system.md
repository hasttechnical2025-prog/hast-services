# 01 — Design System

Mục tiêu: biến "patchwork" thành **đồng nhất bằng cấu trúc**. Mọi màn hình dùng chung một bộ token + component; quy tắc hiển thị **nhúng vào component** để không thể làm sai.

## 1. Token (design tokens)
Định nghĩa 1 nơi (CSS variables + Tailwind theme), dùng toàn app:
- **Màu**: accent xanh (primary), slate (nền/chữ), semantic: success (emerald), warning (amber), danger (rose), info (blue). **Chỉ sáng — KHÔNG dark mode.**
- **Tier ưu tiên** (đã dùng ở CSKH, chuẩn hoá chung): đỏ (khẩn) → hổ phách (vừa) → xanh (thấp) → xám (nền/backlog).
- **Spacing / radius / shadow**: thang nhất quán (vd radius `lg/xl`, shadow `sm` cho card).
- **Typography**: cỡ chữ bảng `text-xs`, tiêu đề `font-bold text-slate-800`, label `text-[11px] uppercase`.

## 2. Thư viện component dùng chung (ưu tiên dựng ở GĐ0)
Mỗi component "đóng khung" sẵn luật ẩn ở [00 §6](./00-ke-hoach-tong.md#6-luật-ẩn-phải-bảo-toàn-khi-port):

| Component | Trách nhiệm | Luật đóng khung sẵn |
|---|---|---|
| `AppShell` / `AppLayout` | Vỏ: header, nav, chuông, provider, realtime | auth guard, `--head-h`, sticky nav |
| `TabPill` / `TabNav` | Menu cấp (cha/con/cháu) đồng nhất | pill trung tính, active = trắng + ring xanh (chuẩn Thuê/CPC & CSKH) |
| `DataTable` | Bảng danh sách | **sort header bắt buộc**, empty state, loading, phân trang |
| `Money` | Hiển thị tiền | `toLocaleString('vi-VN')`, `Math.round`, VAT `%` |
| `DateField` | Ô chọn ngày | native ẩn + hiển thị `DD/MM/YYYY` (đã có, chuẩn hoá vào DS) |
| `DateText` | Hiển thị ngày read-only | `formatDate` → `DD/MM/YYYY` |
| `Modal` / `Drawer` | Hộp thoại | khóa Esc (theo `NoKeyShortcuts`), scroll an toàn |
| `ConfirmDialog` + `useConfirm` | Xác nhận | KHÔNG `window.confirm` (đã có) |
| `Toast` / `useNotify` | Thông báo | `showNotification` ổn định (`useCallback([])`) |
| `FilterBar` / `Chip` | Lọc | chip tier-màu (chuẩn CSKH), nhãn "Lọc" |
| `StatCard` / KPI row | Thẻ chỉ số | mẫu StatCards hiện có |
| `Dropdown` / `Popover` / `Menu` | Nổi trong bảng/modal | `position:fixed` bám rect (tránh overflow cắt) |
| `ExportCsvButton` | Xuất CSV | đúng dữ liệu đã lọc + BOM UTF-8 |
| `Badge` / `StatusTag` | Nhãn trạng thái | bảng màu semantic chung |
| `SearchInput` | Ô tìm | debounce, chuẩn hoá tiếng Việt (bỏ dấu) |

## 3. Provider / hooks dùng chung (lớp "vỏ")
Bóc khỏi `admin/page.tsx` khổng lồ hiện tại:
- `SessionProvider` — thông tin đăng nhập + role + `roleCanTab/subVisible/tabVisible`.
- `SharedDataProvider` — dữ liệu dùng nhiều nơi: danh sách khách, kho (inventory), users, danh mục, cấu hình. Fetch 1 lần, cung cấp qua context + hàm refetch (ngầm).
- `RealtimeProvider` — đăng ký `useRealtimeRefetch` tập trung ở layout (giữ mount khi điều hướng client-side), bơm refetch tới provider liên quan.
- `NotificationCenter` (chuông) — nhận các "alertSection" từ provider.

> Đây là **việc nền quan trọng nhất và rủi ro nhất**. Có thể làm **Giai đoạn 1 ngay trên `main`** dưới dạng refactor KHÔNG đổi giao diện (shell cũ vẫn dùng provider), để de-risk trước khi chuyển route.

## 4. Quy ước đặt tên & cấu trúc thư mục đề xuất
```
src/
  ui/                 ← Design System (component thuần, không gọi API)
    primitives/       (Button, Input, Badge, Dropdown, Modal, Toast…)
    data/             (DataTable, FilterBar, Chip, StatCard…)
    form/             (DateField, Money, SearchInput…)
    theme/            (tokens.css, tailwind preset)
  features/           ← mỗi module: component + hook gọi API cũ
    giao-viec/ hoan-phieu/ kho-hang/ cong-no/ cskh/ …
  app/v2/             ← route-based shell + các trang (mỏng, ghép feature)
```
`features/*` được dùng lại bởi route `app/v2/*`; `ui/*` không biết gì về nghiệp vụ → tái dùng tối đa, test riêng được.

## 5. Nguyên tắc chất lượng
- Component `ui/*` **không fetch** — nhận data qua props → dễ test, dễ tái dùng.
- Mỗi màn hình responsive tới bề rộng điện thoại (gutter 16px, không tràn ngang).
- Giữ `'use client'` đúng chỗ; tận dụng Server Component cho phần tĩnh nếu an toàn (không vỡ realtime).
