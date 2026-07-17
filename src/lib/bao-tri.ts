// Lịch bảo trì theo tháng của từng máy + tạm dừng theo dõi.
// Quy ước: thang_bao_tri rỗng/NULL = bảo trì HẰNG THÁNG (mặc định, giữ hành vi cũ).

export const LOAI_HD_BAO_TRI = ['HĐBT', 'MF'] // chỉ 2 loại này mới theo dõi bảo trì

// '2,4,6,8,10,12' -> [2,4,6,8,10,12]. Chuỗi rỗng -> [] (nghĩa là hằng tháng).
export function parseThangBaoTri(s: string | null | undefined): number[] {
  if (!s) return []
  const out = new Set<number>()
  for (const p of String(s).split(',')) {
    const n = parseInt(p.trim(), 10)
    if (n >= 1 && n <= 12) out.add(n)
  }
  return Array.from(out).sort((a, b) => a - b)
}

// [4,2,2,13] -> '2,4' (dedupe, sắp xếp, bỏ giá trị ngoài 1..12). Chọn đủ 12 tháng -> '' (hằng tháng).
export function formatThangBaoTri(months: number[]): string {
  const list = parseThangBaoTri(months.join(','))
  if (list.length === 0 || list.length === 12) return ''
  return list.join(',')
}

// Tháng `month` (1..12) có nằm trong lịch bảo trì của máy không.
export function coBaoTriThang(thang_bao_tri: string | null | undefined, month: number): boolean {
  const list = parseThangBaoTri(thang_bao_tri)
  return list.length === 0 ? true : list.includes(month)
}

// Máy đã tạm dừng theo dõi tính đến tháng `thang_nam` ('YYYY-MM') chưa.
// So sánh chuỗi 'YYYY-MM' là đúng thứ tự thời gian nên không cần parse ngày.
export function dangTamDung(tam_dung_tu_thang: string | null | undefined, thang_nam: string): boolean {
  const t = (tam_dung_tu_thang || '').trim()
  if (!/^\d{4}-\d{2}$/.test(t)) return false
  return thang_nam >= t
}

type MayBaoTri = {
  ma_may?: string | null
  loai_hd?: string | null
  thang_bao_tri?: string | null
  tam_dung_tu_thang?: string | null
}

// Máy có bị đòi bảo trì trong tháng `thang_nam` ('YYYY-MM') không:
// đúng loại HĐ + tháng nằm trong lịch + chưa tạm dừng.
export function canBaoTriThang(may: MayBaoTri, thang_nam: string): boolean {
  if (!may.ma_may) return false
  if (!LOAI_HD_BAO_TRI.includes((may.loai_hd || '').trim())) return false
  if (dangTamDung(may.tam_dung_tu_thang, thang_nam)) return false
  const month = parseInt(thang_nam.split('-')[1] || '0', 10)
  return coBaoTriThang(may.thang_bao_tri, month)
}

// Mô tả lịch cho cột hiển thị: '' -> 'Hằng tháng'; '2,4,6' -> 'T2, T4, T6'
export function moTaLichBaoTri(thang_bao_tri: string | null | undefined): string {
  const list = parseThangBaoTri(thang_bao_tri)
  return list.length === 0 ? 'Hằng tháng' : list.map(m => `T${m}`).join(', ')
}

// ===== Đối chiếu cuối năm =====
export const CELL_DA_LAM = '✓'   // đã bảo trì tháng đó
export const CELL_THIEU = 'x'    // theo lịch mà chưa làm
export const CELL_NGUNG = 'N'    // đã tạm dừng theo dõi
// '' = tháng không nằm trong lịch -> không phải làm

// Dựng 1 dòng đối chiếu của 1 máy trong năm `year`.
// `doneMonths` = các tháng (1..12) máy THỰC SỰ có bản ghi bảo trì.
export function doiChieuNam(may: MayBaoTri, year: number, doneMonths: Set<number>) {
  const cells: string[] = []
  let theo_hd = 0, da_lam = 0, thieu = 0
  for (let m = 1; m <= 12; m++) {
    const thang_nam = `${year}-${String(m).padStart(2, '0')}`
    const done = doneMonths.has(m)
    const paused = dangTamDung(may.tam_dung_tu_thang, thang_nam)
    const scheduled = !paused && coBaoTriThang(may.thang_bao_tri, m)
    if (done) da_lam++
    if (scheduled) { theo_hd++; if (!done) thieu++ }
    // Đã làm thì luôn ghi ✓ (kể cả tháng ngoài lịch / sau khi tạm dừng) — báo cáo phải trung thực
    cells.push(done ? CELL_DA_LAM : paused ? CELL_NGUNG : scheduled ? CELL_THIEU : '')
  }
  return { cells, theo_hd, da_lam, thieu }
}

// 'YYYY-MM' -> 'MM/YYYY' để hiển thị
export function fmtThang(thang_nam: string | null | undefined): string {
  const t = (thang_nam || '').trim()
  if (!/^\d{4}-\d{2}$/.test(t)) return ''
  const [y, m] = t.split('-')
  return `${m}/${y}`
}
