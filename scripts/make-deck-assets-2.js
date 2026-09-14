const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, 'pptx-assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 1. Sơ đồ Ma trận Phân quyền 6 Roles (Vector Diagram)
async function makeRolesGraphic() {
  const svg = `
  <svg width="1100" height="620" viewBox="0 0 1100 620" xmlns="http://www.w3.org/2000/svg">
    <rect width="1100" height="620" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="1100" height="50" rx="16" fill="#0047AB"/>
    <text x="550" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">MA TRẬN PHÂN QUYỀN VÀ TRÁCH NHIỆM 6 VAI TRÒ HỆ THỐNG HAST</text>

    <!-- Table Header -->
    <rect y="50" width="1100" height="38" fill="#F1F5F9" stroke="#CBD5E1"/>
    <text x="30" y="74" fill="#1E293B" font-family="Arial" font-size="12" font-weight="bold">VAI TRÒ (ROLE)</text>
    <text x="180" y="74" fill="#1E293B" font-family="Arial" font-size="12" font-weight="bold">ĐỐI TƯỢNG VÀ THIẾT BỊ</text>
    <text x="380" y="74" fill="#1E293B" font-family="Arial" font-size="12" font-weight="bold">MODULE VÀ PHẠM VI TRUY CẬP</text>
    <text x="680" y="74" fill="#1E293B" font-family="Arial" font-size="12" font-weight="bold">TRÁCH NHIỆM CHÍNH</text>
    <text x="940" y="74" fill="#1E293B" font-family="Arial" font-size="12" font-weight="bold">GIỚI HẠN BẢO MẬT</text>

    <!-- Row 1: admin -->
    <g transform="translate(0, 88)">
      <rect width="1100" height="85" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#0047AB"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">admin</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Quản trị tối cao</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Ban Lãnh đạo, Trưởng IT</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">PC / Laptop / Mobile (/m)</text>

      <text x="380" y="32" fill="#0047AB" font-family="Arial" font-size="12" font-weight="bold">Toàn bộ 6 Tab cha &amp; Tab con</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Sổ CT, Theo dõi máy, Kho, Tài chính, Quản lý, Hệ thống</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Cấu hình, duyệt đơn hàng về, bật bảo trì</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Phân quyền tab, xem Audit log, kéo thả Kanban</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Toàn quyền xóa/sửa dữ liệu khi xảy ra sự cố</text>

      <rect x="940" y="25" width="130" height="24" rx="4" fill="#DEF7EC"/>
      <text x="1005" y="41" fill="#03543F" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Không giới hạn</text>
    </g>

    <!-- Row 2: tech_admin -->
    <g transform="translate(0, 173)">
      <rect width="1100" height="85" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#0284C7"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">tech_admin</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Quản lý kỹ thuật</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Trưởng phòng / Điều phối</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">PC Office / Mobile (/m)</text>

      <text x="380" y="32" fill="#0284C7" font-family="Arial" font-size="12" font-weight="bold">Sổ CT, Theo dõi máy, Kho, Quản lý</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Xem cột 1-3 Kanban, không quản trị hệ thống</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Tạo phiếu, điều phối việc, bắn tin Telegram</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Rà soát vật tư &amp; giá riêng, duyệt nghỉ phép KTV</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Quản lý cảnh báo tồn &amp; tạo PO đặt hàng nháp</text>

      <rect x="940" y="25" width="130" height="36" rx="4" fill="#FEF3C7"/>
      <text x="1005" y="40" fill="#92400E" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Chặn ghi hàng về</text>
      <text x="1005" y="53" fill="#92400E" font-family="Arial" font-size="9" text-anchor="middle">Chặn cấu hình hệ thống</text>
    </g>

    <!-- Row 3: staff -->
    <g transform="translate(0, 258)">
      <rect width="1100" height="85" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#475569"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">staff</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Nhân viên văn phòng</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Trực tổng đài / Hành chính</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">PC / Laptop văn phòng</text>

      <text x="380" y="32" fill="#334155" font-family="Arial" font-size="12" font-weight="bold">Sổ công tác, Theo dõi máy</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Tra cứu khách hàng, lịch sử phiếu, in sổ theo dõi</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Tiếp nhận cuộc gọi khách báo hỏng máy</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Khởi tạo phiếu giao việc mới đưa vào Pool</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Hỗ trợ in sổ bảo trì định kỳ cho KTV</text>

      <rect x="940" y="25" width="130" height="36" rx="4" fill="#FEE2E2"/>
      <text x="1005" y="40" fill="#991B1B" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Chặn Kho, Tài chính</text>
      <text x="1005" y="53" fill="#991B1B" font-family="Arial" font-size="9" text-anchor="middle">Chặn duyệt nghỉ phép</text>
    </g>

    <!-- Row 4: ktv -->
    <g transform="translate(0, 343)">
      <rect width="1100" height="85" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#E11D48"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">ktv</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Kỹ thuật hiện trường</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Kỹ thuật viên lưu động</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">Smartphone (/ktv)</text>

      <text x="380" y="32" fill="#E11D48" font-family="Arial" font-size="12" font-weight="bold">Giao diện chuyên biệt /ktv</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Công việc hôm nay, Báo cáo ngày, Nghỉ phép, Passkey</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Nhận việc từ Pool, quét QR mã máy</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Chuyển trạng thái Đang làm → Hoàn thành</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Báo cáo ngày &amp; Đăng ký nghỉ phép trực tiếp</text>

      <rect x="940" y="25" width="130" height="36" rx="4" fill="#FEE2E2"/>
      <text x="1005" y="40" fill="#991B1B" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">CẤM TRUY CẬP /admin</text>
      <text x="1005" y="53" fill="#991B1B" font-family="Arial" font-size="9" text-anchor="middle">Chỉ thấy việc của bản thân</text>
    </g>

    <!-- Row 5: kthc -->
    <g transform="translate(0, 428)">
      <rect width="1100" height="85" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#059669"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">kthc</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Kế toán hành chính</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Kế toán thanh toán &amp; Thuế</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">PC văn phòng</text>

      <text x="380" y="32" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">Chuyên biệt: Kanban Hóa Đơn</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Cột 2 (KT lên HĐ), Cột 3 (Chờ TT), Cột 4 (Đã TT), Cài đặt</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Xuất Excel M-invoice 32 cột để lập hóa đơn điện tử</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Nhập số hóa đơn, ghi nhận thu tiền công nợ</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Xuất báo cáo công nợ thô 2 sheet để đối soát</text>

      <rect x="940" y="25" width="130" height="36" rx="4" fill="#FEF3C7"/>
      <text x="1005" y="40" fill="#92400E" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">Ẩn Sổ CT &amp; Chuông</text>
      <text x="1005" y="53" fill="#92400E" font-family="Arial" font-size="9" text-anchor="middle">Khóa sửa vật tư/giá</text>
    </g>

    <!-- Row 6: kinh_doanh -->
    <g transform="translate(0, 513)">
      <rect width="1100" height="85" fill="#F8FAFC" stroke="#E2E8F0"/>
      <rect x="25" y="15" width="120" height="28" rx="6" fill="#854D0E"/>
      <text x="85" y="33" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">kinh_doanh</text>
      <text x="25" y="65" fill="#64748B" font-family="Arial" font-size="11">Phòng kinh doanh</text>

      <text x="180" y="32" fill="#0F172A" font-family="Arial" font-size="12" font-weight="bold">Nhân viên Sales / Kinh doanh</text>
      <text x="180" y="52" fill="#64748B" font-family="Arial" font-size="11">PC / Mobile (/kho-thue)</text>

      <text x="380" y="32" fill="#854D0E" font-family="Arial" font-size="12" font-weight="bold">Chuyên biệt: /kho-thue</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="11">Danh mục máy photocopy sẵn sàng cho thuê / CPC</text>

      <text x="680" y="28" fill="#0F172A" font-family="Arial" font-size="11">• Tra cứu danh sách máy thuê tồn kho theo Model/Hãng</text>
      <text x="680" y="46" fill="#0F172A" font-family="Arial" font-size="11">• Xem cấu hình, tình trạng kỹ thuật của máy sẵn sàng</text>
      <text x="680" y="64" fill="#0F172A" font-family="Arial" font-size="11">• Tư vấn và làm việc với khách hàng thuê máy mới</text>

      <rect x="940" y="25" width="130" height="36" rx="4" fill="#FEE2E2"/>
      <text x="1005" y="40" fill="#991B1B" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">CẤM TRUY CẬP /admin</text>
      <text x="1005" y="53" fill="#991B1B" font-family="Arial" font-size="9" text-anchor="middle">Chỉ xem (Read-only)</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-roles.png'));
  console.log('✓ Created mockup-roles.png');
}

// 7. UI Mockup: Đặt hàng PO & Giỏ hàng
async function makeDatHangMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Kho Hàng — Quy Trình Đặt Hàng PO &amp; Giỏ Hàng 2 Bảng Cân Đối</text>

    <!-- Filters Row -->
    <rect x="20" y="52" width="960" height="48" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
    <rect x="35" y="61" width="160" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="45" y="81" fill="#64748B" font-family="Arial" font-size="11">🔍 Tìm mã / tên vật tư</text>
    <rect x="205" y="61" width="150" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="215" y="81" fill="#64748B" font-family="Arial" font-size="11">Model: Bizhub ▼</text>
    <rect x="365" y="61" width="120" height="30" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="375" y="81" fill="#64748B" font-family="Arial" font-size="11">Hãng: Konica ▼</text>
    <text x="510" y="81" fill="#DC2626" font-family="Arial" font-size="11" font-weight="bold">☑ Dưới ngưỡng</text>
    <text x="630" y="81" fill="#D97706" font-family="Arial" font-size="11" font-weight="bold">☑ Tồn = 0</text>

    <!-- Left Table: Chọn vật tư đặt hàng -->
    <g transform="translate(20, 110)">
      <rect width="530" height="465" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect width="530" height="34" rx="6" fill="#EFF6FF" stroke="#BFDBFE"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">1. DANH MỤC VẬT TƯ CẦN ĐẶT (KHO)</text>

      <!-- Head -->
      <rect y="34" width="530" height="28" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="15" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">MÃ HÀNG</text>
      <text x="110" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">TÊN VẬT TƯ / MODEL</text>
      <text x="330" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">TỒN</text>
      <text x="380" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">SL ĐẶT</text>
      <text x="465" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">THÊM</text>

      <!-- Row 1 -->
      <line x1="0" y1="95" x2="530" y2="95" stroke="#F1F5F9"/>
      <text x="15" y="80" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">TN328K</text>
      <text x="110" y="75" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Mực đen TN-328K</text>
      <text x="110" y="89" fill="#64748B" font-family="Arial" font-size="10">C250i, C300i, C360i</text>
      <text x="335" y="80" fill="#DC2626" font-family="Courier" font-size="11" font-weight="bold">0</text>
      <rect x="375" y="66" width="45" height="24" rx="3" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="397" y="82" fill="#0F172A" font-family="Courier" font-size="11" text-anchor="middle">10</text>
      <rect x="455" y="66" width="60" height="24" rx="4" fill="#0047AB"/>
      <text x="485" y="82" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">+ Giỏ</text>

      <!-- Row 2 -->
      <line x1="0" y1="135" x2="530" y2="135" stroke="#F1F5F9"/>
      <text x="15" y="120" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">A0G6731400</text>
      <text x="110" y="115" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Rulo ép sấy dưới</text>
      <text x="110" y="129" fill="#64748B" font-family="Arial" font-size="10">Bizhub 287, 367</text>
      <text x="335" y="120" fill="#D97706" font-family="Courier" font-size="11" font-weight="bold">1</text>
      <rect x="375" y="106" width="45" height="24" rx="3" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="397" y="122" fill="#0F172A" font-family="Courier" font-size="11" text-anchor="middle">5</text>
      <rect x="455" y="106" width="60" height="24" rx="4" fill="#0047AB"/>
      <text x="485" y="122" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">+ Giỏ</text>

      <!-- Row 3 -->
      <line x1="0" y1="175" x2="530" y2="175" stroke="#F1F5F9"/>
      <text x="15" y="160" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">DV614K</text>
      <text x="110" y="155" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Từ đen Developer DV614K</text>
      <text x="110" y="169" fill="#64748B" font-family="Arial" font-size="10">Bizhub C458, C558</text>
      <text x="335" y="160" fill="#DC2626" font-family="Courier" font-size="11" font-weight="bold">0</text>
      <rect x="375" y="146" width="45" height="24" rx="3" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="397" y="162" fill="#0F172A" font-family="Courier" font-size="11" text-anchor="middle">4</text>
      <rect x="455" y="146" width="60" height="24" rx="4" fill="#0047AB"/>
      <text x="485" y="162" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">+ Giỏ</text>
    </g>

    <!-- Right Table: Giỏ đặt hàng -->
    <g transform="translate(565, 110)">
      <rect width="415" height="465" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <rect width="415" height="34" rx="6" fill="#FFF1F2" stroke="#FECDD3"/>
      <text x="15" y="22" fill="#E11D48" font-family="Arial" font-size="12" font-weight="bold">2. GIỎ HÀNG CHỜ TẠO ĐƠN (3 MẶT HÀNG)</text>

      <!-- Head -->
      <rect y="34" width="415" height="28" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="15" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">MÃ HÀNG</text>
      <text x="110" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">TÊN VẬT TƯ</text>
      <text x="260" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">SL ĐẶT</text>
      <text x="340" y="52" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">XÓA</text>

      <!-- Cart Item 1 -->
      <line x1="0" y1="95" x2="415" y2="95" stroke="#F1F5F9"/>
      <text x="15" y="80" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">TN328K</text>
      <text x="110" y="80" fill="#0F172A" font-family="Arial" font-size="11">Mực đen TN-328K</text>
      <rect x="255" y="67" width="45" height="22" rx="3" fill="#EFF6FF"/>
      <text x="277" y="82" fill="#1D4ED8" font-family="Courier" font-size="11" font-weight="bold" text-anchor="middle">10</text>
      <text x="350" y="81" fill="#DC2626" font-family="Arial" font-size="12">✕</text>

      <!-- Cart Item 2 -->
      <line x1="0" y1="135" x2="415" y2="135" stroke="#F1F5F9"/>
      <text x="15" y="120" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">A0G6731400</text>
      <text x="110" y="120" fill="#0F172A" font-family="Arial" font-size="11">Rulo ép sấy dưới</text>
      <rect x="255" y="107" width="45" height="22" rx="3" fill="#EFF6FF"/>
      <text x="277" y="122" fill="#1D4ED8" font-family="Courier" font-size="11" font-weight="bold" text-anchor="middle">5</text>
      <text x="350" y="121" fill="#DC2626" font-family="Arial" font-size="12">✕</text>

      <!-- Cart Item 3 -->
      <line x1="0" y1="175" x2="415" y2="175" stroke="#F1F5F9"/>
      <text x="15" y="160" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">DV614K</text>
      <text x="110" y="160" fill="#0F172A" font-family="Arial" font-size="11">Từ đen DV614K</text>
      <rect x="255" y="147" width="45" height="22" rx="3" fill="#EFF6FF"/>
      <text x="277" y="162" fill="#1D4ED8" font-family="Courier" font-size="11" font-weight="bold" text-anchor="middle">4</text>
      <text x="350" y="161" fill="#DC2626" font-family="Arial" font-size="12">✕</text>

      <!-- Cart Bottom Actions -->
      <g transform="translate(15, 380)">
        <rect width="385" height="70" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
        <text x="15" y="25" fill="#64748B" font-family="Arial" font-size="11">Tổng cộng: <tspan font-weight="bold" fill="#0F172A">3 loại vật tư · 19 sản phẩm</tspan></text>
        <rect x="15" y="35" width="165" height="28" rx="4" fill="#0047AB"/>
        <text x="97" y="53" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">✓ Tạo đơn PO Nháp</text>
        <rect x="190" y="35" width="180" height="28" rx="4" fill="#059669"/>
        <text x="280" y="53" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">📊 Xuất Excel Đơn Đặt</text>
      </g>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-dat-hang.png'));
  console.log('✓ Created mockup-dat-hang.png');
}

// 8. UI Mockup: Bảo Trì & Giám Định (Đối chiếu 12 tháng)
async function makeBaoTriMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Theo Dõi Máy — Ma Trận Đối Chiếu Bảo Trì 12 Tháng &amp; Quyết Toán Khách Hàng</text>

    <!-- Sub Navigation -->
    <rect y="42" width="1000" height="45" fill="#FFFFFF" stroke="#E2E8F0"/>
    <rect x="20" y="52" width="110" height="26" rx="4" fill="#F1F5F9"/>
    <text x="75" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Đã bảo trì (45)</text>
    <rect x="140" y="52" width="110" height="26" rx="4" fill="#F1F5F9"/>
    <text x="195" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Chưa bảo trì (12)</text>
    <rect x="260" y="52" width="110" height="26" rx="4" fill="#F1F5F9"/>
    <text x="315" y="69" fill="#475569" font-family="Arial" font-size="11" text-anchor="middle">Tạm dừng (3)</text>
    <rect x="380" y="52" width="130" height="26" rx="4" fill="#0047AB"/>
    <text x="445" y="69" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">Đối chiếu năm 2026</text>

    <rect x="830" y="52" width="150" height="26" rx="4" fill="#059669"/>
    <text x="905" y="69" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">📊 Xuất Excel Đối Chiếu</text>

    <!-- Legend -->
    <g transform="translate(20, 95)">
      <rect width="960" height="35" rx="4" fill="#EFF6FF" stroke="#BFDBFE"/>
      <text x="15" y="22" fill="#1E40AF" font-family="Arial" font-size="11" font-weight="bold">CHÚ THÍCH KÝ HIỆU:</text>
      <text x="150" y="22" fill="#059669" font-family="Arial" font-size="11" font-weight="bold">✓ Đã bảo trì</text>
      <text x="260" y="22" fill="#DC2626" font-family="Arial" font-size="11" font-weight="bold">✕ Quá hạn (Chưa làm)</text>
      <text x="420" y="22" fill="#94A3B8" font-family="Arial" font-size="11">· Chưa tới tháng</text>
      <text x="560" y="22" fill="#D97706" font-family="Arial" font-size="11" font-weight="bold">N Đã tạm dừng</text>
      <text x="700" y="22" fill="#64748B" font-family="Arial" font-size="11">(Trống) Ngoài lịch bảo trì</text>
    </g>

    <!-- Matrix Table -->
    <g transform="translate(20, 140)">
      <rect width="960" height="430" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/>
      <!-- Header -->
      <rect width="960" height="34" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="15" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">MÃ MÁY</text>
      <text x="90" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">KHÁCH HÀNG</text>
      <text x="260" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T1</text>
      <text x="295" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T2</text>
      <text x="330" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T3</text>
      <text x="365" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T4</text>
      <text x="400" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T5</text>
      <text x="435" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T6</text>
      <text x="470" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T7</text>
      <text x="505" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T8</text>
      <text x="540" y="22" fill="#0047AB" font-family="Arial" font-size="10" font-weight="bold">T9 (Hiện)</text>
      <text x="610" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T10</text>
      <text x="650" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T11</text>
      <text x="690" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">T12</text>
      <text x="735" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">THEO HĐ</text>
      <text x="810" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">ĐÃ LÀM</text>
      <text x="875" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">THIẾU</text>
      <text x="925" y="22" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">CÒN</text>

      <!-- Row 1 -->
      <line x1="0" y1="34" x2="960" y2="34" stroke="#F1F5F9"/>
      <text x="15" y="62" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">36051</text>
      <text x="90" y="62" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Chi cục Thuế Ba Đình</text>
      <text x="260" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="295" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="330" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="365" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="400" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="435" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="470" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="505" y="62" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="555" y="62" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">✕</text>
      <text x="615" y="62" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="655" y="62" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="695" y="62" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="750" y="62" fill="#0F172A" font-family="Courier" font-size="11">12</text>
      <text x="825" y="62" fill="#059669" font-family="Courier" font-size="11" font-weight="bold">8</text>
      <text x="885" y="62" fill="#DC2626" font-family="Courier" font-size="11" font-weight="bold">1</text>
      <text x="930" y="62" fill="#64748B" font-family="Courier" font-size="11">3</text>

      <!-- Row 2 -->
      <line x1="0" y1="85" x2="960" y2="85" stroke="#F1F5F9"/>
      <text x="15" y="112" fill="#0047AB" font-family="Courier" font-size="12" font-weight="bold">35256</text>
      <text x="90" y="112" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Bệnh Viện Nhi TW</text>
      <text x="260" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="295" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="330" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="365" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="400" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="435" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="470" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="505" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="555" y="112" fill="#059669" font-family="Arial" font-size="12" font-weight="bold">✓</text>
      <text x="615" y="112" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="655" y="112" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="695" y="112" fill="#94A3B8" font-family="Arial" font-size="12">·</text>
      <text x="750" y="112" fill="#0F172A" font-family="Courier" font-size="11">12</text>
      <text x="825" y="112" fill="#059669" font-family="Courier" font-size="11" font-weight="bold">9</text>
      <text x="885" y="112" fill="#059669" font-family="Courier" font-size="11" font-weight="bold">0</text>
      <text x="930" y="112" fill="#64748B" font-family="Courier" font-size="11">3</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-bao-tri.png'));
  console.log('✓ Created mockup-bao-tri.png');
}

// 9. UI Mockup: Trợ thủ M-invoice & Xuất Chứng Từ Word
async function makeMinvoiceMockup() {
  const svg = `
  <svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="600" rx="10" fill="#F8FAFC"/>
    <rect width="1000" height="42" rx="10" fill="#0047AB"/>
    <text x="500" y="26" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold" text-anchor="middle">HAST Kế Toán — Trợ Thủ Lập Hóa Đơn Điện Tử M-invoice &amp; Xuất Chứng Từ Word</text>

    <!-- Modal Box Simulation -->
    <g transform="translate(60, 65)">
      <rect width="880" height="500" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
      <rect width="880" height="45" rx="8" fill="#F1F5F9" stroke="#E2E8F0"/>
      <text x="25" y="28" fill="#0047AB" font-family="Arial" font-size="14" font-weight="bold">📄 TRỢ THỦ LẬP HÓA ĐƠN — KHÁCH HÀNG: CHI CỤC THUẾ BA ĐÌNH</text>
      <text x="840" y="28" fill="#64748B" font-family="Arial" font-size="16">✕</text>

      <!-- Customer Meta Strip -->
      <g transform="translate(25, 60)">
        <rect width="830" height="55" rx="6" fill="#EFF6FF" stroke="#BFDBFE"/>
        <text x="20" y="25" fill="#1E40AF" font-family="Arial" font-size="11" font-weight="bold">MÃ SỐ THUẾ:</text>
        <text x="110" y="25" fill="#0F172A" font-family="Courier" font-size="12" font-weight="bold">0100789456-002</text>
        <text x="320" y="25" fill="#1E40AF" font-family="Arial" font-size="11" font-weight="bold">EMAIL KẾ TOÁN:</text>
        <text x="430" y="25" fill="#0F172A" font-family="Arial" font-size="11">ketoan@thuebadinh.hanoi.gov.vn</text>
        <text x="20" y="44" fill="#64748B" font-family="Arial" font-size="11">Địa chỉ: 25 Liễu Giai, Ba Đình, Hà Nội · Ký hiệu HĐ: <tspan font-weight="bold" fill="#0047AB">1C26MST</tspan></text>
      </g>

      <!-- Items Table -->
      <g transform="translate(25, 130)">
        <rect width="830" height="230" rx="4" fill="#FFFFFF" stroke="#E2E8F0"/>
        <rect width="830" height="30" fill="#F8FAFC" stroke="#E2E8F0"/>
        <text x="15" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">STT</text>
        <text x="60" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">TÊN HÀNG HÓA TRÊN HÓA ĐƠN</text>
        <text x="400" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">ĐVT</text>
        <text x="460" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">SL</text>
        <text x="520" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">ĐƠN GIÁ</text>
        <text x="620" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">VAT</text>
        <text x="700" y="20" fill="#64748B" font-family="Arial" font-size="10" font-weight="bold">THÀNH TIỀN</text>

        <!-- Row 1 -->
        <line x1="0" y1="30" x2="830" y2="30" stroke="#F1F5F9"/>
        <text x="15" y="55" fill="#64748B" font-family="Arial" font-size="11">1</text>
        <text x="60" y="55" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Cụm sấy máy Bizhub 367 (Fusing Unit)</text>
        <text x="400" y="55" fill="#0047AB" font-family="Arial" font-size="11">Cái</text>
        <text x="465" y="55" fill="#0F172A" font-family="Courier" font-size="11">1</text>
        <text x="520" y="55" fill="#0F172A" font-family="Courier" font-size="11">3.500.000</text>
        <text x="625" y="55" fill="#059669" font-family="Courier" font-size="11">8%</text>
        <text x="700" y="55" fill="#E11D48" font-family="Courier" font-size="11" font-weight="bold">3.780.000 đ</text>

        <!-- Row 2 -->
        <line x1="0" y1="80" x2="830" y2="80" stroke="#F1F5F9"/>
        <text x="15" y="105" fill="#64748B" font-family="Arial" font-size="11">2</text>
        <text x="60" y="105" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Bộ cò tách giấy sấy dưới</text>
        <text x="400" y="105" fill="#0047AB" font-family="Arial" font-size="11">Bộ</text>
        <text x="465" y="105" fill="#0F172A" font-family="Courier" font-size="11">1</text>
        <text x="520" y="105" fill="#0F172A" font-family="Courier" font-size="11">250.000</text>
        <text x="625" y="105" fill="#059669" font-family="Courier" font-size="11">8%</text>
        <text x="700" y="105" fill="#E11D48" font-family="Courier" font-size="11" font-weight="bold">270.000 đ</text>
      </g>

      <!-- Bottom Summary & Export Buttons -->
      <g transform="translate(25, 380)">
        <rect width="830" height="95" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
        <text x="20" y="30" fill="#64748B" font-family="Arial" font-size="12">Cộng tiền hàng: <tspan font-weight="bold" fill="#0F172A">3.750.000 đ</tspan> · Tiền thuế VAT (8%): <tspan font-weight="bold" fill="#0F172A">300.000 đ</tspan></text>
        <text x="20" y="55" fill="#E11D48" font-family="Arial" font-size="14" font-weight="bold">TỔNG CỘNG THANH TOÁN: 4.050.000 đ</text>

        <!-- Actions -->
        <rect x="360" y="25" width="140" height="35" rx="4" fill="#059669"/>
        <text x="430" y="47" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">📥 Xuất M-invoice (32 cột)</text>

        <rect x="515" y="25" width="140" height="35" rx="4" fill="#0047AB"/>
        <text x="585" y="47" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">📑 Xuất Word BBBG</text>

        <rect x="670" y="25" width="145" height="35" rx="4" fill="#1E293B"/>
        <text x="742" y="47" fill="#FFFFFF" font-family="Arial" font-size="11" font-weight="bold" text-anchor="middle">📄 Xuất Word ĐNTT</text>
      </g>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'mockup-minvoice.png'));
  console.log('✓ Created mockup-minvoice.png');
}

async function run() {
  await makeRolesGraphic();
  await makeDatHangMockup();
  await makeBaoTriMockup();
  await makeMinvoiceMockup();
  console.log('All 9 assets created perfectly!');
}

run().catch(err => {
  console.error('Error generating assets 2:', err);
  process.exit(1);
});
