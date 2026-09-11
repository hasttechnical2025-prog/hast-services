"use client"

// SỔ THEO DÕI MÁY — in 2 trang A4 NGANG cho 1 máy (điểm máy loai_hd ∈ {HĐBT, MF}).
// Trang 1: logo + QR (mã máy) + thông tin máy/HĐ. Trang 2: 12 ô để KTV ghi tay hàng tháng.
// QR mã hóa `ma_may` (khớp luồng quét /admin/scan). Ảnh thương hiệu đặt ở /public/sotheodoi/.
// Mốc nhập tay lúc in (hộp thoại): Người liên hệ, Số điện thoại, Thời hạn HĐ (từ/đến), Số serial.

import { useState } from "react"
import QRCodeLib from "qrcode"
import { Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DateField from "@/components/DateField"

export type MayInfo = {
  ma_may?: string | null
  model?: string | null
  loai_hd?: string | null
  serial?: string | null
  ngay_het_han_hdbt?: string | null
  ten_khach_hang?: string | null
  dia_chi?: string | null
  vi_tri_dat_may?: string | null
  soct_khach_cum?: { ten_khach_hang?: string | null; dia_chi?: string | null } | null
}

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const todayVN = () => { const d = new Date(Date.now() + 7 * 3600 * 1000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
const dmy = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

// Ô checkbox in: vuông, tick khi checked.
const box = (label: string, checked = false) =>
  `<span class="cb"><span class="bx">${checked ? '✔' : ''}</span>${esc(label)}</span>`

type ManFields = { nguoiLienHe: string; soDienThoai: string; hdTu: string; hdDen: string; soSerial: string; hinhThuc: string }

// Dựng 2 trang (trang 1 + trang 2) cho MỘT máy — KHÔNG kèm <head>/<style> (để wrapDoc bọc chung).
function pagesFor(may: MayInfo, man: ManFields, qr: string): string {
  const khName = (may.ten_khach_hang || may.soct_khach_cum?.ten_khach_hang || '').toUpperCase()
  const diaChi = may.dia_chi || ''
  const maMay = may.ma_may || ''
  const loaiMay = may.model || ''
  const isMF = String(man.hinhThuc || '').trim().toUpperCase() === 'MF'
  const thoiHan = (man.hdTu || man.hdDen) ? `Từ&nbsp; <b>${esc(dmy(man.hdTu))}</b> &nbsp;đến&nbsp; <b>${esc(dmy(man.hdDen))}</b>` : ''

  // 12 ô trang 2 (4 cột × 3 hàng)
  const cell = () => `
    <div class="cell">
      <div class="cell-date"><i>Ngày ..... tháng ..... năm 20.....</i></div>
      <div class="ln f">KTV: <span class="dot"></span></div>
      <div class="ln f">Số đếm: <span class="dot"></span></div>
      <div class="ln">Công việc: ${box('Bảo trì')} ${box('Lắp máy')}</div>
      <div class="ln">T.trạng máy: ${box('Tốt')} ${box('TBình')} ${box('Kém')}</div>
      <div class="ln f">Ghi chú: <span class="dot"></span></div>
      <div class="ghi2"></div>
      <div class="sign"><span>KHÁCH HÀNG</span><span>KS NỘI BỘ</span></div>
    </div>`
  const cells = Array.from({ length: 12 }).map(cell).join('')

  const inst = [
    '1. Kiểm tra các chức năng của máy',
    '2. Kiểm tra các bộ phận trên máy',
    '3. Kiểm tra thông số kỹ thuật theo quy định của NSX',
    'Kiểm tra kết nối của máy tới mạng máy tính (nếu có)',
    '4. Hiệu chỉnh phần mềm trên máy cho phù hợp với yêu cầu sử dụng của Khách hàng',
    '5. Cập nhật các thông số của máy vào Sổ theo dõi máy',
    '6. Sao chụp/ in ấn kiểm tra',
    '7. Đề nghị Khách hàng kiểm tra lại máy và ký xác nhận',
  ].map(t => `<div>${esc(t)}</div>`).join('')

  return `
<div class="page p1">
  <div class="p1-left">
    <img class="logo-big" src="/sotheodoi/logo-slogan.png" alt="logo" onerror="this.style.display='none'">
    <div class="mays"><img src="/sotheodoi/mays.png" alt="" onerror="this.style.display='none'"></div>
    <div class="inst">${inst}</div>
  </div>

  <div class="p1-right">
    <img class="letterhead" src="/sotheodoi/letterhead.png" alt="" onerror="this.style.display='none'">
    <div class="card">

    <div class="r-title-row">
      <div class="r-phong">PHÒNG KỸ THUẬT</div>
      <img class="qr" src="${qr}" alt="QR mã máy">
    </div>
    <div class="r-title">SỔ THEO DÕI MÁY</div>

    <div class="info">
      <div class="kh-row"><span class="lbl">Khách hàng:</span><b class="kh">${esc(khName)}</b></div>
      <div><span class="lbl">Địa chỉ:</span> &nbsp;${esc(diaChi)}</div>
      <div><span class="lbl">Vị trí đặt máy:</span></div>
      <div><span class="lbl">Số điện thoại:</span> &nbsp;${esc(man.soDienThoai)}</div>
      <div><span class="lbl">Người liên hệ:</span> &nbsp;${esc(man.nguoiLienHe)}</div>
    </div>

    <div class="two">
      <div class="b"><div class="h">LOẠI MÁY</div><div class="v">${esc(loaiMay)}</div></div>
      <div class="b"><div class="h">MÃ MÁY</div><div class="v">${esc(maMay)}</div></div>
    </div>

    <div class="row-b"><span class="lbl">Số serial:</span> &nbsp;${esc(man.soSerial)}</div>
    <div class="row-b"><span class="lbl">Hình thức hợp đồng:</span> &nbsp;&nbsp; ${box('HĐBT', !isMF)} &nbsp;&nbsp; ${box('MF', isMF)}</div>
    <div class="row-b"><span class="lbl">Thời hạn hợp đồng:</span> &nbsp;${thoiHan}</div>

    <div class="print-date"><span class="lbl">Ngày in sổ:</span> &nbsp;${todayVN()}</div>
    </div>
  </div>
</div>

<div class="page">
  <div class="p2-head">
    <img class="p2-logo" src="/sotheodoi/logo.png" alt="" onerror="this.style.display='none'">
    <div class="mm">Mã máy: <b>${esc(maMay)}</b></div>
  </div>
  <div class="grid">${cells}</div>
</div>`
}

const DOC_STYLE = `<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: #111; }
  .page { width: 297mm; height: 210mm; padding: 8mm 10mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .brand-blue { color: #1a3a8f; }

  /* ---- TRANG 1: 2 nửa A5 BẰNG NHAU (gập đôi khít gáy) ---- */
  .page.p1 { padding: 0; }
  .p1 { display: flex; height: 210mm; }
  .p1-left, .p1-right { width: 148.5mm; padding: 9mm 7mm; }
  .p1-left { display: flex; flex-direction: column; align-items: center; }
  .logo-big { width: 92%; max-height: 42mm; object-fit: contain; }
  .mays { display: flex; align-items: center; justify-content: center; margin: 6mm 0; width: 100%; }
  .mays img { max-height: 64mm; max-width: 100%; object-fit: contain; }
  .inst { margin-top: auto; border: 1.5px solid #111; border-radius: 8px; padding: 4mm 5mm; width: 100%; font-size: 11pt; line-height: 1.55; }
  .inst div { margin: 0.4mm 0; }

  .p1-right { display: flex; flex-direction: column; }
  .letterhead { width: 100%; max-height: 12mm; object-fit: contain; display: block; margin-bottom: 2.5mm; }
  .card { border: 1.5px solid #111; border-radius: 6px; padding: 4mm; width: 100%; flex: 1; display: flex; flex-direction: column; }
  .r-title-row { display: flex; justify-content: space-between; align-items: flex-start; margin: 1mm 0; }
  .r-phong { font-size: 11pt; font-weight: bold; }
  .qr { width: 20mm; height: 20mm; }
  .r-title { text-align: center; font-size: 23pt; font-weight: bold; letter-spacing: 0.5px; margin: 16mm 0 16mm; }
  .info { border: 1.2px solid #111; border-radius: 8px; padding: 2.5mm 3.5mm; font-size: 10.5pt; line-height: 1.6; }
  .info b.kh { font-size: 11.5pt; }
  .info .lbl { font-weight: bold; }
  .info .kh-row { display: flex; gap: 1.5mm; align-items: baseline; }
  .info .kh-row .lbl { flex-shrink: 0; }
  .info .kh-row .kh { flex: 1; }
  .two { display: flex; gap: 3mm; margin-top: 2.5mm; }
  .two .b { flex: 1; border: 1.2px solid #111; border-radius: 4px; text-align: center; padding: 3.5mm 1.5mm; }
  .two .b .h { font-weight: bold; font-size: 10.5pt; }
  .two .b .v { font-size: 15pt; font-weight: bold; margin-top: 3mm; }
  .row-b { border: 1.2px solid #111; border-radius: 4px; padding: 1.5mm 3mm; margin-top: 2.5mm; font-size: 10.5pt; }
  .row-b .lbl { font-weight: bold; }
  .cb { display: inline-flex; align-items: center; gap: 0.8mm; margin-right: 2.5mm; white-space: nowrap; }
  .cb .bx { display: inline-block; width: 3mm; height: 3mm; border: 1.2px solid #111; text-align: center; line-height: 2.6mm; font-size: 9pt; }
  .print-date { margin-top: auto; font-size: 10pt; }
  .print-date .lbl { font-weight: bold; }

  /* ---- TRANG 2 ---- */
  .p2-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3mm; }
  .p2-logo { height: 7mm; object-fit: contain; }
  .p2-head .mm { font-size: 12pt; } .p2-head .mm b { font-size: 15pt; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(3, 1fr); gap: 0; border: 1.5px solid #111; height: 178mm; }
  .cell { border: 0.8px solid #111; padding: 2.5mm 2mm; font-size: 10pt; display: flex; flex-direction: column; overflow: hidden; }
  .cell-date { text-align: center; margin-bottom: 0.5mm; }
  .cell .ln { margin: 0.4mm 0; white-space: nowrap; }
  .cell .ln.f { display: flex; align-items: baseline; gap: 1.5mm; }
  .cell .dot { border-bottom: 1px dotted #333; }
  .cell .ln.f .dot { flex: 1; min-width: 0; }
  .cell .ghi2 { border-bottom: 1px dotted #333; margin-top: 3mm; }
  .cell .sign { margin-top: 2mm; display: flex; justify-content: space-around; font-weight: bold; font-size: 9.5pt; }
</style>`

// Bọc N trang (mỗi máy 2 trang) thành 1 tài liệu in hoàn chỉnh A4 ngang, tự gọi print.
function wrapDoc(pages: string, origin: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Sổ theo dõi máy</title>
<base href="${esc(origin)}/">
${DOC_STYLE}
</head><body>
${pages}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
</body></html>`
}

// Suy các trường tự động (không nhập tay) cho in HÀNG LOẠT — dựa hoàn toàn vào DB.
function autoMan(may: MayInfo): ManFields {
  const base = may.ngay_het_han_hdbt ? String(may.ngay_het_han_hdbt).slice(0, 10) : ''
  let hdTu = '', hdDen = ''
  if (base) { hdTu = base; const d = new Date(base); if (!isNaN(d.getTime())) { d.setFullYear(d.getFullYear() + 1); hdDen = d.toISOString().slice(0, 10) } }
  return {
    nguoiLienHe: '', soDienThoai: '', hdTu, hdDen,
    soSerial: may.serial ? String(may.serial) : '',
    hinhThuc: String(may.loai_hd || '').trim().toUpperCase() === 'MF' ? 'MF' : 'HĐBT',
  }
}

// IN HÀNG LOẠT: dựng 1 tài liệu chứa sổ của NHIỀU máy (tự điền từ DB) rồi in một lần.
export async function printSoTheoDoiBatch(mays: MayInfo[], origin: string): Promise<{ ok: boolean; n: number; err?: string }> {
  const list = mays.filter(m => m.ma_may)
  if (!list.length) return { ok: false, n: 0, err: 'Không có máy hợp lệ (thiếu mã máy) để in.' }
  try {
    const parts: string[] = []
    for (const m of list) {
      const qr = await QRCodeLib.toDataURL(String(m.ma_may), { width: 320, margin: 1 })
      parts.push(pagesFor(m, autoMan(m), qr))
    }
    const w = window.open('', '_blank')
    if (!w) return { ok: false, n: 0, err: 'Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.' }
    w.document.open(); w.document.write(wrapDoc(parts.join('\n'), origin)); w.document.close()
    return { ok: true, n: list.length }
  } catch (e: any) {
    return { ok: false, n: 0, err: e?.message || 'Lỗi tạo sổ in hàng loạt' }
  }
}

export default function SoTheoDoiPrintButton({ may, showNotification }: {
  may: MayInfo
  showNotification?: (t: 'success' | 'error', m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ nguoiLienHe: '', soDienThoai: '', hdTu: '', hdDen: '', soSerial: '', hinhThuc: 'HĐBT' })

  // Mở modal + tự điền KỲ KẾ TIẾP: in sổ mới khi hết hạn -> Từ = ngày hết hạn HĐ hiện tại
  // (ngay_het_han_hdbt), đến = Từ + 1 năm. Số serial ← may.serial. User sửa tay được.
  const openModal = () => {
    const base = may.ngay_het_han_hdbt ? String(may.ngay_het_han_hdbt).slice(0, 10) : ''
    let tu = '', den = ''
    if (base) {
      tu = base
      const d = new Date(base); if (!isNaN(d.getTime())) { d.setFullYear(d.getFullYear() + 1); den = d.toISOString().slice(0, 10) }
    }
    const hinhThuc = String(may.loai_hd || '').trim().toUpperCase() === 'MF' ? 'MF' : 'HĐBT'
    setF({ nguoiLienHe: '', soDienThoai: '', hdTu: tu, hdDen: den, soSerial: may.serial ? String(may.serial) : '', hinhThuc })
    setOpen(true)
  }

  const doPrint = async () => {
    if (!may.ma_may) { showNotification?.('error', 'Máy chưa có mã máy — không tạo được QR.'); return }
    setBusy(true)
    try {
      const qr = await QRCodeLib.toDataURL(String(may.ma_may), { width: 320, margin: 1 })
      const html = wrapDoc(pagesFor(may, f, qr), window.location.origin)
      const w = window.open('', '_blank')
      if (!w) { showNotification?.('error', 'Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.'); return }
      w.document.open(); w.document.write(html); w.document.close()
      setOpen(false)
    } catch (e: any) {
      showNotification?.('error', e?.message || 'Lỗi tạo sổ in')
    } finally { setBusy(false) }
  }

  return (
    <>
      <Button variant="outline" onClick={openModal} title="In sổ theo dõi máy (2 trang A4 ngang)" className="h-9 gap-1.5">
        <Printer className="w-4 h-4" /> In sổ máy
      </Button>
      {open && (
        <div className="fixed inset-0 bg-slate-900/50 z-[80] flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">In Sổ theo dõi máy — {may.ma_may}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500">Các trường nhập tay (để trống nếu để KTV viết tay). Còn lại tự lấy theo máy.</p>
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Hình thức hợp đồng</label>
                <div className="flex gap-2">
                  {(['HĐBT', 'MF'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setF({ ...f, hinhThuc: v })}
                      className={`flex-1 h-9 rounded-md border text-sm font-semibold transition ${f.hinhThuc === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{v}</button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">Mặc định theo máy ({may.loai_hd || '—'}); đổi tại đây nếu danh sách khách chưa cập nhật.</p>
              </div>
              <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">Người liên hệ</label>
                <Input value={f.nguoiLienHe} onChange={e => setF({ ...f, nguoiLienHe: e.target.value })} placeholder="VD: Mr Huy" className="bg-white h-9" /></div>
              <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">Số điện thoại</label>
                <Input value={f.soDienThoai} onChange={e => setF({ ...f, soDienThoai: e.target.value })} placeholder="VD: 0977.452.239" className="bg-white h-9" /></div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Thời hạn hợp đồng</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <DateField value={f.hdTu} onChange={v => setF({ ...f, hdTu: v })} heightClass="h-9" className="w-full min-w-0" placeholder="Từ ngày" />
                  <span className="text-xs text-slate-400 font-medium shrink-0">đến</span>
                  <DateField value={f.hdDen} onChange={v => setF({ ...f, hdDen: v })} heightClass="h-9" className="w-full min-w-0" placeholder="Đến ngày" />
                </div>
              </div>
              <div className="space-y-1"><label className="text-xs font-semibold text-slate-600">Số serial</label>
                <Input value={f.soSerial} onChange={e => setF({ ...f, soSerial: e.target.value })} placeholder="Để trống nếu viết tay" className="bg-white h-9" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="h-9">Hủy</Button>
              <Button onClick={doPrint} disabled={busy} className="h-9 gap-1.5"><Printer className="w-4 h-4" /> {busy ? 'Đang tạo…' : 'In sổ'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
