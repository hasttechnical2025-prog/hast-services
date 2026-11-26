# Bộ quy chuẩn Font & Giao diện (Design System) — App HAST

> Dán nguyên file này cho app/AI khác để làm theo. Stack gốc: **Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + TypeScript**. Nếu app kia dùng stack khác, giữ nguyên **giá trị** (font, mã màu, px, bo góc), chỉ đổi cách khai báo.

---

## 1. Font chữ

| Vai trò | Font | Nguồn | Weight dùng |
|---|---|---|---|
| Chữ chính (sans) | **Inter** | `next/font/google`, subsets `["latin","vietnamese"]` | 300, 400, 500, 600, 700 |
| Mã / serial / số đếm (mono) | **Geist Mono** | `next/font/google` | mặc định |

- Khai báo biến CSS: `--font-inter`, `--font-geist-mono`; map vào Tailwind theme: `--font-sans`, `--font-mono`.
- `display: "swap"`, bật `antialiased` trên `<html>`.
- Font-family fallback của body:
  ```
  var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
  ```
- **BẮT BUỘC có subset `vietnamese`** để hiển thị dấu tiếng Việt chuẩn.

```tsx
// layout.tsx
import { Inter, Geist_Mono } from "next/font/google";
const inter = Inter({ variable: "--font-inter", subsets: ["latin","vietnamese"], weight: ["300","400","500","600","700"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// <html className={`${inter.variable} ${geistMono.variable} h-full antialiased`} lang="vi">
```

## 2. Cỡ chữ (quan trọng — app rất "mảnh, gọn")

- **Root `html { font-size: 14px }`** (KHÔNG phải 16px mặc định). Mọi `rem`/`text-*` của Tailwind co lại theo mốc 14.
- Thang cỡ chữ nội dung bảng/danh sách theo **vai trò dữ liệu** (không theo cột), đặt bằng **px tuyệt đối** cho chắc:

| Token | px | Dùng cho |
|---|---|---|
| Thân bảng (`td`) | 12.25px | dữ liệu dòng |
| Tiêu đề cột (`th`) | 10.5px | header bảng |
| `t1` (nhấn/chính) | 12.25px | tên, model, loại việc, tiền |
| `t2` (phụ) | 10.5px | mã máy, địa chỉ, km, thời gian |
| `t3` (nền/meta, badge) | 10px | ghi chú mờ, badge |
| `t-time` (chip giờ) | 8px | chip buổi·giờ |

## 3. Màu sắc

**Nguyên tắc: CHỈ Light Mode — KHÔNG Dark Mode.** Accent = **xanh dương (blue)**, nền trung tính = **slate**.

| Token | Mã màu | Dùng |
|---|---|---|
| `--background` (canvas) | `#f8fafc` (slate-50) | nền toàn app |
| `--foreground` (chữ) | `#0f172a` (slate-900) | chữ chính |
| Theme color (PWA/status bar) | `#1e3a8a` (blue-900) | — |
| Accent chính | `blue-600 #2563eb` / hover `blue-700 #1d4ed8` | nút chính, link, focus |
| Cảnh báo/phá hủy | `red-500 #ef4444` / hover `red-600`; badge `red-500` | xóa, lỗi, đếm số |
| Viền ô nhập | mặc định `slate-200 #e2e8f0`; vùng form đậm hơn `slate-300 #cbd5e1`; focus `blue-500 #3b82f6` | input/select/textarea |
| Nền phụ (secondary) | `slate-100` + chữ `slate-800` | nút phụ nền |
| Viền nút phụ (outline) | `slate-300`, hover `slate-400`, chữ `slate-700`, nền trắng | — |

## 4. Hệ nút 3 cấp (BẮT BUỘC thống nhất)

Dùng `class-variance-authority` (cva). Khung chung:
```
inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium
transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1
disabled:pointer-events-none disabled:opacity-50 select-none
```
| Cấp | Variant | Class |
|---|---|---|
| **Chính** (xanh đặc) | `default` | `bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:scale-[0.99]` |
| **Cảnh báo** | `destructive` | `bg-red-500 text-white hover:bg-red-600 shadow-xs active:scale-[0.99]` |
| **Phụ** (viền) | `outline` | `border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-700 shadow-2xs active:scale-[0.99]` |
| Phụ nền | `secondary` | `bg-slate-100 text-slate-800 hover:bg-slate-200/80 active:scale-[0.99]` |
| Trơn | `ghost` | `hover:bg-slate-100 hover:text-slate-900` |
| Link | `link` | `text-blue-600 underline-offset-4 hover:underline` |

**Size:** `default` = `h-8 px-3 py-1.5` · `sm` = `h-7 px-2.5 text-[11px]` · `lg` = `h-9 px-4 text-sm` · `icon` = `h-8 w-8`.

**Quy ước:** nút "Xuất CSV/Excel" **LUÔN là nút phụ** (outline), không bao giờ xanh đặc. Toolbar: **lọc bên trái · nút hành động bên phải**.

## 5. Ô nhập (Input)

```
flex h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800
placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500
disabled:opacity-50 transition-colors
```
- Bo góc chuẩn: `rounded-md`. Chiều cao chuẩn: `h-8` (nút & input cùng cao để thẳng hàng).

## 6. Tương tác & chuyển động

- Nút nhún nhẹ khi bấm: `active:scale-[0.99]` (hoặc `scale: 0.96` qua thuộc tính `scale`, KHÔNG dùng `transform:scale` để tránh đè translate).
- Tôn trọng `@media (prefers-reduced-motion: reduce)` → tắt scale.

## 7. Quy tắc nghiệp vụ hiển thị (giữ nguyên nếu app tương tự)

- **Tiền tệ:** phân tách hàng nghìn bằng dấu chấm `#.###` qua `value.toLocaleString('vi-VN')`; số thực `Math.round` trước khi format; VAT kèm `%`. KHÔNG áp cho số phiếu/mã.
- **Ngày:** luôn `DD/MM/YYYY`, KHÔNG dùng locale trình duyệt. Ô chọn ngày dùng component `DateField` (native `<input type=date>` ẩn opacity-0 đè lên phần hiển thị DD/MM/YYYY), không dùng `<input type=date>` trần.
- **CSV:** chỉ xuất đúng dữ liệu đang hiển thị sau lọc; ghi **BOM UTF-8** để Excel đọc tiếng Việt.
- **Bảng:** mọi bảng cho bấm tiêu đề cột để sắp xếp (click header to sort).
- **Không phím tắt:** chỉ click nút mới có tác dụng; Enter/Esc không submit/hủy hộ (trừ `<textarea>`, bộ gõ tiếng Việt, và vùng `data-allow-enter` như form đăng nhập).
- **Xác nhận:** dùng dialog in-app (hook `useConfirm()` + `ConfirmDialog`), KHÔNG `window.confirm`.

## 8. PWA / Mobile

- Viewport: `width=device-width, initialScale=1, maximumScale=1, userScalable=false, viewportFit=cover`.
- Chặn double-tap zoom: `body { touch-action: pan-x pan-y; -webkit-text-size-adjust: 100% }`.
- Dùng `env(safe-area-inset-*)` cho thanh nav đáy (tránh home indicator iPhone).
- `appleWebApp: { capable: true, title: "<TÊN NGẮN>", statusBarStyle: "default" }`.

---
*Nguồn: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `AGENTS.md` của app HAST.*
