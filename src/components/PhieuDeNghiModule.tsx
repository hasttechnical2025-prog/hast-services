"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import DateField from "@/components/DateField"
import {
  FileText, Search, Plus, Printer, PenSquare, Trash2,
  RefreshCw, X, Save, ArrowUpDown, ChevronUp, ChevronDown
} from "lucide-react"

export type PhieuDeNghiCt = {
  id?: string
  phieu_id?: string
  loai_hang: 'xuat_ra' | 'nhap_lai'
  stt: number
  ten_hang: string
  ma_hang: string
  dvt: string
  so_luong: number | string | null
  ghi_chu: string
}

export type PhieuDeNghi = {
  id: string
  so_phieu: string
  so_phieu_num: number
  so_phieu_sub: string
  ngay_lap: string
  ten_may: string | null
  ma_may: string | null
  serial: string | null
  kho_may: string | null
  so_px: string | null
  ma_kho: string | null
  so_report: string | null
  the_kho: string | null
  ly_do: string | null
  ky_bgd: string | null
  ky_ktt: string | null
  ky_pkt: string | null
  nguoi_lap: string | null
  created_at?: string
  created_by?: string
  soct_phieu_de_nghi_ct?: PhieuDeNghiCt[]
}

const fmtDate = (s?: string | null) => {
  if (!s) return ''
  const p = String(s).slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ''
}

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// In phiếu đề nghị A4 dọc theo biểu mẫu BM38-NC ĐT.01
export function printPhieuDeNghiA4(phieu: PhieuDeNghi, origin: string) {
  const w = window.open('', '_blank')
  if (!w) {
    alert('Trình duyệt chặn mở cửa sổ in. Vui lòng cho phép popup để in phiếu.')
    return
  }

  const pNgay = phieu.ngay_lap ? phieu.ngay_lap.slice(0, 10).split('-') : []
  const ngayStr = pNgay.length === 3
    ? `Hà Nội, ngày ${pNgay[2]} tháng ${pNgay[1]} năm ${pNgay[0]}`
    : `Hà Nội, ngày ..... tháng ..... năm 20....`

  const allCt = phieu.soct_phieu_de_nghi_ct || []
  const xuat = allCt.filter(c => c.loai_hang === 'xuat_ra')
  const nhap = allCt.filter(c => c.loai_hang === 'nhap_lai')

  // Đảm bảo tối thiểu 6 dòng theo yêu cầu người dùng
  const rowCount = Math.max(6, xuat.length, nhap.length)

  let rowsHtml = ''
  for (let i = 0; i < rowCount; i++) {
    const x = xuat[i]
    const n = nhap[i]

    rowsHtml += `
      <tr>
        <td class="c-stt">${i + 1}</td>
        <td class="c-ma">${x?.ma_hang ? esc(x.ma_hang) : ''}</td>
        <td class="c-ten">${x?.ten_hang ? esc(x.ten_hang) : ''}</td>
        <td class="c-sl">${x?.so_luong != null ? esc(x.so_luong) : ''}</td>
        <td class="c-ma">${n?.ma_hang ? esc(n.ma_hang) : ''}</td>
        <td class="c-ten">${n?.ten_hang ? esc(n.ten_hang) : ''}</td>
        <td class="c-sl">${n?.so_luong != null ? esc(n.so_luong) : ''}</td>
      </tr>
    `
  }

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Phiếu đề nghị ${esc(phieu.so_phieu)} - BM38</title>
  <base href="${esc(origin)}/">
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 10.5pt;
      color: #000;
      line-height: 1.25;
    }
    .page-container {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .banner-img {
      width: 100%;
      height: auto;
      max-height: 22mm;
      object-fit: contain;
      display: block;
      margin-bottom: 2mm;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 1mm;
      margin-bottom: 2mm;
    }
    .header-left {
      width: 70%;
      text-align: center;
    }
    .title-main {
      font-size: 15pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .title-sub {
      font-size: 10pt;
      font-style: italic;
      margin: 1.5mm 0 0 0;
    }
    .header-right {
      width: 30%;
      text-align: right;
      font-size: 9.5pt;
    }
    .bm-code {
      font-weight: bold;
      font-size: 9pt;
      color: #333;
    }
    .so-phieu-box {
      margin-top: 1mm;
      font-weight: bold;
      font-size: 11pt;
    }
    .date-row {
      text-align: right;
      font-style: italic;
      font-size: 9.5pt;
      margin-bottom: 3mm;
    }
    .dear-row {
      margin-bottom: 2mm;
      font-size: 10.5pt;
    }
    .dear-row b {
      font-weight: bold;
    }
    .meta-box {
      border: 1px solid #333;
      padding: 2.5mm 3mm;
      margin-bottom: 3mm;
      font-size: 10pt;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5mm 3mm;
    }
    .meta-item {
      display: flex;
      align-items: baseline;
    }
    .meta-label {
      white-space: nowrap;
      margin-right: 1.5mm;
    }
    .meta-val {
      font-weight: bold;
      word-break: break-word;
    }
    .meta-full {
      grid-column: 1 / -1;
      display: flex;
      align-items: baseline;
    }
    .table-container {
      margin-bottom: 3.5mm;
    }
    table.data-tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table.data-tbl th, table.data-tbl td {
      border: 1px solid #000;
      padding: 1.2mm 1mm;
      vertical-align: middle;
    }
    table.data-tbl td {
      height: 7.2mm;
    }
    table.data-tbl th {
      text-align: center;
      font-weight: bold;
      background-color: #f5f5f5;
    }
    .th-group-xuat {
      background-color: #eef2ff !important;
    }
    .th-group-nhap {
      background-color: #ecfdf5 !important;
    }
    .c-stt { width: 5%; text-align: center; }
    .c-ma  { width: 16%; text-align: center; font-family: monospace; }
    .c-ten { width: 21.5%; }
    .c-sl  { width: 6%; text-align: center; font-weight: bold; }
    td.c-ten {
      line-height: 1.15;
      word-break: break-word;
    }
    .signs-container {
      margin-top: 4mm;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      text-align: center;
      page-break-inside: avoid;
    }
    .sign-col {
      display: flex;
      flex-direction: column;
      height: 25mm;
      justify-content: space-between;
    }
    .sign-title {
      font-weight: bold;
      font-size: 9.5pt;
      text-transform: uppercase;
    }
    .sign-note {
      font-size: 8pt;
      font-style: italic;
      color: #555;
    }
    .sign-name {
      font-weight: bold;
      font-size: 10pt;
      text-transform: uppercase;
    }
    .foot-note {
      margin-top: 5mm;
      border-top: 1px dotted #999;
      padding-top: 1.5mm;
      font-size: 8.5pt;
      font-style: italic;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <img src="/letterhead.png" alt="HSTC Group Letterhead" class="banner-img" onerror="this.style.display='none'" />

    <div class="header-row">
      <div class="header-left">
        <h1 class="title-main">PHIẾU ĐỀ NGHỊ</h1>
        <div class="title-sub">(V/v: Chuyển đổi - tháo vật tư - hoàn thiện máy)</div>
      </div>
      <div class="header-right">
        <div class="bm-code">BM38-NC ĐT.01</div>
        <div class="so-phieu-box">Số: ${esc(phieu.so_phieu)}</div>
      </div>
    </div>

    <div class="date-row">${ngayStr}</div>

    <div class="dear-row">
      <b>Kính gửi:</b> Ban Tổng Giám đốc Công ty Cổ phần Siêu Thanh Hà Nội
    </div>

    <div class="meta-box">
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Mã hàng:</span><span class="meta-val">${esc(phieu.ma_may || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Tên hàng:</span><span class="meta-val">${esc(phieu.ten_may || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Serial:</span><span class="meta-val">${esc(phieu.serial || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Mã kho:</span><span class="meta-val">${esc(phieu.ma_kho || '')}</span></div>

        <div class="meta-item"><span class="meta-label">Kho máy:</span><span class="meta-val">${esc(phieu.kho_may || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Số PX:</span><span class="meta-val">${esc(phieu.so_px || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Số report:</span><span class="meta-val">${esc(phieu.so_report || '')}</span></div>
        <div class="meta-item"><span class="meta-label">Thẻ kho:</span><span class="meta-val">${esc(phieu.the_kho || '')}</span></div>

        <div class="meta-full"><span class="meta-label">Lý do &amp; Diễn giải:</span><span class="meta-val">${esc(phieu.ly_do || '')}</span></div>
      </div>
    </div>

    <div class="table-container">
      <table class="data-tbl">
        <thead>
          <tr>
            <th class="c-stt" rowspan="2">TT</th>
            <th colspan="3" class="th-group-xuat">HÀNG XUẤT RA</th>
            <th colspan="3" class="th-group-nhap">HÀNG NHẬP LẠI</th>
          </tr>
          <tr>
            <th class="c-ma">Mã hàng</th>
            <th class="c-ten">Tên hàng</th>
            <th class="c-sl">SL</th>
            <th class="c-ma">Mã hàng</th>
            <th class="c-ten">Tên hàng</th>
            <th class="c-sl">SL</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="signs-container">
      <div class="sign-col">
        <div>
          <div class="sign-title">Ban Tổng Giám đốc</div>
          <div class="sign-note">(Ký, ghi rõ họ tên)</div>
        </div>
        <div class="sign-name">${esc(phieu.ky_bgd || 'Nguyễn Nhân')}</div>
      </div>
      <div class="sign-col">
        <div>
          <div class="sign-title">Kế toán trưởng</div>
          <div class="sign-note">(Ký, ghi rõ họ tên)</div>
        </div>
        <div class="sign-name">${esc(phieu.ky_ktt || 'Phạm Thị Phương')}</div>
      </div>
      <div class="sign-col">
        <div>
          <div class="sign-title">Phòng Kỹ thuật</div>
          <div class="sign-note">(Ký, ghi rõ họ tên)</div>
        </div>
        <div class="sign-name">${esc(phieu.ky_pkt || 'Trần Kiên')}</div>
      </div>
      <div class="sign-col">
        <div>
          <div class="sign-title">Người lập biểu</div>
          <div class="sign-note">(Ký, ghi rõ họ tên)</div>
        </div>
        <div class="sign-name">${esc(phieu.nguoi_lap || '')}</div>
      </div>
    </div>

    <div class="foot-note"><b>Ghi chú:</b> Phiếu sửa chữa, viết tay không có giá trị.</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`

  w.document.open()
  w.document.write(html)
  w.document.close()
}

// Combobox chọn mã hàng từ kho: gõ để lọc theo mã/tên, chọn xong tự điền Tên hàng.
// Vẫn cho gõ tự do mã ngoài danh mục (kho không có) — Tên hàng khi đó nhập tay.
function MaHangCombo({
  value,
  inventory,
  onChangeMa,
  onPick,
}: {
  value: string
  inventory: any[]
  onChangeMa: (ma: string) => void
  onPick: (ma: string, ten: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const matches = useMemo(() => {
    const s = (kw || value).trim().toLowerCase()
    const list = Array.isArray(inventory) ? inventory : []
    if (!s) return list.slice(0, 30)
    return list
      .filter((it: any) =>
        String(it?.ma_hang || '').toLowerCase().includes(s) ||
        String(it?.ten_hang || '').toLowerCase().includes(s)
      )
      .slice(0, 30)
  }, [kw, value, inventory])

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={value}
        onChange={e => { onChangeMa(e.target.value); setKw(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Mã hàng..."
        className="h-7 text-xs font-mono"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-0.5 w-[320px] max-w-[80vw] max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-xs">
          {matches.map((it: any, i: number) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(String(it?.ma_hang || ''), String(it?.ten_hang || '')); setOpen(false); setKw('') }}
              className="w-full text-left px-2 py-1.5 hover:bg-slate-100 flex items-center gap-2"
            >
              <span className="font-mono font-semibold text-slate-800 shrink-0">{it?.ma_hang}</span>
              <span className="text-slate-500 truncate">{it?.ten_hang}</span>
              <span className="ml-auto text-[10px] text-slate-400 shrink-0">Tồn: {Number(it?.ton_kho) || 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PhieuDeNghiModule({
  showNotification,
  currentUserRole = 'admin',
  currentUserName = '',
  inventory = [],
}: {
  showNotification: (t: 'success' | 'error', m: string) => void
  currentUserRole?: string
  currentUserName?: string
  customers?: any[]
  inventory?: any[]
}) {
  const [rows, setRows] = useState<PhieuDeNghi[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tuNgay, setTuNgay] = useState('')
  const [denNgay, setDenNgay] = useState('')
  const [nextSoPhieu, setNextSoPhieu] = useState('5758')

  // Sorting
  const [sortField, setSortField] = useState<'so_phieu' | 'ngay_lap' | 'ten_may' | 'ma_may'>('so_phieu')
  const [sortAsc, setSortAsc] = useState<boolean>(false) // Mặc định số phiếu mới nhất lên đầu

  // Modal thêm/sửa
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [form, setForm] = useState({
    so_phieu: '',
    ngay_lap: new Date().toISOString().slice(0, 10),
    ten_may: '',
    ma_may: '',
    serial: '',
    kho_may: '',
    so_px: '',
    ma_kho: '',
    so_report: '',
    the_kho: '',
    ly_do: '',
    ky_bgd: 'Nguyễn Nhân',
    ky_ktt: 'Phạm Thị Phương',
    ky_pkt: 'Trần Kiên',
    nguoi_lap: currentUserName || 'Admin',
  })

  // Detail lines
  const [linesXuat, setLinesXuat] = useState<PhieuDeNghiCt[]>([])
  const [linesNhap, setLinesNhap] = useState<PhieuDeNghiCt[]>([])

  // Modal xóa
  const [deleteTarget, setDeleteTarget] = useState<PhieuDeNghi | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Tải danh sách
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (tuNgay) p.set('tuNgay', tuNgay)
      if (denNgay) p.set('denNgay', denNgay)
      if (q.trim()) p.set('q', q.trim())

      const res = await fetch(`/api/admin/phieu-de-nghi?${p.toString()}`)
      const j = await res.json()
      if (res.ok) {
        setRows(j.data || [])
        if (j.next_so_phieu) setNextSoPhieu(j.next_so_phieu)
      } else {
        showNotification('error', j.error || 'Lỗi tải danh sách phiếu đề nghị')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối khi tải phiếu đề nghị')
    } finally {
      setLoading(false)
    }
  }, [tuNgay, denNgay, q, showNotification])

  useEffect(() => {
    load()
  }, [load])

  // Sắp xếp tự nhiên (Natural/Alphanumeric sort) cho số phiếu
  const sortedRows = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'so_phieu') {
        if (a.so_phieu_num !== b.so_phieu_num) {
          cmp = a.so_phieu_num - b.so_phieu_num
        } else {
          cmp = String(a.so_phieu_sub || '').localeCompare(String(b.so_phieu_sub || ''), 'vi', { numeric: true })
        }
      } else if (sortField === 'ngay_lap') {
        cmp = String(a.ngay_lap || '').localeCompare(String(b.ngay_lap || ''))
      } else if (sortField === 'ten_may') {
        cmp = String(a.ten_may || '').localeCompare(String(b.ten_may || ''), 'vi')
      } else if (sortField === 'ma_may') {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi')
      }

      if (cmp === 0) {
        cmp = a.so_phieu_num - b.so_phieu_num
      }
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [rows, sortField, sortAsc])

  const handleSort = (f: 'so_phieu' | 'ngay_lap' | 'ten_may' | 'ma_may') => {
    if (sortField === f) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(f)
      setSortAsc(f === 'so_phieu' ? false : true)
    }
  }

  // Khởi tạo form tạo mới
  const openCreateModal = () => {
    setEditingId(null)
    setForm({
      so_phieu: nextSoPhieu,
      ngay_lap: new Date().toISOString().slice(0, 10),
      ten_may: '',
      ma_may: '',
      serial: '',
      kho_may: '',
      so_px: '',
      ma_kho: '',
      so_report: '',
      the_kho: '',
      ly_do: '',
      ky_bgd: 'Nguyễn Nhân',
      ky_ktt: 'Phạm Thị Phương',
      ky_pkt: 'Trần Kiên',
      nguoi_lap: currentUserName || 'Admin',
    })

    // Khởi tạo sẵn 2 dòng trống cho mỗi vế (thêm khi cần); bản in vẫn đệm tối thiểu 6
    setLinesXuat(
      Array.from({ length: 2 }, (_, i) => ({
        loai_hang: 'xuat_ra',
        stt: i + 1,
        ten_hang: '',
        ma_hang: '',
        dvt: 'Cái',
        so_luong: '',
        ghi_chu: '',
      }))
    )
    setLinesNhap(
      Array.from({ length: 2 }, (_, i) => ({
        loai_hang: 'nhap_lai',
        stt: i + 1,
        ten_hang: '',
        ma_hang: '',
        dvt: 'Cái',
        so_luong: '',
        ghi_chu: '',
      }))
    )
    setModalOpen(true)
  }

  // Mở modal sửa phiếu
  const openEditModal = async (phieu: PhieuDeNghi) => {
    setEditingId(phieu.id)
    setForm({
      so_phieu: phieu.so_phieu || '',
      ngay_lap: phieu.ngay_lap ? phieu.ngay_lap.slice(0, 10) : new Date().toISOString().slice(0, 10),
      ten_may: phieu.ten_may || '',
      ma_may: phieu.ma_may || '',
      serial: phieu.serial || '',
      kho_may: phieu.kho_may || '',
      so_px: phieu.so_px || '',
      ma_kho: phieu.ma_kho || '',
      so_report: phieu.so_report || '',
      the_kho: phieu.the_kho || '',
      ly_do: phieu.ly_do || '',
      ky_bgd: phieu.ky_bgd || 'Nguyễn Nhân',
      ky_ktt: phieu.ky_ktt || 'Phạm Thị Phương',
      ky_pkt: phieu.ky_pkt || 'Trần Kiên',
      nguoi_lap: phieu.nguoi_lap || currentUserName || 'Admin',
    })

    // Fetch chi tiết phiếu đầy đủ
    try {
      const res = await fetch(`/api/admin/phieu-de-nghi?id=${phieu.id}`)
      const j = await res.json()
      if (res.ok && j.data) {
        const ct: PhieuDeNghiCt[] = j.data.soct_phieu_de_nghi_ct || []
        const xList = ct.filter(c => c.loai_hang === 'xuat_ra')
        const nList = ct.filter(c => c.loai_hang === 'nhap_lai')

        // Đệm thêm dòng trống nếu ít hơn 2 (giữ form gọn; bản in tự đệm tới 6)
        while (xList.length < 2) {
          xList.push({
            loai_hang: 'xuat_ra',
            stt: xList.length + 1,
            ten_hang: '',
            ma_hang: '',
            dvt: 'Cái',
            so_luong: '',
            ghi_chu: '',
          })
        }
        while (nList.length < 2) {
          nList.push({
            loai_hang: 'nhap_lai',
            stt: nList.length + 1,
            ten_hang: '',
            ma_hang: '',
            dvt: 'Cái',
            so_luong: '',
            ghi_chu: '',
          })
        }

        setLinesXuat(xList)
        setLinesNhap(nList)
      } else {
        showNotification('error', j.error || 'Lỗi tải chi tiết phiếu')
      }
    } catch {
      showNotification('error', 'Lỗi tải chi tiết phiếu')
    }

    setModalOpen(true)
  }

  // Thêm dòng mới
  const addLine = (type: 'xuat_ra' | 'nhap_lai') => {
    if (type === 'xuat_ra') {
      setLinesXuat(prev => [
        ...prev,
        {
          loai_hang: 'xuat_ra',
          stt: prev.length + 1,
          ten_hang: '',
          ma_hang: '',
          dvt: 'Cái',
          so_luong: '',
          ghi_chu: '',
        },
      ])
    } else {
      setLinesNhap(prev => [
        ...prev,
        {
          loai_hang: 'nhap_lai',
          stt: prev.length + 1,
          ten_hang: '',
          ma_hang: '',
          dvt: 'Cái',
          so_luong: '',
          ghi_chu: '',
        },
      ])
    }
  }

  // Xóa dòng
  const removeLine = (type: 'xuat_ra' | 'nhap_lai', idx: number) => {
    if (type === 'xuat_ra') {
      setLinesXuat(prev => {
        const next = prev.filter((_, i) => i !== idx)
        return next.map((r, i) => ({ ...r, stt: i + 1 }))
      })
    } else {
      setLinesNhap(prev => {
        const next = prev.filter((_, i) => i !== idx)
        return next.map((r, i) => ({ ...r, stt: i + 1 }))
      })
    }
  }

  // Cập nhật giá trị ô dòng chi tiết
  const updateLine = (type: 'xuat_ra' | 'nhap_lai', idx: number, field: keyof PhieuDeNghiCt, val: any) => {
    if (type === 'xuat_ra') {
      setLinesXuat(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], [field]: val }
        return next
      })
    } else {
      setLinesNhap(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], [field]: val }
        return next
      })
    }
  }

  // Lưu phiếu (Tạo mới hoặc Sửa)
  const handleSave = async () => {
    if (!form.so_phieu.trim()) {
      showNotification('error', 'Vui lòng nhập số phiếu đề nghị')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        ...form,
        xuat_ra: linesXuat,
        nhap_lai: linesNhap,
      }

      const res = await fetch('/api/admin/phieu-de-nghi', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const j = await res.json()
      if (res.ok) {
        showNotification('success', editingId ? `Đã cập nhật phiếu số ${form.so_phieu}` : `Đã tạo phiếu đề nghị số ${form.so_phieu}`)
        setModalOpen(false)
        load()
      } else {
        showNotification('error', j.error || 'Lỗi lưu phiếu đề nghị')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối khi lưu phiếu')
    } finally {
      setSubmitting(false)
    }
  }

  // Xóa phiếu
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/phieu-de-nghi?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const j = await res.json()
      if (res.ok) {
        showNotification('success', `Đã xóa phiếu đề nghị số ${deleteTarget.so_phieu}`)
        setDeleteTarget(null)
        load()
      } else {
        showNotification('error', j.error || 'Lỗi xóa phiếu')
      }
    } catch {
      showNotification('error', 'Lỗi kết nối khi xóa phiếu')
    } finally {
      setDeleting(false)
    }
  }

  // In nhanh từ danh sách
  const handlePrint = async (row: PhieuDeNghi) => {
    try {
      const res = await fetch(`/api/admin/phieu-de-nghi?id=${row.id}`)
      const j = await res.json()
      if (res.ok && j.data) {
        printPhieuDeNghiA4(j.data, window.location.origin)
      } else {
        printPhieuDeNghiA4(row, window.location.origin)
      }
    } catch {
      printPhieuDeNghiA4(row, window.location.origin)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Phiếu đề nghị (BM38-NC ĐT.01)
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                {sortedRows.length} phiếu
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Biểu mẫu đề nghị chuyển đổi - tháo vật tư - hoàn thiện máy giữa kho và phòng kỹ thuật. Khổ A4 dọc.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={openCreateModal}
            className="h-9 px-4 text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" /> Tạo phiếu mới
          </Button>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            title="Tải lại danh sách"
            className="h-9 w-9 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Tìm số phiếu, model, serial, PX..."
            className="pl-9 pr-7 bg-white h-9 text-xs"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              title="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="text-slate-500 whitespace-nowrap">Từ ngày:</span>
          <DateField value={tuNgay} onChange={setTuNgay} heightClass="h-9" className="w-32" />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="text-slate-500 whitespace-nowrap">Đến ngày:</span>
          <DateField value={denNgay} onChange={setDenNgay} heightClass="h-9" className="w-32" />
        </div>

        {(tuNgay || denNgay || q) && (
          <Button
            variant="ghost"
            onClick={() => { setTuNgay(''); setDenNgay(''); setQ('') }}
            className="h-9 text-xs text-slate-600 hover:text-slate-900 px-2.5"
          >
            Bỏ lọc
          </Button>
        )}
      </div>

      {/* Data table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase border-b border-slate-200 select-none">
              <tr>
                <th
                  onClick={() => handleSort('so_phieu')}
                  className={`px-3 py-2.5 text-left whitespace-nowrap cursor-pointer hover:bg-slate-100 transition ${sortField === 'so_phieu' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    Số phiếu
                    {sortField === 'so_phieu' ? (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ngay_lap')}
                  className={`px-3 py-2.5 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 transition ${sortField === 'ngay_lap' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    Ngày lập
                    {sortField === 'ngay_lap' ? (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ten_may')}
                  className={`px-3 py-2.5 text-left cursor-pointer hover:bg-slate-100 transition ${sortField === 'ten_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    Tên hàng / Model
                    {sortField === 'ten_may' ? (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ma_may')}
                  className={`px-2.5 py-2.5 text-left cursor-pointer hover:bg-slate-100 transition ${sortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    Mã máy
                    {sortField === 'ma_may' ? (sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                  </div>
                </th>
                <th className="px-2.5 py-2.5 text-left">Serial</th>
                <th className="px-2.5 py-2.5 text-left">Kho máy / Mã kho</th>
                <th className="px-2.5 py-2.5 text-left">Số PX</th>
                <th className="px-2.5 py-2.5 text-center">Vật tư (Xuất / Nhập)</th>
                <th className="px-2.5 py-2.5 text-left">Người lập</th>
                <th className="px-3 py-2.5 text-center w-28">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-600" />
                    Đang tải danh sách phiếu đề nghị...
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Không tìm thấy phiếu đề nghị nào phù hợp.
                  </td>
                </tr>
              ) : (
                sortedRows.map(row => {
                  const ct = row.soct_phieu_de_nghi_ct || []
                  const countXuat = ct.filter(c => c.loai_hang === 'xuat_ra').length
                  const countNhap = ct.filter(c => c.loai_hang === 'nhap_lai').length

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                          {row.so_phieu}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap text-slate-700">
                        {fmtDate(row.ngay_lap)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {row.ten_may || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-slate-700">
                        {row.ma_may || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-slate-600">
                        {row.serial || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-600">
                        {row.kho_may || row.ma_kho ? `${row.kho_may || ''} ${row.ma_kho ? `(${row.ma_kho})` : ''}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-slate-600">
                        {row.so_px || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Số mặt hàng xuất ra">
                            Xuất: {countXuat}
                          </span>
                          <span className="px-1.5 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Số mặt hàng nhập lại">
                            Nhập: {countNhap}
                          </span>
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-600">
                        {row.nguoi_lap || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => handlePrint(row)}
                            title="In phiếu A4 (BM38)"
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => openEditModal(row)}
                            title="Chỉnh sửa phiếu"
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                          >
                            <PenSquare className="w-4 h-4" />
                          </Button>
                          {currentUserRole === 'admin' && (
                            <Button
                              variant="ghost"
                              onClick={() => setDeleteTarget(row)}
                              title="Xóa phiếu"
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm / Sửa Phiếu Đề Nghị */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[90] flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-6 flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-800">
                  {editingId ? `Sửa phiếu đề nghị số ${form.so_phieu}` : 'Tạo phiếu đề nghị mới (BM38-NC ĐT.01)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Khối Thông tin chung & Số phiếu */}
              <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Số phiếu <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={form.so_phieu}
                      onChange={e => setForm({ ...form, so_phieu: e.target.value })}
                      placeholder="VD: 5757, 5757A..."
                      className="h-8 font-mono font-bold text-blue-700 bg-white"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Hỗ trợ hậu tố A, B, C...</span>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Ngày lập phiếu <span className="text-rose-500">*</span>
                    </label>
                    <DateField
                      value={form.ngay_lap}
                      onChange={v => setForm({ ...form, ngay_lap: v })}
                      heightClass="h-8"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Mã hàng (máy)</label>
                    <Input
                      value={form.ma_may}
                      onChange={e => setForm({ ...form, ma_may: e.target.value })}
                      placeholder="VD: AA6W04.1CTD..."
                      className="h-8 font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tên hàng (máy)</label>
                    <Input
                      value={form.ten_may}
                      onChange={e => setForm({ ...form, ten_may: e.target.value })}
                      placeholder="VD: bizhub 308e..."
                      className="h-8 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Serial</label>
                    <Input
                      value={form.serial}
                      onChange={e => setForm({ ...form, serial: e.target.value })}
                      placeholder="Serial máy..."
                      className="h-8 font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Kho máy</label>
                    <Input
                      value={form.kho_may}
                      onChange={e => setForm({ ...form, kho_may: e.target.value })}
                      placeholder="VD: Lai Xá..."
                      className="h-8 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Số PX (Phiếu xuất)</label>
                    <Input
                      value={form.so_px}
                      onChange={e => setForm({ ...form, so_px: e.target.value })}
                      placeholder="Số PX..."
                      className="h-8 font-mono bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Mã kho</label>
                    <Input
                      value={form.ma_kho}
                      onChange={e => setForm({ ...form, ma_kho: e.target.value })}
                      placeholder="Mã kho..."
                      className="h-8 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Số report</label>
                    <Input
                      value={form.so_report}
                      onChange={e => setForm({ ...form, so_report: e.target.value })}
                      placeholder="Report..."
                      className="h-8 font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Thẻ kho</label>
                    <Input
                      value={form.the_kho}
                      onChange={e => setForm({ ...form, the_kho: e.target.value })}
                      placeholder="Thẻ kho..."
                      className="h-8 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Lý do &amp; Diễn giải</label>
                  <Input
                    value={form.ly_do}
                    onChange={e => setForm({ ...form, ly_do: e.target.value })}
                    placeholder="Lý do chuyển đổi / tháo vật tư / hoàn thiện máy..."
                    className="h-8 bg-white"
                  />
                </div>
              </div>

              {/* Bảng đối ứng 2 vế (Side-by-side tables) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* VẾ TRÁI: HÀNG XUẤT RA */}
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 uppercase text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                      1. Hàng xuất ra ({linesXuat.length} dòng)
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addLine('xuat_ra')}
                      className="h-7 text-[11px] px-2 text-indigo-700 border-indigo-200 hover:bg-indigo-100/50"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Thêm dòng xuất
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 gap-1.5 px-0.5 text-[10px] font-semibold uppercase text-indigo-700/70">
                      <div className="col-span-1 text-center">TT</div>
                      <div className="col-span-4">Mã hàng</div>
                      <div className="col-span-5">Tên hàng</div>
                      <div className="col-span-2 text-center">SL</div>
                    </div>
                    {linesXuat.map((ln, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                        <div className="col-span-1 text-center text-[11px] font-semibold text-indigo-700">{idx + 1}</div>
                        <div className="col-span-4">
                          <MaHangCombo
                            value={ln.ma_hang}
                            inventory={inventory}
                            onChangeMa={(v) => updateLine('xuat_ra', idx, 'ma_hang', v)}
                            onPick={(ma, ten) => { updateLine('xuat_ra', idx, 'ma_hang', ma); updateLine('xuat_ra', idx, 'ten_hang', ten) }}
                          />
                        </div>
                        <div className="col-span-5 flex items-center gap-1">
                          <Input
                            value={ln.ten_hang}
                            onChange={e => updateLine('xuat_ra', idx, 'ten_hang', e.target.value)}
                            placeholder="Tên hàng / vật tư..."
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <Input
                            type="number"
                            value={ln.so_luong ?? ''}
                            onChange={e => updateLine('xuat_ra', idx, 'so_luong', e.target.value)}
                            placeholder="SL"
                            className="h-7 text-xs text-center font-bold text-indigo-700"
                          />
                          <button
                            type="button"
                            onClick={() => removeLine('xuat_ra', idx)}
                            className="text-slate-300 hover:text-rose-600 shrink-0"
                            title="Xóa dòng này"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* VẾ PHẢI: HÀNG NHẬP LẠI */}
                <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 uppercase text-xs flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      2. Hàng nhập lại ({linesNhap.length} dòng)
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addLine('nhap_lai')}
                      className="h-7 text-[11px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-100/50"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Thêm dòng nhập
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 gap-1.5 px-0.5 text-[10px] font-semibold uppercase text-emerald-700/70">
                      <div className="col-span-1 text-center">TT</div>
                      <div className="col-span-4">Mã hàng</div>
                      <div className="col-span-5">Tên hàng</div>
                      <div className="col-span-2 text-center">SL</div>
                    </div>
                    {linesNhap.map((ln, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                        <div className="col-span-1 text-center text-[11px] font-semibold text-emerald-700">{idx + 1}</div>
                        <div className="col-span-4">
                          <MaHangCombo
                            value={ln.ma_hang}
                            inventory={inventory}
                            onChangeMa={(v) => updateLine('nhap_lai', idx, 'ma_hang', v)}
                            onPick={(ma, ten) => { updateLine('nhap_lai', idx, 'ma_hang', ma); updateLine('nhap_lai', idx, 'ten_hang', ten) }}
                          />
                        </div>
                        <div className="col-span-5 flex items-center gap-1">
                          <Input
                            value={ln.ten_hang}
                            onChange={e => updateLine('nhap_lai', idx, 'ten_hang', e.target.value)}
                            placeholder="Tên hàng / vật tư..."
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <Input
                            type="number"
                            value={ln.so_luong ?? ''}
                            onChange={e => updateLine('nhap_lai', idx, 'so_luong', e.target.value)}
                            placeholder="SL"
                            className="h-7 text-xs text-center font-bold text-emerald-700"
                          />
                          <button
                            type="button"
                            onClick={() => removeLine('nhap_lai', idx)}
                            className="text-slate-300 hover:text-rose-600 shrink-0"
                            title="Xóa dòng này"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Khối Người ký tên 4 bên */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <span className="font-bold text-slate-700 uppercase text-xs">
                  Chữ ký 4 bên in trên phiếu (tùy biến)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1 text-[11px]">Ban Tổng Giám đốc</label>
                    <Input
                      value={form.ky_bgd}
                      onChange={e => setForm({ ...form, ky_bgd: e.target.value })}
                      className="h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1 text-[11px]">Kế toán trưởng</label>
                    <Input
                      value={form.ky_ktt}
                      onChange={e => setForm({ ...form, ky_ktt: e.target.value })}
                      className="h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1 text-[11px]">Phòng Kỹ thuật</label>
                    <Input
                      value={form.ky_pkt}
                      onChange={e => setForm({ ...form, ky_pkt: e.target.value })}
                      className="h-8 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1 text-[11px]">Người lập biểu</label>
                    <Input
                      value={form.nguoi_lap}
                      onChange={e => setForm({ ...form, nguoi_lap: e.target.value })}
                      className="h-8 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="h-9 px-4 text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={handleSave}
                disabled={submitting}
                className="h-9 px-4 text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Đang lưu...' : (editingId ? 'Lưu cập nhật' : 'Tạo phiếu')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 z-[95] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Xác nhận xóa phiếu đề nghị</h3>
                <p className="text-xs text-slate-500">
                  Bạn có chắc chắn muốn xóa phiếu đề nghị số <b>{deleteTarget.so_phieu}</b> không?
                </p>
              </div>
            </div>
            <div className="bg-rose-50 text-rose-800 text-xs p-3 rounded-lg border border-rose-200">
              Thao tác này sẽ xóa toàn bộ thông tin phiếu và các dòng vật tư liên quan, không thể khôi phục.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-9 text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
