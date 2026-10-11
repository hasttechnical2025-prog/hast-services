# 00 — Kế hoạch tổng

## 1. Mục tiêu
- Giao diện **thống nhất, sạch, hiện đại**, thay thế bản hiện tại (chắp vá qua nhiều đợt ý tưởng → thiếu nhất quán).
- **Route-based**: mỗi module/tab có URL riêng → chuột phải "mở link ở tab mới", bookmark, back/forward trình duyệt, tách code theo route (tải nhanh hơn).
- **Không đụng dữ liệu & nghiệp vụ**: rủi ro bằng 0 về dữ liệu.

## 2. Nguyên tắc nền (bất di bất dịch)
1. **Data & nghiệp vụ ở backend, không ở UI.** Giữ nguyên `src/app/api/*`, `src/lib/*`, Supabase. UI mới **gọi lại đúng API cũ**.
2. **Không rewrite API.** Mọi fix xương máu đang nằm ở đó (xem mục 6). Rewrite = tự đập đi dựng lại từng cái bẫy.
3. **Strangler, không big-bang.** Dựng nền → port từng module → chạy song song → đổi mặc định → khoá bản cũ.
4. **Luôn có đường lùi.** Bản cũ sống song song cho tới khi bản mới đạt parity toàn bộ.
5. **Đồng nhất bằng cấu trúc, không bằng kỷ luật.** Quy tắc hiển thị (tiền, ngày, sort, chặn Enter, CSV BOM) nhúng vào component dùng chung, không "nhớ làm đúng" từng màn.

## 3. GIỮ vs LÀM MỚI
| Lớp | Xử lý |
|---|---|
| Supabase (bảng `soct_*`, trigger, RLS) | **GIỮ 100%** |
| `src/app/api/*` (route handlers) | **GIỮ 100%** (tái dùng) |
| `src/lib/*` (session, config, realtime, supabase-admin, selectAll, ai…) | **GIỮ** (bổ sung nếu cần) |
| Component UI (`src/components/*`, `src/app/admin/page.tsx` …) | **LÀM MỚI** trên Design System |
| Vỏ ứng dụng (header, chuông, auth guard, provider, realtime wiring) | **LÀM MỚI** dưới dạng layout route |

> Lưu ý: nhiều "logic nghiệp vụ" đang **lẫn trong component** (validation, format, confirm, realtime, quy tắc CLAUDE.md). Khi port phải **bê logic này sang có chủ đích**, không chỉ "vẽ lại màn hình".

## 4. Chiến lược chạy song song (giảm rủi ro cutover)
- Vì **chung một DB**, bản cũ `/admin` và bản mới (đề xuất base `/v2`) **sống cùng lúc trên production**.
- Office dùng thử bản mới **từng module**; sai thì quay lại `/admin` ngay.
- Khi một nhóm module đạt parity → **đổi mặc định** sang bản mới cho nhóm đó.
- Khi toàn bộ đạt parity + dogfood ổn → **khoá `/admin`** (chỉ còn redirect sang `/v2`).
- 2 UI ghi cùng DB là an toàn (giống nhiều office ghi đồng thời hôm nay) **vì cùng gọi 1 lớp API** đã kiểm soát nghiệp vụ.

## 5. Quy trình an toàn (process)
1. **Nhánh riêng** `feat/ui-2027` (KHÔNG làm trên `main`; `main` = production).
2. **Vercel Preview** tự dựng URL cho nhánh → cả team test song song.
3. **Staging Supabase**: 1 project Supabase free thứ 2, nạp từ pg_dump gần nhất + chạy đủ migration; biến môi trường **scope Preview** trỏ về staging → test phá hủy thoải mái, không chạm prod. (Golive thì đổi env về Supabase production.)
4. **Tag quay lui** `pre-ui-2027` trên `main` trước mỗi lần promote; đảm bảo có bản dump mới.
5. **Cổng parity**: mỗi module phải qua [checklist parity](./02-modules-va-route.md#checklist-parity) trước khi thành mặc định.

## 6. "Luật ẩn" phải bảo toàn khi port (trích từ memory + CLAUDE.md)
Danh sách này là **điểm dễ vỡ** — khi port UI phải giữ đúng:
- **Tiền**: `toLocaleString('vi-VN')`, số thực `Math.round` trước format, VAT kèm `%`; **không** áp cho Số phiếu / mã.
- **Ngày**: hiển thị/nhập `DD/MM/YYYY`; ô chọn ngày dùng `DateField` (không `<input type=date>` trần); đọc-chỉ dùng `formatDate/fmtDate`. Ngoại lệ ô chọn THÁNG giữ `MM/YYYY`.
- **Phím tắt**: KHÔNG Enter submit / Esc hủy (đã chặn ở `NoKeyShortcuts`). Ngoại lệ `data-allow-enter` (chat AI, form đăng nhập).
- **Sort cột**: MỌI bảng cho bấm tiêu đề để sắp xếp (`localeCompare('vi',{numeric,sensitivity:'base'})`).
- **Confirm**: dùng `useConfirm()` + `ConfirmDialog`, KHÔNG `window.confirm`.
- **CSV**: xuất đúng dữ liệu đang hiển thị (đã lọc), BOM UTF-8.
- **Supabase cap ~1000 dòng** → dùng `selectAll()` cho danh sách dài.
- **Embed đa FK**: `soct_cong_viec`→`soct_users` phải chỉ rõ `!ktv_id`/`!ktv2_id`.
- **Dropdown/popover trong bảng/modal**: dùng `position:fixed` bám rect (tránh overflow cắt).
- **Realtime "tự lành"**: `useRealtimeRefetch(topics, event, refetch, enabled, pollMs, pollFn)`; broadcast từ API qua `src/lib/realtime.ts`.
- **showNotification**: giữ `useCallback([])` để tránh refetch loop ở component con.
- **Kho reactive**: tồn kho qua trigger DB; đừng chỉnh `ton_kho` tay theo phiếu.
- **Chỉ sáng, KHÔNG dark mode**; accent xanh; mẫu thẻ KPI StatCards.
- **pdfjs trên Vercel**: 2 gotcha khi bóc phiếu PDF (xem memory `nhap-phieu-pdf`).

**Bổ sung sau khảo sát code (2026-10-11):**
- **Điều hướng KHÔNG tập trung**: mỗi tab cha có `useState` riêng (`congTacTab`, `monitorTab`, `khoTab`, `taiChinhTab`, `quanLyTab`, `systemTab`) trong `admin/page.tsx` — không có router dùng chung. Port sang route phải gom hết về URL (xem [02 §0](./02-modules-va-route.md#0-state-điều-hướng-thực-tế-adminpagetsx)).
- **ThueCpc: UI ≠ key quyền.** UI gộp 5 key quyền (`don_gia/counter/khung/bang_ke/canh_bao_muc`) thành **3 tab** (`danh_sach` = đơn giá+khung; `counter` = counter+bảng kê; `canh_bao_muc`). Giữ 5 key để guard, nhưng vẽ 3 tab. Đừng tạo route theo 5 key.
- **Hệ thống có 6 tab con** (`cai_dat/tai_khoan/danh_muc/audit/tro_ly_log/doi_mat_khau`) — không khai trong `tabs.ts`; `doi_mat_khau` hiện cho MỌI role (kể cả không phải admin).
- **Báo cáo sửa chữa** có 2 view nội bộ (`cho_gui/da_gui`); **CSKH** 4 view (`can/ds/pipeline/kpi`); **Khách cụm** có `scope` (both/cum/kd) + đối chiếu minVoice. Đây là cấp 3/4 phải giữ khi port.
- **Không có cổng tra cứu public no-auth**: mọi trang standalone (`/kho-thue`, `/lenh-xuat-hang`, `/admin/scan`…) đều qua đăng nhập.

> Khi khảo sát sâu từng module lúc port, bổ sung tiếp luật ẩn phát hiện được vào đây.

## 7. Lộ trình (không ép mốc năm — cutover theo parity)
- **GĐ0 — Nền tảng**: Design System (token + component) + vỏ route (`app/v2/layout.tsx`: auth guard + header + chuông + provider + realtime) + 1 màn demo.
- **GĐ1 — Lõi hằng ngày**: Sổ công tác › Giao việc, Hoàn phiếu.
- **GĐ2 — Kho & Tài chính**: Kho hàng (Tồn kho, Đặt hàng), Tài chính (Công nợ, Kanban Hóa đơn).
- **GĐ3 — Theo dõi máy & phần còn lại Tài chính**: Bảo trì, Giám định, Thuê/CPC, Phí bảo trì.
- **GĐ4 — Đuôi dài**: Quản lý (tất cả), Báo cáo sửa chữa, CSKH, Hệ thống.
- **GĐ5 — Các mặt khác**: `/ktv`, `/m` (có thể làm song song sớm nếu cần).
- **GĐ6 — Dogfood & chuyển giao**: chạy song song, đổi mặc định theo nhóm, khoá bản cũ.

Chi tiết thứ tự + parity: xem [02-modules-va-route.md](./02-modules-va-route.md).
