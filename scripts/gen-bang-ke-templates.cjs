/*
 * Sinh 2 template Word cho bảng kê Thuê/CPC bằng thư viện `docx`.
 * Chạy: node scripts/gen-bang-ke-templates.cjs
 * Xuất ra: src/lib/report/bang-ke-don-may.docx  (Mẫu A — 1 máy, Hình 1)
 *          src/lib/report/bang-ke-da-may.docx   (Mẫu B — nhiều máy, Hình 2)
 *
 * Cột đặt FIXED width -> placeholder dài không làm vỡ cột. Runtime docxtemplater
 * chỉ thay text {{...}} nên số liệu ngắn -> bảng khít, đẹp.
 */
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, VerticalMergeType, VerticalAlign,
  HeadingLevel, PageOrientation, TableLayoutType, LineRuleType, HeightRule,
} = require('docx')

// Giãn dòng 1.5 (240 = single, 360 = 1.5) cho phần chữ info phía trên bảng
const LS15 = { line: 360, lineRule: LineRuleType.AUTO }

const FONT = 'Times New Roman'
// PNG RGB (ảnh gốc là JPEG CMYK làm Word báo "corrupt" -> đã convert sang sRGB PNG)
const LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'letterhead-hstc.png'))     // A4 (2290x102)
const LOGO_A3 = fs.readFileSync(path.join(__dirname, 'assets', 'letterhead-a3.png'))    // A3 (1982x52)
const OUT_DIR = path.join(__dirname, '..', 'src', 'lib', 'report')

// ---------- helpers ----------
const R = (text, o = {}) => new TextRun({ text: String(text), font: FONT, size: o.size || 24, bold: o.bold, italics: o.italics, color: o.color })
const P = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  alignment: o.align, spacing: o.spacing || { before: 0, after: 0 }, indent: o.indent,
})
const txt = (s, o = {}) => P(R(s, o), { align: o.align, spacing: o.spacing })

const B_SINGLE = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const ALL_BORDERS = { top: B_SINGLE, bottom: B_SINGLE, left: B_SINGLE, right: B_SINGLE }

// Ô bảng: gộp dọc (vMerge), gộp ngang (span), canh, tô nền, nhiều đoạn.
function CELL(content, o = {}) {
  const paras = Array.isArray(content) ? content : [content]
  return new TableCell({
    children: paras,
    columnSpan: o.span,
    verticalMerge: o.vMerge, // VerticalMergeType.RESTART | CONTINUE
    verticalAlign: o.vAlign || VerticalAlign.CENTER,
    shading: o.fill ? { fill: o.fill, type: 'clear', color: 'auto' } : undefined,
    margins: { top: 20, bottom: 20, left: 40, right: 40 },
  })
}
// Ô header 2 dòng (Việt đậm + Anh nghiêng)
const H2 = (vi, en, o = {}) => CELL([
  txt(vi, { bold: true, size: o.size || 18, align: AlignmentType.CENTER }),
  ...(en ? [txt(en, { italics: true, size: (o.size || 18) - 2, align: AlignmentType.CENTER })] : []),
], { span: o.span, vMerge: o.vMerge, fill: o.fill || 'D9E1F2' })
// Ô dữ liệu (canh giữa, cỡ nhỏ)
const D = (s, o = {}) => CELL(txt(s, { size: o.size || 20, align: o.align || AlignmentType.CENTER, bold: o.bold }), { span: o.span, vMerge: o.vMerge, fill: o.fill })
// Ô vMerge tiếp tục (rỗng)
const CONT = (o = {}) => CELL(txt(''), { vMerge: VerticalMergeType.CONTINUE, span: o.span })

// img mặc định = LOGO A4 (2290x102). Truyền {data,w,h} để dùng ảnh khác (VD A3).
const logoImg = (widthPx, img) => {
  const src = img || { data: LOGO, w: 2290, h: 102 }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new ImageRun({ type: 'png', data: src.data, transformation: { width: widthPx, height: Math.round(widthPx * src.h / src.w) } })],
  })
}

// Nhãn:giá trị trên 1 dòng (label đậm, value thường)
// o.valBold: giá trị in đậm hay không (mặc định true)
const labelVal = (label, en, ph, o = {}) => P([
  R(label, { size: 24, bold: false }), en ? R(` /${en}`, { size: 22, italics: true }) : R(''), R(': ', { size: 24 }),
  R(`{{${ph}}}`, { size: 24, bold: o.valBold !== false }),
], { spacing: { before: 20, after: 20, ...LS15 } })

// =====================================================================
// MẪU A — ĐƠN MÁY (Hình 1): BẢNG KÊ THANH TOÁN PHÍ DỊCH VỤ BẢN CHỤP
// Portrait A4, info 12pt, bảng 10pt. 13 cột A..M.
// =====================================================================
function buildDonMay() {
  // A4 NGANG: 13 cột, tổng ~15900 dxa (usable ~28.4cm). Data 12pt.
  const colW = [1300, 1250, 1100, 1250, 1100, 1150, 1250, 1000, 1100, 1250, 1350, 1400, 1400]
  const TW = colW.reduce((a, b) => a + b, 0)
  const Da = (s, o = {}) => D(s, { size: 24, ...o }) // ô dữ liệu 12pt

  // Header row 1
  const hr1 = new TableRow({
    children: [
      H2('LOẠI BẢN CHỤP', 'Item', { vMerge: VerticalMergeType.RESTART }),
      H2('ĐẦU KỲ', 'Opening', { span: 2 }),
      H2('CUỐI KỲ', 'Closing', { span: 2 }),
      H2('SỐ BẢN CHỤP SỬ DỤNG', 'Number of used copies', { vMerge: VerticalMergeType.RESTART }),
      H2('SỐ BC MF / TỐI THIỂU', 'Free / minimum copies', { vMerge: VerticalMergeType.RESTART }),
      H2('SỐ BC TÍNH PHÍ', 'Chargeable copies', { vMerge: VerticalMergeType.RESTART }),
      H2('ĐƠN GIÁ (VNĐ/BẢN)', 'Price', { vMerge: VerticalMergeType.RESTART }),
      H2('PHÍ DỊCH VỤ BẢN CHỤP (VNĐ)', 'Copy service fee', { vMerge: VerticalMergeType.RESTART }),
      H2('PHÍ DV TỐI THIỂU/THÁNG', 'Minimum charge', { vMerge: VerticalMergeType.RESTART }),
      H2('TỔNG TRƯỚC VAT (VNĐ)', 'Total excl. tax', { vMerge: VerticalMergeType.RESTART }),
      H2('TỔNG SAU VAT (VNĐ)', 'Total incl. tax', { vMerge: VerticalMergeType.RESTART }),
    ],
  })
  // Header row 2 (sub cột ngày/counter dưới ĐẦU KỲ, CUỐI KỲ; các cột khác vMerge continue)
  const hr2 = new TableRow({
    children: [
      CONT(),
      H2('NGÀY', 'Date'), H2('SỐ BC', 'Counter'),
      H2('NGÀY', 'Date'), H2('SỐ BC', 'Counter'),
      CONT(), CONT(), CONT(), CONT(), CONT(), CONT(), CONT(), CONT(),
    ],
  })
  // Header row 3 (mã cột)
  const codes = ['A', 'B', 'C', 'D', 'E', 'F=E-C', 'G', 'H', 'I', 'J', 'K', 'L=Σ(J+K)', 'M']
  const hr3 = new TableRow({ children: codes.map(c => D(c, { size: 16, fill: 'F2F2F2' })) })

  const rowH = { height: { value: 567, rule: HeightRule.ATLEAST } } // cao 1cm (567 twips)
  // Dòng Đen A4
  const rowDen = new TableRow({
    ...rowH,
    children: [
      Da('Đen A4', { bold: true, align: AlignmentType.LEFT }),
      Da('{{NGAY_DAU}}', { vMerge: VerticalMergeType.RESTART, bold: true }),
      Da('{{DEN_SO_DAU}}', { bold: true }),
      Da('{{NGAY_CUOI}}', { vMerge: VerticalMergeType.RESTART, bold: true }),
      Da('{{DEN_SO_CUOI}}', { bold: true }),
      Da('{{DEN_SD}}'), Da('{{DEN_MF}}'), Da('{{DEN_TP}}'), Da('{{DEN_DG}}'), Da('{{DEN_TT}}'),
      Da('{{PHI_TOI_THIEU_THANG}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{TONG_TRUOC_VAT}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{TONG_SAU_VAT}}', { vMerge: VerticalMergeType.RESTART, bold: true }),
    ],
  })
  // Dòng Màu A4
  const rowMau = new TableRow({
    ...rowH,
    children: [
      Da('Màu A4', { bold: true, align: AlignmentType.LEFT }),
      CONT(), Da('{{MAU_SO_DAU}}', { bold: true }), CONT(), Da('{{MAU_SO_CUOI}}', { bold: true }),
      Da('{{MAU_SD}}'), Da('{{MAU_MF}}'), Da('{{MAU_TP}}'), Da('{{MAU_DG}}'), Da('{{MAU_TT}}'),
      CONT(), CONT(), CONT(),
    ],
  })

  const table = new Table({
    columnWidths: colW,
    width: { size: TW, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS,
    rows: [hr1, hr2, hr3, rowDen, rowMau],
  })

  const info = [
    labelVal('Tên KH', 'Customer Name', 'TEN_KH'),                       // tên KH: đậm (+ UPPER ở dữ liệu)
    labelVal('Địa chỉ', 'Address', 'DIA_CHI', { valBold: false }),        // thường
    labelVal('Vị trí đặt máy', 'Machine located', 'VI_TRI_DAT_MAY', { valBold: false }),
    // 2 cột: dùng bảng ẩn viền cho căn hàng nhãn trái/phải
    infoTwoCol('Ngày chốt counter thanh toán', '', 'NGAY_CHOT', 'Mã máy', 'Code', 'MA_MAY', { lBold: false, rBold: true }),
    infoTwoCol('Người liên hệ', 'PIC', 'NGUOI_LIEN_HE', 'Loại máy', 'Model', 'MODEL', { lBold: false, rBold: true }),
    infoTwoCol('Email', '', 'EMAIL', 'Thời hạn', 'EOD', 'EOD', { lBold: false, rBold: false }),
    P([
      R('Phí bản in', { size: 24 }), R(' /Copy Cost (VNĐ/A4 chưa VAT /excl. tax)', { size: 22, italics: true }), R(': ', { size: 24 }),
      R('Đen /B&W: ', { size: 24 }), R('{{DON_GIA_BW}}', { size: 24, bold: true }),
      R('     Màu/Color: ', { size: 24 }), R('{{DON_GIA_MAU}}', { size: 24, bold: true }),
    ], { spacing: { before: 20, after: 80, ...LS15 } }),
  ]

  const footer = [
    P(R('')),
    P([R('Bằng chữ: ', { size: 24, italics: true }), R('{{BANG_CHU}}', { size: 24, italics: true, bold: true })], { align: AlignmentType.RIGHT, spacing: { before: 60 } }),
  ]
  // Khối chân trang chữ ký (điều kiện)
  const chanTrang = [
    P(R('{{#HIEN_CHAN_TRANG}}', { size: 2 })),
    P(R('')),
    twoColSign(true),
    P(R('{{/HIEN_CHAN_TRANG}}', { size: 2 })),
  ]

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      // A4 ngang: truyền kích thước dọc (11906 x 16838), lib tự hoán -> 16838 x 11906
      properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 400, bottom: 400, left: 400, right: 400 } } },
      children: [
        logoImg(1000),
        P(R('')), // cách letterhead 1 enter
        txt('BẢNG KÊ THANH TOÁN PHÍ DỊCH VỤ BẢN CHỤP', { bold: true, size: 30, align: AlignmentType.CENTER }),
        P(R('')), // cách BẢNG KÊ 1 enter
        ...info,
        table,
        ...footer,
        ...chanTrang,
      ],
    }],
  })
}

// Bảng 2 cột ẩn viền để căn nhãn trái | phải trong khối info
// o.lBold / o.rBold: giá trị cột trái/phải in đậm (mặc định true)
function infoTwoCol(lLabel, lEn, lPh, rLabel, rEn, rPh, o = {}) {
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }
  const c = (label, en, ph, bold) => new TableCell({
    borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [P([R(label, { size: 24 }), en ? R(` /${en}`, { size: 22, italics: true }) : R(''), R(': ', { size: 24 }), R(`{{${ph}}}`, { size: 24, bold: bold !== false })], { spacing: { before: 20, after: 20, ...LS15 } })],
  })
  return new Table({
    columnWidths: [8600, 7300], width: { size: 15900, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [c(lLabel, lEn, lPh, o.lBold), c(rLabel, rEn, rPh, o.rBold)] })],
  })
}

// dateInRight=true (Mẫu A): "Hà Nội, ngày..." canh giữa trên ĐẠI DIỆN CÔNG TY (cột phải).
// mặc định false (Mẫu B): giữ nguyên 2 cột KHÁCH HÀNG | CÔNG TY.
function twoColSign(dateInRight, totalW = 15900) {
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }
  const cell = (paras) => new TableCell({ borders: noBorder, children: paras })
  const left = dateInRight
    ? cell([txt('', { size: 24, align: AlignmentType.CENTER }), txt('ĐẠI DIỆN KHÁCH HÀNG', { bold: true, size: 24, align: AlignmentType.CENTER })])
    : cell([txt('ĐẠI DIỆN KHÁCH HÀNG', { bold: true, size: 24, align: AlignmentType.CENTER, spacing: { before: 80 } })])
  const right = dateInRight
    ? cell([txt('{{NGAY_LAP_BANG_KE}}', { italics: true, size: 24, align: AlignmentType.CENTER }), txt('ĐẠI DIỆN CÔNG TY', { bold: true, size: 24, align: AlignmentType.CENTER })])
    : cell([txt('ĐẠI DIỆN CÔNG TY', { bold: true, size: 24, align: AlignmentType.CENTER, spacing: { before: 80 } })])
  const half = Math.round(totalW / 2)
  return new Table({
    columnWidths: [half, half], width: { size: totalW, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: noBorder,
    rows: [new TableRow({ children: [left, right] })],
  })
}

// =====================================================================
// MẪU B — ĐA MÁY (Hình 2): BẢNG KÊ THANH TOÁN TIỀN THUÊ MÁY
// A3 ngang, 10pt. Vòng lặp dòng máy {{#ds}}...{{/ds}} + dòng Cộng tổng.
// =====================================================================
function buildDaMay() {
  // 24 cột theo file chuẩn (A3). Cột 4 + 13..24 = giá trị cấp hợp đồng (hiện ở hàng Cộng tổng).
  const colW = [400, 729, 1276, 1134, 1134, 992, 851, 1134, 992, 851, 992, 992, 709, 992, 851, 850, 851, 708, 993, 992, 1134, 1134, 1134, 1134]
  const totalW = colW.reduce((a, b) => a + b, 0)
  const HS = 18 // header size (9pt)
  const DS = 22 // data size (11pt)
  const vR = VerticalMergeType.RESTART

  // ---- Header 3 tầng ----
  const hr1 = new TableRow({ tableHeader: true, children: [
    H2('TT', '', { vMerge: vR, size: HS }),
    H2('Mã máy', '', { vMerge: vR, size: HS }),
    H2('Tên máy', '', { vMerge: vR, size: HS }),
    H2('Giá thuê máy (chưa VAT)', '', { vMerge: vR, size: HS }),
    H2('Đầu kỳ', '', { span: 3, vMerge: vR, size: HS }),
    H2('Cuối kỳ', '', { span: 3, vMerge: vR, size: HS }),
    H2('Chi tiết bản chụp', '', { span: 6, size: HS }),
    H2('Đơn giá', '', { span: 2, vMerge: vR, size: HS }),
    H2('Card reader', '', { vMerge: vR, size: HS }),
    H2('Thành tiền bản chụp', '', { span: 2, vMerge: vR, size: HS }),
    H2('Thành tiền máy + bản chụp (chưa VAT)', '', { vMerge: vR, size: HS }),
    H2('Thuế VAT {{VAT}}%', '', { vMerge: vR, size: HS }),
    H2('Tổng tiền thanh toán (gồm VAT)', '', { vMerge: vR, size: HS }),
  ] })
  const dm = (t) => H2(t, '', { size: HS })
  const hr2 = new TableRow({ tableHeader: true, children: [
    CONT(), CONT(), CONT(), CONT(),
    CONT({ span: 3 }), CONT({ span: 3 }),
    H2('Số bản chụp sử dụng', '', { span: 2, size: HS }),
    H2('Số BC miễn phí', '', { span: 2, size: HS }),
    H2('Số BC tính phí', '', { span: 2, size: HS }),
    CONT({ span: 2 }), CONT(), CONT({ span: 2 }), CONT(), CONT(), CONT(),
  ] })
  const hr3 = new TableRow({ tableHeader: true, children: [
    CONT(), CONT(), CONT(), CONT(),
    dm('Ngày'), dm('Đen trắng'), dm('Màu'),
    dm('Ngày'), dm('Đen trắng'), dm('Màu'),
    dm('Đen trắng'), dm('Màu'),
    dm('Đen trắng'), dm('Màu'),
    dm('Đen trắng'), dm('Màu'),
    dm('Đen trắng'), dm('Màu'),
    CONT(),
    dm('Đen trắng'), dm('Màu'),
    CONT(), CONT(), CONT(),
  ] })

  // ---- Hàng Cộng tổng: chứa mọi giá trị cấp hợp đồng khung ----
  const sumLabel = CELL(txt('Cộng tổng bản chụp tháng {{THANG}}/{{NAM}}', { bold: true, size: DS, align: AlignmentType.CENTER }), { span: 3, fill: 'F2F2F2' })
  const st = (ph, o = {}) => CELL(txt(`{{${ph}}}`, { bold: true, size: DS, align: o.align || AlignmentType.RIGHT }), { fill: 'F2F2F2', span: o.span })
  const blank = (o = {}) => CELL(txt(''), { fill: 'F2F2F2', span: o.span })
  const sumRow = new TableRow({ children: [
    sumLabel,
    st('GIA_THUE'),                       // 4 Giá thuê máy
    blank(), blank(), blank(),            // 5-7 đầu kỳ
    blank(), blank(), blank(),            // 8-10 cuối kỳ
    st('TONG_SD_DEN'), st('TONG_SD_MAU'), // 11-12 sử dụng
    st('MP_DEN'), st('MP_MAU'),           // 13-14 miễn phí
    st('TP_DEN'), st('TP_MAU'),           // 15-16 tính phí
    st('DG_DEN'), st('DG_MAU'),           // 17-18 đơn giá
    st('CARD'),                           // 19 card reader
    st('TT_DEN'), st('TT_MAU'),           // 20-21 thành tiền BC
    st('TT_MAY_BC'), st('VAT_TIEN'), st('TONG_CONG'), // 22-24
  ] })

  // ---- Dòng máy (loop) — chỉ điền cột theo từng máy; cột 4 & 13..24 để trống ----
  const dcell = (ph, o = {}) => CELL(txt(`{{${ph}}}`, { size: DS, align: o.align || AlignmentType.CENTER }))
  const ec = () => CELL(txt('', { size: DS }))
  const firstCell = CELL(P([R('{{#ds}}', { size: 2 }), R('{{stt}}', { size: DS })], { align: AlignmentType.CENTER }))
  const lastCell = CELL(P([R('', { size: DS }), R('{{/ds}}', { size: 2 })], { align: AlignmentType.CENTER }))
  const loopRow = new TableRow({ children: [
    firstCell,
    dcell('ma', { align: AlignmentType.LEFT }), dcell('ten', { align: AlignmentType.LEFT }),
    ec(),                                                                 // 4 giá thuê (trống)
    dcell('dk_ngay'), dcell('dk_den', { align: AlignmentType.RIGHT }), dcell('dk_mau', { align: AlignmentType.RIGHT }),
    dcell('ck_ngay'), dcell('ck_den', { align: AlignmentType.RIGHT }), dcell('ck_mau', { align: AlignmentType.RIGHT }),
    dcell('sd_den', { align: AlignmentType.RIGHT }), dcell('sd_mau', { align: AlignmentType.RIGHT }),
    ec(), ec(), ec(), ec(), ec(), ec(), ec(), ec(), ec(), ec(), ec(),    // 13-23 (miễn phí/tính phí/đơn giá/card/thành tiền/máy+BC/VAT)
    lastCell,                                                            // 24 tổng (trống)
  ] })

  const table = new Table({
    columnWidths: colW, width: { size: totalW, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS, rows: [hr1, hr2, hr3, sumRow, loopRow],
  })

  const info = [
    P([R('Tên Khách hàng: ', { size: 24 }), R('{{TEN_KH}}', { size: 24, bold: true })], { spacing: { before: 20, after: 20, ...LS15 } }),
    P([R('Địa chỉ: ', { size: 24 }), R('{{DIA_CHI}}', { size: 24, bold: true })], { spacing: { after: 20, ...LS15 } }),
    P([R('Địa chỉ đặt máy: ', { size: 24 }), R('{{DIA_CHI_MAY}}', { size: 24, bold: true }), R('          Kỳ tháng ', { size: 24 }), R('{{THANG}}', { size: 24, bold: true }), R(' năm ', { size: 24 }), R('{{NAM}}', { size: 24, bold: true })], { spacing: { after: 80, ...LS15 } }),
  ]
  const footer = [
    P([R('Bằng chữ: ', { size: 22, italics: true }), R('{{BANG_CHU}}', { size: 22, italics: true, bold: true })], { align: AlignmentType.RIGHT, spacing: { before: 80 } }),
    P(R('{{#HIEN_CHAN_TRANG}}', { size: 2 })),
    P(R('')),
    twoColSign(true, totalW), // chân trang rộng bằng bảng tính; "Hà Nội, ngày..." canh giữa trên ĐẠI DIỆN CÔNG TY
    P(R('{{/HIEN_CHAN_TRANG}}', { size: 2 })),
  ]

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      // A3 ngang: truyền kích thước dọc A3 (16838 x 23811), lib tự hoán -> 23811 x 16838
      properties: { page: { size: { width: 16838, height: 23811, orientation: PageOrientation.LANDSCAPE }, margin: { top: 500, bottom: 500, left: 500, right: 500 } } },
      children: [
        logoImg(1500, { data: LOGO_A3, w: 1982, h: 52 }), // letterhead A3 (rộng vừa khổ)
        txt('BẢNG KÊ THANH TOÁN TIỀN THUÊ MÁY', { bold: true, size: 30, align: AlignmentType.CENTER, spacing: { before: 60, after: 120 } }),
        ...info,
        table,
        ...footer,
      ],
    }],
  })
}

// ---------- xuất ----------
async function main() {
  const a = buildDonMay()
  fs.writeFileSync(path.join(OUT_DIR, 'bang-ke-don-may.docx'), await Packer.toBuffer(a))
  console.log('✓ bang-ke-don-may.docx')
  const b = buildDaMay()
  fs.writeFileSync(path.join(OUT_DIR, 'bang-ke-da-may.docx'), await Packer.toBuffer(b))
  console.log('✓ bang-ke-da-may.docx')
}
main().catch(e => { console.error(e); process.exit(1) })
