// Đọc số tiền (VND) ra chữ tiếng Việt, kết thúc "đồng./."
export function docSoTien(amount: number): string {
  const number = Math.round(amount || 0)
  if (number <= 0) return 'Không đồng./.'
  const dg = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriple = (num: number, pad: boolean): string => {
    const tram = Math.floor(num / 100), chuc = Math.floor((num % 100) / 10), donvi = num % 10
    const w: string[] = []
    if (pad || tram > 0) w.push(dg[tram], 'trăm')
    if (chuc === 0) {
      if (donvi > 0) { if (pad || tram > 0) w.push('lẻ'); w.push(dg[donvi]) }
    } else if (chuc === 1) {
      w.push('mười'); if (donvi === 5) w.push('lăm'); else if (donvi > 0) w.push(dg[donvi])
    } else {
      w.push(dg[chuc], 'mươi'); if (donvi === 1) w.push('mốt'); else if (donvi === 5) w.push('lăm'); else if (donvi > 0) w.push(dg[donvi])
    }
    return w.join(' ')
  }
  const scale = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']
  const groups: number[] = []
  let n = number
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) } // groups[0] = hàng đơn vị
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    const pad = i < groups.length - 1
    parts.push(readTriple(groups[i], pad) + (scale[i] ? ' ' + scale[i] : ''))
  }
  let s = parts.join(' ').replace(/\s+/g, ' ').trim()
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return s + ' đồng./.'
}

const fmt = (x: number) => Math.round(x || 0).toLocaleString('vi-VN')

export type QuoteRow = { ten: string; dvt: string; sl: number; gia: number; vat: number; gc: string }
export type QuoteInput = {
  khach_hang: string
  dia_chi: string
  nam: string
  rows: QuoteRow[]
  markups: [number, number, number] // % tăng cho 3 báo giá cạnh tranh, VD [3,5,6]
}

// Tính 1 bảng theo % markup (0 = giá gốc). Giá cạnh tranh làm tròn đến nghìn.
function buildTable(rows: QuoteRow[], markupPct: number) {
  const f = 1 + markupPct / 100
  const items = rows.map((r, i) => {
    const gia = markupPct === 0 ? Math.round(r.gia) : Math.round(r.gia * f / 1000) * 1000
    const tt = gia * (Number(r.sl) || 0)
    return { stt: i + 1, ten: r.ten, dvt: r.dvt || 'Cái', sl: r.sl, gia: fmt(gia), tt: fmt(tt), gc: r.gc || '', _tt: tt, _vat: Number(r.vat) || 0 }
  })
  const cong = items.reduce((s, x) => s + x._tt, 0)
  const thue = Math.round(items.reduce((s, x) => s + x._tt * x._vat / 100, 0))
  const tong = cong + thue
  return { items: items.map(({ _tt, _vat, ...x }) => x), cong, thue, tong }
}

// Dựng dữ liệu điền template báo giá (4 bảng: gốc + 3 cạnh tranh)
export function buildQuoteData(input: QuoteInput) {
  const rows = (input.rows || []).filter(r => r.ten && (Number(r.sl) || 0) > 0)
  const p = buildTable(rows, 0)
  const a = buildTable(rows, input.markups[0])
  const b = buildTable(rows, input.markups[1])
  const c = buildTable(rows, input.markups[2])
  const vatPct = p.cong > 0 ? Math.round(p.thue / p.cong * 100) : 0

  return {
    YYYY: input.nam,
    KHACH_HANG: input.khach_hang || '',
    DIA_CHI: input.dia_chi || '',
    VAT_PCT: String(vatPct),
    BANG_CHU: docSoTien(p.tong),
    items: p.items, CONG: fmt(p.cong), THUE: fmt(p.thue), TONG: fmt(p.tong),
    items_a: a.items, CONG_A: fmt(a.cong), THUE_A: fmt(a.thue), TONG_A: fmt(a.tong),
    items_b: b.items, CONG_B: fmt(b.cong), THUE_B: fmt(b.thue), TONG_B: fmt(b.tong),
    items_c: c.items, CONG_C: fmt(c.cong), THUE_C: fmt(c.thue), TONG_C: fmt(c.tong),
  }
}
