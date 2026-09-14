const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, 'pptx-assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 1. Leaflet 1: KTV Mobile Infographic (Phone mockup with 5-step overlay & Offline Queue badge)
async function makeKtvLeafletGraphic() {
  const svg = `
  <svg width="600" height="780" viewBox="0 0 600 780" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="780" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="600" height="50" rx="16" fill="#0047AB"/>
    <text x="300" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">SƠ ĐỒ TÁC NGHIỆP KTV MOBILE (/ktv)</text>

    <!-- Phone Body Simulation -->
    <g transform="translate(140, 65)">
      <rect width="320" height="500" rx="28" fill="#0F172A" stroke="#334155" stroke-width="3"/>
      <rect x="12" y="14" width="296" height="472" rx="20" fill="#FFFFFF"/>
      <rect x="100" y="18" width="120" height="16" rx="8" fill="#0F172A"/>

      <!-- Phone App Header -->
      <rect x="12" y="38" width="296" height="38" fill="#0047AB"/>
      <text x="25" y="62" fill="#FFFFFF" font-family="Arial" font-size="12" font-weight="bold">HAST KTV Mobile</text>
      <rect x="215" y="46" width="85" height="20" rx="10" fill="#FF2A54"/>
      <text x="257" y="60" fill="#FFFFFF" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle">📶 Offline Q: 0</text>

      <!-- Step 1 Card -->
      <g transform="translate(22, 85)">
        <rect width="276" height="75" rx="6" fill="#EFF6FF" stroke="#3B82F6"/>
        <text x="10" y="20" fill="#1D4ED8" font-family="Arial" font-size="10" font-weight="bold">BƯỚC 1: NHẬN VIỆC (GÁN HOẶC POOL)</text>
        <text x="10" y="38" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Cục Thuế Ba Đình · Bizhub 367</text>
        <rect x="10" y="47" width="120" height="20" rx="4" fill="#0047AB"/>
        <text x="70" y="61" fill="#FFFFFF" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle">👉 Bấm Nhận Việc</text>
      </g>

      <!-- Step 2 Card -->
      <g transform="translate(22, 170)">
        <rect width="276" height="80" rx="6" fill="#FEF3C7" stroke="#F59E0B"/>
        <text x="10" y="20" fill="#B45309" font-family="Arial" font-size="10" font-weight="bold">BƯỚC 2: CHẠM MÁY ➔ BẤM "ĐANG LÀM"</text>
        <text x="10" y="38" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Bệnh Viện Nhi TW · Xerox 3065</text>
        <rect x="10" y="48" width="120" height="22" rx="4" fill="#0284C7"/>
        <text x="70" y="63" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">▶ ĐANG LÀM</text>
      </g>

      <!-- Step 3 Card -->
      <g transform="translate(22, 260)">
        <rect width="276" height="80" rx="6" fill="#ECFDF5" stroke="#10B981"/>
        <text x="10" y="20" fill="#047857" font-family="Arial" font-size="10" font-weight="bold">BƯỚC 3: XỬ LÝ XONG ➔ BẤM "HOÀN THÀNH"</text>
        <text x="10" y="38" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Ngân Hàng Agribank · MP 5055</text>
        <rect x="10" y="48" width="130" height="22" rx="4" fill="#059669"/>
        <text x="75" y="63" fill="#FFFFFF" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">✓ HOÀN THÀNH</text>
      </g>

      <!-- Step 4 & 5 Strip -->
      <g transform="translate(22, 350)">
        <rect width="132" height="50" rx="6" fill="#F8FAFC" stroke="#CBD5E1"/>
        <text x="66" y="22" fill="#0047AB" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle">BƯỚC 4: BÁO CÁO</text>
        <text x="66" y="38" fill="#475569" font-family="Arial" font-size="8" text-anchor="middle">Trước 18h hàng ngày</text>

        <rect x="144" width="132" height="50" rx="6" fill="#F8FAFC" stroke="#CBD5E1"/>
        <text x="210" y="22" fill="#E11D48" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle">BƯỚC 5: NGHỈ PHÉP</text>
        <text x="210" y="38" fill="#475569" font-family="Arial" font-size="8" text-anchor="middle">Đăng ký online /ktv</text>
      </g>
    </g>

    <!-- Bottom Highlights -->
    <g transform="translate(30, 585)">
      <rect width="540" height="85" rx="8" fill="#EFF6FF" stroke="#BFDBFE"/>
      <text x="20" y="28" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">🔑 ĐĂNG NHẬP 1-CHẠM BẰNG PASSKEY (VÂN TAY / FACE ID)</text>
      <text x="20" y="50" fill="#334155" font-family="Arial" font-size="11">• Không cần nhớ mật khẩu: Bấm "Đăng nhập bằng Passkey" trên điện thoại.</text>
      <text x="20" y="70" fill="#334155" font-family="Arial" font-size="11">• Thêm vào màn hình chính: Mở Chrome ➔ Chọn "Add to Home Screen" thành app.</text>
    </g>

    <g transform="translate(30, 680)">
      <rect width="540" height="85" rx="8" fill="#FEF2F2" stroke="#FECDD3"/>
      <text x="20" y="28" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">📶 CƠ CHẾ HÀNG ĐỢI OFFLINE KHI MẤT SÓNG DƯỚI HẦM</text>
      <text x="20" y="50" fill="#475569" font-family="Arial" font-size="11">• Mất mạng vẫn bấm trạng thái bình thường ➔ Lưu an toàn vào máy.</text>
      <text x="20" y="70" fill="#B91C1C" font-family="Arial" font-size="11" font-weight="bold">• Tuyệt đối KHÔNG xóa dữ liệu trình duyệt / tải lại trang khi Offline Q > 0.</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'leaflet-ktv.png'));
  console.log('✓ Created leaflet-ktv.png');
}

// 2. Leaflet 2: Office Workflow (Tiếp nhận -> Mã máy -> Giao việc Pool/Tele -> Kho & PO)
async function makeOfficeLeafletGraphic() {
  const svg = `
  <svg width="600" height="780" viewBox="0 0 600 780" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="780" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="600" height="50" rx="16" fill="#0047AB"/>
    <text x="300" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">QUY TRÌNH VĂN PHÒNG ĐIỀU PHỐI (OFFICE)</text>

    <!-- Box 1: Khởi tạo phiếu -->
    <g transform="translate(30, 65)">
      <rect width="540" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 1: TIẾP NHẬN CUỘC GỌI ➔ BẮT BUỘC CHỌN MÃ MÁY</text>

      <g transform="translate(15, 45)">
        <rect width="180" height="30" rx="4" fill="#F8FAFC" stroke="#0047AB" stroke-width="1.5"/>
        <text x="10" y="20" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">🔍 Mã máy: 36051</text>

        <path d="M 190 15 L 215 15" stroke="#0047AB" stroke-width="2" marker-end="url(#arrow)"/>

        <rect x="225" width="280" height="30" rx="4" fill="#F1F5F9" stroke="#E2E8F0"/>
        <text x="10" y="20" fill="#0F172A" font-family="Arial" font-size="10">Tự điền: Cục Thuế Ba Đình (Tầng 2)</text>
      </g>

      <rect x="15" y="85" width="510" height="50" rx="4" fill="#FEF3C7"/>
      <text x="25" y="105" fill="#92400E" font-family="Arial" font-size="11" font-weight="bold">⚠️ CẢNH BÁO GIÁM ĐỊNH TỰ ĐỘNG:</text>
      <text x="25" y="123" fill="#78350F" font-family="Arial" font-size="10">Nếu máy có BB Giám định chờ thay ➔ Bấm chọn lấy vật tư từ Giám định để không sót đồ.</text>
    </g>

    <!-- Box 2: Phân công & Telegram -->
    <g transform="translate(30, 230)">
      <rect width="540" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 2: PHÂN CÔNG KTV HOẶC ĐẨY VÀO POOL TỰ DO</text>

      <g transform="translate(15, 45)">
        <rect width="245" height="90" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
        <text x="15" y="24" fill="#0047AB" font-family="Arial" font-size="11" font-weight="bold">CÁCH A: GÁN ĐÍCH DANH</text>
        <text x="15" y="44" fill="#475569" font-family="Arial" font-size="10">• Chọn tên KTV cụ thể.</text>
        <text x="15" y="62" fill="#475569" font-family="Arial" font-size="10">• Bot Telegram bắn tin nhắn riêng (DM).</text>
        <text x="15" y="80" fill="#059669" font-family="Arial" font-size="10" font-weight="bold">✓ KTV nhận việc ngay trên máy.</text>

        <rect x="265" width="245" height="90" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
        <text x="15" y="24" fill="#E11D48" font-family="Arial" font-size="11" font-weight="bold">CÁCH B: ĐẨY POOL (CHỜ NHẬN)</text>
        <text x="15" y="44" fill="#475569" font-family="Arial" font-size="10">• Chọn "Chưa gán" đưa vào Pool.</text>
        <text x="15" y="62" fill="#475569" font-family="Arial" font-size="10">• Bắn tin lên Group Telegram chung.</text>
        <text x="15" y="80" fill="#0284C7" font-family="Arial" font-size="10" font-weight="bold">✓ Bot tự sửa tin khi có thợ nhận.</text>
      </g>
    </g>

    <!-- Box 3: Kho & Đặt hàng PO -->
    <g transform="translate(30, 395)">
      <rect width="540" height="175" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 3: THEO DÕI CHUÔNG TỒN KHO &amp; TẠO ĐƠN PO NHÁP</text>

      <g transform="translate(15, 45)">
        <text x="10" y="20" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">1. Quan sát Chuông đỏ Header:</text>
        <text x="210" y="20" fill="#DC2626" font-family="Arial" font-size="11">Báo số vật tư chạm ngưỡng nguy hiểm.</text>

        <text x="10" y="45" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">2. Tab Đặt hàng:</text>
        <text x="120" y="45" fill="#475569" font-family="Arial" font-size="11">Tích chọn "Dưới ngưỡng" ➔ Nhập SL ➔ Bấm <tspan font-weight="bold" fill="#0047AB">+ Giỏ</tspan>.</text>

        <text x="10" y="70" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">3. Tạo đơn PO Nháp:</text>
        <text x="140" y="70" fill="#475569" font-family="Arial" font-size="11">Giỏ hàng giữ nguyên khi đổi tab ➔ Bấm Tạo đơn.</text>

        <text x="10" y="95" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">4. Xuất Excel 8 cột:</text>
        <text x="135" y="95" fill="#059669" font-family="Arial" font-size="11" font-weight="bold">Xuất đơn đặt gửi Nhà cung cấp vật tư.</text>

        <rect y="105" width="510" height="20" rx="3" fill="#FEE2E2"/>
        <text x="255" y="119" fill="#991B1B" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">🔒 Đơn PO có hàng về sẽ bị KHÓA CỨNG — Chỉ Admin được ghi hàng về.</text>
      </g>
    </g>

    <!-- Box 4: In Sổ Bảo Trì QR -->
    <g transform="translate(30, 585)">
      <rect width="540" height="85" rx="8" fill="#F8FAFC" stroke="#0047AB" stroke-width="1.5"/>
      <text x="20" y="26" fill="#0047AB" font-family="Arial" font-size="12" font-weight="bold">🖨️ BƯỚC 4: IN SỔ THEO DÕI MÁY DÁN THÂN MÁY</text>
      <text x="20" y="48" fill="#334155" font-family="Arial" font-size="11">• Vào menu "Theo dõi máy" ➔ Tìm Mã máy ➔ Bấm "In Sổ theo dõi".</text>
      <text x="20" y="68" fill="#334155" font-family="Arial" font-size="11">• Chọn mẫu chuẩn 2 trang A4 ngang: Tự động có mã QR tra cứu và tên điểm máy in hoa.</text>
    </g>

    <!-- Bottom Warning -->
    <g transform="translate(30, 680)">
      <rect width="540" height="85" rx="8" fill="#FEF2F2" stroke="#FECDD3"/>
      <text x="20" y="28" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">⛔ LƯU Ý SỐNG CÒN KHI GIAO VIỆC CÓ VẬT TƯ</text>
      <text x="20" y="50" fill="#475569" font-family="Arial" font-size="11">• Cờ "Hóa đơn" mặc định là FALSE: Chỉ tick khi khách yêu cầu xuất HĐ.</text>
      <text x="20" y="70" fill="#B91C1C" font-family="Arial" font-size="11" font-weight="bold">• Soát kỹ đơn giá trước khi bấm "Bàn giao sang Kế toán" để tránh bị trả lại.</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'leaflet-office.png'));
  console.log('✓ Created leaflet-office.png');
}

// 3. Leaflet 3: Kế toán Hành chính (Kanban 4 Cột + M-invoice + Thu nợ)
async function makeKthcLeafletGraphic() {
  const svg = `
  <svg width="600" height="780" viewBox="0 0 600 780" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="780" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="600" height="50" rx="16" fill="#0047AB"/>
    <text x="300" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">QUY TRÌNH KẾ TOÁN KANBAN &amp; HÓA ĐƠN M-INVOICE</text>

    <!-- 4 Kanban Columns Schematic -->
    <g transform="translate(25, 65)">
      <!-- Col 1 -->
      <rect width="130" height="230" rx="6" fill="#F1F5F9" stroke="#CBD5E1"/>
      <rect width="130" height="26" rx="6" fill="#E2E8F0"/>
      <text x="65" y="18" fill="#334155" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">1. CHỜ LÊN HĐ</text>
      <text x="10" y="48" fill="#0047AB" font-family="Arial" font-size="10" font-weight="bold">Phòng Kỹ thuật:</text>
      <text x="10" y="68" fill="#64748B" font-family="Arial" font-size="9">• Rà soát vật tư</text>
      <text x="10" y="86" fill="#64748B" font-family="Arial" font-size="9">• Đặt giá riêng/khách</text>
      <text x="10" y="104" fill="#64748B" font-family="Arial" font-size="9">• Bấm bàn giao ➔</text>
      <rect x="10" y="185" width="110" height="35" rx="4" fill="#E2E8F0"/>
      <text x="65" y="206" fill="#64748B" font-family="Arial" font-size="9" text-anchor="middle">Kế toán bị ẩn Cột 1</text>

      <!-- Col 2 -->
      <g transform="translate(140, 0)">
        <rect width="130" height="230" rx="6" fill="#EFF6FF" stroke="#3B82F6"/>
        <rect width="130" height="26" rx="6" fill="#DBEAFE"/>
        <text x="65" y="18" fill="#1D4ED8" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">2. KT LÊN HÓA ĐƠN</text>
        <text x="10" y="48" fill="#1E40AF" font-family="Arial" font-size="10" font-weight="bold">Kế toán xử lý:</text>
        <text x="10" y="68" fill="#1E3A8A" font-family="Arial" font-size="9">• Khóa sửa vật tư</text>
        <text x="10" y="86" fill="#1E3A8A" font-family="Arial" font-size="9">• Xuất M-invoice</text>
        <text x="10" y="104" fill="#1E3A8A" font-family="Arial" font-size="9">• Trả Cột 1 nếu sai</text>
        <rect x="8" y="185" width="114" height="35" rx="4" fill="#059669"/>
        <text x="65" y="206" fill="#FFFFFF" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">Xuất M-inv 32 cột</text>
      </g>

      <!-- Col 3 -->
      <g transform="translate(280, 0)">
        <rect width="130" height="230" rx="6" fill="#FFFBEB" stroke="#F59E0B"/>
        <rect width="130" height="26" rx="6" fill="#FEF3C7"/>
        <text x="65" y="18" fill="#B45309" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">3. CHỜ THANH TOÁN</text>
        <text x="10" y="48" fill="#B45309" font-family="Arial" font-size="10" font-weight="bold">Theo dõi nợ:</text>
        <text x="10" y="68" fill="#78350F" font-family="Arial" font-size="9">• Nhập số HĐ thật</text>
        <text x="10" y="86" fill="#78350F" font-family="Arial" font-size="9">• In BBBG &amp; ĐNTT</text>
        <text x="10" y="104" fill="#78350F" font-family="Arial" font-size="9">• Báo nợ 7-15-30 ngày</text>
        <rect x="8" y="185" width="114" height="35" rx="4" fill="#0047AB"/>
        <text x="65" y="206" fill="#FFFFFF" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">Nhập Số HĐ thật</text>
      </g>

      <!-- Col 4 -->
      <g transform="translate(420, 0)">
        <rect width="130" height="230" rx="6" fill="#ECFDF5" stroke="#10B981"/>
        <rect width="130" height="26" rx="6" fill="#DCFCE7"/>
        <text x="65" y="18" fill="#047857" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">4. ĐÃ THANH TOÁN</text>
        <text x="10" y="48" fill="#065F46" font-family="Arial" font-size="10" font-weight="bold">Hoàn tất nợ:</text>
        <text x="10" y="68" fill="#064E3B" font-family="Arial" font-size="9">• Ghi thu tiền lũy kế</text>
        <text x="10" y="86" fill="#064E3B" font-family="Arial" font-size="9">• Tự nhảy khi đủ 100%</text>
        <text x="10" y="104" fill="#064E3B" font-family="Arial" font-size="9">• Lưu trữ tra cứu</text>
        <rect x="8" y="185" width="114" height="35" rx="4" fill="#047857"/>
        <text x="65" y="206" fill="#FFFFFF" font-family="Arial" font-size="9.5" font-weight="bold" text-anchor="middle">Thu đủ 100% tiền</text>
      </g>
    </g>

    <!-- Detail Box 1: M-invoice -->
    <g transform="translate(25, 310)">
      <rect width="550" height="155" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="550" height="30" rx="8" fill="#EFF6FF"/>
      <text x="15" y="20" fill="#1D4ED8" font-family="Arial" font-size="11" font-weight="bold">HƯỚNG DẪN 1: XUẤT FILE M-INVOICE &amp; CHỨNG TỪ PHÁP LÝ</text>

      <g transform="translate(15, 40)">
        <text x="10" y="20" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">1. Xuất M-invoice (32 cột):</text>
        <text x="180" y="20" fill="#475569" font-family="Arial" font-size="10.5">Bấm nút "Xuất M-invoice" ➔ Import thẳng vào phần mềm thuế.</text>

        <text x="10" y="45" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">2. Xuất Word BBBG:</text>
        <text x="145" y="45" fill="#475569" font-family="Arial" font-size="10.5">Tự động sinh Biên bản bàn giao có thông tin máy &amp; vật tư thay.</text>

        <text x="10" y="70" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">3. Xuất Word ĐNTT:</text>
        <text x="145" y="70" fill="#475569" font-family="Arial" font-size="10.5">Giấy đề nghị thanh toán tự nhảy số tăng dần theo năm.</text>

        <text x="10" y="95" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">4. Trả lại Cột 1 kèm lý do:</text>
        <text x="185" y="95" fill="#DC2626" font-family="Arial" font-size="10.5">Nếu sai tên cty / mã số thuế ➔ Bấm trả lại cho Kỹ thuật sửa.</text>
      </g>
    </g>

    <!-- Detail Box 2: Thu nợ & Banner -->
    <g transform="translate(25, 480)">
      <rect width="550" height="180" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="550" height="30" rx="8" fill="#FEF3C7"/>
      <text x="15" y="20" fill="#B45309" font-family="Arial" font-size="11" font-weight="bold">HƯỚNG DẪN 2: THEO DÕI NỢ ĐỌNG &amp; GHI NHẬN TIỀN VỀ</text>

      <g transform="translate(15, 40)">
        <rect width="520" height="36" rx="4" fill="#FEF2F2" stroke="#FF2A54"/>
        <text x="15" y="23" fill="#DC2626" font-family="Arial" font-size="10.5" font-weight="bold">🚨 Banner Cảnh Báo Tuổi Nợ: Nhắc nhở danh sách nợ > 7 ngày, 15 ngày và 30 ngày.</text>

        <text x="10" y="65" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Ghi nhận tiền thu:</text>
        <text x="135" y="65" fill="#475569" font-family="Arial" font-size="10.5">Bấm nút "Thu tiền" ➔ Nhập số tiền thu được (cho phép thu nhiều lần).</text>

        <text x="10" y="90" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Chuyển Cột 4 tự động:</text>
        <text x="165" y="90" fill="#059669" font-family="Arial" font-size="10.5" font-weight="bold">Khi số tiền thu = Tổng tiền sau thuế ➔ Tự động đóng nợ.</text>

        <text x="10" y="115" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">Xuất Excel Công nợ thô:</text>
        <text x="175" y="115" fill="#0047AB" font-family="Arial" font-size="10.5">Xuất 2 sheet phẳng để Kế toán pivot đối soát cuối tháng.</text>
      </g>
    </g>

    <!-- Bottom Warning -->
    <g transform="translate(25, 680)">
      <rect width="550" height="85" rx="8" fill="#FEF2F2" stroke="#FECDD3"/>
      <text x="20" y="28" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">⛔ 3 NGUYÊN TẮC BẢO MẬT CỦA KẾ TOÁN</text>
      <text x="20" y="50" fill="#475569" font-family="Arial" font-size="11">• Không sửa tay danh mục vật tư: Bị khóa trên hệ thống, sai phải bấm trả lại.</text>
      <text x="20" y="70" fill="#B91C1C" font-family="Arial" font-size="11" font-weight="bold">• Bắt buộc nhập số HĐ thật: Neo chân lý tránh xuất đúp và mới sang được Cột 3.</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'leaflet-kthc.png'));
  console.log('✓ Created leaflet-kthc.png');
}

// 4. Leaflet 4: Kinh Doanh (Kho máy thuê /kho-thue & CPC)
async function makeSalesLeafletGraphic() {
  const svg = `
  <svg width="600" height="780" viewBox="0 0 600 780" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="780" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="600" height="50" rx="16" fill="#0047AB"/>
    <text x="300" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">HƯỚNG DẪN DÀNH CHO PHÒNG KINH DOANH (SALES)</text>

    <!-- Box 1: Cổng tra cứu -->
    <g transform="translate(30, 65)">
      <rect width="540" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 1: TRUY CẬP CỔNG /kho-thue (KHÔNG VÀO /admin)</text>

      <g transform="translate(15, 45)">
        <text x="10" y="20" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">• Đường dẫn:</text>
        <text x="100" y="20" fill="#0047AB" font-family="Courier" font-size="11" font-weight="bold">hast-services.vercel.app/kho-thue</text>

        <text x="10" y="45" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">• Đăng nhập:</text>
        <text x="100" y="45" fill="#475569" font-family="Arial" font-size="11">Dùng tài khoản vai trò kinh_doanh (Chế độ Read-only an toàn).</text>

        <text x="10" y="70" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">• 3 Bộ lọc nhanh:</text>
        <text x="130" y="70" fill="#475569" font-family="Arial" font-size="11">Hãng (Ricoh / Konica / Xerox) · Dòng (Màu / Đen trắng) · Tốc độ in.</text>
      </g>
    </g>

    <!-- Box 2: 3 Màu trạng thái máy -->
    <g transform="translate(30, 230)">
      <rect width="540" height="235" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 2: CÁCH ĐỌC 3 TRẠNG THÁI MÁY (QUAN TRỌNG)</text>

      <g transform="translate(15, 45)">
        <!-- Green State -->
        <rect width="510" height="50" rx="6" fill="#ECFDF5" stroke="#10B981"/>
        <rect x="12" y="12" width="120" height="26" rx="4" fill="#059669"/>
        <text x="72" y="29" fill="#FFFFFF" font-family="Arial" font-size="10.5" font-weight="bold" text-anchor="middle">🟢 SẴN SÀNG XUẤT</text>
        <text x="145" y="25" fill="#065F46" font-family="Arial" font-size="11" font-weight="bold">Máy đã dọn sạch, test bản in hoàn hảo.</text>
        <text x="145" y="40" fill="#047857" font-family="Arial" font-size="10">Có thể ký hợp đồng cam kết giao ngay trong 24h.</text>

        <!-- Amber State -->
        <g transform="translate(0, 60)">
          <rect width="510" height="55" rx="6" fill="#FFFBEB" stroke="#F59E0B"/>
          <rect x="12" y="14" width="120" height="26" rx="4" fill="#D97706"/>
          <text x="72" y="31" fill="#FFFFFF" font-family="Arial" font-size="10.5" font-weight="bold" text-anchor="middle">🟡 ĐANG BẢO DƯỠNG</text>
          <text x="145" y="26" fill="#92400E" font-family="Arial" font-size="11" font-weight="bold">Đang thay thế sấy/trống hoặc chờ dọn máy.</text>
          <text x="145" y="43" fill="#B45309" font-family="Arial" font-size="10" font-weight="bold">⚠️ BẮT BUỘC HỎI TECH_ADMIN ngày hoàn thành trước khi hẹn khách.</text>
        </g>

        <!-- Red State -->
        <g transform="translate(0, 125)">
          <rect width="510" height="50" rx="6" fill="#FEF2F2" stroke="#EF4444"/>
          <rect x="12" y="12" width="120" height="26" rx="4" fill="#DC2626"/>
          <text x="72" y="29" fill="#FFFFFF" font-family="Arial" font-size="10.5" font-weight="bold" text-anchor="middle">🔴 ĐANG CHO THUÊ</text>
          <text x="145" y="25" fill="#991B1B" font-family="Arial" font-size="11" font-weight="bold">Máy đang chạy ở khách hàng khác.</text>
          <text x="145" y="40" fill="#7F1D1D" font-family="Arial" font-size="10">Không khả dụng để tư vấn cho khách mới.</text>
        </g>
      </g>
    </g>

    <!-- Box 3: Ký HĐ & Bàn giao -->
    <g transform="translate(30, 480)">
      <rect width="540" height="180" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect width="540" height="32" rx="8" fill="#EFF6FF"/>
      <text x="15" y="22" fill="#1D4ED8" font-family="Arial" font-size="12" font-weight="bold">BƯỚC 3: QUY TRÌNH KHI KÝ HỢP ĐỒNG THUÊ MÁY MỚI</text>

      <g transform="translate(15, 45)">
        <text x="10" y="20" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">1. Chốt Mã máy &amp; Serial:</text>
        <text x="175" y="20" fill="#475569" font-family="Arial" font-size="10.5">Gửi mã máy cụ thể cho Văn phòng Điều phối.</text>

        <text x="10" y="45" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">2. Cung cấp hồ sơ khách:</text>
        <text x="180" y="45" fill="#475569" font-family="Arial" font-size="10.5">Tên công ty, Mã số thuế, Vị trí đặt, Ngày chốt counter.</text>

        <text x="10" y="70" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">3. Tech_admin tạo Điểm máy:</text>
        <text x="210" y="70" fill="#0047AB" font-family="Arial" font-size="10.5" font-weight="bold">Khởi tạo trên hệ thống ➔ Xuất phiếu giao lắp đặt.</text>

        <text x="10" y="95" fill="#0F172A" font-family="Arial" font-size="11" font-weight="bold">4. Dán tem QR Code:</text>
        <text x="160" y="95" fill="#059669" font-family="Arial" font-size="10.5">KTV dán tem mã QR lên thân máy để theo dõi trọn đời.</text>
      </g>
    </g>

    <!-- Bottom Warning -->
    <g transform="translate(30, 680)">
      <rect width="540" height="85" rx="8" fill="#FEF2F2" stroke="#FECDD3"/>
      <text x="20" y="28" fill="#DC2626" font-family="Arial" font-size="12" font-weight="bold">⛔ 2 NGUYÊN TẮC CẦM TRỊCH CỦA KINH DOANH</text>
      <text x="20" y="50" fill="#475569" font-family="Arial" font-size="11">• Tuyệt đối không tự ý hứa ngày giao máy khi máy đang "Đang bảo dưỡng".</text>
      <text x="20" y="70" fill="#B91C1C" font-family="Arial" font-size="11" font-weight="bold">• Không truy cập vào /admin để tránh xáo trộn giao việc và số liệu kỹ thuật.</text>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'leaflet-sales.png'));
  console.log('✓ Created leaflet-sales.png');
}

// 5. Leaflet 5: Cheat Sheet Do's & Don'ts
async function makeDoDontLeafletGraphic() {
  const svg = `
  <svg width="600" height="780" viewBox="0 0 600 780" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="780" rx="16" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
    <rect width="600" height="50" rx="16" fill="#0047AB"/>
    <text x="300" y="32" fill="#FFFFFF" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">BẢNG VÀNG QUY TẮC: DO'S &amp; DON'TS HAST</text>

    <!-- DO'S Summary -->
    <g transform="translate(30, 65)">
      <rect width="540" height="330" rx="8" fill="#ECFDF5" stroke="#10B981" stroke-width="2"/>
      <rect width="540" height="36" rx="8" fill="#059669"/>
      <text x="20" y="24" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold">✓ 5 ĐIỀU NÊN LÀM ĐỂ VẬN HÀNH TRƠN TRU (DO'S)</text>

      <g transform="translate(20, 50)">
        <text x="0" y="20" fill="#065F46" font-family="Arial" font-size="11.5" font-weight="bold">1. Luôn CLICK CHUỘT vào nút bấm:</text>
        <text x="0" y="38" fill="#047857" font-family="Arial" font-size="10.5">Mọi thao tác lưu, xóa, nhận việc đều phải click chuột trực tiếp vào nút.</text>

        <text x="0" y="70" fill="#065F46" font-family="Arial" font-size="11.5" font-weight="bold">2. Đúng chuẩn Tiền tệ &amp; Ngày tháng:</text>
        <text x="0" y="88" fill="#047857" font-family="Arial" font-size="10.5">Tiền phân cách bằng dấu chấm (2.500.000 đ); Ngày theo DD/MM/YYYY.</text>

        <text x="0" y="120" fill="#065F46" font-family="Arial" font-size="11.5" font-weight="bold">3. Tải lại trang khi có phiên bản mới:</text>
        <text x="0" y="138" fill="#047857" font-family="Arial" font-size="10.5">Bấm nút "Tải lại trang" trên thanh nhắc màu vàng để nhận code mới nhất.</text>

        <text x="0" y="170" fill="#065F46" font-family="Arial" font-size="11.5" font-weight="bold">4. Bấm chuẩn trạng thái ngoài hiện trường:</text>
        <text x="0" y="188" fill="#047857" font-family="Arial" font-size="10.5">"Đang làm" khi chạm máy và "Hoàn thành" trước khi rời máy khách.</text>

        <text x="0" y="220" fill="#065F46" font-family="Arial" font-size="11.5" font-weight="bold">5. Kiểm tra chuông &amp; banner đỏ mỗi sáng:</text>
        <text x="0" y="238" fill="#047857" font-family="Arial" font-size="10.5">Office xem chuông tồn kho, Kế toán xem banner nợ đọng đầu giờ sáng.</text>
      </g>
    </g>

    <!-- DON'TS Summary -->
    <g transform="translate(30, 415)">
      <rect width="540" height="340" rx="8" fill="#FEF2F2" stroke="#EF4444" stroke-width="2"/>
      <rect width="540" height="36" rx="8" fill="#DC2626"/>
      <text x="20" y="24" fill="#FFFFFF" font-family="Arial" font-size="13" font-weight="bold">✕ 5 ĐIỀU TUYỆT ĐỐI CẤM KỴ (DON'TS)</text>

      <g transform="translate(20, 50)">
        <text x="0" y="20" fill="#991B1B" font-family="Arial" font-size="11.5" font-weight="bold">1. KHÔNG dùng phím tắt Enter / Escape:</text>
        <text x="0" y="38" fill="#7F1D1D" font-family="Arial" font-size="10.5">Hệ thống đã chặn toàn diện để tránh lỡ tay bấm nhầm khi đang load mạng.</text>

        <text x="0" y="70" fill="#991B1B" font-family="Arial" font-size="11.5" font-weight="bold">2. KHÔNG nhảy cóc quy trình:</text>
        <text x="0" y="88" fill="#7F1D1D" font-family="Arial" font-size="10.5">KTV chưa Hoàn thành thì cấm lên HĐ; Chưa có số HĐ thật cấm sang Cột 3.</text>

        <text x="0" y="120" fill="#991B1B" font-family="Arial" font-size="11.5" font-weight="bold">3. KHÔNG xóa dữ liệu web khi Offline Q > 0:</text>
        <text x="0" y="138" fill="#7F1D1D" font-family="Arial" font-size="10.5">KTV mất sóng dưới hầm phải giữ nguyên máy để hệ thống tự sync khi có 4G.</text>

        <text x="0" y="170" fill="#991B1B" font-family="Arial" font-size="11.5" font-weight="bold">4. KHÔNG gõ tay tên khách nếu máy đã có:</text>
        <text x="0" y="188" fill="#7F1D1D" font-family="Arial" font-size="10.5">Luôn tìm theo Mã máy để giữ nguyên lịch sử máy và điểm đặt.</text>

        <text x="0" y="220" fill="#991B1B" font-family="Arial" font-size="11.5" font-weight="bold">5. KHÔNG sửa dữ liệu vượt thẩm quyền:</text>
        <text x="0" y="238" fill="#7F1D1D" font-family="Arial" font-size="10.5">Kế toán không sửa vật tư; Tech_admin không tự ý ghi nhận hàng về kho.</text>
      </g>
    </g>
  </svg>
  `;
  await sharp(Buffer.from(svg)).png().toFile(path.join(ASSETS_DIR, 'leaflet-dodont.png'));
  console.log('✓ Created leaflet-dodont.png');
}

async function run() {
  await makeKtvLeafletGraphic();
  await makeOfficeLeafletGraphic();
  await makeKthcLeafletGraphic();
  await makeSalesLeafletGraphic();
  await makeDoDontLeafletGraphic();
  console.log('All 5 leaflet infographics generated!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
