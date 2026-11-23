// Chuẩn hóa SỐ PHIẾU (report) — NGUỒN CHÂN LÝ DUY NHẤT cho toàn app.
// Dùng ở CẢ server (lúc insert/update soct_cong_viec) LẪN client (pre-check cảnh báo trùng),
// để chuỗi lưu xuống DB và chuỗi đem so trùng luôn khớp nhau -> unique index không bị lọt.
//
// Số phiếu là 1 token KHÔNG chứa khoảng trắng (mẫu PDF: "Số phiếu: 958102"). Các khác biệt
// "nhìn giống nhau nhưng byte khác" khiến trùng lọt qua index: ký tự ẩn (zero-width) do pdfjs,
// khoảng trắng thừa/giữa, hoa-thường. Ta triệt tiêu hết:
//   - bỏ ký tự ẩn zero-width (U+200B..U+200D, U+FEFF)
//   - bỏ MỌI khoảng trắng (số phiếu vốn không có khoảng trắng)
//   - viết HOA (số phiếu HAST là số -> no-op; phòng trường hợp có chữ thì đồng nhất hoa/thường)
// Rỗng -> '' (caller tự quy về null; số phiếu rỗng KHÔNG tính trùng).
//
// LƯU Ý ĐỒNG BỘ: biểu thức chuẩn hóa dữ liệu CŨ trong migration (upper + bỏ zero-width + bỏ
// \s) phải khớp hàm này. Đổi hàm này thì cập nhật migration tương ứng.
export function normReport(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[​-‍﻿]/g, '') // ký tự ẩn (zero-width) do PDF chèn
    .replace(/\s+/g, '')                    // số phiếu không chứa khoảng trắng
    .toUpperCase()
}
