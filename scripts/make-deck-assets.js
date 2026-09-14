const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, 'pptx-assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 1. Sơ đồ hệ sinh thái khép kín (End-to-End Workflow)
async function makeWorkflowGraphic() {
  const svg = `
  <svg width="1200" height="600" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="#1E293B"/>
      </linearGradient>
      <linearGradient id="cobaltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0047AB"/>
        <stop offset="100%" stop-color="#1D4ED8"/>
      </linearGradient>
      <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF2A54"/>
        <stop offset="100%" stop-color="#E11D48"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>

    <rect width="1200" height="600" rx="16" fill="url(#bgGrad)"/>

    <!-- Grid lines -->
    <line x1="100" y1="300" x2="1100" y2="300" stroke="#334155" stroke-width="3" stroke-dasharray="6,6"/>

    <!-- 5 Main Nodes -->
    <!-- Node 1: Khách hàng & Tiếp nhận -->
    <g transform="translate(60, 180)" filter="url(#shadow)">
      <rect width="190" height="240" rx="12" fill="#1E293B" stroke="#0047AB" stroke-width="2"/>
      <rect width="190" height="42" rx="12" fill="url(#cobaltGrad)"/>
      <text x="95" y="27" fill="#FFFFFF" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">1. KHÁCH HÀNG</text>
      <text x="95" y="80" fill="#38BDF8" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">Yêu Cầu / Sự Cố</text>
      <text x="20" y="115" fill="#94A3B8" font-family="Arial" font-size="11">• Gọi hotline / Zalo</text>
      <text x="20" y="140" fill="#94A3B8" font-family="Arial" font-size="11">• Báo kẹt giấy, hết mực</text>
      <text x="20" y="165" fill="#94A3B8" font-family="Arial" font-size="11">• Định kỳ bảo trì máy</text>
      <text x="20" y="190" fill="#94A3B8" font-family="Arial" font-size="11">• Điểm máy có mã QR</text>
      <rect x="25" y="205" width="140" height="22" rx="4" fill="#0047AB" fill-opacity="0.3"/>
      <text x="95" y="220" fill="#60A5FA" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">ĐẦU VÀO DỊCH VỤ</text>
    </g>

    <!-- Arrow 1 -> 2 -->
    <path d="M 260 300 L 290 300" stroke="#FF2A54" stroke-width="4" stroke-linecap="round"/>
    <polygon points="290,294 302,300 290,306" fill="#FF2A54"/>

    <!-- Node 2: Office Điều phối -->
    <g transform="translate(310, 180)" filter="url(#shadow)">
      <rect width="190" height="240" rx="12" fill="#1E293B" stroke="#38BDF8" stroke-width="2"/>
      <rect width="190" height="42" rx="12" fill="#0369A1"/>
      <text x="95" y="27" fill="#FFFFFF" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">2. ĐIỀU PHỐI (OFFICE)</text>
      <text x="95" y="80" fill="#7DD3FC" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">Sổ Công Tác / Pool</text>
      <text x="20" y="115" fill="#94A3B8" font-family="Arial" font-size="11">• Tạo phiếu giao việc</text>
      <text x="20" y="140" fill="#94A3B8" font-family="Arial" font-size="11">• Gán KTV hoặc đẩy Pool</text>
      <text x="20" y="165" fill="#94A3B8" font-family="Arial" font-size="11">• Bắn bot Telegram nhóm</text>
      <text x="20" y="190" fill="#94A3B8" font-family="Arial" font-size="11">• Gắn vật tư &amp; giá riêng</text>
      <rect x="25" y="205" width="140" height="22" rx="4" fill="#0284C7" fill-opacity="0.3"/>
      <text x="95" y="220" fill="#38BDF8" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">TECH_ADMIN / STAFF</text>
    </g>

    <!-- Arrow 2 -> 3 -->
    <path d="M 510 300 L 540 300" stroke="#FF2A54" stroke-width="4" stroke-linecap="round"/>
    <polygon points="540,294 552,300 540,306" fill="#FF2A54"/>

    <!-- Node 3: KTV Hiện trường -->
    <g transform="translate(560, 180)" filter="url(#shadow)">
      <rect width="190" height="240" rx="12" fill="#1E293B" stroke="#E11D48" stroke-width="2"/>
      <rect width="190" height="42" rx="12" fill="url(#redGrad)"/>
      <text x="95" y="27" fill="#FFFFFF" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">3. KTV HIỆN TRƯỜNG</text>
      <text x="95" y="80" fill="#FDA4AF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">KTV Mobile App (/ktv)</text>
      <text x="20" y="115" fill="#94A3B8" font-family="Arial" font-size="11">• Nhận việc / Quét QR máy</text>
      <text x="20" y="140" fill="#94A3B8" font-family="Arial" font-size="11">• Bấm Đang làm → Xong</text>
      <text x="20" y="165" fill="#94A3B8" font-family="Arial" font-size="11">• Đo Lead-time thực tế</text>
      <text x="20" y="190" fill="#94A3B8" font-family="Arial" font-size="11">• Hàng đợi Offline dưới hầm</text>
      <rect x="25" y="205" width="140" height="22" rx="4" fill="#BE123C" fill-opacity="0.3"/>
      <text x="95" y="220" fill="#FB7185" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">KỸ THUẬT VIÊN (KTV)</text>
    </g>

    <!-- Arrow 3 -> 4 -->
    <path d="M 760 300 L 790 300" stroke="#FF2A54" stroke-width="4" stroke-linecap="round"/>
    <polygon points="790,294 802,300 790,306" fill="#FF2A54"/>

    <!-- Node 4: Kho Hàng & Vật Tư -->
    <g transform="translate(810, 180)" filter="url(#shadow)">
      <rect width="190" height="240" rx="12" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
      <rect width="190" height="42" rx="12" fill="#D97706"/>
      <text x="95" y="27" fill="#FFFFFF" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">4. KHO &amp; VẬT TƯ</text>
      <text x="95" y="80" fill="#FCD34D" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">Trigger Tự Động Trừ</text>
      <text x="20" y="115" fill="#94A3B8" font-family="Arial" font-size="11">• Trừ kho khi Hoàn thành</text>
      <text x="20" y="140" fill="#94A3B8" font-family="Arial" font-size="11">• Báo động tồn &lt; Ngưỡng</text>
      <text x="20" y="165" fill="#94A3B8" font-family="Arial" font-size="11">• Mã ngưng &amp; Mã thay thế</text>
      <text x="20" y="190" fill="#94A3B8" font-family="Arial" font-size="11">• Đặt hàng PO &amp; Hàng về</text>
      <rect x="25" y="205" width="140" height="22" rx="4" fill="#B45309" fill-opacity="0.3"/>
      <text x="95" y="220" fill="#FBBF24" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">QUẢN LÝ KHO (ADMIN)</text>
    </g>

    <!-- Arrow 4 -> 5 -->
    <path d="M 1010 300 L 1035 300" stroke="#FF2A54" stroke-width="4" stroke-linecap="round"/>
    <polygon points="1035,294 1047,300 1035,306" fill="#FF2A54"/>

    <!-- Node 5: Kế toán & Dòng tiền -->
    <g transform="translate(1055, 180)" filter="url(#shadow)">
      <rect width="190" height="240" rx="12" fill="#1E293B" stroke="#10B981" stroke-width="2"/>
      <rect width="190" height="42" rx="12" fill="#059669"/>
      <text x="95" y="27" fill="#FFFFFF" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">5. KẾ TOÁN &amp; THU</text>
      <text x="95" y="80" fill="#6EE7B7" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">Kanban HĐ 4 Cột</text>
      <text x="20" y="115" fill="#94A3B8" font-family="Arial" font-size="11">• Khóa sửa vật tư</text>
      <text x="20" y="140" fill="#94A3B8" font-family="Arial" font-size="11">• Xuất M-invoice 32 cột</text>
      <text x="20" y="165" fill="#94A3B8" font-family="Arial" font-size="11">• Xuất BBBG + ĐNTT Word</text>
      <text x="20" y="190" fill="#94A3B8" font-family="Arial" font-size="11">• Thu tiền &amp; Tuổi nợ</text>
      <rect x="25" y="205" width="140" height="22" rx="4" fill="#047857" fill-opacity="0.3"/>
      <text x="95" y="220" fill="#34D399" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">KẾ TOÁN (KTHC)</text>
    </g>

    <!-- Top & Bottom highlights -->
    <text x="600" y="70" fill="#FFFFFF" font-family="Arial" font-size="24" font-weight="bold" text-anchor="middle">VÒNG KHÉP KÍN DỮ LIỆU ĐIỀU HÀNH DOANH NGHIỆP HAST</text>
    <text x="600" y="105" fill="#94A3B8" font-family="Arial" font-size="14" text-anchor="middle">Từ cuộc gọi khách hàng đến điều phối, thực hiện ngoài hiện trường, kiểm soát kho và thu tiền hoàn tất</text>

    <!-- Realtime badge -->
    <rect x="420" y="470" width="360" height="40" rx="20" fill="#0F172A" stroke="#FF2A54" stroke-width="2"/>
    <circle cx="445" cy="490" r="6" fill="#10B981"/>
    <text x="465" y="495" fill="#F1F5F9" font-family="Arial" font-size="13" font-weight="bold">Realtime Broadcast + Telegram Bot đồng bộ tức thì</text>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'workflow-overview.png'));
  console.log('✓ Created workflow-overview.png');
}

// 2. UI Mockup: Sổ Công Tác (Giao Việc PC)
async function makeGiaoViecMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <!-- Window Header -->
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <circle cx="25" cy="21" r="6" fill="#FF2A54"/>
    <circle cx="45" cy="21" r="6" fill="#FBBF24"/>
    <circle cx="65" cy="21" r="6" fill="#10B981"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Admin — Sổ Công Tác &amp; Điều Phối Giao Việc</text>

    <!-- Sub Header / Navigation -->
    <rect y="42" width="1000" height="48" fill="#FFFFFF" stroke="#E2E8F0"/>
    <rect x="20" y="52" width="110" height="28" rx="4" fill="#0047AB"/>
    <text x="75" y="70" fill="#FFFFFF" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">Giao việc (4)</text>
    <rect x="140" y="52" width="100" height="28" rx="4" fill="#F1F5F9"/>
    <text x="190" y="70" fill="#475569" font-family="Arial" font-size="12" text-anchor="middle">Hoàn phiếu (0)</text>
    <rect x="250" y="52" width="110" height="28" rx="4" fill="#F1F5F9"/>
    <text x="305" y="70" fill="#475569" font-family="Arial" font-size="12" text-anchor="middle">Quét QR bảo trì</text>

    <rect x="760" y="52" width="220" height="28" rx="4" fill="#FEF2F2" stroke="#FF2A54"/>
    <text x="870" y="70" fill="#E11D48" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">🔔 2 Phiếu chưa làm tiếp</text>

    <!-- Toolbar Filters -->
    <rect x="20" y="105" width="960" height="55" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
    <rect x="35" y="118" width="130" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="45" y="138" fill="#64748B" font-family="Arial" font-size="11">📅 13/09/2026</text>
    <rect x="175" y="118" width="140" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="185" y="138" fill="#64748B" font-family="Arial" font-size="11">🔍 Tìm khách / số phiếu</text>
    <rect x="325" y="118" width="120" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="335" y="138" fill="#64748B" font-family="Arial" font-size="11">Trạng thái: Tất cả ▼</text>
    <rect x="455" y="118" width="110" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="465" y="138" fill="#64748B" font-family="Arial" font-size="11">KTV: Tất cả ▼</text>

    <rect x="850" y="118" width="115" height="30" rx="4" fill="#E11D48"/>
    <text x="907" y="138" fill="#FFFFFF" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle">+ Tạo phiếu mới</text>

    <!-- Table Data -->
    <g transform="translate(20, 175)">
      <rect width="960" height="380" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <!-- Table Header -->
      <rect width="960" height="36" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="25" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">SỐ PHIẾU</text>
      <text x="110" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">KHÁCH HÀNG / ĐIỂM MÁY</text>
      <text x="360" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">MODEL / MÃ</text>
      <text x="490" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">LOẠI VIỆC</text>
      <text x="610" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">KTV PHỤ TRÁCH</text>
      <text x="760" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">TRẠNG THÁI</text>
      <text x="890" y="23" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">TG XỬ LÝ</text>

      <!-- Row 1 -->
      <line x1="0" y1="36" x2="960" y2="36" stroke="#F1F5F9"/>
      <text x="25" y="68" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">958102</text>
      <text x="110" y="62" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Chi cục Thuế Ba Đình</text>
      <text x="110" y="78" fill="#64748B" font-family="Arial" font-size="10">Phòng Hành chính — Tầng 2</text>
      <text x="360" y="68" fill="#334155" font-family="Courier" font-size="12">Bizhub 367 · <tspan fill="#0047AB">36051</tspan></text>
      <text x="490" y="68" fill="#334155" font-family="Arial" font-size="11">Thay sấy + Rulo</text>
      <text x="610" y="68" fill="#0F172A" font-family="Arial" font-size="12">Nguyễn Văn Tuấn</text>
      <rect x="750" y="54" width="85" height="22" rx="4" fill="#DEF7EC"/>
      <text x="792" y="69" fill="#03543F" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Hoàn thành</text>
      <text x="895" y="68" fill="#64748B" font-family="Arial" font-size="11">45 phút</text>

      <!-- Row 2 -->
      <line x1="0" y1="92" x2="960" y2="92" stroke="#F1F5F9"/>
      <text x="25" y="124" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">958103</text>
      <text x="110" y="118" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Bệnh Viện Nhi Trung Ương</text>
      <text x="110" y="134" fill="#64748B" font-family="Arial" font-size="10">Khoa Khám bệnh — P.102</text>
      <text x="360" y="124" fill="#334155" font-family="Courier" font-size="12">DocuCentre IV · <tspan fill="#0047AB">35256</tspan></text>
      <text x="490" y="124" fill="#334155" font-family="Arial" font-size="11">Sửa kẹt giấy cụm sấy</text>
      <text x="610" y="124" fill="#0F172A" font-family="Arial" font-size="12">Trần Văn Hưng</text>
      <rect x="750" y="110" width="85" height="22" rx="4" fill="#E1EFFE"/>
      <text x="792" y="125" fill="#1E429F" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Đang làm</text>
      <text x="895" y="124" fill="#64748B" font-family="Arial" font-size="11">--</text>

      <!-- Row 3 -->
      <line x1="0" y1="148" x2="960" y2="148" stroke="#F1F5F9"/>
      <text x="25" y="180" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">958104</text>
      <text x="110" y="174" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Ngân Hàng Agribank CN Hà Nội</text>
      <text x="110" y="190" fill="#64748B" font-family="Arial" font-size="10">Phòng Kế toán tổng hợp</text>
      <text x="360" y="180" fill="#334155" font-family="Courier" font-size="12">Ricoh MP 5055 · <tspan fill="#0047AB">36167</tspan></text>
      <text x="490" y="180" fill="#334155" font-family="Arial" font-size="11">Giao mực đen + Bảo trì</text>
      <text x="610" y="180" fill="#64748B" font-family="Arial" font-size="12" font-style="italic">Chưa gán (Pool)</text>
      <rect x="750" y="166" width="85" height="22" rx="4" fill="#FEEBC8"/>
      <text x="792" y="181" fill="#7B341E" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Chờ nhận</text>
      <text x="895" y="180" fill="#64748B" font-family="Arial" font-size="11">--</text>

      <!-- Row 4 -->
      <line x1="0" y1="204" x2="960" y2="204" stroke="#F1F5F9"/>
      <text x="25" y="236" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">958105</text>
      <text x="110" y="230" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Tập đoàn Viễn thông Quân đội</text>
      <text x="110" y="246" fill="#64748B" font-family="Arial" font-size="10">Ban Dự án — Tầng 8</text>
      <text x="360" y="236" fill="#334155" font-family="Courier" font-size="12">Bizhub C458 · <tspan fill="#0047AB">36148</tspan></text>
      <text x="490" y="236" fill="#334155" font-family="Arial" font-size="11">Kiểm tra báo lỗi C-2557</text>
      <text x="610" y="236" fill="#0F172A" font-family="Arial" font-size="12">Lê Hoàng Nam</text>
      <rect x="750" y="222" width="85" height="22" rx="4" fill="#FDF2F8"/>
      <text x="792" y="237" fill="#9D174D" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Đã nhận</text>
      <text x="895" y="236" fill="#64748B" font-family="Arial" font-size="11">--</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-giaoviec.png'));
  console.log('✓ Created mockup-giaoviec.png');
}

// 3. UI Mockup: KTV Mobile (/ktv)
async function makeKtvMobileMockup() {
  const svg = `
  <svg width="450" height="700" viewBox="0 0 450 700" xmlns="http://www.w3.org/2000/svg">
    <!-- Phone Outer Body -->
    <rect width="450" height="700" rx="40" fill="#0F172A" stroke="#334155" stroke-width="4"/>
    <!-- Screen Area -->
    <rect x="18" y="20" width="414" height="660" rx="30" fill="#F8FAFC"/>

    <!-- Notch / Island -->
    <rect x="155" y="28" width="140" height="22" rx="11" fill="#0F172A"/>

    <!-- App Bar -->
    <rect x="18" y="55" width="414" height="48" fill="#0047AB"/>
    <text x="45" y="85" fill="#FFFFFF" font-family="Arial" font-size="15" font-weight="bold">HAST KTV Mobile</text>
    <rect x="340" y="68" width="75" height="24" rx="12" fill="#FF2A54"/>
    <text x="377" y="84" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">📶 Offline Q</text>

    <!-- Date Strip -->
    <rect x="28" y="115" width="394" height="45" rx="8" fill="#FFFFFF" stroke="#E2E8F0"/>
    <text x="45" y="142" fill="#0F172A" font-family="Arial" font-size="13" font-weight="bold">📅 Hôm nay: 13/09/2026</text>
    <rect x="330" y="125" width="80" height="25" rx="4" fill="#E2E8F0"/>
    <text x="370" y="141" fill="#334155" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Đổi ngày</text>

    <!-- Card 1: Job Active -->
    <g transform="translate(28, 175)">
      <rect width="394" height="195" rx="10" fill="#FFFFFF" stroke="#0047AB" stroke-width="2"/>
      <rect width="394" height="32" rx="10" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#0047AB" font-family="Courier" font-size="13" font-weight="bold">PHIẾU #958103</text>
      <rect x="305" y="6" width="75" height="20" rx="4" fill="#DEF7EC"/>
      <text x="342" y="20" fill="#03543F" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Đang làm</text>

      <text x="15" y="58" fill="#0F172A" font-family="Arial" font-size="14" font-weight="bold">Bệnh Viện Nhi Trung Ương</text>
      <text x="15" y="78" fill="#64748B" font-family="Arial" font-size="11">Khoa Khám bệnh — P.102 (Đường Đê La Thành)</text>
      <text x="15" y="98" fill="#334155" font-family="Arial" font-size="11">Máy: <tspan font-family="Courier" font-weight="bold" fill="#0047AB">35256</tspan> · Fuji Xerox DC-IV 3065</text>
      <text x="15" y="118" fill="#DC2626" font-family="Arial" font-size="11">Lỗi: Kẹt giấy cụm sấy liên tục</text>

      <!-- Buttons -->
      <rect x="15" y="140" width="175" height="42" rx="6" fill="#10B981"/>
      <text x="102" y="165" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">✓ HOÀN THÀNH</text>

      <rect x="205" y="140" width="175" height="42" rx="6" fill="#F1F5F9" stroke="#CBD5E1"/>
      <text x="292" y="165" fill="#475569" font-family="Arial" font-size="12" text-anchor="middle">Chưa hoàn thành...</text>
    </g>

    <!-- Card 2: Pool Job -->
    <g transform="translate(28, 385)">
      <rect width="394" height="155" rx="10" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect width="394" height="32" rx="10" fill="#FEF3C7"/>
      <text x="15" y="22" fill="#B45309" font-family="Courier" font-size="13" font-weight="bold">PHIẾU #958104 (POOL)</text>
      <rect x="305" y="6" width="75" height="20" rx="4" fill="#FEEBC8"/>
      <text x="342" y="20" fill="#7B341E" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Chờ nhận</text>

      <text x="15" y="58" fill="#0F172A" font-family="Arial" font-size="14" font-weight="bold">Ngân Hàng Agribank CN Hà Nội</text>
      <text x="15" y="78" fill="#64748B" font-family="Arial" font-size="11">Phòng Kế toán tổng hợp (77 Lạc Trung)</text>
      <text x="15" y="98" fill="#334155" font-family="Arial" font-size="11">Máy: <tspan font-family="Courier" font-weight="bold" fill="#0047AB">36167</tspan> · Ricoh MP 5055</text>

      <rect x="15" y="112" width="364" height="34" rx="6" fill="#0047AB"/>
      <text x="197" y="133" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">👉 BẤM NHẬN VIỆC NÀY</text>
    </g>

    <!-- Bottom Navigation Bar -->
    <rect x="18" y="625" width="414" height="55" rx="20" fill="#FFFFFF" stroke="#E2E8F0"/>
    <text x="65" y="658" fill="#0047AB" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Công việc (2)</text>
    <text x="175" y="658" fill="#64748B" font-family="Arial" font-size="11" text-anchor="middle">Báo cáo ngày</text>
    <text x="285" y="658" fill="#64748B" font-family="Arial" font-size="11" text-anchor="middle">Nghỉ phép</text>
    <text x="385" y="658" fill="#64748B" font-family="Arial" font-size="11" text-anchor="middle">Cài đặt ⚙</text>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-ktv-mobile.png'));
  console.log('✓ Created mockup-ktv-mobile.png');
}

// 4. UI Mockup: Kho Hàng & Cảnh Báo Tồn (PC)
async function makeKhoHangMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Admin — Quản Lý Kho Hàng &amp; Cảnh Báo Tồn Đa Hãng</text>

    <!-- Header Stats -->
    <g transform="translate(20, 55)">
      <rect width="225" height="70" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <text x="15" y="28" fill="#64748B" font-family="Arial" font-size="11">TỔNG MÃ HÀNG ĐANG DÙNG</text>
      <text x="15" y="55" fill="#0047AB" font-family="Arial" font-size="22" font-weight="bold">1.248</text>

      <rect x="245" width="225" height="70" rx="6" fill="#FFFFFF" stroke="#FF2A54" stroke-width="1.5"/>
      <text x="260" y="28" fill="#E11D48" font-family="Arial" font-size="11" font-weight="bold">DƯỚI NGƯỠNG CẢNH BÁO</text>
      <text x="260" y="55" fill="#FF2A54" font-family="Arial" font-size="22" font-weight="bold">14 mã</text>

      <rect x="490" width="225" height="70" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <text x="505" y="28" fill="#64748B" font-family="Arial" font-size="11">MÃ NGƯNG DÙNG (CÒN TỒN)</text>
      <text x="505" y="55" fill="#D97706" font-family="Arial" font-size="22" font-weight="bold">32 mã</text>

      <rect x="735" width="225" height="70" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <text x="750" y="28" fill="#64748B" font-family="Arial" font-size="11">ĐANG GIỮ CHO PHIẾU CHỜ</text>
      <text x="750" y="55" fill="#059669" font-family="Arial" font-size="22" font-weight="bold">28 vật tư</text>
    </g>

    <!-- Table Threshold Warnings -->
    <g transform="translate(20, 140)">
      <rect width="960" height="430" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <!-- Header Bar -->
      <rect width="960" height="42" rx="6" fill="#FFF1F2" stroke="#FECDD3"/>
      <text x="20" y="26" fill="#E11D48" font-family="Arial" font-size="13" font-weight="bold">⚠️ DANH SÁCH VẬT TƯ CẦN ĐẶT HÀNG GẤP (TỒN KHO ≤ NGƯỠNG AN TOÀN)</text>
      <rect x="790" y="8" width="150" height="26" rx="4" fill="#0047AB"/>
      <text x="865" y="25" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">🛒 Đẩy sang giỏ đặt hàng</text>

      <!-- Table Head -->
      <rect y="42" width="960" height="32" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="20" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">MÃ VẬT TƯ</text>
      <text x="160" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">TÊN VẬT TƯ / MÔ TẢ</text>
      <text x="440" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">MODEL MÁY ÁP DỤNG</text>
      <text x="630" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">HÃNG</text>
      <text x="720" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">TỒN THỰC</text>
      <text x="820" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">NGƯỠNG</text>
      <text x="910" y="63" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">THAO TÁC</text>

      <!-- Row 1 -->
      <line x1="0" y1="110" x2="960" y2="110" stroke="#F1F5F9"/>
      <text x="20" y="96" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">TN328K</text>
      <text x="160" y="96" fill="#0F172A" font-family="Arial" font-size="12">Mực đen Konica Minolta TN-328K</text>
      <text x="440" y="96" fill="#334155" font-family="Arial" font-size="12">Bizhub C250i, C300i, C360i</text>
      <text x="630" y="96" fill="#0F172A" font-family="Arial" font-size="12">Konica</text>
      <rect x="715" y="82" width="45" height="22" rx="4" fill="#FEE2E2"/>
      <text x="737" y="97" fill="#DC2626" font-family="Courier" font-size="12" font-weight="bold" text-anchor="middle">0</text>
      <text x="835" y="96" fill="#64748B" font-family="Courier" font-size="12">5</text>
      <text x="925" y="96" fill="#0047AB" font-family="Arial" font-size="11" font-weight="bold">+ Đặt</text>

      <!-- Row 2 -->
      <line x1="0" y1="150" x2="960" y2="150" stroke="#F1F5F9"/>
      <text x="20" y="136" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">A0G6731400</text>
      <text x="160" y="136" fill="#0F172A" font-family="Arial" font-size="12">Rulo ép sấy dưới (Lower Pressure)</text>
      <text x="440" y="136" fill="#334155" font-family="Arial" font-size="12">Bizhub 287, 367</text>
      <text x="630" y="136" fill="#0F172A" font-family="Arial" font-size="12">Konica</text>
      <rect x="715" y="122" width="45" height="22" rx="4" fill="#FEF3C7"/>
      <text x="737" y="137" fill="#B45309" font-family="Courier" font-size="12" font-weight="bold" text-anchor="middle">1</text>
      <text x="835" y="136" fill="#64748B" font-family="Courier" font-size="12">3</text>
      <text x="925" y="136" fill="#0047AB" font-family="Arial" font-size="11" font-weight="bold">+ Đặt</text>

      <!-- Row 3 (Mã thay thế) -->
      <line x1="0" y1="190" x2="960" y2="190" stroke="#F1F5F9"/>
      <text x="20" y="176" fill="#94A3B8" font-family="Courier" font-size="12" text-decoration="line-through">007K98390</text>
      <text x="160" y="170" fill="#64748B" font-family="Arial" font-size="12">Trống gạt Xerox DC-IV (Cũ)</text>
      <text x="160" y="185" fill="#0047AB" font-family="Arial" font-size="11" font-weight="bold">↳ Mã thay thế: 013R00662</text>
      <text x="440" y="176" fill="#334155" font-family="Arial" font-size="12">DC-IV 2060, 3060, 3065</text>
      <text x="630" y="176" fill="#0F172A" font-family="Arial" font-size="12">Fuji Xerox</text>
      <rect x="715" y="162" width="45" height="22" rx="4" fill="#F1F5F9"/>
      <text x="737" y="177" fill="#475569" font-family="Courier" font-size="12" text-anchor="middle">0</text>
      <text x="835" y="176" fill="#64748B" font-family="Courier" font-size="12">--</text>
      <rect x="895" y="165" width="55" height="20" rx="3" fill="#E0E7FF"/>
      <text x="922" y="179" fill="#3730A3" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Đã ngưng</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-kho-hang.png'));
  console.log('✓ Created mockup-kho-hang.png');
}

// 5. UI Mockup: Kanban Hóa Đơn 4 Cột (PC)
async function makeKanbanMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Tài Chính — Bảng Điều Phối Kanban Hóa Đơn (Quy Trình 4 Cột)</text>

    <!-- Top Alert Banner for Overdue Debt -->
    <rect x="20" y="52" width="960" height="34" rx="6" fill="#FEF2F2" stroke="#FF2A54"/>
    <circle cx="40" cy="69" r="7" fill="#FF2A54"/>
    <text x="55" y="73" fill="#E11D48" font-family="Arial" font-size="12" font-weight="bold">CẢNH BÁO CÔNG NỢ TỒN ĐỌNG: Có 3 hóa đơn quá hạn &gt; 30 ngày chưa thanh toán (Tổng nợ: 28.500.000 đ)</text>

    <!-- 4 Kanban Columns -->
    <!-- Col 1 -->
    <g transform="translate(20, 95)">
      <rect width="230" height="480" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
      <rect width="230" height="36" rx="8" fill="#E2E8F0"/>
      <text x="15" y="23" fill="#334155" font-family="Arial" font-size="12" font-weight="bold">1. CHỜ LÊN HÓA ĐƠN</text>
      <rect x="195" y="8" width="24" height="20" rx="10" fill="#0047AB"/>
      <text x="207" y="22" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">2</text>

      <!-- Card 1.1 -->
      <rect x="10" y="48" width="210" height="110" rx="6" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="20" y="70" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">#958098 · HĐ 8%</text>
      <text x="20" y="90" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Chi cục Thuế Ba Đình</text>
      <text x="20" y="108" fill="#64748B" font-family="Arial" font-size="11">Cụm sấy + Cò tách giấy</text>
      <text x="20" y="135" fill="#E11D48" font-family="Courier" font-size="13" font-weight="bold">4.250.000 đ</text>
      <rect x="135" y="120" width="75" height="22" rx="4" fill="#0047AB"/>
      <text x="172" y="135" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Bàn giao ➔</text>
    </g>

    <!-- Col 2 -->
    <g transform="translate(263, 95)">
      <rect width="230" height="480" rx="8" fill="#EFF6FF" stroke="#BFDBFE"/>
      <rect width="230" height="36" rx="8" fill="#DBEAFE"/>
      <text x="15" y="23" fill="#1E40AF" font-family="Arial" font-size="12" font-weight="bold">2. KT-HC LÊN HÓA ĐƠN</text>
      <rect x="195" y="8" width="24" height="20" rx="10" fill="#1D4ED8"/>
      <text x="207" y="22" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">1</text>

      <!-- Card 2.1 -->
      <rect x="10" y="48" width="210" height="135" rx="6" fill="#FFFFFF" stroke="#3B82F6" stroke-width="1.5"/>
      <text x="20" y="70" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">#958085 · M-INVOICE</text>
      <text x="20" y="90" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Bệnh Viện Nhi TW</text>
      <text x="20" y="108" fill="#64748B" font-family="Arial" font-size="11">2 Hộp Mực Konica 367</text>
      <text x="20" y="130" fill="#E11D48" font-family="Courier" font-size="13" font-weight="bold">2.600.000 đ</text>
      <rect x="20" y="145" width="90" height="24" rx="4" fill="#059669"/>
      <text x="65" y="161" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Xuất M-inv</text>
      <rect x="120" y="145" width="90" height="24" rx="4" fill="#0047AB"/>
      <text x="165" y="161" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Nhập số HĐ</text>
    </g>

    <!-- Col 3 -->
    <g transform="translate(506, 95)">
      <rect width="230" height="480" rx="8" fill="#FFFBEB" stroke="#FDE68A"/>
      <rect width="230" height="36" rx="8" fill="#FEF3C7"/>
      <text x="15" y="23" fill="#92400E" font-family="Arial" font-size="12" font-weight="bold">3. CHỜ THANH TOÁN</text>
      <rect x="195" y="8" width="24" height="20" rx="10" fill="#D97706"/>
      <text x="207" y="22" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">3</text>

      <!-- Card 3.1 -->
      <rect x="10" y="48" width="210" height="120" rx="6" fill="#FFFFFF" stroke="#F59E0B"/>
      <rect x="15" y="55" width="80" height="18" rx="3" fill="#FEF2F2"/>
      <text x="55" y="68" fill="#DC2626" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Tuổi nợ: 14 ngày</text>
      <text x="20" y="90" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">HĐ #0012489</text>
      <text x="20" y="110" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Viễn Thông Quân Đội</text>
      <text x="20" y="135" fill="#E11D48" font-family="Courier" font-size="13" font-weight="bold">8.400.000 đ</text>
      <rect x="125" y="120" width="85" height="22" rx="4" fill="#059669"/>
      <text x="167" y="135" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Thu tiền ➔</text>
    </g>

    <!-- Col 4 -->
    <g transform="translate(750, 95)">
      <rect width="230" height="480" rx="8" fill="#F0FDF4" stroke="#BBF7D0"/>
      <rect width="230" height="36" rx="8" fill="#DCFCE7"/>
      <text x="15" y="23" fill="#166534" font-family="Arial" font-size="12" font-weight="bold">4. ĐÃ THANH TOÁN</text>
      <rect x="195" y="8" width="24" height="20" rx="10" fill="#059669"/>
      <text x="207" y="22" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">12</text>

      <!-- Card 4.1 -->
      <rect x="10" y="48" width="210" height="100" rx="6" fill="#FFFFFF" stroke="#86EFAC"/>
      <text x="20" y="70" fill="#059669" font-family="Courier" font-size="12" font-weight="bold">HĐ #0012390 ✓ ĐỦ</text>
      <text x="20" y="90" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Kho bạc Nhà nước Ba Đình</text>
      <text x="20" y="110" fill="#64748B" font-family="Arial" font-size="11">Đã thu: 14.500.000 đ (Chuyển khoản)</text>
      <text x="20" y="130" fill="#059669" font-family="Arial" font-size="10" font-weight="bold">Ngày TT: 10/09/2026</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-kanban.png'));
  console.log('✓ Created mockup-kanban.png');
}

// 6. UI Mockup: Thuê / CPC & Bảng Kê Counter
async function makeThueCpcMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Dịch Vụ — Module Máy Thuê &amp; Thu Phí CPC (Billing)</text>

    <!-- Sub Tabs -->
    <rect y="42" width="1000" height="45" fill="#FFFFFF" stroke="#E2E8F0"/>
    <rect x="20" y="52" width="120" height="26" rx="4" fill="#F1F5F9"/>
    <text x="80" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Đơn giá hợp đồng</text>
    <rect x="150" y="52" width="120" height="26" rx="4" fill="#0047AB"/>
    <text x="210" y="69" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Nhập Counter (18)</text>
    <rect x="280" y="52" width="120" height="26" rx="4" fill="#F1F5F9"/>
    <text x="340" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Hợp đồng khung</text>
    <rect x="410" y="52" width="120" height="26" rx="4" fill="#F1F5F9"/>
    <text x="470" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Xuất Bảng kê Word</text>

    <!-- Counter Reminder Banner -->
    <rect x="20" y="100" width="960" height="45" rx="6" fill="#FFFBEB" stroke="#F59E0B"/>
    <text x="40" y="127" fill="#B45309" font-family="Arial" font-size="12" font-weight="bold">⏱ KỲ THÁNG 08/2026: Còn 4 máy cần lấy số Counter trước ngày chốt số (2 máy quá hạn)</text>
    <rect x="840" y="110" width="120" height="26" rx="4" fill="#D97706"/>
    <text x="900" y="127" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Lọc máy cần lấy</text>

    <!-- Counter Table -->
    <g transform="translate(20, 160)">
      <rect width="960" height="410" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <!-- Header -->
      <rect width="960" height="34" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="20" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">MÃ MÁY</text>
      <text x="110" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">KHÁCH HÀNG / ĐIỂM ĐẶT</text>
      <text x="340" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">NGÀY CHỐT</text>
      <text x="440" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">COUNTER CŨ (BW)</text>
      <text x="570" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">COUNTER MỚI</text>
      <text x="700" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">SẢN LƯỢNG</text>
      <text x="820" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">TRẠNG THÁI</text>
      <text x="915" y="22" fill="#64748B" font-family="Arial" font-size="11" font-weight="bold">LƯU</text>

      <!-- Row 1 -->
      <line x1="0" y1="34" x2="960" y2="34" stroke="#F1F5F9"/>
      <text x="20" y="65" fill="#0047AB" font-family="Courier" font-size="13" font-weight="bold">36167</text>
      <text x="110" y="58" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Agribank Lạc Trung</text>
      <text x="110" y="74" fill="#64748B" font-family="Arial" font-size="10">Ricoh MP 5055 (Đen trắng)</text>
      <text x="340" y="65" fill="#334155" font-family="Arial" font-size="12">Ngày 15</text>
      <text x="440" y="65" fill="#64748B" font-family="Courier" font-size="12">142.500</text>
      <rect x="560" y="50" width="100" height="26" rx="4" fill="#FFFFFF" stroke="#0047AB"/>
      <text x="570" y="67" fill="#0F172A" font-family="Courier" font-size="12" font-weight="bold">148.200</text>
      <text x="700" y="65" fill="#059669" font-family="Courier" font-size="12" font-weight="bold">+5.700</text>
      <rect x="810" y="53" width="75" height="20" rx="4" fill="#DEF7EC"/>
      <text x="847" y="67" fill="#03543F" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Đã lấy</text>
      <text x="925" y="65" fill="#0047AB" font-family="Arial" font-size="14">💾</text>

      <!-- Row 2 -->
      <line x1="0" y1="90" x2="960" y2="90" stroke="#F1F5F9"/>
      <text x="20" y="120" fill="#0047AB" font-family="Courier" font-size="13" font-weight="bold">36051</text>
      <text x="110" y="113" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Cục Thuế Ba Đình</text>
      <text x="110" y="129" fill="#64748B" font-family="Arial" font-size="10">Bizhub 367 (Máy thuê)</text>
      <text x="340" y="120" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">Ngày 10 (Trễ)</text>
      <text x="440" y="120" fill="#64748B" font-family="Courier" font-size="12">89.120</text>
      <rect x="560" y="105" width="100" height="26" rx="4" fill="#FEF2F2" stroke="#EF4444"/>
      <text x="570" y="122" fill="#991B1B" font-family="Courier" font-size="12">Chưa nhập</text>
      <text x="700" y="120" fill="#94A3B8" font-family="Courier" font-size="12">--</text>
      <rect x="810" y="108" width="75" height="20" rx="4" fill="#FEE2E2"/>
      <text x="847" y="122" fill="#991B1B" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Quá hạn</text>
      <text x="925" y="120" fill="#94A3B8" font-family="Arial" font-size="14">💾</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-thue-cpc.png'));
  console.log('✓ Created mockup-thue-cpc.png');
}

async function run() {
  await makeWorkflowGraphic();
  await makeGiaoViecMockup();
  await makeKtvMobileMockup();
  await makeKhoHangMockup();
  await makeKanbanMockup();
  await makeThueCpcMockup();
  console.log('All mockups generated successfully!');
}

run().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
