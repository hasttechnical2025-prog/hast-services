const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');

console.log('Starting Leaflet PowerPoint generation...');

const pptx = new PptxGenJS();

// 1. Presentation Metadata & Layout
pptx.title = 'HAST — Cẩm Nang Bỏ Túi Hướng Dẫn Tác Nghiệp & Vận Hành Thực Chiến';
pptx.author = 'HAST Tech Team';
pptx.company = 'HAST Services';
pptx.subject = 'Leaflet Quy Trình Kỹ Thuật, Kế Toán & Kinh Doanh';
pptx.layout = 'LAYOUT_16x9'; // 10.0 x 5.625 inches

// 2. Color Constants (Hex WITHOUT #)
const COLOR_DEEP_COBALT = '002B7F'; // Xanh Coban đậm (Bìa / Kết)
const COLOR_COBALT = '0047AB';      // Xanh Coban chuẩn (Primary)
const COLOR_COBALT_LIGHT = '1D4ED8';// Xanh Coban sáng
const COLOR_VIBRANT_RED = 'E11D48'; // Đỏ Siêu Thanh (Rose/Red)
const COLOR_SONIC_RED = 'FF2A54';   // Đỏ Siêu Thanh rực rỡ
const COLOR_DARK_SLATE = '0F172A';  // Chữ chính (Slate 900)
const COLOR_MUTED_SLATE = '475569'; // Chữ phụ (Slate 600)
const COLOR_LIGHT_SLATE = '64748B'; // Chữ mờ (Slate 500)
const COLOR_BG_LIGHT = 'F8FAFC';    // Nền sáng (Slate 50)
const COLOR_WHITE = 'FFFFFF';       // Trắng
const COLOR_CARD_BORDER = 'CBD5E1'; // Viền thẻ
const COLOR_SUCCESS = '059669';     // Xanh lá (Emerald)
const COLOR_WARNING = 'D97706';     // Vàng cam (Amber)

const FONT_PRIMARY = 'Calibri';
const FONT_TITLE = 'Arial';

// Helper to resolve asset paths
const asset = (fileName) => path.join(__dirname, 'pptx-assets', fileName);

// Helper for Content Slide Headers
function addSlideHeader(slide, title, category, roleBadge = 'TẤT CẢ VAI TRÒ') {
  // Category Pill
  slide.addText(category.toUpperCase(), {
    x: 0.6,
    y: 0.35,
    w: 4.5,
    h: 0.25,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_VIBRANT_RED,
    isTextBox: true,
    margin: 0
  });

  // Main Slide Title
  slide.addText(title, {
    x: 0.6,
    y: 0.6,
    w: 6.8,
    h: 0.45,
    fontSize: 16,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });

  // Role Badge on Top Right
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.5,
    y: 0.45,
    w: 1.9,
    h: 0.32,
    rectRadius: 0.08,
    fill: { color: COLOR_COBALT },
    line: { color: COLOR_COBALT, width: 1 }
  });
  slide.addText(`ROLE: ${roleBadge}`, {
    x: 7.5,
    y: 0.45,
    w: 1.9,
    h: 0.32,
    fontSize: 9,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
}

// =========================================================================
// SLIDE 1: TRANG BÌA CẨM NANG BỎ TÚI (POCKET LEAFLET COVER)
// =========================================================================
console.log('Building Slide 1: Cover...');
const s1 = pptx.addSlide();
s1.background = { color: COLOR_DEEP_COBALT };

// Logo HAST
const logoPath = path.join(__dirname, '../public/sotheodoi/logo-slogan.png');
if (fs.existsSync(logoPath)) {
  s1.addImage({
    path: logoPath,
    x: 0.7,
    y: 0.5,
    w: 2.2,
    h: 0.88
  });
}

// Main Title
s1.addText('HỆ THỐNG VẬN HÀNH NỘI BỘ HAST · PHIÊN BẢN THỰC CHIẾN', {
  x: 0.7,
  y: 1.55,
  w: 8.6,
  h: 0.35,
  fontSize: 12,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_SONIC_RED,
  charSpacing: 1.5,
  isTextBox: true,
  margin: 0
});

s1.addText('CẨM NANG BỎ TÚI HƯỚNG DẪN TÁC NGHIỆP', {
  x: 0.7,
  y: 1.95,
  w: 8.6,
  h: 0.75,
  fontSize: 26,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_WHITE,
  isTextBox: true,
  margin: 0
});

s1.addText('QUY TRÌNH THAO TÁC CƠ BẢN & LƯU Ý SỐNG CÒN DÀNH CHO CBNV KỸ THUẬT, KẾ TOÁN & KINH DOANH', {
  x: 0.7,
  y: 2.75,
  w: 8.6,
  h: 0.45,
  fontSize: 11.5,
  fontFace: FONT_PRIMARY,
  color: '93C5FD',
  isTextBox: true,
  margin: 0
});

// 4 Leaflet Role Cards
const coverCards = [
  { role: 'LEAFLET 01: KTV HIỆN TRƯỜNG', link: '👉 /ktv Mobile', text: '5 Bước thao tác, xử lý hầm mất sóng 4G & 3 điều cấm', x: 0.7, y: 3.45 },
  { role: 'LEAFLET 02: VĂN PHÒNG ĐIỀU PHỐI', link: '👉 /admin (Sổ CT & Kho)', text: 'Bắt buộc mã máy, gợi ý giám định, Telegram & PO nháp', x: 5.1, y: 3.45 },
  { role: 'LEAFLET 03: KẾ TOÁN HÀNH CHÍNH', link: '👉 /admin (Kanban)', text: '4 Cột Kanban, xuất M-invoice 32 cột, BBBG, ĐNTT & Tuổi nợ', x: 0.7, y: 4.25 },
  { role: 'LEAFLET 04: PHÒNG KINH DOANH', link: '👉 /kho-thue', text: 'Tra cứu máy sẵn sàng, đọc 3 màu trạng thái & ký HĐ', x: 5.1, y: 4.25 }
];

coverCards.forEach(c => {
  s1.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: c.x,
    y: c.y,
    w: 4.2,
    h: 0.68,
    rectRadius: 0.08,
    fill: { color: '0A2558' },
    line: { color: '1E40AF', width: 1 }
  });
  s1.addText(`${c.role}  [${c.link}]`, {
    x: c.x + 0.15,
    y: c.y + 0.08,
    w: 3.9,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_SONIC_RED,
    isTextBox: true,
    margin: 0
  });
  s1.addText(c.text, {
    x: c.x + 0.15,
    y: c.y + 0.3,
    w: 3.9,
    h: 0.32,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: 'E2E8F0',
    isTextBox: true,
    margin: 0
  });
});

s1.addText('💡 In từng tờ Leaflet A4 dán tại bàn làm việc hoặc lưu ảnh vào điện thoại để tra cứu thao tác hàng ngày', {
  x: 0.7,
  y: 5.1,
  w: 8.6,
  h: 0.3,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  color: '94A3B8',
  align: 'center',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 2: LEAFLET 1 — KỸ THUẬT VIÊN HIỆN TRƯỜNG (KTV MOBILE /ktv)
// =========================================================================
console.log('Building Slide 2: Leaflet KTV Mobile...');
const s2 = pptx.addSlide();
s2.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s2, 'LEAFLET 01: DÀNH CHO KỸ THUẬT VIÊN HIỆN TRƯỜNG', 'HƯỚNG DẪN TÁC NGHIỆP', 'KTV (SMARTPHONE)');

// Left Infographic Image
if (fs.existsSync(asset('leaflet-ktv.png'))) {
  s2.addImage({
    path: asset('leaflet-ktv.png'),
    x: 0.6,
    y: 1.15,
    w: 3.4,
    h: 4.1
  });
}

// Right Action Breakdown Cards
const ktvLeafletSteps = [
  {
    step: '1',
    title: 'Đăng nhập 1-chạm & Nhận việc',
    desc: 'Truy cập hast-services.vercel.app/ktv. Đăng nhập bằng Vân tay / Face ID (Passkey). Vào tab "Công việc": thấy phiếu đích danh hoặc bấm "Nhận việc" từ Pool chung.',
    badge: 'BẮT ĐẦU NGÀY',
    y: 1.15
  },
  {
    step: '2',
    title: 'Đến nơi: Bấm nút "ĐANG LÀM"',
    desc: 'Ngay khi chạm tay vào máy khách hàng, bắt buộc bấm "Đang làm" để app kích hoạt bộ đếm giờ lead-time đo lường năng suất xử lý thực tế.',
    badge: 'CHẠM MÁY KHÁCH',
    y: 1.95
  },
  {
    step: '3',
    title: 'Xử lý xong: Bấm nút "✓ HOÀN THÀNH"',
    desc: 'Kiểm tra vật tư/mực đã thay chuẩn chỉnh. Bấm "Hoàn thành" trước khi rời máy để hệ thống tự động trừ kho và chuyển dữ liệu sang Kế toán.',
    badge: 'TRƯỚC KHI VỀ',
    y: 2.75
  },
  {
    step: '4',
    title: 'Báo cáo ngày (trước 18h) & Nghỉ phép',
    desc: 'Cuối ngày vào tab "Báo cáo ngày" gửi vắn tắt kết quả. Khi cần nghỉ phép/ốm, chuyển tab "Nghỉ phép" đăng ký để văn phòng duyệt trực tuyến.',
    badge: 'HÀNH CHÍNH',
    y: 3.55
  }
];

ktvLeafletSteps.forEach(s => {
  s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.2,
    y: s.y,
    w: 5.2,
    h: 0.72,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    rectRadius: 0.06,
    fill: { color: COLOR_COBALT }
  });
  s2.addText(s.step, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s2.addText(s.title, {
    x: 4.75,
    y: s.y + 0.08,
    w: 3.3,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });
  s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s2.addText(s.badge, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s2.addText(s.desc, {
    x: 4.75,
    y: s.y + 0.3,
    w: 4.5,
    h: 0.38,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Warning: 3 Lethal Don'ts for KTV
s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 4.35,
  w: 5.2,
  h: 0.9,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1.5 }
});
s2.addText('⛔ 3 ĐIỀU TUYỆT ĐỐI CẤM KỴ CỦA KTV HIỆN TRƯỜNG:', {
  x: 4.35,
  y: 4.43,
  w: 4.9,
  h: 0.2,
  fontSize: 9.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});
s2.addText([
  { text: '• KHÔNG bấm "Hoàn thành" khi chưa rời khách (tránh trừ kho và đẩy HĐ sớm).', breakLine: true },
  { text: '• KHÔNG nhận việc hộ người khác bằng tài khoản của mình (sai lệch KPI & lead-time).', breakLine: true },
  { text: '• KHÔNG xóa dữ liệu web / tải lại trang khi đang có hàng đợi Offline Q > 0 dưới hầm.', breakLine: false }
], {
  x: 4.35,
  y: 4.65,
  w: 4.9,
  h: 0.55,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '991B1B',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 3: LEAFLET 2 — VĂN PHÒNG ĐIỀU PHỐI (OFFICE /admin)
// =========================================================================
console.log('Building Slide 3: Leaflet Office...');
const s3 = pptx.addSlide();
s3.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s3, 'LEAFLET 02: DÀNH CHO VĂN PHÒNG ĐIỀU PHỐI KỸ THUẬT', 'HƯỚNG DẪN TÁC NGHIỆP', 'TECH_ADMIN · STAFF');

// Left Infographic Image
if (fs.existsSync(asset('leaflet-office.png'))) {
  s3.addImage({
    path: asset('leaflet-office.png'),
    x: 0.6,
    y: 1.15,
    w: 3.4,
    h: 4.1
  });
}

// Right Action Breakdown Cards
const officeLeafletSteps = [
  {
    step: '1',
    title: 'Tiếp nhận cuộc gọi: Bắt buộc chọn Mã máy',
    desc: 'Gõ mã máy (VD: 36051) ➔ Hệ thống tự điền tên khách và địa chỉ. Nếu máy có Biên bản giám định chờ thay ➔ Bấm "Lấy theo Giám định" để tự động gợi ý linh kiện.',
    badge: 'TẠO PHIẾU',
    y: 1.15
  },
  {
    step: '2',
    title: 'Cơ chế Giao việc: Gán đích danh hoặc Pool',
    desc: 'Gán đích danh cho KTV (bắn DM riêng). Hoặc chọn "Chưa gán" để đẩy vào Pool chung (bắn group Telegram, bot tự động sửa lại tin nhắn khi có thợ bấm nhận).',
    badge: 'ĐIỀU PHỐI',
    y: 1.95
  },
  {
    step: '3',
    title: 'Xem Chuông cảnh báo & Tạo PO Đặt hàng',
    desc: 'Nhìn Chuông đỏ trên Header để thấy vật tư chạm ngưỡng. Vào tab Đặt hàng: Lọc "Dưới ngưỡng" ➔ Nhập SL ➔ Bấm "+ Giỏ" ➔ Bấm "Tạo đơn PO Nháp" ➔ Xuất Excel gửi NCC.',
    badge: 'KHO & MUA HÀNG',
    y: 2.75
  },
  {
    step: '4',
    title: 'In Sổ bảo trì & Xuất Báo giá 4 trang',
    desc: 'Tại "Theo dõi máy" ➔ Tìm máy ➔ Bấm "In Sổ theo dõi" (2 trang A4 ngang có mã QR). Nếu làm báo giá thay đồ: Xuất Word .docx 4 trang (gốc + 3 cạnh tranh +3/5/6%).',
    badge: 'HỖ TRỢ MÁY',
    y: 3.55
  }
];

officeLeafletSteps.forEach(s => {
  s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.2,
    y: s.y,
    w: 5.2,
    h: 0.72,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    rectRadius: 0.06,
    fill: { color: COLOR_COBALT }
  });
  s3.addText(s.step, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s3.addText(s.title, {
    x: 4.75,
    y: s.y + 0.08,
    w: 3.3,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });
  s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s3.addText(s.badge, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s3.addText(s.desc, {
    x: 4.75,
    y: s.y + 0.3,
    w: 4.5,
    h: 0.38,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Warning
s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 4.35,
  w: 5.2,
  h: 0.9,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1.5 }
});
s3.addText('⛔ 3 ĐIỀU TUYỆT ĐỐI CẤM KỴ CỦA VĂN PHÒNG ĐIỀU PHỐI:', {
  x: 4.35,
  y: 4.43,
  w: 4.9,
  h: 0.2,
  fontSize: 9.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});
s3.addText([
  { text: '• Mọi phiếu có vật tư: Cờ Hóa đơn mặc định là FALSE. Không tự ý tick nếu khách chưa đòi HĐ.', breakLine: true },
  { text: '• KHÔNG gõ tay tên khách hàng nếu máy đã có trên hệ thống (bắt buộc tìm theo Mã máy).', breakLine: true },
  { text: '• KHÔNG tự ý ghi nhận hàng về kho (quyền riêng của Admin để bảo vệ số tồn thực tế).', breakLine: false }
], {
  x: 4.35,
  y: 4.65,
  w: 4.9,
  h: 0.55,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '991B1B',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 4: LEAFLET 3 — KẾ TOÁN HÀNH CHÍNH (KANBAN HÓA ĐƠN & M-INVOICE)
// =========================================================================
console.log('Building Slide 4: Leaflet KTHC...');
const s4 = pptx.addSlide();
s4.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s4, 'LEAFLET 03: DÀNH CHO KẾ TOÁN HÀNH CHÍNH', 'HƯỚNG DẪN TÁC NGHIỆP', 'KTHC (KẾ TOÁN)');

// Left Infographic Image
if (fs.existsSync(asset('leaflet-kthc.png'))) {
  s4.addImage({
    path: asset('leaflet-kthc.png'),
    x: 0.6,
    y: 1.15,
    w: 3.4,
    h: 4.1
  });
}

// Right Action Breakdown Cards
const kthcLeafletSteps = [
  {
    step: '1',
    title: 'Nhận bàn giao tại Cột 2 "KT lên HĐ"',
    desc: 'Soát kỹ Tên công ty, MST, Email, Đơn giá vật tư. Nếu thông tin sai/thiếu ➔ Bấm "Trả lại Cột 1 kèm lý do" để Kỹ thuật sửa (phiếu ở Cột 2 đã bị khóa cứng sửa vật tư).',
    badge: 'KIỂM TRA DỮ LIỆU',
    y: 1.15
  },
  {
    step: '2',
    title: 'Xuất file Excel M-invoice 32 cột & Word',
    desc: 'Bấm nút "Xuất M-invoice (32 cột)" ➔ Import trực tiếp vào phần mềm M-invoice. Đồng thời bấm nút xuất Word "Biên bản bàn giao" và "Đề nghị thanh toán" in ký gửi khách.',
    badge: 'XUẤT CHỨNG TỪ',
    y: 1.95
  },
  {
    step: '3',
    title: 'Nhập Số HĐ thật ➔ Sang Cột 3 "Chờ thanh toán"',
    desc: 'Sau khi có số hóa đơn điện tử chính thức từ M-invoice ➔ Bấm nút "Nhập số HĐ" (VD: 0012489) ➔ Thẻ tự động chuyển sang Cột 3. Cơ chế neo số HĐ ngăn chặn xuất đúp 100%.',
    badge: 'CHỐT SỐ HÓA ĐƠN',
    y: 2.75
  },
  {
    step: '4',
    title: 'Ghi nhận tiền thu ➔ Cột 4 "Đã thanh toán"',
    desc: 'Quan sát Banner đỏ trên Header để đòi nợ quá hạn > 7, 15, 30 ngày. Bấm "Thu tiền" ghi nhận lũy kế. Khi thu đủ 100% ➔ Thẻ tự động nhảy sang Cột 4 Đã thanh toán.',
    badge: 'THU HỒI CÔNG NỢ',
    y: 3.55
  }
];

kthcLeafletSteps.forEach(s => {
  s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.2,
    y: s.y,
    w: 5.2,
    h: 0.72,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    rectRadius: 0.06,
    fill: { color: COLOR_SUCCESS }
  });
  s4.addText(s.step, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s4.addText(s.title, {
    x: 4.75,
    y: s.y + 0.08,
    w: 3.3,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });
  s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s4.addText(s.badge, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s4.addText(s.desc, {
    x: 4.75,
    y: s.y + 0.3,
    w: 4.5,
    h: 0.38,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Warning
s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 4.35,
  w: 5.2,
  h: 0.9,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1.5 }
});
s4.addText('⛔ 3 ĐIỀU TUYỆT ĐỐI CẤM KỴ CỦA KẾ TOÁN HÀNH CHÍNH:', {
  x: 4.35,
  y: 4.43,
  w: 4.9,
  h: 0.2,
  fontSize: 9.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});
s4.addText([
  { text: '• KHÔNG sửa tay tên/giá vật tư khi thẻ ở Cột 2 (dữ liệu đã khóa, sai bấm Trả Cột 1).', breakLine: true },
  { text: '• Bắt buộc nhập số HĐ thật mới sang được Cột 3 (tránh xuất trùng đúp hóa đơn).', breakLine: true },
  { text: '• KHÔNG ghi nhận thu tiền vượt quá tổng giá trị sau thuế của phiếu.', breakLine: false }
], {
  x: 4.35,
  y: 4.65,
  w: 4.9,
  h: 0.55,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '991B1B',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 5: LEAFLET 4 — PHÒNG KINH DOANH (CỔNG KHO MÁY THUÊ /kho-thue)
// =========================================================================
console.log('Building Slide 5: Leaflet Sales...');
const s5 = pptx.addSlide();
s5.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s5, 'LEAFLET 04: DÀNH CHO PHÒNG KINH DOANH', 'HƯỚNG DẪN TÁC NGHIỆP', 'KINH_DOANH (SALES)');

// Left Infographic Image
if (fs.existsSync(asset('leaflet-sales.png'))) {
  s5.addImage({
    path: asset('leaflet-sales.png'),
    x: 0.6,
    y: 1.15,
    w: 3.4,
    h: 4.1
  });
}

// Right Action Breakdown Cards
const salesLeafletSteps = [
  {
    step: '1',
    title: 'Truy cập cổng chuyên biệt /kho-thue',
    desc: 'Đăng nhập vào link hast-services.vercel.app/kho-thue bằng tài khoản kinh_doanh (Chế độ Read-only bảo vệ dữ liệu). Tuyệt đối KHÔNG đăng nhập vào /admin.',
    badge: 'TRUY CẬP',
    y: 1.15
  },
  {
    step: '2',
    title: 'Lọc danh mục máy thuê theo nhu cầu',
    desc: 'Dùng bộ lọc nhanh: Chọn Hãng (Ricoh / Konica / Xerox) · Dòng máy (Màu / Đen trắng) · Tốc độ in để tìm chính xác model phù hợp với yêu cầu khách hàng.',
    badge: 'TRA CỨU',
    y: 1.95
  },
  {
    step: '3',
    title: 'Đọc chuẩn 3 màu trạng thái máy',
    desc: '🟢 Sẵn sàng xuất: Máy đã test đẹp, giao ngay trong 24h · 🟡 Đang bảo dưỡng: Đang thay đồ, HỎI TECH_ADMIN ngày xong · 🔴 Đang cho thuê: Không khả dụng.',
    badge: 'TÌNH TRẠNG MÁY',
    y: 2.75
  },
  {
    step: '4',
    title: 'Bàn giao khi ký xong Hợp đồng mới',
    desc: 'Chốt model & Seri máy ➔ Gửi thông tin công ty, MST, ngày chốt counter cho Tech_admin để tạo Điểm máy trên app và in dán tem QR code lên thân máy.',
    badge: 'BÀN GIAO MÁY',
    y: 3.55
  }
];

salesLeafletSteps.forEach(s => {
  s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.2,
    y: s.y,
    w: 5.2,
    h: 0.72,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    rectRadius: 0.06,
    fill: { color: COLOR_WARNING }
  });
  s5.addText(s.step, {
    x: 4.32,
    y: s.y + 0.12,
    w: 0.35,
    h: 0.35,
    fontSize: 12,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s5.addText(s.title, {
    x: 4.75,
    y: s.y + 0.08,
    w: 3.3,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });
  s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s5.addText(s.badge, {
    x: 8.15,
    y: s.y + 0.08,
    w: 1.15,
    h: 0.2,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s5.addText(s.desc, {
    x: 4.75,
    y: s.y + 0.3,
    w: 4.5,
    h: 0.38,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Warning
s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 4.35,
  w: 5.2,
  h: 0.9,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1.5 }
});
s5.addText('⛔ 2 ĐIỀU TUYỆT ĐỐI CẤM KỴ CỦA PHÒNG KINH DOANH:', {
  x: 4.35,
  y: 4.43,
  w: 4.9,
  h: 0.2,
  fontSize: 9.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});
s5.addText([
  { text: '• KHÔNG tự ý cam kết ngày giao máy khi máy đang "Đang bảo dưỡng" (chưa hỏi Tech_admin).', breakLine: true },
  { text: '• KHÔNG tìm cách vào link /admin để tránh xáo trộn giao diện và phân quyền kỹ thuật.', breakLine: false }
], {
  x: 4.35,
  y: 4.68,
  w: 4.9,
  h: 0.5,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '991B1B',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 6: LEAFLET 5 — BẢNG VÀNG QUY TẮC DO'S & DON'TS CHO TOÀN CÔNG TY
// =========================================================================
console.log('Building Slide 6: Leaflet Do & Don\'t...');
const s6 = pptx.addSlide();
s6.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s6, 'LEAFLET 05: BẢNG VÀNG QUY TẮC BẮT BUỘC (DO\'S & DON\'TS)', 'KỶ LUẬT HỆ THỐNG', 'TOÀN BỘ CBNV HAST');

// Left Infographic Image
if (fs.existsSync(asset('leaflet-dodont.png'))) {
  s6.addImage({
    path: asset('leaflet-dodont.png'),
    x: 0.6,
    y: 1.15,
    w: 3.4,
    h: 4.1
  });
}

// Right 2 Big Columns: 3 Must-Dos & 3 Never-Dos Detailed
// Box 1: Must Dos
s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 1.15,
  w: 5.2,
  h: 1.95,
  rectRadius: 0.08,
  fill: { color: 'F0FDF4' },
  line: { color: '86EFAC', width: 1.5 }
});
s6.addText('✓ 3 QUY TẮC VÀNG BẮT BUỘC THỰC HIỆN (MUST-DO):', {
  x: 4.35,
  y: 1.25,
  w: 4.9,
  h: 0.25,
  fontSize: 10.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_SUCCESS,
  isTextBox: true,
  margin: 0
});
s6.addText([
  { text: '1. Luôn CLICK CHUỘT vào nút bấm:', bold: true, color: '065F46' },
  { text: ' Hệ thống đã chặn phím Enter/Esc để chống bấm nhầm khi đang load mạng. Mọi thao tác bắt buộc phải click chuột.', breakLine: true },
  { text: '2. Chuẩn hóa Tiền & Ngày tháng:', bold: true, color: '065F46' },
  { text: ' Tiền tệ luôn phân tách hàng nghìn bằng dấu chấm (2.500.000 đ); Ngày tháng luôn là DD/MM/YYYY (dùng DateField).', breakLine: true },
  { text: '3. Tải lại trang khi có bản mới:', bold: true, color: '065F46' },
  { text: ' Khi thấy thanh thông báo vàng "Có phiên bản mới từ máy chủ" ➔ Click "Tải lại trang" ngay để cập nhật tính năng mới.', breakLine: false }
], {
  x: 4.35,
  y: 1.55,
  w: 4.9,
  h: 1.45,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '064E3B',
  isTextBox: true,
  margin: 0
});

// Box 2: Never Dos
s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 4.2,
  y: 3.25,
  w: 5.2,
  h: 2.0,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1.5 }
});
s6.addText('✕ 3 ĐIỀU TUYỆT ĐỐI CẤM KỴ (NEVER-DO):', {
  x: 4.35,
  y: 3.35,
  w: 4.9,
  h: 0.25,
  fontSize: 10.5,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});
s6.addText([
  { text: '1. KHÔNG nhảy cóc quy trình:', bold: true, color: '991B1B' },
  { text: ' KTV chưa bấm Hoàn thành thì cấm lên HĐ; Chưa có số HĐ thật từ M-invoice thì cấm chuyển sang Chờ thanh toán.', breakLine: true },
  { text: '2. KHÔNG gõ tay nếu đã có mã máy:', bold: true, color: '991B1B' },
  { text: ' Khi tạo phiếu giao việc, luôn tìm theo Mã máy để hệ thống tự load khách hàng và giữ trọn lịch sử sửa chữa.', breakLine: true },
  { text: '3. KHÔNG can thiệp dữ liệu chéo phòng ban:', bold: true, color: '991B1B' },
  { text: ' Kế toán không sửa vật tư kỹ thuật; Văn phòng không tự ghi nhận hàng về; Kinh doanh không tự vào /admin.', breakLine: false }
], {
  x: 4.35,
  y: 3.65,
  w: 4.9,
  h: 1.5,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: '7F1D1D',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 7: TRANG KẾT & DANH BẠ ĐĂNG NHẬP / HỖ TRỢ KỸ THUẬT
// =========================================================================
console.log('Building Slide 7: Closing...');
const s7 = pptx.addSlide();
s7.background = { color: COLOR_DEEP_COBALT };

s7.addText('TỔNG KẾT ĐƯỜNG DẪN TRUY CẬP & HỖ TRỢ KỸ THUẬT NỘI BỘ', {
  x: 0.7,
  y: 0.45,
  w: 8.6,
  h: 0.4,
  fontSize: 16,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_SONIC_RED,
  isTextBox: true,
  margin: 0
});

const accessList = [
  {
    role: 'KỸ THUẬT HIỆN TRƯỜNG (KTV)',
    url: 'hast-services.vercel.app/ktv',
    guide: 'Đăng nhập bằng Vân tay / Face ID (Passkey). Add to Home Screen để dùng như app gốc. Nhận việc ➔ Đang làm ➔ Hoàn thành ➔ Báo cáo ngày.',
    color: COLOR_SONIC_RED,
    y: 1.05
  },
  {
    role: 'VĂN PHÒNG KỸ THUẬT & KHO (TECH_ADMIN / STAFF)',
    url: 'hast-services.vercel.app/admin',
    guide: 'Sổ công tác, Theo dõi máy, Kho hàng. Bắt buộc chọn Mã máy khi tạo phiếu, xem chuông cảnh báo tồn kho và tạo đơn đặt hàng PO nháp.',
    color: '38BDF8',
    y: 1.95
  },
  {
    role: 'KẾ TOÁN HÀNH CHÍNH (KTHC)',
    url: 'hast-services.vercel.app/admin (Tự động vào Kanban Hóa đơn)',
    guide: 'Chuyên biệt Bảng Kanban Hóa đơn. Xuất M-invoice 32 cột, xuất Word BBBG/ĐNTT, nhập số HĐ thật, theo dõi tuổi nợ và ghi nhận thu tiền.',
    color: '34D399',
    y: 2.85
  },
  {
    role: 'PHÒNG KINH DOANH (KINH_DOANH)',
    url: 'hast-services.vercel.app/kho-thue',
    guide: 'Tra cứu danh mục máy photocopy sẵn sàng cho thuê / CPC. Phân biệt rõ máy xanh (Sẵn sàng) vs máy vàng (Bảo dưỡng). Cấm truy cập /admin.',
    color: 'FBBF24',
    y: 3.75
  }
];

accessList.forEach(a => {
  s7.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7,
    y: a.y,
    w: 8.6,
    h: 0.75,
    rectRadius: 0.08,
    fill: { color: '0A2558' },
    line: { color: '1E40AF', width: 1 }
  });
  s7.addText(a.role, {
    x: 0.9,
    y: a.y + 0.08,
    w: 4.2,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: a.color,
    isTextBox: true,
    margin: 0
  });
  s7.addText(a.url, {
    x: 5.1,
    y: a.y + 0.08,
    w: 4.0,
    h: 0.22,
    fontSize: 9.5,
    fontFace: 'Courier',
    bold: true,
    color: COLOR_WHITE,
    align: 'right',
    isTextBox: true,
    margin: 0
  });
  s7.addText(a.guide, {
    x: 0.9,
    y: a.y + 0.32,
    w: 8.2,
    h: 0.38,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: 'E2E8F0',
    isTextBox: true,
    margin: 0
  });
});

s7.addText('HỆ THỐNG VẬN HÀNH HAST — ĐÚNG DỮ LIỆU TỪ ĐẦU NGUỒN · VẬN HÀNH CHUẨN XÁC TỪNG GIÂY PHÚT', {
  x: 0.7,
  y: 4.95,
  w: 8.6,
  h: 0.3,
  fontSize: 10,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_WHITE,
  align: 'center',
  isTextBox: true,
  margin: 0
});

// Write PPTX File
const outputPath = path.join(__dirname, '../Cam-Nang-Bo-Tui-HAST.pptx');
pptx.writeFile({ fileName: outputPath })
  .then(() => {
    console.log('Leaflet PowerPoint successfully generated at:', outputPath);
  })
  .catch(err => {
    console.error('Error generating Leaflet PowerPoint:', err);
    process.exit(1);
  });
