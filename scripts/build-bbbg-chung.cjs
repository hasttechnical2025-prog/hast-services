// Dựng 2 template "Mẫu chung" (có giá / không giá) từ file tô vàng trên Desktop -> src/lib/report/.
// Thay run tô vàng bằng placeholder (theo thứ tự), bỏ highlight, GIỮ letterhead/định dạng.
// Bọc hàng vật tư bằng loop {{#ds}}/{{/ds}} (STT ở ô đầu, {{/ds}} ở ô cuối của hàng dữ liệu).
// Chạy: node scripts/build-bbbg-chung.cjs   (tự verify render bên dưới)
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/anonymous/Desktop/BBBG _Mau moi'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'report')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Thay text các run tô vàng theo mảng reps (đúng thứ tự), bỏ highlight.
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

// Bọc hàng dữ liệu (chứa {{ten}}) trong bảng vật tư bằng {{#ds}}...{{/ds}}.
function wrapLoop(xml, lastPayload) {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []
  const tbl = tbls.find(t => t.includes('{{ten}}'))
  if (!tbl) throw new Error('Không thấy bảng vật tư ({{ten}})')
  const rows = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []
  const di = rows.findIndex(r => r.includes('{{ten}}'))
  if (di < 0) throw new Error('Không thấy hàng dữ liệu')
  let row = rows[di]
  // {{#ds}} trước {{stt}}
  row = row.replace('{{stt}}', '{{#ds}}{{stt}}')
  // {{/ds}} ở ô CUỐI của hàng
  const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g)
  const last = cells[cells.length - 1]
  let newLast
  if (/<w:t[^>]*>[\s\S]*?<\/w:t>/.test(last)) {
    // Ô cuối có sẵn text (vd {{thanh_tien}}) -> nối payload vào <w:t> cuối cùng
    newLast = last.replace(/(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)(?![\s\S]*<w:t)/, (m, a, b, c) => a + b + lastPayload + c)
  } else {
    // Ô cuối rỗng (vd Ghi chú) -> chèn 1 run trước </w:p> cuối
    const run = '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">' + lastPayload + '</w:t></w:r>'
    newLast = last.replace(/<\/w:p>(?![\s\S]*<\/w:p>)/, run + '</w:p>')
  }
  const newRow = row.replace(last, newLast)
  const newTbl = tbl.replace(rows[di], newRow)
  return xml.replace(tbl, newTbl)
}

function build(srcFile, outFile, reps, lastPayload) {
  const zip = new PizZip(fs.readFileSync(path.join(SRC, srcFile)))
  let xml = zip.file('word/document.xml').asText()
  xml = replaceHighlights(xml, reps)
  xml = wrapLoop(xml, lastPayload)
  // Dọn mọi highlight còn sót (ở pPr/cell-mark) để không còn vệt vàng nào
  xml = xml.replace(/<w:highlight w:val="(?!none)[^"]*"\s*\/>/g, '')
  if (/w:highlight w:val="yellow"/.test(xml)) console.warn('  ⚠ còn highlight vàng (kiểm tra lại)')
  zip.file('word/document.xml', xml)
  const buf = zip.generate({ type: 'nodebuffer' })
  fs.writeFileSync(path.join(OUT, outFile), buf)
  console.log('  ✓ ghi ' + outFile)
  return buf
}

// ===== MẪU CÓ GIÁ =====
// Thứ tự run tô vàng: TEN_KH(2 run) · DIA_CHI(2 run) · stt·ten·dvt·sl·vat·don_gia·thanh_tien · TONG_CHUA_THUE·THUE·TONG_CONG
console.log('Mẫu CÓ giá:')
const bufPrice = build(
  'Bien ban Ban giao _Mau chung.docx',
  'bbbg-chung-price.docx',
  ['{{TEN_KH}}', '', '{{DIA_CHI}}', '', '{{stt}}', '{{ten}}', '{{dvt}}', '{{sl}}', '{{vat}}', '{{don_gia}}', '{{thanh_tien}}', '{{TONG_CHUA_THUE}}', '{{THUE}}', '{{TONG_CONG}}'],
  '{{/ds}}'
)

// ===== MẪU KHÔNG GIÁ =====
// Thứ tự run tô vàng: TEN_KH(1 run) · DIA_CHI(2 run) · stt·ten·dvt·sl  (Ghi chú rỗng)
console.log('Mẫu KHÔNG giá:')
const bufNo = build(
  'Bien ban Ban giao _Mau chung _noprice.docx',
  'bbbg-chung-noprice.docx',
  ['{{TEN_KH}}', '{{DIA_CHI}}', '', '{{stt}}', '{{ten}}', '{{dvt}}', '{{sl}}'],
  '{{ghi_chu}}{{/ds}}'
)

// ===== VERIFY =====
function verify(buf, data, label) {
  const doc = new Docxtemplater(new PizZip(buf), { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  const out = doc.getZip().file('word/document.xml').asText()
  const left = (out.match(/\{\{/g) || []).length
  const rows = (out.match(/TN714/g) || []).length
  console.log(`Verify ${label}: còn {{ = ${left}; số dòng TN714 = ${rows} ${left === 0 ? '✓' : '✗ CÒN PLACEHOLDER'}`)
}
verify(bufPrice, {
  TEN_KH: 'CỤC TEST', DIA_CHI: 'Địa chỉ test',
  ds: [
    { stt: '1', ten: 'TN714 A', dvt: 'Cái', sl: '2', vat: '8', don_gia: '2.865.741', thanh_tien: '5.731.481' },
    { stt: '2', ten: 'TN714 B', dvt: 'Cái', sl: '1', vat: '8', don_gia: '1.000.000', thanh_tien: '1.000.000' },
  ],
  TONG_CHUA_THUE: '6.731.481', THUE: '538.518', TONG_CONG: '7.269.999',
}, 'CÓ giá')
verify(bufNo, {
  TEN_KH: 'CỤC TEST', DIA_CHI: 'Địa chỉ test',
  ds: [
    { stt: '1', ten: 'TN714 A', dvt: 'Cái', sl: '2', ghi_chu: '' },
    { stt: '2', ten: 'TN714 B', dvt: 'Cái', sl: '1', ghi_chu: '' },
  ],
}, 'KHÔNG giá')
