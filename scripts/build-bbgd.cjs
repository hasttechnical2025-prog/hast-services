// Dựng template Biên bản giám định (BM26-KT.01) từ file tô vàng trên Desktop -> src/lib/report/bbgd-bm26.docx.
// Chỉ 5 trường động (tô vàng), KHÔNG loop, KHÔNG giá. Giữ nguyên letterhead/định dạng.
// Chạy: node scripts/build-bbgd.cjs
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/anonymous/Desktop/ST _BB Giam dinh.docx'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'report', 'bbgd-bm26.docx')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Thứ tự run tô vàng: Tên KH · Địa chỉ · Loại máy (hãng) · Mã máy · Model
const reps = ['{{TEN_KH}}', '{{DIA_CHI}}', '{{LOAI_MAY}}', '{{MA_MAY}}', '{{MODEL}}']

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

const zip = new PizZip(fs.readFileSync(SRC))
let xml = zip.file('word/document.xml').asText()
xml = replaceHighlights(xml, reps)
xml = xml.replace(/<w:highlight w:val="(?!none)[^"]*"\s*\/>/g, '')   // dọn highlight còn sót
zip.file('word/document.xml', xml)
const buf = zip.generate({ type: 'nodebuffer' })
fs.writeFileSync(OUT, buf)
console.log('✓ ghi bbgd-bm26.docx')

// Verify
const doc = new Docxtemplater(new PizZip(buf), { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
doc.render({ TEN_KH: 'KH TEST', DIA_CHI: 'Địa chỉ test', LOAI_MAY: 'Konica Minolta', MA_MAY: '36137', MODEL: 'bizhub 451i' })
const out = doc.getZip().file('word/document.xml').asText()
console.log('Verify: còn {{ = ' + (out.match(/\{\{/g) || []).length + '; có "KH TEST" = ' + out.includes('KH TEST'))
