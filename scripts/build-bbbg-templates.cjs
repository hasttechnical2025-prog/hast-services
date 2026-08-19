// Dựng template docxtemplater từ 3 file mẫu (Desktop) -> src/lib/report/.
// Thay các run TÔ VÀNG bằng placeholder (theo thứ tự), bỏ highlight, GIỮ NGUYÊN mọi định dạng/ảnh.
// NHNN: thêm loop {{#ds}}/{{/ds}} vào hàng vật tư (STT + Ghi chú) và xoá 9 hàng trống.
// Chạy: node scripts/build-bbbg-templates.cjs   (rồi tự verify render bên dưới)
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/anonymous/Desktop/Mau BBBG'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'report')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Thay text của các run tô vàng theo mảng `reps` (đúng thứ tự xuất hiện), đồng thời bỏ highlight.
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

// NHNN: biến hàng vật tư thành hàng LẶP + xoá các hàng trống phía sau.
function nhnnLoopRows(xml) {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []
  const tbl = tbls.find(t => t.includes('{{ten}}'))
  if (!tbl) throw new Error('NHNN: không thấy bảng vật tư ({{ten}})')
  const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []
  const dataIdx = rows.findIndex(r => r.includes('{{ten}}'))
  if (dataIdx < 0) throw new Error('NHNN: không thấy hàng dữ liệu')
  let dataRow = rows[dataIdx]
  // STT: <w:t>1</w:t> đầu tiên trong hàng -> {{#ds}}{{stt}}
  dataRow = dataRow.replace(/<w:t>1<\/w:t>/, '<w:t>{{#ds}}{{stt}}</w:t>')
  // Ghi chú (ô cuối, rỗng): chèn run {{ghi_chu}}{{/ds}} trước </w:p> của ô cuối
  const cells = dataRow.match(/<w:tc>[\s\S]*?<\/w:tc>/g)
  const lastCell = cells[cells.length - 1]
  const runIns = '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>{{ghi_chu}}{{/ds}}</w:t></w:r>'
  const lastCell2 = lastCell.replace(/<\/w:p>\s*<\/w:tc>$/, runIns + '</w:p></w:tc>')
  const dataRow2 = dataRow.replace(lastCell, lastCell2)
  // Giữ header (0..dataIdx) + hàng dữ liệu; BỎ mọi hàng sau dataIdx
  const keptRows = rows.slice(0, dataIdx).concat([dataRow2])
  const headerPrefix = tbl.slice(0, tbl.indexOf(rows[0]))
  const newTbl = headerPrefix + keptRows.join('') + '</w:tbl>'
  return xml.replace(tbl, newTbl)
}

function build(srcName, outName, reps, extra) {
  const zip = new PizZip(fs.readFileSync(path.join(SRC, srcName)))
  let xml = zip.file('word/document.xml').asText()
  xml = replaceHighlights(xml, reps)
  if (extra) xml = extra(xml)
  zip.file('word/document.xml', xml)
  const buf = zip.generate({ type: 'nodebuffer' })
  fs.writeFileSync(path.join(OUT, outName), buf)
  console.log('  ->', outName, '(' + buf.length + ' bytes)')
}

console.log('Dựng template:')
build('Bien ban Ban giao _Cuc Quan ly thi hanh an.docx', 'bbbg-cuc-tha.docx',
  ['{{#ds}}{{stt}}', '{{ten}}', '{{dvt}}', '{{sl}}{{/ds}}', '{{VI_TRI}}'])
build('Bien ban Ban giao _Ngan hang Nha nuoc.docx', 'bbbg-nhnn.docx',
  ['{{VI_TRI}}', '{{ten}}', '', '{{dvt}}', '{{sl}}', '{{tinh_trang}}'], nhnnLoopRows)
build('Đe nghi Thanh toan _Mau chung.docx', 'dntt.docx',
  ['{{SO_DNTT}}', '{{NGAY}}', '{{THANG}}', '{{NAM}}', '{{TEN_KH}}', '', '{{NGAY_HD}}', '{{SO_HD}}', '{{TIEN}}', '{{GHI_CHU}}', '{{CONG}}', '{{TONG}}', '{{BANG_CHU}}'])

// ---- VERIFY: render thử với dữ liệu mẫu, in lại text để chắc placeholder chạy ----
function extractText(buf) {
  const xml = new PizZip(buf).file('word/document.xml').asText()
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
function render(file, data) {
  const zip = new PizZip(fs.readFileSync(path.join(OUT, file)))
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer' })
}
const dsVT = [
  { stt: '1', ten: 'Mực in TN628', dvt: 'Cái', sl: '2', tinh_trang: 'Hàng mới 100%', ghi_chu: '' },
  { stt: '2', ten: 'Trống DR017', dvt: 'Cái', sl: '1', tinh_trang: 'Hàng mới 100%', ghi_chu: '' },
]
console.log('\nVERIFY render:')
for (const [f, data] of [
  ['bbbg-cuc-tha.docx', { ds: dsVT, VI_TRI: 'Phòng 403 - 139 Nguyễn Thái Học' }],
  ['bbbg-nhnn.docx', { ds: dsVT, VI_TRI: 'P1203. Thanh tra NHNN' }],
  ['dntt.docx', { SO_DNTT: '26-146', NGAY: '15', THANG: '08', NAM: '2026', TEN_KH: 'CÔNG TY ABC', NGAY_HD: '15/08/2026', SO_HD: '873', TIEN: '2.376.000', GHI_CHU: '', CONG: '2.376.000', TONG: '2.376.000', BANG_CHU: 'Hai triệu...' }],
]) {
  try {
    const out = render(f, data)
    const txt = extractText(out).filter(l => /Mực in TN628|Trống DR017|Phòng 403|P1203|26-146|873|CÔNG TY ABC|\{\{/.test(l))
    console.log('  [' + f + '] OK. Mẫu dòng:', JSON.stringify(txt.slice(0, 6)))
    if (extractText(out).some(l => l.includes('{{') || l.includes('}}'))) console.log('    ⚠ CÒN placeholder chưa thay!')
  } catch (e) { console.log('  [' + f + '] LỖI render:', e.message) }
}
