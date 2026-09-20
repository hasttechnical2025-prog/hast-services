// Danh sách mẫu Biên bản bàn giao (BBBG). key -> { file .docx trong src/lib/report, nhãn hiển thị }.
// Dùng chung: dropdown chọn mẫu (client) + route xuất (server). Thêm mẫu mới = thêm 1 dòng ở đây
// (sau khi đã đặt placeholder cho file .docx tương ứng bằng scripts/build-bbbg-templates.cjs).
// padRows: giữ bảng đủ N dòng như mẫu (đệm dòng trống chỉ có STT). Bỏ trống = số dòng đúng bằng số vật tư.
// price: mẫu có cột %VAT / Đơn giá / Thành tiền + dòng tổng (lấy don_gia/vat/thanh_tien từ vật tư).
// allLines: lấy TOÀN BỘ vật tư của phiếu (không lọc da_tra) — dùng cho mẫu chung.
// chung (price/noprice): Bên A (tên + địa chỉ hóa đơn) là ĐỘNG, ưu tiên khách cụm.
export const BBBG_TEMPLATES: Record<string, { file: string; label: string; padRows?: number; price?: boolean; allLines?: boolean }> = {
  'cuc-tha': { file: 'bbbg-cuc-tha.docx', label: 'Cục Quản lý THA Dân sự' },
  'nhnn': { file: 'bbbg-nhnn.docx', label: 'Ngân hàng Nhà nước', padRows: 10 },
  'chung-price': { file: 'bbbg-chung-price.docx', label: 'Mẫu chung (có giá)', price: true, allLines: true },
  'chung-noprice': { file: 'bbbg-chung-noprice.docx', label: 'Mẫu chung (không giá)', allLines: true },
}

export const BBBG_TEMPLATE_LIST = Object.entries(BBBG_TEMPLATES).map(([key, v]) => ({ key, label: v.label }))
