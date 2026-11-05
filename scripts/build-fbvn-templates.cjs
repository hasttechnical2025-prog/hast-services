// Dựng template docxtemplater cho module Bảo hành FBVN từ 2 file mẫu (Desktop) -> src/lib/report/.
// - Thay các run TÔ VÀNG bằng placeholder (đúng thứ tự), bỏ highlight, GIỮ NGUYÊN định dạng.
// - Form A: checkbox là ẢNH (<w:drawing>) -> đổi thành run ký tự {{cb_*}} (render ☒/☐). Bảng "Attached"
//   có 6 ô, bảng "Judgment (by CE)" có 4 ô; khối FBVN JUDGEMENT (hãng điền) GIỮ NGUYÊN.
// Chạy: node scripts/build-fbvn-templates.cjs
const PizZip = require('pizzip')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/anonymous/Desktop'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'report')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Thay <w:t> của mỗi run tô vàng theo mảng reps (đúng thứ tự), bỏ highlight.
function replaceHighlights(xml, reps) {
  let i = 0
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => {
    if (!/<w:highlight w:val="(?!none)[^"]*"\s*\/>/.test(run)) return run
    const rep = i < reps.length ? reps[i] : ''
    i++
    let r = run.replace(/<w:highlight w:val="[^"]*"\s*\/>/g, '')
    r = r.replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/, `$1${esc(rep)}$2`)
    // Run tô vàng không có <w:t> (vd chỉ space) -> bỏ qua text, vẫn gỡ highlight
    return r
  })
}

// Trong 1 bảng (chứa anchor), đổi N <w:drawing>...</w:drawing> đầu tiên thành run chứa placeholder {{keys[k]}}.
// Dùng rPr cỡ chữ của ô để glyph ☒/☐ vừa. Ném lỗi nếu số ô không khớp (tránh map lệch).
function drawingsToCheckbox(xml, anchor, keys) {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []
  const tbl = tbls.find(t => t.replace(/<[^>]*>/g, '').includes(anchor))
  if (!tbl) throw new Error(`Không thấy bảng chứa "${anchor}"`)
  const n = (tbl.match(/<w:drawing\b/g) || []).length
  if (n !== keys.length) throw new Error(`Bảng "${anchor}": ${n} ô vẽ, kỳ vọng ${keys.length}`)
  let k = 0
  const newTbl = tbl.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => {
    if (!/<w:drawing\b/.test(run)) return run
    const key = keys[k]; k++
    // Giữ rPr nếu có; thêm font symbol để chắc chắn có glyph ☒/☐.
    const rpr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]
      .replace(/<w:rFonts[^>]*\/>/, '<w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/>')
    const rprOut = rpr.includes('w:rFonts')
      ? rpr
      : rpr.replace('<w:rPr>', '<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/>') || '<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/></w:rPr>'
    return `<w:r>${rprOut}<w:t xml:space="preserve">{{${key}}}</w:t></w:r>`
  })
  return xml.replace(tbl, newTbl)
}

// Gỡ sạch MỌI highlight còn sót (kể cả tô vàng dính ở dấu kết đoạn pPr mà replaceHighlights
// — vốn chỉ quét cấp run — không với tới). Chạy sau cùng để template không còn nền vàng.
function stripHighlights(xml) {
  return xml.replace(/<w:highlight w:val="[^"]*"\s*\/>/g, '')
}

// ── Form A (mẫu mới "FBVN CLAIM FORM.docx") ──
// 17 ô tô vàng theo ĐÚNG thứ tự xuất hiện trong file. Checkbox để TĨNH trong mẫu (không map).
const FORMA_REPS = [
  '{{SO_FORMA}}',                           // 1  Số (cả cụm, vd HST-26.001)
  '{{NGAY}}',                               // 2  Date (ngày lập claim)
  '{{MODEL}}',                              // 3  M/C Model
  '{{SERIAL}}',                             // 4  Serial
  '{{CE}}',                                 // 5  Name (CE)
  '{{FOB_D}}', '{{FOB_M}}', '{{FOB_Y}}',    // 6-8   FOB D/M/Y
  '{{DEF_D}}', '{{DEF_M}}', '{{DEF_Y}}',    // 9-11  Defect D/M/Y
  '{{TEN_CLAIM}}', '{{MA}}', '{{DVT}}',     // 12-14 Tên/Mã/ĐVT
  '{{CONTENTS}}',                           // 15 Contents
  '{{CAUSE}}',                              // 16 Possible Cause
  '{{CE}}',                                 // 17 Prepared by CE
]

// ── BB Bàn giao (mẫu mới "BB Ban giao.docx") — 14 ô tô vàng, thêm Mã hàng ──
const BB_REPS = [
  '{{SO_BB}}',                                                   // 1  Số (cả cụm, vd HST-2026.021)
  '{{KHACH}}', '{{DIACHI}}',                                     // 2-3  Khách / Địa chỉ
  '{{MODEL}}', '{{SERIAL}}', '{{COUNTER}}',                      // 4-6  Model / Serial / Số đếm
  '{{HANGHOA}}', '{{MA}}',                                       // 7-8  Tên hàng / Mã hàng
  '{{TINHTRANG}}', '{{NGUYENNHAN}}', '{{HUONG}}',               // 9-11 Tình trạng / Nguyên nhân / Hướng
  '{{NGAY_D}}', '{{NGAY_M}}', '{{NGAY_Y}}',                      // 12-14 Ngày lập D/M/Y
]

function build(srcName, outName, apply) {
  const srcPath = path.join(SRC, srcName)
  if (!fs.existsSync(srcPath)) { console.log('  (bỏ qua, không thấy nguồn):', srcName); return }
  const zip = new PizZip(fs.readFileSync(srcPath))
  let xml = zip.file('word/document.xml').asText()
  xml = apply(xml)
  zip.file('word/document.xml', xml)
  const buf = zip.generate({ type: 'nodebuffer' })
  fs.writeFileSync(path.join(OUT, outName), buf)
  console.log('  ->', outName, '(' + buf.length + ' bytes)')
}

console.log('Dựng template FBVN:')
build('FBVN CLAIM FORM.docx', 'fbvn-form-a.docx', xml => stripHighlights(replaceHighlights(xml, FORMA_REPS)))
build('BB Ban giao.docx', 'fbvn-bb.docx', xml => stripHighlights(replaceHighlights(xml, BB_REPS)))
console.log('Xong.')
