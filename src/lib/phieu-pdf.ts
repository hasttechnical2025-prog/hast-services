// Bóc tách "Phiếu công tác" (mẫu BM26-KT.02, xuất từ app quản lý bên ngoài) thành dữ liệu
// có cấu trúc để tiền-điền form Giao việc. Mẫu CỐ ĐỊNH 1 dạng -> parser bám layout (nhãn +
// giá trị lệch nhau ~1px về y nên gom dòng theo cụm y có dung sai). KHÔNG dùng AI/OCR: phiếu
// là PDF text-based, bóc tách xác định (deterministic).
//
// Chạy ở Node runtime (route). Không cần canvas (chỉ đọc text, không render trang).

export interface ParsedVatTu {
  stt: number
  ma_hang: string
  ten_hang: string
  so_luong: number
  don_gia: number
  thanh_tien: number
}

export interface ParsedPhieu {
  so_phieu: string
  ma_may: string
  model: string
  khach_ten: string
  dia_chi: string
  mst: string
  loai_goc: string            // loại công tác gốc trên phiếu (VD "KT_Lẫn (vật tư + trống mực)")
  loai_mapped: string | null  // ánh xạ sang loại việc HAST ("Thay vật tư" | "Giao mực" | null)
  vat_tu: ParsedVatTu[]
  cong_tien_hang: number      // "Cộng tiền hàng" trên phiếu (đối chiếu)
}

// Ánh xạ loại công tác trên phiếu -> loại việc trong HAST.
// KT_Lẫn (vật tư + trống mực)  -> Thay vật tư   (có "vật tư")
// GN_Trống + mực               -> Giao mực      (chỉ trống/mực)
export function mapLoaiCongTac(raw: string): string | null {
  const s = (raw || '').toLowerCase()
  if (/v[aậ]t\s*t[uư]/.test(s)) return 'Thay vật tư'
  if (/tr[oố]ng|m[uự]c/.test(s)) return 'Giao mực'
  return null
}

const money = (s: string) => Number(String(s).replace(/[.\s]/g, '')) || 0

// Gom text-items thành các dòng theo tọa độ y (dung sai 4px), mỗi dòng sắp theo x tăng dần.
function itemsToLines(items: { x: number; y: number; str: string }[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; parts: { x: number; str: string }[] }[] = []
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= 4)
    if (line) line.parts.push({ x: it.x, str: it.str })
    else lines.push({ y: it.y, parts: [{ x: it.x, str: it.str }] })
  }
  return lines.map(l =>
    l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim()
  )
}

// Tách văn bản PDF -> danh sách dòng đã dựng lại. Xử lý mọi trang (phòng khi bảng vật tư
// tràn sang trang 2), gộp chung.
export async function extractPdfLines(buffer: Buffer | Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
  const allLines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = (tc.items as any[])
      .filter(it => typeof it.str === 'string' && it.str.trim())
      .map(it => ({ x: it.transform[4], y: it.transform[5], str: it.str }))
    allLines.push(...itemsToLines(items))
  }
  return allLines
}

// Làm sạch tên hàng: bỏ đuôi "(<mã>)" trùng chính mã hàng (VD "Khối sấy (AA2JR75300)" -> "Khối sấy").
function cleanTenHang(ten: string, ma: string): string {
  const esc = ma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return ten.replace(new RegExp(`\\s*\\(\\s*${esc}\\s*\\)\\s*$`), '').trim() || ten.trim()
}

export function parsePhieuLines(lines: string[]): ParsedPhieu {
  const text = lines.join('\n')
  const grab = (re: RegExp) => (text.match(re)?.[1] || '').trim()

  const so_phieu = grab(/Số phiếu:\s*(\S+)/)
  const ma_may = grab(/Mã máy:\s*(\S+)/)
  const model = grab(/Model:\s*(.+?)\s*(?:SN:|$)/m)
  const khach_ten = grab(/Khách hàng:\s*(.+)/)
  const mst = grab(/MST:\s*(\S+)/)
  let dia_chi = grab(/Địa chỉ:\s*(.+?)\s*(?:MST:|$)/)
  dia_chi = dia_chi.replace(/\*+\s*$/, '').trim() // bỏ dấu "*" cuối địa chỉ
  const loai_goc = grab(/Loại công tác:\s*(.+)/)

  // Dòng vật tư: "STT MãHàng Tên... SốLg ĐơnGiá ThànhTiền" (đơn giá & thành tiền có dấu chấm ngăn nghìn).
  const rowRe = /^(\d+)\s+([A-Z0-9]{6,})\s+(.+?)\s+(\d+)\s+([\d.]+)\s+([\d.]+)$/
  const vat_tu: ParsedVatTu[] = []
  for (const ln of lines) {
    const m = ln.match(rowRe)
    if (!m) continue
    const ma = m[2]
    vat_tu.push({
      stt: Number(m[1]),
      ma_hang: ma,
      ten_hang: cleanTenHang(m[3], ma),
      so_luong: Number(m[4]) || 1,
      don_gia: money(m[5]),
      thanh_tien: money(m[6]),
    })
  }

  const cong_tien_hang = money(grab(/Cộng tiền hàng\s*([\d.]+)/) || '0')

  return {
    so_phieu,
    ma_may,
    model,
    khach_ten,
    dia_chi,
    mst,
    loai_goc,
    loai_mapped: mapLoaiCongTac(loai_goc),
    vat_tu,
    cong_tien_hang,
  }
}

export async function parsePhieuPdf(buffer: Buffer | Uint8Array): Promise<ParsedPhieu> {
  const lines = await extractPdfLines(buffer)
  return parsePhieuLines(lines)
}
