# 📌 ĐỌC TRƯỚC: `PROJECT_STATUS.md`
Trạng thái dự án, danh sách module, migration mới nhất, và các "gotcha" dễ vỡ nằm ở **`PROJECT_STATUS.md`** (thư mục gốc). Đọc file đó trước để nắm nhanh hiện trạng, không phải khảo sát lại toàn bộ. Lịch sử git đã bị viết lại nhiều lần → tin vào code hiện tại, không tra theo commit cũ.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Quy tắc hiển thị (BẮT BUỘC)

Áp dụng cho mọi giao diện Admin và KTV.

## Tiền tệ / số lượng tiền
- Mọi số tiền (đơn giá, thành tiền, tổng, VAT quy ra tiền…) phải hiển thị dạng phân tách hàng nghìn bằng dấu chấm: `#.###` (VD `2.000.000`, `150.000`).
- Dùng `value.toLocaleString('vi-VN')`. Số thực cần `Math.round(...)` trước khi format. VAT hiển thị kèm `%`.
- Không áp dụng cho Số phiếu (report) và các mã (mã máy, mã hàng, số đơn…).

## Ngày tháng năm
- Mọi ngày hiển thị/nhập phải theo `DD/MM/YYYY` (VD `04/07/2026`), KHÔNG dùng định dạng locale của trình duyệt (mm/dd/yyyy).
- Ô CHỌN ngày: dùng component `DateField` (native `<input type="date">` ẩn opacity-0 nằm đè lên phần hiển thị `DD/MM/YYYY`). Không dùng `<input type="date">` / `<Input type="date">` trần vì sẽ hiển thị theo locale.
- Ô hiển thị (read-only): format bằng helper `formatDate`/`fmtDate` (đều ra `DD/MM/YYYY`).
- Ngoại lệ: ô chọn THÁNG (`<input type="month">`) ở Bảo trì / Thống kê nhập — giữ nguyên (MM/YYYY).

## Phím tắt: KHÔNG dùng (BẮT BUỘC)
- Nguyên tắc: **chỉ CLICK vào nút được thiết kế mới có tác dụng**. Enter KHÔNG submit form / bấm hộ nút Lưu · Đăng nhập · Tra cứu; Esc KHÔNG bấm hộ nút Hủy / đóng hộp thoại. Lý do: người dùng hay bấm Enter theo quán tính khi app đang chờ tải dữ liệu → tạo/lưu nhầm.
- Đã chặn tập trung ở `NoKeyShortcuts` (root layout, listener capture trên `document`) → **không cần** và **không nên** vá từng form.
- **Không thêm** `onKeyDown` bắt `Enter`/`Escape` để chạy hành động — sẽ bị chặn, thành code chết. Mọi hành động phải có nút bấm.
- Ngoại lệ có chủ đích (đừng phá): Enter trong `<textarea>` = xuống dòng; đang gõ tiếng Việt bằng bộ gõ (`isComposing`/keyCode 229).

## Xuất CSV
- Nút "Xuất CSV" chỉ xuất đúng dữ liệu ĐANG hiển thị sau khi lọc (danh sách đã filter), cột khớp thông tin hiển thị. Ghi BOM UTF-8 (`'﻿'`) để Excel đọc tiếng Việt đúng.
