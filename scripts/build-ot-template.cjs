// Dựng template docxtemplater cho "Phiếu đăng ký làm thêm giờ" từ mẫu Desktop của kthc.
// Thay các run TÔ VÀNG bằng placeholder (đúng thứ tự), bỏ highlight, GIỮ NGUYÊN định dạng/letterhead.
// Biến hàng dữ liệu mẫu thành hàng LẶP {{#ds}}..{{/ds}} (mở ở ô đầu, đóng ở ô cuối) + xoá các hàng trống.
// Chạy: node scripts/build-ot-template.cjs
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/anonymous/Desktop/Phieu dang ky lam them gio.docx'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'report', 'phieu-dang-ky-ot.docx')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Thay text run tô vàng theo mảng reps (đúng thứ tự), bỏ highlight.
function replaceHighlights(xml, reps) {
  let i = 0
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => {
    if (!/<w:highlight w:val="(?!none)[^"]*"\s*\/>/.test(run)) return run
    const rep = i < reps.length ? reps[i] : ''
    i++
    let r = run.replace(/<w:highlight w:val="[^"]*"\s*\/>/g, '')
    r = r.replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/, `$1${esc(rep)}$2`)
    return r
  })
}

// Hàng dữ liệu (chứa {{NGAY}}) -> hàng LẶP: đóng {{/ds}} ở Ô CUỐI (cột "Ngày Lễ/Tết", trống);
// mở {{#ds}} đã đặt sẵn ở ô đầu qua reps. Xoá mọi hàng mẫu phía sau.
function loopRows(xml) {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []
  const tbl = tbls.find(t => t.includes('{{NGAY}}'))
  if (!tbl) throw new Error('OT: không thấy bảng dữ liệu ({{NGAY}})')
  const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []
  const dataIdx = rows.findIndex(r => r.includes('{{NGAY}}'))
  if (dataIdx < 0) throw new Error('OT: không thấy hàng dữ liệu')
  let dataRow = rows[dataIdx]
  // Chèn {{/ds}} vào Ô CUỐI (đóng vòng lặp bao trọn <w:tr>).
  const cells = dataRow.match(/<w:tc>[\s\S]*?<\/w:tc>/g)
  const lastCell = cells[cells.length - 1]
  const runIns = '<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>{{/ds}}</w:t></w:r>'
  // Ô cuối trống: đoạn văn có thể TỰ ĐÓNG (<w:p .../>) hoặc có </w:p>. Xử lý cả hai.
  let lastCell2
  if (/<w:p\b[^>]*\/>\s*<\/w:tc>$/.test(lastCell)) {
    lastCell2 = lastCell.replace(/(<w:p\b[^>]*)\/>(\s*<\/w:tc>)$/, `$1>${runIns}</w:p>$2`)
  } else {
    lastCell2 = lastCell.replace(/<\/w:p>(\s*)<\/w:tc>$/, runIns + '</w:p>$1</w:tc>')
  }
  if (lastCell2 === lastCell) throw new Error('OT: không chèn được {{/ds}} vào ô cuối')
  const dataRow2 = dataRow.replace(lastCell, lastCell2)
  // Giữ header (0..dataIdx-1) + hàng dữ liệu; BỎ mọi hàng mẫu trống sau đó.
  const keptRows = rows.slice(0, dataIdx).concat([dataRow2])
  const headerPrefix = tbl.slice(0, tbl.indexOf(rows[0]))
  const newTbl = headerPrefix + keptRows.join('') + '</w:tbl>'
  return xml.replace(tbl, newTbl)
}

if (!fs.existsSync(SRC)) { console.error('Không thấy nguồn:', SRC); process.exit(1) }
const zip = new PizZip(fs.readFileSync(SRC))
let xml = zip.file('word/document.xml').asText()
// reps THEO THỨ TỰ run tô vàng: THANG, NAM, HOTEN (đầu phiếu) rồi hàng dữ liệu mẫu.
xml = replaceHighlights(xml, [
  '{{THANG}}', '{{NAM}}', '{{HOTEN}}',
  '{{#ds}}{{NGAY}}', '{{THU}}', '{{TGIAN}}', '', '',   // 3 run thời gian -> gộp 1 field TGIAN
  '{{DIADIEM}}', '{{DAUVIEC}}', '{{KETQUA}}',
])
xml = loopRows(xml)
// Bỏ mũi tên Wingdings (char F0E0) user vẽ sau {{TGIAN}} trong ô "Thời gian dự kiến".
xml = xml.replace(/<w:sym w:font="Wingdings" w:char="F0E0"\/>/g, '')
zip.file('word/document.xml', xml)
fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('✓ phieu-dang-ky-ot.docx (' + fs.statSync(OUT).size + ' bytes)')

// ---- VERIFY: render thử, in text để chắc placeholder + loop chạy ----
function extractText(buf) {
  const x = new PizZip(buf).file('word/document.xml').asText()
  return x.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
const doc = new Docxtemplater(new PizZip(fs.readFileSync(OUT)), { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
doc.render({
  THANG: '10', NAM: '2026', HOTEN: 'Phạm Hoàng Hải Sơn',
  ds: [
    { NGAY: '03/10/2026', THU: '7', TGIAN: '08:00 - 21:00', DIADIEM: 'VP Trung ương Đảng - 1A Hùng Vương', DAUVIEC: 'Trực Hội nghị', KETQUA: 'Hoàn thành' },
    { NGAY: '05/10/2026', THU: '2', TGIAN: '17:30 - 20:00', DIADIEM: 'Kho HSTC', DAUVIEC: 'Sửa máy gấp', KETQUA: 'Hoàn thành' },
  ],
})
const out = doc.getZip().generate({ type: 'nodebuffer' })
const txt = extractText(out)
console.log('VERIFY:', JSON.stringify(txt.filter(l => /Sơn|03\/10|05\/10|Hội nghị|Kho HSTC|\{\{/.test(l)).slice(0, 10)))
if (txt.some(l => l.includes('{{') || l.includes('}}'))) console.log('  ⚠ CÒN placeholder chưa thay!')
else console.log('  OK — không còn placeholder.')
