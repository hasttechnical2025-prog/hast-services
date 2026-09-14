const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');

console.log('Starting PowerPoint generation...');

const pptx = new PptxGenJS();

// 1. Presentation Metadata & Layout
pptx.title = 'HAST — Cẩm Nang Hướng Dẫn Sử Dụng & Quy Trình Vận Hành';
pptx.author = 'HAST Tech Team';
pptx.company = 'HAST Services';
pptx.subject = 'Sổ Công Tác, Kho Hàng, Bảo Trì & Kế Toán Kanban';
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
const COLOR_CARD_BORDER = 'E2E8F0'; // Viền thẻ
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
    w: 4.0,
    h: 0.25,
    fontSize: 9,
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
    fontSize: 17,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });

  // Role Badge on Top Right
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.6,
    y: 0.45,
    w: 1.8,
    h: 0.32,
    rectRadius: 0.08,
    fill: { color: COLOR_COBALT },
    line: { color: COLOR_COBALT, width: 1 }
  });
  slide.addText(`ROLE: ${roleBadge}`, {
    x: 7.6,
    y: 0.45,
    w: 1.8,
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
// SLIDE 1: TRANG BÌA (EXECUTIVE TITLE)
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
    y: 0.6,
    w: 2.2,
    h: 0.88
  });
}

// Main Title
s1.addText('HỆ THỐNG QUẢN LÝ ĐIỀU HÀNH HAST', {
  x: 0.7,
  y: 1.7,
  w: 8.6,
  h: 0.4,
  fontSize: 13,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_SONIC_RED,
  charSpacing: 2,
  isTextBox: true,
  margin: 0
});

s1.addText('SỔ CÔNG TÁC & VẬN HÀNH KHO BÃI', {
  x: 0.7,
  y: 2.15,
  w: 8.6,
  h: 0.8,
  fontSize: 28,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_WHITE,
  isTextBox: true,
  margin: 0
});

s1.addText('CẨM NANG HƯỚNG DẪN SỬ DỤNG VÀ BỨC TRANH NGHIỆP VỤ TOÀN DIỆN', {
  x: 0.7,
  y: 2.95,
  w: 8.6,
  h: 0.4,
  fontSize: 13,
  fontFace: FONT_PRIMARY,
  color: '93C5FD',
  isTextBox: true,
  margin: 0
});

// 3 Feature Badges
const badges = [
  { text: '⚡ Sổ công tác & KTV Mobile', x: 0.7 },
  { text: '📦 Quản lý kho & Đặt hàng PO', x: 3.5 },
  { text: '📊 Tài chính Kanban & M-invoice', x: 6.3 }
];
badges.forEach(b => {
  s1.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: b.x,
    y: 3.65,
    w: 2.6,
    h: 0.38,
    rectRadius: 0.08,
    fill: { color: '0A2558' },
    line: { color: '1E40AF', width: 1 }
  });
  s1.addText(b.text, {
    x: b.x,
    y: 3.65,
    w: 2.6,
    h: 0.38,
    fontSize: 10,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_WHITE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
});

// Bottom Footer Metadata
s1.addText('Hệ thống dịch vụ kỹ thuật máy photocopy HAST · Phiên bản Production 2026 · Phát hành nội bộ', {
  x: 0.7,
  y: 4.85,
  w: 8.6,
  h: 0.3,
  fontSize: 9.5,
  fontFace: FONT_PRIMARY,
  color: '64748B',
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 2: BỨC TRANH TOÀN CẢNH (END-TO-END WORKFLOW)
// =========================================================================
console.log('Building Slide 2: End-to-End Ecosystem...');
const s2 = pptx.addSlide();
s2.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s2, 'BỨC TRANH TOÀN CẢNH — DÒNG CHẢY NGHIỆP VỤ KHÉP KÍN', 'TỔNG QUAN HỆ THỐNG', 'TOÀN CÔNG TY');

// Image Graphic
if (fs.existsSync(asset('workflow-overview.png'))) {
  s2.addImage({
    path: asset('workflow-overview.png'),
    x: 0.6,
    y: 1.15,
    w: 5.4,
    h: 2.7
  });
}

// Right Side: 3 Key Pillar Cards
const pillars = [
  {
    title: '1. Liên thông dữ liệu tức thì (Realtime)',
    desc: 'Supabase Broadcast đồng bộ mọi thay đổi trạng thái phiếu từ KTV ngoài hiện trường về màn hình Office và Telegram mà không cần tải lại trang.',
    color: COLOR_COBALT,
    y: 1.15
  },
  {
    title: '2. Tự động hóa trừ kho & khóa giá',
    desc: 'Trigger Database phản ứng chỉ trừ kho khi phiếu Hoàn thành. Khi bàn giao sang Kế toán, toàn bộ tên và giá vật tư được khóa chặt chẽ.',
    color: COLOR_VIBRANT_RED,
    y: 2.05
  },
  {
    title: '3. Kiểm soát công nợ & hóa đơn khép kín',
    desc: 'Kanban 4 cột đưa dữ liệu thẳng vào file Excel M-invoice 32 cột, tự động xuất BBBG, ĐNTT và cảnh báo tuổi nợ đọng trên 30 ngày.',
    color: COLOR_SUCCESS,
    y: 2.95
  }
];

pillars.forEach(p => {
  s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.2,
    y: p.y,
    w: 3.2,
    h: 0.8,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s2.addText(p.title, {
    x: 6.35,
    y: p.y + 0.08,
    w: 2.9,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: p.color,
    isTextBox: true,
    margin: 0
  });
  s2.addText(p.desc, {
    x: 6.35,
    y: p.y + 0.3,
    w: 2.9,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Banner: Tóm tắt nguyên tắc
s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.05,
  w: 8.8,
  h: 0.95,
  rectRadius: 0.08,
  fill: { color: 'EFF6FF' },
  line: { color: 'BFDBFE', width: 1 }
});
s2.addText('💡 NGUYÊN TẮC VẬN HÀNH BẤT BIẾN:', {
  x: 0.8,
  y: 4.15,
  w: 8.4,
  h: 0.22,
  fontSize: 10,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_COBALT,
  isTextBox: true,
  margin: 0
});
s2.addText([
  { text: '• Dữ liệu chỉ nhập một lần duy nhất từ lúc tạo phiếu giao việc, tự động kế thừa qua Kho hàng, Giám định và Kế toán xuất hóa đơn.', breakLine: true },
  { text: '• Mọi thao tác đều có phân quyền rõ ràng, lưu vết Audit Log và chặn tuyệt đối thao tác nhảy cóc quy trình.', breakLine: false }
], {
  x: 0.8,
  y: 4.4,
  w: 8.4,
  h: 0.5,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  color: COLOR_DARK_SLATE,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 3: MA TRẬN 6 VAI TRÒ (USER ROLES)
// =========================================================================
console.log('Building Slide 3: Roles & Permissions...');
const s3 = pptx.addSlide();
s3.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s3, 'MA TRẬN 6 VAI TRÒ & PHÂN ĐỊNH TRÁCH NHIỆM HỆ THỐNG', 'CƠ CHẾ BẢO MẬT & PHÂN QUYỀN', 'PHÂN QUYỀN');

if (fs.existsSync(asset('mockup-roles.png'))) {
  s3.addImage({
    path: asset('mockup-roles.png'),
    x: 0.6,
    y: 1.15,
    w: 5.8,
    h: 3.2
  });
}

// Right Explanation Cards
const roleDetails = [
  {
    title: '1. Khối Kỹ Thuật (tech_admin / staff / ktv)',
    text: 'Tập trung tiếp nhận cuộc gọi, phân phối việc ngoài hiện trường, kiểm soát vật tư kỹ thuật và giải quyết sự cố máy tại chỗ.',
    color: COLOR_COBALT,
    y: 1.15
  },
  {
    title: '2. Khối Kế Toán (kthc) — Tách Biệt Độc Lập',
    text: 'Chỉ truy cập Bảng điều phối Kanban Hóa đơn. Ẩn hoàn toàn Sổ công tác và chuông cảnh báo để tập trung xuất hóa đơn, thu nợ.',
    color: COLOR_SUCCESS,
    y: 2.15
  },
  {
    title: '3. Khối Kinh Doanh (kinh_doanh)',
    text: 'Chỉ truy cập cổng thông tin /kho-thue để tra cứu cấu hình máy sẵn sàng phục vụ khách hàng. Bị chặn tuyệt đối vào /admin.',
    color: COLOR_WARNING,
    y: 3.15
  },
  {
    title: '4. Ban Quản Trị (admin)',
    text: 'Cầm trịch cấu hình hệ thống, duyệt đơn hàng về, quản lý mật khẩu, bật chế độ bảo trì khẩn cấp và rà soát Audit Log.',
    color: COLOR_VIBRANT_RED,
    y: 4.15
  }
];

roleDetails.forEach(r => {
  s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.6,
    y: r.y,
    w: 2.8,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s3.addText(r.title, {
    x: 6.75,
    y: r.y + 0.08,
    w: 2.5,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: r.color,
    isTextBox: true,
    margin: 0
  });
  s3.addText(r.desc || r.text, {
    x: 6.75,
    y: r.y + 0.32,
    w: 2.5,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// =========================================================================
// SLIDE 4: SỔ CÔNG TÁC — GIAO VIỆC & ĐIỀU PHỐI (OFFICE)
// =========================================================================
console.log('Building Slide 4: Sổ Công Tác...');
const s4 = pptx.addSlide();
s4.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s4, 'SỔ CÔNG TÁC — ĐIỀU PHỐI & GIAO VIỆC HIỆN TRƯỜNG', 'NGHIỆP VỤ ĐIỀU HÀNH', 'TECH_ADMIN · STAFF');

if (fs.existsSync(asset('mockup-giaoviec.png'))) {
  s4.addImage({
    path: asset('mockup-giaoviec.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

// Right column: quy trình và bot telegram
const gvSteps = [
  {
    title: '1. Khởi tạo phiếu & Nhận diện Giám định',
    text: 'Nhập số phiếu, chọn khách hàng/mã máy. Hệ thống tự động quét cảnh báo nếu máy đang có Biên bản giám định chờ thay để gợi ý vật tư.',
    y: 1.15
  },
  {
    title: '2. Cơ chế Pool & Phân công linh hoạt',
    text: 'Có thể gán KTV đích danh (gửi DM riêng) hoặc đẩy vào Pool "Chờ nhận" (bắn lên Group Telegram chung để thợ tiện đường tự bấm nhận).',
    y: 2.05
  },
  {
    title: '3. Bot Telegram tự dọn rác thông minh',
    text: 'Khi có KTV nhận việc từ Pool, bot tự động sửa lại tin nhắn gốc trên nhóm thành "Đã nhận bởi KTV..." giúp group luôn gọn gàng.',
    y: 2.95
  },
  {
    title: '4. Tự động cuốn ngày phiếu tồn đọng',
    text: 'Các phiếu chưa làm trong ngày sẽ được cron job tự động cuốn sang ngày làm việc tiếp theo kèm huy hiệu cảnh báo tồn đọng.',
    y: 3.85
  }
];

gvSteps.forEach(s => {
  s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: s.y,
    w: 3.1,
    h: 0.75,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s4.addText(s.title, {
    x: 6.45,
    y: s.y + 0.06,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s4.addText(s.text, {
    x: 6.45,
    y: s.y + 0.28,
    w: 2.8,
    h: 0.42,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom rule bar
s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 8.8,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'FFF1F2' },
  line: { color: 'FECDD3', width: 1 }
});
s4.addText('⚠️ LƯU Ý KHI GIAO VIỆC: Mọi phiếu giao có gắn vật tư, mặc định cờ Hóa đơn là FALSE. Tech_admin rà soát kỹ đơn giá trước khi đẩy kế toán.', {
  x: 0.8,
  y: 4.75,
  w: 8.4,
  h: 0.3,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 5: HIỆN TRƯỜNG KTV — MOBILE APP (/ktv)
// =========================================================================
console.log('Building Slide 5: KTV Mobile...');
const s5 = pptx.addSlide();
s5.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s5, 'HIỆN TRƯỜNG KTV — ỨNG DỤNG DI ĐỘNG TIỆN LỢI (/ktv)', 'KỸ THUẬT LƯU ĐỘNG', 'KTV');

if (fs.existsSync(asset('mockup-ktv-mobile.png'))) {
  s5.addImage({
    path: asset('mockup-ktv-mobile.png'),
    x: 0.6,
    y: 1.15,
    w: 2.5,
    h: 3.9
  });
}

// Right column: Các tính năng mobile
const ktvFeatures = [
  {
    title: '📱 Thao tác 1 chạm tối giản',
    desc: 'KTV chỉ cần 1 cú chạm: "Nhận việc" từ Pool ➔ Bấm "Đang làm" khi tới nơi ➔ Bấm "Hoàn thành" khi sửa xong. Màn hình tự động cập nhật việc mới.',
    badge: 'QUY TRÌNH 3 BƯỚC',
    y: 1.15
  },
  {
    title: '📶 Hàng đợi Offline chống mất sóng dưới hầm',
    desc: 'Khi làm việc trong tầng hầm tòa nhà mất 4G/Wifi, KTV vẫn bấm trạng thái bình thường. Thao tác được lưu cục bộ và tự động đồng bộ lên server ngay khi có mạng.',
    badge: 'CÔNG NGHỆ ĐỘC QUYỀN',
    y: 2.15
  },
  {
    title: '⏱ Đo thời gian xử lý thực tế (Lead-time)',
    desc: 'Hệ thống tự động ghi nhận thời gian thực hiện từ lúc Đang làm đến Hoàn thành. Cho phép KTV hiệu chỉnh thời lượng khi có sự cố phát sinh.',
    badge: 'ĐO LƯỜNG NĂNG SUẤT',
    y: 3.15
  },
  {
    title: '🌴 Báo cáo ngày & Đăng ký nghỉ phép trực tuyến',
    desc: 'Cuối ngày KTV làm báo cáo vắn tắt gửi văn phòng. Tích hợp tab xin nghỉ phép/nghỉ ốm để Tech_admin duyệt ngay trên mobile /m.',
    badge: 'HÀNH CHÍNH TIỆN LỢI',
    y: 4.15
  }
];

ktvFeatures.forEach(f => {
  s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.3,
    y: f.y,
    w: 6.1,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s5.addText(f.title, {
    x: 3.45,
    y: f.y + 0.08,
    w: 4.3,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.8,
    y: f.y + 0.08,
    w: 1.45,
    h: 0.22,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s5.addText(f.badge, {
    x: 7.8,
    y: f.y + 0.08,
    w: 1.45,
    h: 0.22,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s5.addText(f.desc, {
    x: 3.45,
    y: f.y + 0.32,
    w: 5.7,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// =========================================================================
// SLIDE 6: KHO HÀNG — TỒN KHO, NGƯỠNG CẢNH BÁO & MÃ THAY THẾ
// =========================================================================
console.log('Building Slide 6: Kho Hàng & Tồn Kho...');
const s6 = pptx.addSlide();
s6.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s6, 'KHO HÀNG — QUẢN LÝ VẬT TƯ & CẢNH BÁO TỒN ĐA HÃNG', 'QUẢN TRỊ KHO VẬT TƯ', 'TECH_ADMIN · ADMIN');

if (fs.existsSync(asset('mockup-kho-hang.png'))) {
  s6.addImage({
    path: asset('mockup-kho-hang.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

const khoPillars = [
  {
    title: '1. Cảnh báo tồn kho đa hãng (Mig 72)',
    desc: 'Thiết lập ngưỡng tồn an toàn riêng cho từng mặt hàng (Konica, Xerox, Ricoh...). Khi tồn thực tế <= ngưỡng, hệ thống lập tức báo đỏ và gom vào danh sách cần mua.',
    y: 1.15
  },
  {
    title: '2. Mã ngưng dùng & Mã thay thế (Mig 73)',
    desc: 'Khi nhà sản xuất đổi mã hàng, hệ thống đánh dấu "Ngưng sử dụng" kèm "Mã thay thế". Ưu tiên xuất hết hàng tồn cũ trước khi chuyển sang mã mới.',
    y: 2.15
  },
  {
    title: '3. Cơ chế trừ kho phản ứng (Reactive Trigger)',
    desc: 'Tồn kho chỉ bị trừ tự động khi phiếu chuyển sang "Hoàn thành". Khi sửa phiếu hoặc hoàn trả vật tư, database tự động bù trừ net-zero cực kỳ an toàn.',
    y: 3.15
  },
  {
    title: '4. Tồn khả dụng vs Tồn thực tế',
    desc: 'Tồn khả dụng = Tồn thực tế trong kho trừ đi Số lượng đang giữ cho các phiếu đã giao nhưng chưa bấm hoàn thành, chống xuất đúp vật tư.',
    y: 4.15
  }
];

khoPillars.forEach(k => {
  s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: k.y,
    w: 3.1,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s6.addText(k.title, {
    x: 6.45,
    y: k.y + 0.08,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s6.addText(k.desc, {
    x: 6.45,
    y: k.y + 0.32,
    w: 2.8,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom notification
s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 5.5,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'EFF6FF' },
  line: { color: 'BFDBFE', width: 1 }
});
s6.addText('🔔 Chuông cảnh báo thông minh tại Header luôn hiển thị số lượng vật tư chạm ngưỡng nguy hiểm để văn phòng kịp thời đặt hàng dự phòng.', {
  x: 0.8,
  y: 4.75,
  w: 5.1,
  h: 0.3,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: COLOR_COBALT,
  bold: true,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 7: KHO HÀNG — QUY TRÌNH ĐẶT HÀNG PO & BẢO VỆ TỒN KHO
// =========================================================================
console.log('Building Slide 7: Quy trình Đặt Hàng PO...');
const s7 = pptx.addSlide();
s7.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s7, 'KHO HÀNG — QUY TRÌNH ĐẶT HÀNG PO & BẢO VỆ TỒN KHO', 'MUA SẮM VẬT TƯ', 'TECH_ADMIN · ADMIN');

if (fs.existsSync(asset('mockup-dat-hang.png'))) {
  s7.addImage({
    path: asset('mockup-dat-hang.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

// Right column: 4-step PO workflow
const poSteps = [
  {
    step: 'BƯỚC 1',
    title: 'Rà soát & Chọn vật tư',
    desc: 'Lọc nhanh các vật tư dưới ngưỡng hoặc hết hàng. Nhập số lượng dự kiến và bấm "+ Giỏ" để đưa vào giỏ hàng tạm thời.',
    y: 1.15
  },
  {
    step: 'BƯỚC 2',
    title: 'Tạo đơn đặt hàng PO Nháp',
    desc: 'Office kiểm tra giỏ hàng 2 cột cân đối, bấm "Tạo đơn PO Nháp". Giỏ hàng được giữ nguyên trạng thái nếu chuyển tab.',
    y: 2.05
  },
  {
    step: 'BƯỚC 3',
    title: 'Xuất Excel gửi Nhà Cung Cấp',
    desc: 'Xuất file Excel đơn đặt hàng 8 cột chuẩn hóa gửi cho nhà cung cấp vật tư. Đơn hàng chuyển sang trạng thái "Đang đặt".',
    y: 2.95
  },
  {
    step: 'BƯỚC 4',
    title: 'Ghi hàng về theo Mã Thực (Admin)',
    desc: 'Khi hàng về, chỉ Admin được ghi nhận nhập kho từng đợt (Mig 63). Nếu NCC giao model thay thế, cho phép ghi nhận mã thực nhận.',
    y: 3.85
  }
];

poSteps.forEach(p => {
  s7.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: p.y,
    w: 3.1,
    h: 0.75,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s7.addText(`${p.step}: ${p.title}`, {
    x: 6.45,
    y: p.y + 0.06,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s7.addText(p.desc, {
    x: 6.45,
    y: p.y + 0.28,
    w: 2.8,
    h: 0.42,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Warning
s7.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 8.8,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'FEF2F2' },
  line: { color: 'FECDD3', width: 1 }
});
s7.addText('🔒 CƠ CHẾ BẢO VỆ TỒN KHO: Đơn đặt hàng đã có đợt hàng về sẽ bị KHÓA CỨNG (chặn sửa cấu trúc hoặc hủy về nháp) để tránh sai lệch số liệu.', {
  x: 0.8,
  y: 4.75,
  w: 8.4,
  h: 0.3,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  bold: true,
  color: COLOR_VIBRANT_RED,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 8: THEO DÕI MÁY — BẢO TRÌ & GIÁM ĐỊNH
// =========================================================================
console.log('Building Slide 8: Bảo Trì & Giám Định...');
const s8 = pptx.addSlide();
s8.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s8, 'THEO DÕI MÁY — MA TRẬN BẢO TRÌ 12 THÁNG & GIÁM ĐỊNH', 'CHĂM SÓC KHÁCH HÀNG', 'TECH_ADMIN · KTV');

if (fs.existsSync(asset('mockup-bao-tri.png'))) {
  s8.addImage({
    path: asset('mockup-bao-tri.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

const btCards = [
  {
    title: '1. Ma trận đối chiếu 12 tháng minh bạch',
    desc: 'Mỗi máy hiển thị rõ 12 cột tháng: ✓ Đã làm, ✕ Quá hạn, · Chưa tới, N Tạm dừng. Tính toán chính xác số lần thiếu thực tế để quyết toán khách hàng.',
    y: 1.15
  },
  {
    title: '2. Lịch bảo trì theo chu kỳ riêng (Mig 28)',
    desc: 'Hỗ trợ cấu hình máy bảo trì 1 tháng, 2 tháng, hoặc theo quý. Máy không bị đòi oan ở những tháng không có trong hợp đồng.',
    y: 2.15
  },
  {
    title: '3. Giám định ➔ Tự động tạo Báo giá 4 trang',
    desc: 'Biên bản giám định linh kiện hao mòn tự động liên kết tạo Báo giá .docx 4 trang với 3 mức cạnh tranh (+3%, +5%, +6%) chuyên nghiệp.',
    y: 3.15
  },
  {
    title: '4. In Sổ theo dõi máy kèm QR Code',
    desc: 'Hỗ trợ in 2 trang A4 ngang chuẩn chỉnh có mã QR để dán lên thân máy khách hàng. KTV chỉ cần quét QR để tra cứu lịch sử.',
    y: 4.15
  }
];

btCards.forEach(b => {
  s8.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: b.y,
    w: 3.1,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s8.addText(b.title, {
    x: 6.45,
    y: b.y + 0.08,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s8.addText(b.desc, {
    x: 6.45,
    y: b.y + 0.32,
    w: 2.8,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

s8.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 5.5,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'F0FDF4' },
  line: { color: 'BBF7D0', width: 1 }
});
s8.addText('📑 Tính năng Xuất Excel Đối Chiếu Năm: Giúp phòng Hành chính xuất báo cáo quyết toán nhanh chóng chỉ với 1 click chuột.', {
  x: 0.8,
  y: 4.75,
  w: 5.1,
  h: 0.3,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: COLOR_SUCCESS,
  bold: true,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 9: TÀI CHÍNH — BẢNG ĐIỀU PHỐI KANBAN HÓA ĐƠN 4 CỘT
// =========================================================================
console.log('Building Slide 9: Kanban Hóa Đơn...');
const s9 = pptx.addSlide();
s9.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s9, 'TÀI CHÍNH — BẢNG ĐIỀU PHỐI KANBAN HÓA ĐƠN 4 CỘT', 'QUY TRÌNH KẾ TOÁN & CÔNG NỢ', 'KTHC · TECH_ADMIN · ADMIN');

if (fs.existsSync(asset('mockup-kanban.png'))) {
  s9.addImage({
    path: asset('mockup-kanban.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

// Right column: 4 Cột Kanban
const kanbanCols = [
  {
    col: 'CỘT 1',
    title: 'Chờ lên hóa đơn (Office)',
    desc: 'Văn phòng rà soát vật tư, chỉnh tên/giá riêng theo khách, kéo thả sắp xếp thứ tự in và bấm "Bàn giao sang Kế toán".',
    color: COLOR_COBALT,
    y: 1.15
  },
  {
    col: 'CỘT 2',
    title: 'KT-HC lên hóa đơn (Kế toán)',
    desc: 'Phiếu bị khóa sửa vật tư. Kế toán xuất Excel M-invoice. Nếu phát hiện thiếu thông tin, bấm "Trả lại Cột 1 kèm lý do" (Mig 57).',
    color: COLOR_COBALT_LIGHT,
    y: 2.05
  },
  {
    col: 'CỘT 3',
    title: 'Chờ thanh toán (Tuổi nợ)',
    desc: 'Nhập số hóa đơn thật. Thẻ tự động gom nhóm theo số HĐ kèm huy hiệu tuổi nợ (7 - 15 - 30 ngày) và banner cảnh báo.',
    color: COLOR_WARNING,
    y: 2.95
  },
  {
    col: 'CỘT 4',
    title: 'Đã thanh toán (Hoàn tất)',
    desc: 'Kế toán ghi nhận tiền thu lũy kế. Khi số tiền thu đủ tổng sau thuế, thẻ tự động chuyển sang Đã thanh toán hoàn tất chu trình.',
    color: COLOR_SUCCESS,
    y: 3.85
  }
];

kanbanCols.forEach(c => {
  s9.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: c.y,
    w: 3.1,
    h: 0.75,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s9.addText(`${c.col}: ${c.title}`, {
    x: 6.45,
    y: c.y + 0.06,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: c.color,
    isTextBox: true,
    margin: 0
  });
  s9.addText(c.desc, {
    x: 6.45,
    y: c.y + 0.28,
    w: 2.8,
    h: 0.42,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Banner
s9.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 8.8,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'EFF6FF' },
  line: { color: 'BFDBFE', width: 1 }
});
s9.addText('👥 PHÂN QUYỀN ĐẶC BIỆT: Kế toán (kthc) chỉ nhìn thấy Cột 2, 3, 4. Tech_admin thấy toàn bộ nhưng không được sửa hóa đơn đã chốt số.', {
  x: 0.8,
  y: 4.75,
  w: 8.4,
  h: 0.3,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  bold: true,
  color: COLOR_COBALT,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 10: TÍCH HỢP HÓA ĐƠN M-INVOICE & XUẤT CHỨNG TỪ
// =========================================================================
console.log('Building Slide 10: M-invoice & Chứng từ Word...');
const s10 = pptx.addSlide();
s10.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s10, 'TÀI CHÍNH — XUẤT HÓA ĐƠN M-INVOICE & CHỨNG TỪ PHÁP LÝ', 'TỰ ĐỘNG HÓA KẾ TOÁN', 'KTHC · ADMIN');

if (fs.existsSync(asset('mockup-minvoice.png'))) {
  s10.addImage({
    path: asset('mockup-minvoice.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

const minvFeatures = [
  {
    title: '1. Xuất Excel M-invoice 32 cột mẫu',
    desc: 'Chỉ 1 click xuất cả lô hóa đơn. Tự động gom nhiều dòng vật tư vào cùng 1 số đơn hàng, chuẩn hóa ĐVT (Cái, Hộp, Bộ, Ram) và mã thuế suất.',
    y: 1.15
  },
  {
    title: '2. Chống hóa đơn đúp nhiều lớp (Mig 60)',
    desc: 'Đóng dấu điện tử atomic minvoice_luc, nút xuất hàng loạt chỉ tải các thẻ chưa xuất. Neo chân lý theo số HĐ thật ngăn ngừa hoàn toàn lỗi đúp.',
    y: 2.15
  },
  {
    title: '3. Xuất Word BBBG & ĐNTT tự động',
    desc: 'Tự động tạo Biên bản bàn giao và Giấy đề nghị thanh toán với số tăng tự động theo năm ({YY}-{seq}/ĐNTT-ST) sẵn sàng in ký đóng dấu.',
    y: 3.15
  },
  {
    title: '4. Xuất dữ liệu công nợ thô (Pivot Table)',
    desc: 'Xuất file Excel công nợ 2 sheet phẳng: Nợ chưa thu (lũy kế số dư) và Đã thanh toán (phát sinh) để kế toán dễ dàng pivot đối soát.',
    y: 4.15
  }
];

minvFeatures.forEach(m => {
  s10.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: m.y,
    w: 3.1,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s10.addText(m.title, {
    x: 6.45,
    y: m.y + 0.08,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s10.addText(m.desc, {
    x: 6.45,
    y: m.y + 0.32,
    w: 2.8,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

s10.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 5.5,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'F0FDF4' },
  line: { color: 'BBF7D0', width: 1 }
});
s10.addText('⚡ TIẾT KIỆM 90% THỜI GIAN: Kế toán không phải gõ tay từng dòng lên phần mềm hóa đơn, loại bỏ hoàn toàn sai lệch số liệu và thuế suất.', {
  x: 0.8,
  y: 4.75,
  w: 5.1,
  h: 0.3,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: COLOR_SUCCESS,
  bold: true,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 11: CHO THUÊ MÁY & THU PHÍ CPC (BILLING)
// =========================================================================
console.log('Building Slide 11: Thuê / CPC...');
const s11 = pptx.addSlide();
s11.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s11, 'DỊCH VỤ — QUẢN LÝ MÁY THUÊ & THU PHÍ BẢN CHỤP CPC', 'MÁY THUÊ & BILLING', 'ADMIN · TECH_ADMIN · KINH_DOANH');

if (fs.existsSync(asset('mockup-thue-cpc.png'))) {
  s11.addImage({
    path: asset('mockup-thue-cpc.png'),
    x: 0.6,
    y: 1.15,
    w: 5.5,
    h: 3.3
  });
}

const cpcCards = [
  {
    title: '1. Cấu hình Đơn giá & Định mức máy',
    desc: 'Hỗ trợ tính phí phức hợp: Đơn giá bản đen/màu, định mức miễn phí, cam kết doanh thu tối thiểu, phân biệt máy màu và máy đen trắng.',
    y: 1.15
  },
  {
    title: '2. Nhắc nhở chốt Counter định kỳ',
    desc: 'Cấu hình ngày chốt số riêng từng máy (1-31 hoặc cuối tháng). Banner cảnh báo trực quan: 🟢 Đã lấy, 🟡 Sắp đến ngày, 🔴 Quá hạn chốt.',
    y: 2.15
  },
  {
    title: '3. Xuất Bảng kê Word chuyên nghiệp',
    desc: 'Hỗ trợ 2 mẫu Word chuẩn: Bảng kê đơn máy (A4 dọc) và Bảng kê đa máy theo Hợp đồng khung (A3 ngang) sẵn sàng in kèm chân trang.',
    y: 3.15
  },
  {
    title: '4. Đẩy thẳng sang Kanban & Cổng /kho-thue',
    desc: '1-Click đẩy bảng kê sang Kanban Cột 1 để xuất hóa đơn. Đồng thời cổng /kho-thue cho phép phòng Kinh doanh tra cứu máy sẵn sàng xuất.',
    y: 4.15
  }
];

cpcCards.forEach(c => {
  s11.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.3,
    y: c.y,
    w: 3.1,
    h: 0.85,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s11.addText(c.title, {
    x: 6.45,
    y: c.y + 0.08,
    w: 2.8,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_COBALT,
    isTextBox: true,
    margin: 0
  });
  s11.addText(c.desc, {
    x: 6.45,
    y: c.y + 0.32,
    w: 2.8,
    h: 0.45,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

s11.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 4.65,
  w: 5.5,
  h: 0.5,
  rectRadius: 0.08,
  fill: { color: 'FFFBEB' },
  line: { color: 'FDE68A', width: 1 }
});
s11.addText('🎯 TIỆN ÍCH NHẬP COUNTER: Nút lưu là icon gọn nhẹ, cho phép xuất bảng kê ngay tại tab Nhập counter đối với máy đơn lẻ cực kỳ nhanh chóng.', {
  x: 0.8,
  y: 4.75,
  w: 5.1,
  h: 0.3,
  fontSize: 8.5,
  fontFace: FONT_PRIMARY,
  color: COLOR_WARNING,
  bold: true,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 12: QUẢN TRỊ HỆ THỐNG, AN NINH & QUY TẮC BẮT BUỘC
// =========================================================================
console.log('Building Slide 12: Quản Trị & Bảo Mật...');
const s12 = pptx.addSlide();
s12.background = { color: COLOR_BG_LIGHT };
addSlideHeader(s12, 'QUẢN TRỊ — AN NINH, BẢO TRÌ KÍN & QUY TẮC BẮT BUỘC', 'HỆ THỐNG & BẢO MẬT', 'ADMIN');

const secCards = [
  {
    title: '🛡 Chế độ bảo trì ngụy trang sự cố 503',
    desc: 'Khi cần bảo trì hệ thống, app cố ý hiển thị lỗi "HTTP 503 Sự cố máy chủ", dừng toàn bộ bot Telegram và khóa đăng nhập. Admin có đường dẫn bí mật ?qt=<khóa> để vào làm việc.',
    badge: 'BẢO TRÌ AN TOÀN',
    x: 0.6,
    y: 1.15
  },
  {
    title: '🔑 Đăng nhập sinh trắc học Passkey',
    desc: 'KTV và quản trị viên di động có thể đăng nhập bằng Vân tay / Face ID thông qua WebAuthn chuẩn quốc tế. Cực kỳ nhanh chóng và không sợ lộ mật khẩu.',
    badge: 'MOBILE PASSKEY',
    x: 5.2,
    y: 1.15
  },
  {
    title: '🚫 Quy tắc cấm phím tắt Enter / Escape',
    desc: 'Mọi thao tác lưu, xóa, duyệt bắt buộc phải CLICK CHUỘT vào nút. Hệ thống chặn Enter/Esc để ngăn ngừa người dùng bấm nhầm khi app đang tải dữ liệu.',
    badge: 'CHỐNG THAO TÁC NHẦM',
    x: 0.6,
    y: 2.35
  },
  {
    title: '💵 Chuẩn hóa hiển thị Tiền & Ngày tháng',
    desc: 'Mọi số tiền đều phân tách hàng nghìn bằng dấu chấm (2.000.000 đ). Mọi ngày tháng đều bắt buộc định dạng DD/MM/YYYY qua component DateField chuyên biệt.',
    badge: 'QUY TẮC HIỂN THỊ',
    x: 5.2,
    y: 2.35
  }
];

secCards.forEach(c => {
  s12.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: c.x,
    y: c.y,
    w: 4.2,
    h: 1.05,
    rectRadius: 0.08,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_CARD_BORDER, width: 1 }
  });
  s12.addText(c.title, {
    x: c.x + 0.15,
    y: c.y + 0.1,
    w: 2.8,
    h: 0.22,
    fontSize: 10,
    fontFace: FONT_TITLE,
    bold: true,
    color: COLOR_DEEP_COBALT,
    isTextBox: true,
    margin: 0
  });
  s12.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: c.x + 2.8,
    y: c.y + 0.1,
    w: 1.25,
    h: 0.2,
    rectRadius: 0.04,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.5 }
  });
  s12.addText(c.badge, {
    x: c.x + 2.8,
    y: c.y + 0.1,
    w: 1.25,
    h: 0.2,
    fontSize: 7.5,
    fontFace: FONT_PRIMARY,
    bold: true,
    color: COLOR_MUTED_SLATE,
    align: 'center',
    isTextBox: true,
    margin: 0
  });
  s12.addText(c.desc, {
    x: c.x + 0.15,
    y: c.y + 0.36,
    w: 3.9,
    h: 0.6,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: COLOR_MUTED_SLATE,
    isTextBox: true,
    margin: 0
  });
});

// Bottom Audit Card
s12.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 0.6,
  y: 3.65,
  w: 8.8,
  h: 1.4,
  rectRadius: 0.08,
  fill: { color: 'F8FAFC' },
  line: { color: COLOR_COBALT, width: 1.5 }
});
s12.addText('📋 HỆ THỐNG AUDIT LOG & KIỂM SOÁT PHÂN QUYỀN TAB', {
  x: 0.8,
  y: 3.8,
  w: 8.4,
  h: 0.25,
  fontSize: 11,
  fontFace: FONT_TITLE,
  bold: true,
  color: COLOR_COBALT,
  isTextBox: true,
  margin: 0
});
s12.addText([
  { text: '• Audit Logs: Mọi hành động nhạy cảm (tạo phiếu, sửa vật tư, xóa đơn đặt hàng, đổi trạng thái hóa đơn) đều được ghi nhận IP, thiết bị, tài khoản và thời gian chính xác.', breakLine: true },
  { text: '• Phân quyền 3 cấp (Cha - Con - Cháu): Admin có thể bật/tắt quyền xem từng tab con hoặc từng nút chức năng đối với từng tài khoản trong công ty.', breakLine: true },
  { text: '• Tự động cập nhật phiên bản: App tự kiểm tra phiên bản mới từ server và hiển thị thanh nhắc reload nhẹ nhàng mà không làm mất dữ liệu người dùng đang nhập.', breakLine: false }
], {
  x: 0.8,
  y: 4.12,
  w: 8.4,
  h: 0.8,
  fontSize: 9,
  fontFace: FONT_PRIMARY,
  color: COLOR_DARK_SLATE,
  isTextBox: true,
  margin: 0
});

// =========================================================================
// SLIDE 13: LỜI KẾT & 5 NGUYÊN TẮC PHỐI HỢP VÀNG
// =========================================================================
console.log('Building Slide 13: Golden Rules & Closing...');
const s13 = pptx.addSlide();
s13.background = { color: COLOR_DEEP_COBALT };

s13.addText('5 NGUYÊN TẮC VÀNG ĐỂ VẬN HÀNH HỆ THỐNG HAST HIỆU QUẢ', {
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

const goldenRules = [
  {
    dept: 'KỸ THUẬT HIỆN TRƯỜNG (KTV)',
    rule: 'Bấm "Đang làm" ngay khi chạm máy, bấm "Hoàn thành" trước khi rời khỏi khách hàng để hệ thống tính đúng lead-time và tự động trừ kho.',
    color: COLOR_SONIC_RED,
    y: 1.05
  },
  {
    dept: 'VĂN PHÒNG ĐIỀU PHỐI (TECH_ADMIN / STAFF)',
    rule: 'Rà soát kỹ model máy, khách hàng và đơn giá vật tư trước khi bấm "Bàn giao sang Kế toán". Tránh để kế toán phải trả lại phiếu.',
    color: '38BDF8',
    y: 1.8
  },
  {
    dept: 'QUẢN LÝ KHO (ADMIN)',
    rule: 'Theo dõi chuông cảnh báo tồn kho hàng ngày. Tạo PO nháp kịp thời và chỉ Admin mới được ghi nhận hàng về để bảo vệ tính toàn vẹn của kho.',
    color: 'FBBF24',
    y: 2.55
  },
  {
    dept: 'KẾ TOÁN HÀNH CHÍNH (KTHC)',
    rule: 'Xuất file M-invoice 32 cột định kỳ, nhập số hóa đơn ngay khi xuất xong và theo dõi sát sao thẻ nợ quá hạn 7 - 15 - 30 ngày trên Kanban.',
    color: '34D399',
    y: 3.3
  },
  {
    dept: 'KINH DOANH & LÃNH ĐẠO (SALES / ADMIN)',
    rule: 'Khai thác cổng /kho-thue để tư vấn máy thuê sẵn sàng; sử dụng file xuất công nợ thô để pivot phân tích dòng tiền và ra quyết định.',
    color: 'C084FC',
    y: 4.05
  }
];

goldenRules.forEach(g => {
  s13.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7,
    y: g.y,
    w: 8.6,
    h: 0.65,
    rectRadius: 0.08,
    fill: { color: '0A2558' },
    line: { color: '1E40AF', width: 1 }
  });
  s13.addText(g.dept, {
    x: 0.9,
    y: g.y + 0.06,
    w: 8.2,
    h: 0.2,
    fontSize: 9.5,
    fontFace: FONT_TITLE,
    bold: true,
    color: g.color,
    isTextBox: true,
    margin: 0
  });
  s13.addText(g.rule, {
    x: 0.9,
    y: g.y + 0.26,
    w: 8.2,
    h: 0.35,
    fontSize: 8.5,
    fontFace: FONT_PRIMARY,
    color: 'E2E8F0',
    isTextBox: true,
    margin: 0
  });
});

s13.addText('HỆ THỐNG VẬN HÀNH HAST — ĐOÀN KẾT, CHÍNH XÁC VÀ HIỆU QUẢ TỪNG GIÂY PHÚT', {
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
const outputPath = path.join(__dirname, '../Huong-Dan-Su-Dung-HAST.pptx');
pptx.writeFile({ fileName: outputPath })
  .then(() => {
    console.log('PowerPoint successfully generated at:', outputPath);
  })
  .catch(err => {
    console.error('Error generating PowerPoint:', err);
    process.exit(1);
  });
