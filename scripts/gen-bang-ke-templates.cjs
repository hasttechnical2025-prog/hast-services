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
  HeadingLevel, PageOrientation, TableLayoutType,
} = require('docx')

const FONT = 'Times New Roman'
// PNG RGB (ảnh gốc là JPEG CMYK làm Word báo "corrupt" -> đã convert sang sRGB PNG)
const LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'letterhead-hstc.png'))
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

const logoImg = (widthPx) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 60 },
  children: [new ImageRun({ type: 'png', data: LOGO, transformation: { width: widthPx, height: Math.round(widthPx * 102 / 2290) } })],
})

// Nhãn:giá trị trên 1 dòng (label đậm, value thường)
const labelVal = (label, en, ph, o = {}) => P([
  R(label, { size: 24, bold: false }), en ? R(` /${en}`, { size: 22, italics: true }) : R(''), R(': ', { size: 24 }),
  R(`{{${ph}}}`, { size: 24, bold: true }),
], { spacing: { before: 20, after: 20 } })

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

  // Dòng Đen A4
  const rowDen = new TableRow({
    children: [
      Da('Đen A4', { bold: true, align: AlignmentType.LEFT }),
      Da('{{NGAY_DAU}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{DEN_SO_DAU}}'),
      Da('{{NGAY_CUOI}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{DEN_SO_CUOI}}'),
      Da('{{DEN_SD}}'), Da('{{DEN_MF}}'), Da('{{DEN_TP}}'), Da('{{DEN_DG}}'), Da('{{DEN_TT}}'),
      Da('{{PHI_TOI_THIEU_THANG}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{TONG_TRUOC_VAT}}', { vMerge: VerticalMergeType.RESTART }),
      Da('{{TONG_SAU_VAT}}', { vMerge: VerticalMergeType.RESTART }),
    ],
  })
  // Dòng Màu A4
  const rowMau = new TableRow({
    children: [
      Da('Màu A4', { bold: true, align: AlignmentType.LEFT }),
      CONT(), Da('{{MAU_SO_DAU}}'), CONT(), Da('{{MAU_SO_CUOI}}'),
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
    labelVal('Tên KH', 'Customer Name', 'TEN_KH'),
    labelVal('Địa chỉ', 'Address', 'DIA_CHI'),
    labelVal('Vị trí đặt máy', 'Machine located', 'VI_TRI_DAT_MAY'),
    // 2 cột: dùng bảng ẩn viền cho căn hàng nhãn trái/phải
    infoTwoCol('Ngày chốt counter thanh toán', '', 'NGAY_CHOT', 'Mã máy', 'Code', 'MA_MAY'),
    infoTwoCol('Người liên hệ', 'PIC', 'NGUOI_LIEN_HE', 'Loại máy', 'Model', 'MODEL'),
    infoTwoCol('Email', '', 'EMAIL', 'Thời hạn', 'EOD', 'EOD'),
    P([
      R('Phí bản in', { size: 24 }), R(' /Copy Cost (VNĐ/A4 chưa VAT /excl. tax)', { size: 22, italics: true }), R(': ', { size: 24 }),
      R('Đen /B&W: ', { size: 24 }), R('{{DON_GIA_BW}}', { size: 24, bold: true }),
      R('     Màu/Color: ', { size: 24 }), R('{{DON_GIA_MAU}}', { size: 24, bold: true }),
    ], { spacing: { before: 20, after: 80 } }),
  ]

  const footer = [
    P(R('')),
    P([R('Bằng chữ: ', { size: 24, italics: true }), R('{{BANG_CHU}}', { size: 24, italics: true, bold: true })], { spacing: { before: 60 } }),
  ]
  // Khối chân trang chữ ký (điều kiện)
  const chanTrang = [
    P(R('{{#HIEN_CHAN_TRANG}}', { size: 2 })),
    P([R('{{TEN_CONG_TY}}, ', { size: 24 }), R('{{NGAY_LAP_BANG_KE}}', { size: 24 })], { align: AlignmentType.RIGHT, spacing: { before: 160 } }),
    twoColSign(),
    P(R('{{/HIEN_CHAN_TRANG}}', { size: 2 })),
  ]

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      // A4 ngang: truyền kích thước dọc (11906 x 16838), lib tự hoán -> 16838 x 11906
      properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 400, bottom: 400, left: 400, right: 400 } } },
      children: [
        logoImg(1000),
        txt('BẢNG KÊ THANH TOÁN PHÍ DỊCH VỤ BẢN CHỤP', { bold: true, size: 30, align: AlignmentType.CENTER, spacing: { before: 60, after: 120 } }),
        ...info,
        table,
        ...footer,
        ...chanTrang,
      ],
    }],
  })
}

// Bảng 2 cột ẩn viền để căn nhãn trái | phải trong khối info
function infoTwoCol(lLabel, lEn, lPh, rLabel, rEn, rPh) {
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }
  const c = (label, en, ph) => new TableCell({
    borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [P([R(label, { size: 24 }), en ? R(` /${en}`, { size: 22, italics: true }) : R(''), R(': ', { size: 24 }), R(`{{${ph}}}`, { size: 24, bold: true })])],
  })
  return new Table({
    columnWidths: [8600, 7300], width: { size: 15900, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [c(lLabel, lEn, lPh), c(rLabel, rEn, rPh)] })],
  })
}

function twoColSign() {
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }
  const c = (t) => new TableCell({ borders: noBorder, children: [txt(t, { bold: true, size: 24, align: AlignmentType.CENTER, spacing: { before: 80 } })] })
  return new Table({
    columnWidths: [7950, 7950], width: { size: 15900, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: noBorder,
    rows: [new TableRow({ children: [c('ĐẠI DIỆN KHÁCH HÀNG'), c('ĐẠI DIỆN CÔNG TY')] })],
  })
}

// =====================================================================
// MẪU B — ĐA MÁY (Hình 2): BẢNG KÊ THANH TOÁN TIỀN THUÊ MÁY
// A3 ngang, 10pt. Vòng lặp dòng máy {{#ds}}...{{/ds}} + dòng Cộng tổng.
// =====================================================================
function buildDaMay() {
  const colW = [400, 1100, 1400, 1300, 900, 900, 800, 900, 900, 800, 850, 750, 800, 700, 800, 700, 800, 800, 900, 950, 900, 1300, 1000, 1300]
  const totalW = colW.reduce((a, b) => a + b, 0)
  const HS = 18 // header size (9pt)
  const DS = 20 // data size (10pt)

  // Header row 1 (nhóm)
  const hr1 = new TableRow({ tableHeader: true, children: [
    H2('TT', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Mã máy', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Tên máy', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Giá thuê máy (chưa VAT)', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Đầu kỳ', '', { span: 3, size: HS }),
    H2('Cuối kỳ', '', { span: 3, size: HS }),
    H2('Số bản chụp sử dụng', '', { span: 2, size: HS }),
    H2('Số BC miễn phí', '', { span: 2, size: HS }),
    H2('Số BC tính phí', '', { span: 2, size: HS }),
    H2('Đơn giá', '', { span: 2, size: HS }),
    H2('Card reader', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Thành tiền bản chụp', '', { span: 2, size: HS }),
    H2('Thành tiền máy + bản chụp (chưa VAT)', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Thuế VAT {{VAT}}%', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
    H2('Tổng tiền thanh toán (gồm VAT)', '', { vMerge: VerticalMergeType.RESTART, size: HS }),
  ] })
  // Header row 2 (Đen trắng / Màu / Ngày)
  const dm = (t) => H2(t, '', { size: HS })
  const hr2 = new TableRow({ tableHeader: true, children: [
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

  // Dòng máy (loop). Cột đầu mở {{#ds}}, cột cuối đóng {{/ds}}.
  const dcell = (ph, o = {}) => CELL(txt(`{{${ph}}}`, { size: DS, align: o.align || AlignmentType.CENTER }))
  const firstCell = CELL(P([R('{{#ds}}', { size: 2 }), R('{{stt}}', { size: DS })], { align: AlignmentType.CENTER }))
  const lastCell = CELL(P([R('{{tong}}', { size: DS }), R('{{/ds}}', { size: 2 })], { align: AlignmentType.RIGHT }))
  const loopRow = new TableRow({ children: [
    firstCell,
    dcell('ma', { align: AlignmentType.LEFT }), dcell('ten', { align: AlignmentType.LEFT }), dcell('gia', { align: AlignmentType.RIGHT }),
    dcell('dk_ngay'), dcell('dk_den', { align: AlignmentType.RIGHT }), dcell('dk_mau', { align: AlignmentType.RIGHT }),
    dcell('ck_ngay'), dcell('ck_den', { align: AlignmentType.RIGHT }), dcell('ck_mau', { align: AlignmentType.RIGHT }),
    dcell('sd_den', { align: AlignmentType.RIGHT }), dcell('sd_mau', { align: AlignmentType.RIGHT }),
    dcell('mp_den', { align: AlignmentType.RIGHT }), dcell('mp_mau', { align: AlignmentType.RIGHT }),
    dcell('tp_den', { align: AlignmentType.RIGHT }), dcell('tp_mau', { align: AlignmentType.RIGHT }),
    dcell('dg_den', { align: AlignmentType.RIGHT }), dcell('dg_mau', { align: AlignmentType.RIGHT }),
    dcell('card', { align: AlignmentType.RIGHT }),
    dcell('tt_den', { align: AlignmentType.RIGHT }), dcell('tt_mau', { align: AlignmentType.RIGHT }),
    dcell('tt_may_bc', { align: AlignmentType.RIGHT }), dcell('vat_tien', { align: AlignmentType.RIGHT }),
    lastCell,
  ] })

  // Dòng Cộng tổng
  const sumLabel = CELL(txt('Cộng tổng bản chụp tháng {{THANG}}/{{NAM}}', { bold: true, size: DS, align: AlignmentType.CENTER }), { span: 3, fill: 'F2F2F2' })
  const st = (ph, o = {}) => CELL(txt(`{{${ph}}}`, { bold: true, size: DS, align: o.align || AlignmentType.RIGHT }), { fill: 'F2F2F2', span: o.span })
  const blank = (o = {}) => CELL(txt(''), { fill: 'F2F2F2', span: o.span })
  const sumRow = new TableRow({ children: [
    sumLabel,
    st('GIA_THUE_CO_BAN'),
    blank(), blank(), blank(), // đầu kỳ
    blank(), blank(), blank(), // cuối kỳ
    st('TONG_SD_DEN'), st('TONG_SD_MAU'),
    blank(), blank(), // miễn phí
    st('TONG_TP_DEN'), st('TONG_TP_MAU'),
    blank(), blank(), // đơn giá
    st('TONG_CARD'),
    st('TONG_TT_DEN'), st('TONG_TT_MAU'),
    st('TONG_MAY_BC'), st('TONG_VAT'), st('TONG_CONG'),
  ] })

  const table = new Table({
    columnWidths: colW, width: { size: totalW, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
    borders: ALL_BORDERS, rows: [hr1, hr2, sumRow, loopRow],
  })

  const info = [
    P([R('Tên Khách hàng: ', { size: 24 }), R('{{TEN_KH}}', { size: 24, bold: true })], { spacing: { before: 20, after: 20 } }),
    P([R('Địa chỉ: ', { size: 24 }), R('{{DIA_CHI}}', { size: 24, bold: true })], { spacing: { after: 20 } }),
    P([R('Địa chỉ đặt máy: ', { size: 24 }), R('{{DIA_CHI_MAY}}', { size: 24, bold: true }), R('          Kỳ tháng ', { size: 24 }), R('{{THANG}}', { size: 24, bold: true }), R(' năm ', { size: 24 }), R('{{NAM}}', { size: 24, bold: true })], { spacing: { after: 80 } }),
  ]
  const footer = [
    P([R('Bằng chữ: ', { size: 22, italics: true }), R('{{BANG_CHU}}', { size: 22, italics: true, bold: true })], { spacing: { before: 80 } }),
    P(R('{{#HIEN_CHAN_TRANG}}', { size: 2 })),
    P([R('{{TEN_CONG_TY}}, ', { size: 24 }), R('{{NGAY_LAP_BANG_KE}}', { size: 24 })], { align: AlignmentType.RIGHT, spacing: { before: 160 } }),
    twoColSign(),
    P(R('{{/HIEN_CHAN_TRANG}}', { size: 2 })),
  ]

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      // A3 ngang: truyền kích thước dọc A3 (16838 x 23811), lib tự hoán -> 23811 x 16838
      properties: { page: { size: { width: 16838, height: 23811, orientation: PageOrientation.LANDSCAPE }, margin: { top: 500, bottom: 500, left: 500, right: 500 } } },
      children: [
        logoImg(1000),
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
