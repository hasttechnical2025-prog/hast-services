// Danh sách mẫu Biên bản bàn giao (BBBG). key -> { file .docx trong src/lib/report, nhãn hiển thị }.
// Dùng chung: dropdown chọn mẫu (client) + route xuất (server). Thêm mẫu mới = thêm 1 dòng ở đây
// (sau khi đã đặt placeholder cho file .docx tương ứng bằng scripts/build-bbbg-templates.cjs).
// padRows: giữ bảng đủ N dòng như mẫu (đệm dòng trống chỉ có STT). Bỏ trống = số dòng đúng bằng số vật tư.
export const BBBG_TEMPLATES: Record<string, { file: string; label: string; padRows?: number }> = {
  'cuc-tha': { file: 'bbbg-cuc-tha.docx', label: 'Cục Quản lý THA Dân sự' },
  'nhnn': { file: 'bbbg-nhnn.docx', label: 'Ngân hàng Nhà nước', padRows: 10 },
}

export const BBBG_TEMPLATE_LIST = Object.entries(BBBG_TEMPLATES).map(([key, v]) => ({ key, label: v.label }))
