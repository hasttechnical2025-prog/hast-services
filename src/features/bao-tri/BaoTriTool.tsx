'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Download, Trash2, ChevronUp, ChevronDown, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MonthField from '@/components/MonthField'
import SoTheoDoiPrintButton, { printSoTheoDoiBatch } from '@/components/SoTheoDoiPrint'
import { useConfirm } from '@/components/ConfirmDialog'
import { useRealtimeRefetch } from '@/lib/useRealtime'
import { BAOTRI_TOPIC, DATA_EVENT } from '@/lib/realtime'
import { exportRowsToExcel } from '@/lib/excel'
import { LOAI_HD_BAO_TRI, canBaoTriThang, dangTamDung, nghiBaoTri, moTaLichBaoTri, doiChieuNam, thangDaToi, fmtThang, CELL_DA_LAM, CELL_THIEU, CELL_CHUA_TOI } from '@/lib/bao-tri'
import { usePaged, ListFrame, useColView, TableLoading, SearchInput, type ColDef } from '@/ui'

// Port NGUYÊN BaoTriTool từ admin/page.tsx (y hệt giao diện + nghiệp vụ). Chỉ đổi import sang
// helper dùng chung + thay ClearAllButton bằng xác nhận useConfirm.
function parseBaoTriInput(text: string): { ma_may: string, counter: string }[] {
  const out: { ma_may: string, counter: string }[] = []
  for (const line of String(text || '').split(/[\n\r]+/)) {
    const segs = line.split(/\t|\s*-\s*/).map(s => s.trim()).filter(Boolean)
    if (segs.length === 0) continue
    if (segs.length >= 2) {
      const ma = segs[0].split(/[\s,;]+/).filter(Boolean)[0]
      if (ma) out.push({ ma_may: ma, counter: segs.slice(1).join('').replace(/\D/g, '') })
    } else {
      for (const ma of segs[0].split(/[\s,;]+/).filter(Boolean)) out.push({ ma_may: ma, counter: '' })
    }
  }
  return out
}

// Khoá gom NHÓM bảo trì: theo cụm (ma_khach_cum) hoặc theo tên khách lẻ.
const groupKey = (c: any) => (c.ma_khach_cum && c.soct_khach_cum)
  ? `cum:${c.ma_khach_cum}`
  : `le:${String(c.ten_khach_hang || '').trim().toLowerCase()}`

const BAOTRI_COLS: ColDef[] = [
  { key: 'ma_may', label: 'Mã máy', locked: true },
  { key: 'khach', label: 'Khách hàng' },
  { key: 'model', label: 'Model' },
  { key: 'counter', label: 'Counter' },
  { key: 'xoa', label: 'Xóa', locked: true },
]

export function BaoTriTool({ customers, showNotification, canSub, role }: { customers: any[], showNotification: (type: 'success' | 'error', msg: string) => void, canSub?: (g: string) => boolean, role?: string }) {
  const canS = canSub || (() => true)
  const col = useColView('bao_tri', BAOTRI_COLS)
  const { confirm, confirmNode } = useConfirm()
  const [thangNam, setThangNam] = useState(new Date().toISOString().slice(0, 7))
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<{ ma_may: string, cust: any, excluded: boolean, counter: string, prev: number | null }[] | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subTab, setSubTab] = useState<'da_bao_tri' | 'chua_bao_tri' | 'tam_dung' | 'doi_chieu' | 'thong_ke'>('da_bao_tri')
  const [mainTab, setMainTab] = useState<'tra_cuu' | 'ds'>('tra_cuu')
  const active = (canS(subTab) ? subTab : ((['da_bao_tri', 'chua_bao_tri', 'tam_dung', 'doi_chieu', 'thong_ke'] as const).find(canS) ?? subTab))
  const [dcNam, setDcNam] = useState(String(new Date().getFullYear()))
  const [dcRecords, setDcRecords] = useState<any[]>([])
  const [dcLoading, setDcLoading] = useState(false)
  const [dcQ, setDcQ] = useState("")
  const [traMa, setTraMa] = useState('')
  const [traNam, setTraNam] = useState(String(new Date().getFullYear()))
  const [traRes, setTraRes] = useState<{ ma_may: string, months: Set<number>, counters: Map<number, number> } | null>(null)
  const [traLoading, setTraLoading] = useState(false)
  const tracuu = async () => {
    const ma = traMa.trim()
    if (!ma) return showNotification('error', 'Nhập mã máy để tra cứu')
    setTraLoading(true)
    try {
      const res = await fetch(`/api/admin/bao-tri?ma_may=${encodeURIComponent(ma)}&nam=${traNam}`)
      const j = await res.json()
      if (res.ok) {
        const counters = new Map<number, number>()
        for (const r of (j.data || [])) {
          if (r.counter == null) continue
          counters.set(parseInt(String(r.thang_nam).split('-')[1]), Number(r.counter))
        }
        setTraRes({ ma_may: ma, months: new Set((j.data || []).map((r: any) => parseInt(String(r.thang_nam).split('-')[1]))), counters })
      }
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setTraLoading(false) }
  }

  const customerByMaMay = new Map(customers.filter(c => c.ma_may).map(c => [String(c.ma_may).toLowerCase(), c]))
  const kept = preview ? preview.filter(p => !p.excluded) : []
  const unknownKept = kept.filter(p => !p.cust).length
  const daBaoTriSet = new Set(records.map((r: any) => String(r.ma_may).toLowerCase()))
  const dupKept = kept.filter(p => daBaoTriSet.has(p.ma_may.toLowerCase())).length

  const mayCanBaoTri = customers.filter(c => canBaoTriThang(c, thangNam))
  const chuaBaoTri = mayCanBaoTri.filter(c => !daBaoTriSet.has(String(c.ma_may).toLowerCase()))
  const tamDung = customers.filter(c => c.ma_may
    && LOAI_HD_BAO_TRI.includes(String(c.loai_hd || '').trim())
    && nghiBaoTri(c, thangNam))

  const fetchRecords = async (thang: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/bao-tri?thang_nam=${thang}`)
      const json = await res.json()
      setRecords(json.data || [])
    } catch {
      showNotification('error', "Không tải được dữ liệu bảo trì")
    } finally {
      setLoading(false)
    }
  }

  const [daSortField, setDaSortField] = useState<string>("ma_may")
  const [daSortAsc, setDaSortAsc] = useState<boolean>(true)
  const [daSearch, setDaSearch] = useState("") // tìm trong danh sách Đã bảo trì (mã máy / tên khách / model / địa chỉ)
  const handleDaSort = (field: string) => {
    if (daSortField === field) setDaSortAsc(prev => !prev)
    else { setDaSortField(field); setDaSortAsc(true) }
  }
  const sortedRecords = useMemo(() => {
    // Lọc theo từ khóa (không dấu): mã máy / tên khách / model / địa chỉ / vị trí
    const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    const kw = norm(daSearch.trim())
    const base = kw ? records.filter((r: any) => {
      const kh = customerByMaMay.get(String(r.ma_may).toLowerCase())
      return [r.ma_may, kh?.ten_khach_hang, kh?.model, kh?.dia_chi, kh?.vi_tri_dat_may].some(x => norm(x).includes(kw))
    }) : records
    const list = [...base]
    list.sort((a: any, b: any) => {
      let cmp = 0
      const khA = customerByMaMay.get(String(a.ma_may).toLowerCase())
      const khB = customerByMaMay.get(String(b.ma_may).toLowerCase())
      if (daSortField === 'ma_may') {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (daSortField === 'khach') {
        const tA = khA?.ten_khach_hang || ''
        const tB = khB?.ten_khach_hang || ''
        cmp = tA.localeCompare(tB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (daSortField === 'model') {
        const mA = String(khA?.model || '').trim()
        const mB = String(khB?.model || '').trim()
        if (!mA && mB) return 1
        if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (daSortField === 'counter') {
        cmp = (Number(a.counter) || 0) - (Number(b.counter) || 0)
      }
      if (cmp === 0) {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''))
      }
      return daSortAsc ? cmp : -cmp
    })
    return list
  }, [records, daSortField, daSortAsc, customers, daSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const [chuaSortField, setChuaSortField] = useState<string>("ma_may")
  const [chuaSortAsc, setChuaSortAsc] = useState<boolean>(true)
  const handleChuaSort = (field: string) => {
    if (chuaSortField === field) setChuaSortAsc(prev => !prev)
    else { setChuaSortField(field); setChuaSortAsc(true) }
  }
  const sortedChuaBaoTri = useMemo(() => {
    const list = [...chuaBaoTri]
    list.sort((a, b) => {
      let cmp = 0
      if (chuaSortField === 'ma_may') {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (chuaSortField === 'khach') {
        cmp = String(a.ten_khach_hang || '').localeCompare(String(b.ten_khach_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (chuaSortField === 'model') {
        const mA = String(a.model || '').trim()
        const mB = String(b.model || '').trim()
        if (!mA && mB) return 1
        if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (chuaSortField === 'lich') {
        const lA = moTaLichBaoTri(a.thang_bao_tri)
        const lB = moTaLichBaoTri(b.thang_bao_tri)
        cmp = lA.localeCompare(lB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (chuaSortField === 'loai_hd') {
        cmp = String(a.loai_hd || '').localeCompare(String(b.loai_hd || ''), 'vi')
      }
      if (cmp === 0) {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''))
      }
      return chuaSortAsc ? cmp : -cmp
    })
    return list
  }, [chuaBaoTri, chuaSortField, chuaSortAsc])

  const [tdSortField, setTdSortField] = useState<string>("ma_may")
  const [tdSortAsc, setTdSortAsc] = useState<boolean>(true)
  const handleTdSort = (field: string) => {
    if (tdSortField === field) setTdSortAsc(prev => !prev)
    else { setTdSortField(field); setTdSortAsc(true) }
  }
  const sortedTamDung = useMemo(() => {
    const list = [...tamDung]
    list.sort((a, b) => {
      let cmp = 0
      if (tdSortField === 'ma_may') {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (tdSortField === 'khach') {
        cmp = String(a.ten_khach_hang || '').localeCompare(String(b.ten_khach_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (tdSortField === 'model') {
        const mA = String(a.model || '').trim()
        const mB = String(b.model || '').trim()
        if (!mA && mB) return 1
        if (mA && !mB) return -1
        cmp = mA.localeCompare(mB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (tdSortField === 'tam_dung') {
        cmp = String(a.tam_dung_tu_thang || '').localeCompare(String(b.tam_dung_tu_thang || ''))
      } else if (tdSortField === 'ghi_chu') {
        cmp = String(a.ghi_chu_bao_tri || '').localeCompare(String(b.ghi_chu_bao_tri || ''), 'vi')
      }
      if (cmp === 0) {
        cmp = String(a.ma_may || '').localeCompare(String(b.ma_may || ''))
      }
      return tdSortAsc ? cmp : -cmp
    })
    return list
  }, [tamDung, tdSortField, tdSortAsc])

  const [tkSortField, setTkSortField] = useState<'ten' | 'so_may'>('so_may')
  const [tkSortAsc, setTkSortAsc] = useState<boolean>(false)
  const [tkQ, setTkQ] = useState("")
  const handleTkSort = (field: 'ten' | 'so_may') => {
    if (tkSortField === field) setTkSortAsc(p => !p)
    else { setTkSortField(field); setTkSortAsc(field === 'so_may' ? false : true) }
  }
  const tkStrip = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  const thongKeRows = useMemo(() => {
    // Gom theo NHÓM (cụm hoặc khách lẻ cùng tên). so_may = số máy HĐBT (hiển thị);
    // ids = TOÀN BỘ máy của nhóm (kể cả không HĐBT) để "Tạm hoãn" áp cho cả nhóm.
    // hdbt = mốc tạm hoãn CỤM của TỪNG máy HĐBT -> tính "đang tạm hoãn cả nhóm / một phần" ở lúc render.
    type Row = { key: string, ten: string, so_may: number, la_cum: boolean, ids: string[], hdbt: { tu: string | null, den: string | null }[] }
    const g = new Map<string, Row>()
    for (const c of customers) {
      if (!c.ma_may || !LOAI_HD_BAO_TRI.includes(String(c.loai_hd || '').trim())) continue
      const laCum = !!(c.ma_khach_cum && c.soct_khach_cum)
      const key = groupKey(c)
      const ten = laCum ? (c.soct_khach_cum.ten_khach_hang || c.ma_khach_cum) : (String(c.ten_khach_hang || '').trim() || '(không tên)')
      let row = g.get(key)
      if (!row) { row = { key, ten, so_may: 0, la_cum: laCum, ids: [], hdbt: [] }; g.set(key, row) }
      row.so_may++
      row.hdbt.push({ tu: c.tam_hoan_cum_tu_thang || null, den: c.tam_hoan_cum_den_thang || null })
    }
    // Gắn ids của TẤT CẢ máy (mọi loại HĐ) vào nhóm tương ứng để tạm hoãn áp cho cả nhóm.
    for (const c of customers) {
      if (!c.ma_may || c.id == null) continue
      const row = g.get(groupKey(c))
      if (row) row.ids.push(String(c.id))
    }
    return [...g.values()]
  }, [customers])
  const thongKeFiltered = useMemo(() => {
    const kw = tkStrip(tkQ).trim()
    const arr = kw ? thongKeRows.filter(r => tkStrip(r.ten).includes(kw)) : [...thongKeRows]
    arr.sort((a, b) => {
      let cmp = tkSortField === 'so_may' ? a.so_may - b.so_may : a.ten.localeCompare(b.ten, 'vi', { numeric: true, sensitivity: 'base' })
      if (cmp === 0) cmp = a.ten.localeCompare(b.ten, 'vi')
      return tkSortAsc ? cmp : -cmp
    })
    return arr
  }, [thongKeRows, tkQ, tkSortField, tkSortAsc]) // eslint-disable-line react-hooks/exhaustive-deps
  const thongKeTongMay = useMemo(() => thongKeFiltered.reduce((s, r) => s + r.so_may, 0), [thongKeFiltered])
  const exportThongKe = () => {
    const rows = [['Khách hàng', 'Số lượng máy', 'Phân loại'], ...thongKeFiltered.map(r => [r.ten, String(r.so_may), r.la_cum ? 'Cụm' : 'Máy lẻ'])]
    const csv = '﻿' + rows.map(row => row.map(cell => { const s = String(cell ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'thong-ke-bao-tri-theo-cum.csv'; a.click(); URL.revokeObjectURL(url)
  }

  // ── Tạm hoãn bảo trì CẢ NHÓM (cụm / khách lẻ) trong một khoảng tháng ──
  const canTamHoan = role === 'admin' || role === 'tech_admin'
  const [hoanRow, setHoanRow] = useState<{ ten: string, ids: string[], tam_tu: string | null, tam_den: string | null } | null>(null)
  const [hoanTu, setHoanTu] = useState('')
  const [hoanDen, setHoanDen] = useState('')
  const [hoanBusy, setHoanBusy] = useState(false)
  const openHoan = (r: { ten: string, ids: string[], tam_tu: string | null, tam_den: string | null }) => {
    setHoanRow(r)
    setHoanTu(r.tam_tu || new Date().toISOString().slice(0, 7))
    setHoanDen(r.tam_den || '')
  }
  const postHoan = async (body: any, okMsg: string) => {
    if (!hoanRow) return
    setHoanBusy(true)
    try {
      const res = await fetch('/api/admin/bao-tri/tam-hoan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: hoanRow.ids, ...body }),
      })
      const j = await res.json()
      if (res.ok) { showNotification('success', okMsg); setHoanRow(null) }
      else showNotification('error', j.error || 'Lỗi tạm hoãn')
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setHoanBusy(false) }
  }
  const applyHoan = () => {
    if (!/^\d{4}-\d{2}$/.test(hoanTu)) return showNotification('error', 'Chọn tháng bắt đầu tạm hoãn')
    if (hoanDen && hoanDen < hoanTu) return showNotification('error', 'Tháng kết thúc phải sau hoặc bằng tháng bắt đầu')
    postHoan({ tu: hoanTu, den: hoanDen || null },
      `Đã tạm hoãn bảo trì nhóm "${hoanRow?.ten}" (${hoanRow?.ids.length} máy).`)
  }
  const clearHoan = () => postHoan({ clear: true }, `Đã bỏ tạm hoãn bảo trì nhóm "${hoanRow?.ten}".`)

  useEffect(() => { fetchRecords(thangNam) }, [thangNam]) // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeRefetch(BAOTRI_TOPIC, DATA_EVENT, () => fetchRecords(thangNam))
  const paged = usePaged(sortedRecords)
  const chuaBaoTriPaged = usePaged(sortedChuaBaoTri)
  const tamDungPaged = usePaged(sortedTamDung)
  const tkPaged = usePaged(thongKeFiltered, 'baotri-tk')

  const fetchDoiChieu = async (nam: string) => {
    setDcLoading(true)
    try {
      const res = await fetch(`/api/admin/bao-tri?nam=${nam}`)
      const j = await res.json()
      if (res.ok) setDcRecords(j.data || [])
      else showNotification('error', j.error)
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setDcLoading(false) }
  }
  useEffect(() => { if (active === 'doi_chieu' && /^\d{4}$/.test(dcNam)) fetchDoiChieu(dcNam) }, [active, dcNam]) // eslint-disable-line react-hooks/exhaustive-deps

  const doneByMay = (() => {
    const m = new Map<string, Set<number>>()
    for (const r of dcRecords) {
      const k = String(r.ma_may || '').toLowerCase()
      if (!k) continue
      if (!m.has(k)) m.set(k, new Set())
      m.get(k)!.add(parseInt(String(r.thang_nam).split('-')[1], 10))
    }
    return m
  })()

  const dcDenThang = thangDaToi(parseInt(dcNam, 10))
  const dcRows = customers
    .filter(c => c.ma_may && LOAI_HD_BAO_TRI.includes(String(c.loai_hd || '').trim()))
    .map(c => ({ c, ...doiChieuNam(c, parseInt(dcNam, 10), doneByMay.get(String(c.ma_may).toLowerCase()) || new Set<number>(), dcDenThang) }))
    .sort((a, b) => String(a.c.ten_khach_hang || '').localeCompare(String(b.c.ten_khach_hang || ''), 'vi'))

  const [dcSortField, setDcSortField] = useState<string>("khach")
  const [dcSortAsc, setDcSortAsc] = useState<boolean>(true)
  const handleDcSort = (field: string) => {
    if (dcSortField === field) setDcSortAsc(prev => !prev)
    else { setDcSortField(field); setDcSortAsc(true) }
  }

  const dcQq = dcQ.trim().toLowerCase()
  const dcFiltered = useMemo(() => {
    const base = dcQq
      ? dcRows.filter(r => `${r.c.ten_khach_hang || ''} ${r.c.ma_may || ''} ${r.c.model || ''}`.toLowerCase().includes(dcQq))
      : dcRows
    const list = [...base]
    list.sort((a, b) => {
      let cmp = 0
      if (dcSortField === 'ma_may') {
        cmp = String(a.c.ma_may || '').localeCompare(String(b.c.ma_may || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (dcSortField === 'khach') {
        cmp = String(a.c.ten_khach_hang || '').localeCompare(String(b.c.ten_khach_hang || ''), 'vi', { numeric: true, sensitivity: 'base' })
      } else if (dcSortField === 'lich') {
        const lA = moTaLichBaoTri(a.c.thang_bao_tri)
        const lB = moTaLichBaoTri(b.c.thang_bao_tri)
        cmp = lA.localeCompare(lB, 'vi', { numeric: true, sensitivity: 'base' })
      } else if (dcSortField === 'theo_hd') {
        cmp = (Number(a.theo_hd) || 0) - (Number(b.theo_hd) || 0)
      } else if (dcSortField === 'da_lam') {
        cmp = (Number(a.da_lam) || 0) - (Number(b.da_lam) || 0)
      } else if (dcSortField === 'thieu') {
        cmp = (Number(a.thieu) || 0) - (Number(b.thieu) || 0)
      } else if (dcSortField === 'con_lai') {
        cmp = (Number(a.con_lai) || 0) - (Number(b.con_lai) || 0)
      }
      if (cmp === 0) {
        cmp = String(a.c.ma_may || '').localeCompare(String(b.c.ma_may || ''))
      }
      return dcSortAsc ? cmp : -cmp
    })
    return list
  }, [dcRows, dcQq, dcSortField, dcSortAsc]) // eslint-disable-line react-hooks/exhaustive-deps
  const dcPaged = usePaged(dcFiltered)
  const dcTong = dcFiltered.reduce((s, r) => ({ theo_hd: s.theo_hd + r.theo_hd, da_lam: s.da_lam + r.da_lam, thieu: s.thieu + r.thieu, con_lai: s.con_lai + r.con_lai }), { theo_hd: 0, da_lam: 0, thieu: 0, con_lai: 0 })

  const exportDoiChieu = async () => {
    const headers = ['Mã máy', 'Khách hàng', 'Model', 'Loại HĐ', 'Lịch bảo trì',
      ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
      'Số lần theo HĐ', 'Đã làm', 'Thiếu (quá hạn)', 'Còn lại (chưa tới)', 'Tạm dừng từ', 'Ghi chú']
    const rows = dcFiltered.map(r => [
      r.c.ma_may, r.c.ten_khach_hang, r.c.model || '', r.c.loai_hd || '', moTaLichBaoTri(r.c.thang_bao_tri),
      ...r.cells, r.theo_hd, r.da_lam, r.thieu, r.con_lai, fmtThang(r.c.tam_dung_tu_thang), r.c.ghi_chu_bao_tri || '',
    ])
    await exportRowsToExcel(`doi-chieu-bao-tri-${dcNam}`, headers, rows)
  }

  const [batchBusy, setBatchBusy] = useState(false)
  const inHangLoatSo = async () => {
    const mays = dcFiltered.map(r => r.c)
    if (!mays.length) return
    setBatchBusy(true)
    try {
      const res = await printSoTheoDoiBatch(mays, window.location.origin)
      if (!res.ok) showNotification('error', res.err || 'Không in được')
      else showNotification('success', `Đã dựng ${res.n} sổ để in (mỗi máy 2 trang).`)
    } finally { setBatchBusy(false) }
  }

  const xuatBaoTriExcel = async () => {
    const headers = ['Mã máy', 'Khách hàng', 'Model', 'Counter', 'Ngày ghi nhận']
    // Xuất đúng danh sách ĐANG hiển thị (đã lọc + sắp xếp)
    const rows = sortedRecords.map((r: any) => {
      const kh = customerByMaMay.get(String(r.ma_may).toLowerCase())
      return [r.ma_may, kh?.ten_khach_hang || '', kh?.model || '', r.counter ?? '', r.ngay ? formatDate(r.ngay) : '']
    })
    await exportRowsToExcel(`bao-tri-${thangNam}`, headers, rows)
  }

  const handleAnalyze = async () => {
    const seen = new Set<string>()
    const list: { ma_may: string, cust: any, excluded: boolean, counter: string, prev: number | null }[] = []
    for (const it of parseBaoTriInput(text)) {
      const key = it.ma_may.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ ma_may: it.ma_may, cust: customerByMaMay.get(key) || null, excluded: false, counter: it.counter, prev: null })
    }
    if (list.length === 0) return showNotification('error', "Nhập ít nhất một mã máy")

    try {
      const res = await fetch(`/api/admin/bao-tri?nam=${thangNam.slice(0, 4)}`)
      const j = await res.json()
      const last = new Map<string, { thang: string, counter: number }>()
      for (const r of (j.data || [])) {
        if (r.counter == null) continue
        const t = String(r.thang_nam)
        if (t >= thangNam) continue
        const k = String(r.ma_may).toLowerCase()
        const cur = last.get(k)
        if (!cur || t > cur.thang) last.set(k, { thang: t, counter: Number(r.counter) })
      }
      for (const p of list) { const l = last.get(p.ma_may.toLowerCase()); p.prev = l ? l.counter : null }
    } catch { /* không có counter cũ thì thôi, vẫn cho nhập */ }

    setPreview(list)
  }

  const toggleExclude = (i: number) => {
    setPreview(prev => prev ? prev.map((p, idx) => idx === i ? { ...p, excluded: !p.excluded } : p) : prev)
  }
  const setRowCounter = (i: number, v: string) => {
    setPreview(prev => prev ? prev.map((p, idx) => idx === i ? { ...p, counter: v.replace(/\D/g, '') } : p) : prev)
  }

  const handleSave = async () => {
    if (!preview) return
    const items = preview.filter(p => !p.excluded).map(p => ({ ma_may: p.ma_may, counter: p.counter || null }))
    if (items.length === 0) return showNotification('error', "Không còn mã nào để lưu")
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bao-tri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang_nam: thangNam, items })
      })
      if (res.ok) {
        const data = await res.json()
        showNotification('success', `Đã đánh dấu ${data.count} máy bảo trì tháng ${thangNam.split('-').reverse().join('/')}.`)
        setText(""); setPreview(null)
        fetchRecords(thangNam)
      } else {
        const err = await res.json()
        showNotification('error', err.error)
      }
    } catch {
      showNotification('error', "Lỗi kết nối!")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/bao-tri?id=${id}`, { method: 'DELETE' })
      if (res.ok) fetchRecords(thangNam)
      else showNotification('error', "Xóa không thành công")
    } catch {
      showNotification('error', "Lỗi kết nối!")
    }
  }

  const xoaTatCaThang = async () => {
    if (!(await confirm(`Xóa TOÀN BỘ ${records.length} bản ghi bảo trì tháng ${thangNam.split('-').reverse().join('/')}?\nHành động này không thể hoàn tác.`, { confirmLabel: 'Xóa tất cả', danger: true }))) return
    const res = await fetch(`/api/admin/bao-tri?all=1&thang_nam=${thangNam}`, { method: 'DELETE' })
    if (res.ok) { showNotification('success', 'Đã xóa toàn bộ bảo trì tháng này.'); fetchRecords(thangNam) } else showNotification('error', 'Xóa không thành công')
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 bg-slate-200 -mx-2 px-2 flex gap-1 border-b border-slate-200">
        <button onClick={() => setMainTab('tra_cuu')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${mainTab === 'tra_cuu' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Tra cứu &amp; Nhập liệu</button>
        <button onClick={() => setMainTab('ds')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${mainTab === 'ds' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Danh sách</button>
      </div>
      {mainTab === 'tra_cuu' && (
      <>
      <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Tra cứu lịch sử bảo trì theo mã máy</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã máy</label>
            <div className="relative w-40">
              <Input value={traMa} onChange={e => setTraMa(e.target.value)} placeholder="VD: 35816" className="bg-white pr-7 h-9 text-xs" />
              {traMa && (
                <button type="button" onClick={() => setTraMa('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa mã máy">✕</button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Năm</label>
            <Input value={traNam} onChange={e => setTraNam(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} className="bg-white w-24 h-9 text-xs" />
          </div>
          <Button onClick={tracuu} disabled={traLoading} title="Tra cứu lịch sử bảo trì" className="h-9 px-3 text-xs font-semibold gap-1.5">{traLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Tra cứu</Button>
        </div>
        {traRes && (() => {
          const cust = customerByMaMay.get(traRes.ma_may.toLowerCase())
          return (
            <div className="space-y-2">
              <div className="text-sm text-slate-600">
                Máy <b className="font-mono">{traRes.ma_may}</b>
                {cust ? <> — {cust.ten_khach_hang}{cust.model && <span className="text-slate-500"> · model <b className="text-slate-700">{cust.model}</b></span>}{cust.loai_hd && <span className="text-slate-400"> · {cust.loai_hd}</span>}</> : ' — (không có trong Khách hàng)'}
                {' · '}năm {traNam} · <b className="text-emerald-700">{traRes.months.size}/12 tháng</b>
              </div>
              {cust && LOAI_HD_BAO_TRI.includes(String(cust.loai_hd || '').trim()) && (
                <div><SoTheoDoiPrintButton may={cust} showNotification={showNotification} /></div>
              )}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const ok = traRes.months.has(m)
                  return (
                    <div key={m} className={`rounded-md border text-center py-2 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                      <div className="t3 font-semibold">T{m}</div>
                      <div className="text-sm font-bold">{ok ? '✓' : '✗'}</div>
                    </div>
                  )
                })}
              </div>
              {traRes.counters.size > 0 && (() => {
                const ms = [...traRes.counters.keys()].sort((a, b) => a - b)
                return (
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-md">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr><th className="px-3 py-2 font-medium">Tháng</th><th className="px-3 py-2 font-medium text-right">Counter</th><th className="px-3 py-2 font-medium text-right">Chênh lệch</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ms.map((m, idx) => {
                          const cur = traRes.counters.get(m)!
                          const prev = idx > 0 ? traRes.counters.get(ms[idx - 1])! : null
                          const d = prev != null ? cur - prev : null
                          return (
                            <tr key={m}>
                              <td className="px-3 py-1.5 font-medium">T{m}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{cur.toLocaleString('vi-VN')}</td>
                              <td className={`px-3 py-1.5 text-right font-mono ${d == null ? 'text-slate-300' : d < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700'}`}>
                                {d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toLocaleString('vi-VN')}`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )
        })()}
      </div>

      <div className="border border-slate-200 rounded-lg p-6 bg-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tháng bảo trì</label>
            <MonthField value={thangNam} onChange={setThangNam} className="h-9 px-3 text-xs w-44" />
          </div>
          <p className="text-sm text-slate-500 flex-1">
            Dán danh sách <b>mã máy</b> đã bảo trì trong tháng (cách nhau bởi xuống dòng, dấu phẩy hoặc khoảng trắng).<br />
            <span className="text-xs text-slate-400">Muốn ghi kèm <b>counter</b>: mỗi dòng <b>mã máy</b> rồi <b>TAB</b> (dán thẳng 2 cột từ Excel) hoặc dấu <b>-</b>, VD <span className="font-mono">35971 - 125000</span>. Counter để trống cũng được.</span>
          </p>
        </div>
        <textarea rows={4} className="w-full p-3 rounded-md border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" placeholder="VD: 35971 36068 36084..." value={text} onChange={(e) => { setText(e.target.value); setPreview(null) }} />

        {!preview ? (
          <Button onClick={handleAnalyze} variant="outline" className="h-9 text-xs">Phân tích ({parseBaoTriInput(text).length} mã)</Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="text-emerald-700 font-medium">{kept.length} mã sẽ lưu</span>
              {unknownKept > 0 && <span className="text-red-600 font-medium">⚠ {unknownKept} mã lạ (không khớp khách hàng)</span>}
              {dupKept > 0 && <span className="text-amber-600 font-medium">⚠ {dupKept} mã đã bảo trì tháng này (trùng)</span>}
              {preview.length - kept.length > 0 && <span className="text-slate-400">· {preview.length - kept.length} mã đã bỏ</span>}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto bg-white">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
                  <tr><th className="px-3 py-2 font-medium text-center w-12">Bỏ</th><th className="px-3 py-2 font-medium">Mã máy</th><th className="px-3 py-2 font-medium">Khách hàng</th><th className="px-3 py-2 font-medium">HĐBT</th><th className="px-3 py-2 font-medium">Counter</th><th className="px-3 py-2 font-medium">So với lần trước</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((p, i) => {
                    const daBaoTri = daBaoTriSet.has(p.ma_may.toLowerCase())
                    const cNum = p.counter ? parseInt(p.counter, 10) : null
                    const delta = (cNum != null && p.prev != null) ? cNum - p.prev : null
                    const lui = delta != null && delta < 0
                    const nhay = delta != null && delta > 1000000
                    return (
                    <tr key={i} className={p.excluded ? 'opacity-40 line-through' : (!p.cust ? 'bg-red-50' : (daBaoTri ? 'bg-amber-50' : ''))}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={p.excluded} onChange={() => toggleExclude(i)} className="w-4 h-4 accent-red-500 no-underline" title="Tick để bỏ mã này, không lưu" />
                      </td>
                      <td className="px-3 py-2 font-mono font-medium">{p.ma_may}{daBaoTri && <span className="ml-1.5 text-amber-600 font-normal">(đã bảo trì)</span>}</td>
                      <td className="px-3 py-2">{p.cust ? p.cust.ten_khach_hang : <span className="text-red-600 font-medium">Không khớp — có thể nhập sai</span>}</td>
                      <td className="px-3 py-2">{p.cust ? (p.cust.loai_hd || <span className="text-slate-300">—</span>) : ''}</td>
                      <td className="px-3 py-2">
                        <Input value={p.counter ? Number(p.counter).toLocaleString('vi-VN') : ''} onChange={e => setRowCounter(i, e.target.value)} placeholder="—" className="h-7 w-28 bg-white font-mono text-xs text-right" title="Chỉ số counter lúc bảo trì (để trống nếu không đọc được)" />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {cNum == null ? <span className="text-slate-300">—</span>
                          : p.prev == null ? <span className="text-slate-400">lần đầu có số</span>
                            : <span className={lui ? 'text-red-600 font-semibold' : nhay ? 'text-amber-600 font-semibold' : 'text-emerald-700'}>
                              {delta! >= 0 ? '+' : ''}{delta!.toLocaleString('vi-VN')}
                              {lui && ' ⚠ lùi số'}{nhay && ' ⚠ nhảy bất thường'}
                            </span>}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || kept.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Đang lưu..." : `Xác nhận lưu ${kept.length} mã`}
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)}>Sửa lại</Button>
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {mainTab === 'ds' && (
      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto w-full max-w-full sticky top-10 z-20 bg-slate-200 pt-1">
          {canS('da_bao_tri') && <button onClick={() => setSubTab('da_bao_tri')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${active === 'da_bao_tri' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Đã bảo trì tháng {thangNam.split('-').reverse().join('/')} ({records.length} máy)
          </button>}
          {canS('chua_bao_tri') && <button onClick={() => setSubTab('chua_bao_tri')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${active === 'chua_bao_tri' ? 'border-amber-500 text-amber-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Chưa bảo trì tháng {thangNam.split('-').reverse().join('/')} ({chuaBaoTri.length} máy)
          </button>}
          {canS('tam_dung') && <button onClick={() => setSubTab('tam_dung')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${active === 'tam_dung' ? 'border-slate-500 text-slate-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Tạm dừng ({tamDung.length} máy)
          </button>}
          {canS('doi_chieu') && <button onClick={() => setSubTab('doi_chieu')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${active === 'doi_chieu' ? 'border-emerald-600 text-emerald-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Đối chiếu năm
          </button>}
          {canS('thong_ke') && <button onClick={() => setSubTab('thong_ke')} className={`px-4 py-2 font-medium text-sm transition whitespace-nowrap border-b-2 ${active === 'thong_ke' ? 'border-indigo-600 text-indigo-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            HĐBT cụm
          </button>}
        </div>

        {active === 'thong_ke' ? (
          <ListFrame paged={tkPaged} unit="khách"
            aboveTable={<p className="t2 text-slate-400">Gộp theo <b>khách cụm</b>; máy chưa gán cụm = <b>máy lẻ</b>. Chỉ tính HĐ bảo trì ({LOAI_HD_BAO_TRI.join(', ')}).</p>}
            toolbar={
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-600">
                <b className="text-indigo-700">{thongKeFiltered.length}</b> khách · <b className="text-indigo-700">{thongKeTongMay.toLocaleString('vi-VN')}</b> máy HĐ bảo trì
              </div>
              <SearchInput value={tkQ} onChange={setTkQ} placeholder="Tìm tên khách / cụm…" className="w-full sm:w-72" />
              <Button onClick={exportThongKe} disabled={thongKeFiltered.length === 0} title={`Xuất thống kê cụm (${thongKeFiltered.length} khách)`} variant="outline" className="h-9 px-3 gap-1.5 text-xs ml-auto shrink-0">
                <Download className="w-4 h-4" /> Xuất thống kê cụm
              </Button>
            </div>
          }>
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 select-none">
                  <tr>
                    <th onClick={() => handleTkSort('ten')} className={`px-3 py-2 cursor-pointer transition-colors hover:bg-slate-100 ${tkSortField === 'ten' ? 'text-blue-600 bg-blue-50/60' : ''}`}>
                      <span className="inline-flex items-center gap-1">Khách hàng {tkSortField === 'ten' && (tkSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</span>
                    </th>
                    <th onClick={() => handleTkSort('so_may')} className={`px-3 py-2 text-right w-32 cursor-pointer transition-colors hover:bg-slate-100 ${tkSortField === 'so_may' ? 'text-blue-600 bg-blue-50/60' : ''}`}>
                      <span className="inline-flex items-center gap-1 justify-end">Số lượng {tkSortField === 'so_may' && (tkSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</span>
                    </th>
                    {canTamHoan && <th className="px-3 py-2 text-center w-40">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {thongKeFiltered.length === 0 ? (
                    <tr><td colSpan={canTamHoan ? 3 : 2} className="px-4 py-8 text-center text-slate-400">{thongKeRows.length === 0 ? 'Chưa có máy HĐ bảo trì nào.' : 'Không có khách khớp tìm kiếm.'}</td></tr>
                  ) : tkPaged.pageItems.map(r => {
                    const paused = r.hdbt.filter(m => dangTamDung(m.tu, thangNam, m.den))
                    const full = r.so_may > 0 && paused.length === r.so_may // cả nhóm đang tạm hoãn
                    const partial = paused.length > 0 && paused.length < r.so_may // chỉ 1 phần
                    const rep = paused[0] || { tu: null, den: null } // mốc đại diện để prefill modal
                    const repTitle = rep.tu ? `Tạm hoãn từ ${fmtThang(rep.tu)}${rep.den ? ` đến ${fmtThang(rep.den)}` : ' (vô hạn)'}` : ''
                    return (
                    <tr key={r.key} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-800">
                        {r.ten}{!r.la_cum && <span className="ml-1.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-100 text-slate-500 align-middle">máy lẻ</span>}
                        {full && <span className="ml-1.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700 align-middle" title={repTitle}>tạm hoãn cả nhóm</span>}
                        {partial && <span className="ml-1.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-sky-100 text-sky-700 align-middle" title={`${paused.length}/${r.so_may} máy đang tạm hoãn`}>tạm hoãn {paused.length}/{r.so_may}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.so_may.toLocaleString('vi-VN')}</td>
                      {canTamHoan && <td className="px-3 py-1.5 text-center">
                        <button onClick={() => openHoan({ ten: r.ten, ids: r.ids, tam_tu: rep.tu, tam_den: rep.den })} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition ${full ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`} title={full ? 'Cả nhóm đang tạm hoãn — bấm để chỉnh/bỏ' : 'Tạm hoãn bảo trì cả nhóm'}>
                          <PauseCircle className="w-3.5 h-3.5" /> {full ? 'Đang tạm hoãn' : 'Tạm hoãn'}
                        </button>
                      </td>}
                    </tr>
                  )})}
                </tbody>
              </table>
          </ListFrame>
        ) : active === 'doi_chieu' ? (
          <ListFrame paged={!dcLoading && dcFiltered.length > 0 ? dcPaged : undefined} unit="máy"
            aboveTable={<>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span><b className="text-emerald-700">✓</b> đã bảo trì</span>
                <span><b className="text-amber-600">x</b> quá hạn (tháng đã qua mà chưa làm)</span>
                <span><b className="text-slate-400">·</b> theo lịch, chưa tới tháng</span>
                <span><b className="text-slate-500">–</b> chưa có máy (lắp sau)</span>
                <span><b className="text-slate-500">N</b> đã tạm dừng theo dõi</span>
                <span>ô trống = không nằm trong lịch</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">Theo HĐ cả năm: {dcTong.theo_hd} lượt</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Đã làm: {dcTong.da_lam} lượt</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Thiếu (quá hạn): {dcTong.thieu} lượt</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">Còn lại: {dcTong.con_lai} lượt</span>
              </div>
              {dcDenThang > 0 && dcDenThang < 12 && (
                <p className="text-xs text-slate-400 mt-1.5">Đang xem năm hiện tại — &quot;Thiếu&quot; chỉ tính tới <b>tháng {dcDenThang}</b>; các tháng sau ghi <b>·</b> (chưa tới) và nằm ở cột &quot;Còn lại&quot;.</p>
              )}
            </>}
            toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Năm</label>
                <Input value={dcNam} onChange={(e) => setDcNam(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} className="bg-white w-24 h-9 text-xs" />
              </div>
              <div className="space-y-1 flex-1 min-w-[200px]">
                <label className="text-xs font-semibold text-slate-600">Tìm khách hàng / mã máy</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={dcQ} onChange={(e) => setDcQ(e.target.value)} placeholder="Gõ tên khách để đối chiếu riêng..." className="pl-9 pr-7 bg-white h-9 text-xs" />
                  {dcQ && (<button type="button" onClick={() => setDcQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold" title="Xóa tìm kiếm">✕</button>)}
                </div>
              </div>
              <Button variant="outline" onClick={exportDoiChieu} disabled={dcLoading || dcFiltered.length === 0} title={`Xuất đối chiếu năm (${dcFiltered.length} máy)`} className="h-9 px-3 gap-1.5 text-xs">
                <Download className="w-4 h-4" /> Xuất đối chiếu năm
              </Button>
              <Button variant="outline" onClick={inHangLoatSo} disabled={dcLoading || batchBusy || dcFiltered.length === 0} title={`In hàng loạt sổ theo dõi máy — tất cả ${dcFiltered.length} máy đang lọc (mỗi máy 2 trang A4 ngang)`} className="h-9 px-3 gap-1.5 text-xs">
                🖨 {batchBusy ? 'Đang dựng…' : `In sổ (${dcFiltered.length})`}
              </Button>
            </div>
          }>
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                    <tr>
                      <th onClick={() => handleDcSort('ma_may')} className={`px-3 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Mã máy</span>{dcSortField === 'ma_may' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleDcSort('khach')} className={`px-3 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'khach' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Khách hàng</span>{dcSortField === 'khach' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleDcSort('lich')} className={`px-3 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'lich' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Lịch</span>{dcSortField === 'lich' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (<th key={m} className="px-1 py-3 font-semibold text-center w-8">T{m}</th>))}
                      <th onClick={() => handleDcSort('theo_hd')} className={`px-2 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'theo_hd' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center justify-center gap-1"><span>Theo HĐ</span>{dcSortField === 'theo_hd' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleDcSort('da_lam')} className={`px-2 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'da_lam' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center justify-center gap-1"><span>Đã làm</span>{dcSortField === 'da_lam' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleDcSort('thieu')} className={`px-2 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'thieu' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center justify-center gap-1"><span>Thiếu</span>{dcSortField === 'thieu' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleDcSort('con_lai')} className={`px-2 py-3 font-semibold text-center cursor-pointer select-none transition-colors hover:bg-slate-100 ${dcSortField === 'con_lai' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center justify-center gap-1"><span>Còn lại</span>{dcSortField === 'con_lai' && (dcSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dcLoading ? (
                      <TableLoading colSpan={19} label={`Đang tải dữ liệu năm ${dcNam}...`} />
                    ) : dcFiltered.length === 0 ? (
                      <tr><td colSpan={19} className="px-4 py-8 text-center text-slate-400">Không có máy HĐBT/MF nào khớp.</td></tr>
                    ) : dcPaged.pageItems.map((r) => (
                      <tr key={r.c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 font-mono font-medium text-slate-700 whitespace-nowrap">{r.c.ma_may}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {r.c.ten_khach_hang}
                          {r.c.tam_dung_tu_thang && <span className="ml-1 text-xs text-slate-400">(tạm dừng {fmtThang(r.c.tam_dung_tu_thang)})</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{moTaLichBaoTri(r.c.thang_bao_tri)}</td>
                        {r.cells.map((cell: string, i: number) => (
                          <td key={i} className={`px-1 py-2 text-center font-bold ${cell === CELL_DA_LAM ? 'text-emerald-600' : cell === CELL_THIEU ? 'text-amber-600' : cell === CELL_CHUA_TOI ? 'text-slate-300' : 'text-slate-400'}`}>{cell}</td>
                        ))}
                        <td className="px-2 py-2 text-center text-slate-600">{r.theo_hd}</td>
                        <td className="px-2 py-2 text-center font-semibold text-emerald-700">{r.da_lam}</td>
                        <td className={`px-2 py-2 text-center font-semibold ${r.thieu > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{r.thieu}</td>
                        <td className="px-2 py-2 text-center text-slate-400">{r.con_lai || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          </ListFrame>
        ) : active === 'tam_dung' ? (
          <ListFrame paged={tamDung.length > 0 ? tamDungPaged : undefined} unit="máy"
            aboveTable={<p className="text-xs text-slate-500">Máy khách đã bỏ nhưng còn trong hợp đồng — <b>không bị đòi bảo trì</b> nhưng vẫn giữ để đối chiếu cuối năm. Bỏ tạm dừng bằng cách xóa ô &quot;Tạm dừng từ tháng&quot; trong Danh sách khách hàng.</p>}>
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
                    <tr>
                      <th onClick={() => handleTdSort('ma_may')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${tdSortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Mã máy</span>{tdSortField === 'ma_may' && (tdSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleTdSort('khach')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${tdSortField === 'khach' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Khách hàng</span>{tdSortField === 'khach' && (tdSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleTdSort('model')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${tdSortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Model</span>{tdSortField === 'model' && (tdSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleTdSort('tam_dung')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${tdSortField === 'tam_dung' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Tạm dừng từ</span>{tdSortField === 'tam_dung' && (tdSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                      <th onClick={() => handleTdSort('ghi_chu')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${tdSortField === 'ghi_chu' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Ghi chú</span>{tdSortField === 'ghi_chu' && (tdSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tamDung.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Không có máy nào đang tạm dừng theo dõi bảo trì.</td></tr>
                    ) : tamDungPaged.pageItems.map((kh: any) => (
                      <tr key={kh.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{kh.ma_may}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{kh.ten_khach_hang}</td>
                        <td className="px-4 py-3 text-slate-500">{kh.model || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200">{fmtThang(kh.tam_dung_tu_thang)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{kh.ghi_chu_bao_tri || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          </ListFrame>
        ) : active === 'da_bao_tri' ? (
          <ListFrame paged={sortedRecords.length > 0 ? paged : undefined} unit="máy" toolbar={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchInput value={daSearch} onChange={setDaSearch} placeholder="Tìm mã máy / tên khách / model…" className="w-full sm:w-72" />
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" onClick={xuatBaoTriExcel} disabled={sortedRecords.length === 0} title={`Xuất Excel (${sortedRecords.length} máy)`} className="h-9 px-3 gap-1.5 text-xs">
                  <Download className="w-4 h-4" /> Xuất DS đã bảo trì
                </Button>
                <Button variant="outline" onClick={xoaTatCaThang} disabled={records.length === 0} title="Xóa toàn bộ bảo trì tháng này" className="h-9 px-3 gap-1.5 text-xs border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400">
                  <Trash2 className="w-4 h-4" /> Xóa toàn bộ
                </Button>
              </div>
            </div>
          }>
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
                  <tr>
                    {col.show('ma_may') && (
                      <th onClick={() => handleDaSort('ma_may')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${daSortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Mã máy</span>{daSortField === 'ma_may' && (daSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    )}
                    {col.show('khach') && (
                      <th onClick={() => handleDaSort('khach')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${daSortField === 'khach' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Khách hàng</span>{daSortField === 'khach' && (daSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    )}
                    {col.show('model') && (
                      <th onClick={() => handleDaSort('model')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${daSortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center gap-1"><span>Model</span>{daSortField === 'model' && (daSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    )}
                    {col.show('counter') && (
                      <th onClick={() => handleDaSort('counter')} className={`px-4 py-3 font-semibold text-right cursor-pointer select-none transition-colors hover:bg-slate-100 ${daSortField === 'counter' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                        <div className="flex items-center justify-end gap-1"><span>Counter</span>{daSortField === 'counter' && (daSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                      </th>
                    )}
                    {col.show('xoa') && <th className="px-4 py-3 font-semibold text-center w-20">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && records.length === 0 ? (
                    <TableLoading colSpan={4} label="Đang tải danh sách..." />
                  ) : records.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có máy nào được đánh dấu bảo trì tháng này.</td></tr>
                  ) : sortedRecords.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Không tìm thấy máy khớp &quot;{daSearch}&quot;.</td></tr>
                  ) : paged.pageItems.map((r) => {
                    const kh = customerByMaMay.get(String(r.ma_may).toLowerCase())
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        {col.show('ma_may') && <td className="px-4 py-3 font-mono font-medium text-slate-700">{r.ma_may}</td>}
                        {col.show('khach') && <td className="px-4 py-3">{kh ? kh.ten_khach_hang : <span className="text-slate-400 italic">Không khớp khách hàng</span>}</td>}
                        {col.show('model') && <td className="px-4 py-3 text-slate-500">{kh ? kh.model || '—' : '—'}</td>}
                        {col.show('counter') && <td className="px-4 py-3 text-right font-mono text-slate-600">{r.counter != null ? Number(r.counter).toLocaleString('vi-VN') : <span className="text-slate-300">—</span>}</td>}
                        {col.show('xoa') && <td className="px-4 py-3 text-center">
                          <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 hover:bg-red-100 rounded-md transition"><Trash2 className="w-4 h-4" /></button>
                        </td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          </ListFrame>
        ) : (
          <ListFrame paged={chuaBaoTri.length > 0 ? chuaBaoTriPaged : undefined} unit="máy">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200 shadow-sm">
                  <tr>
                    <th onClick={() => handleChuaSort('ma_may')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${chuaSortField === 'ma_may' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                      <div className="flex items-center gap-1"><span>Mã máy</span>{chuaSortField === 'ma_may' && (chuaSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                    </th>
                    <th onClick={() => handleChuaSort('khach')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${chuaSortField === 'khach' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                      <div className="flex items-center gap-1"><span>Khách hàng</span>{chuaSortField === 'khach' && (chuaSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                    </th>
                    <th onClick={() => handleChuaSort('model')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${chuaSortField === 'model' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                      <div className="flex items-center gap-1"><span>Model</span>{chuaSortField === 'model' && (chuaSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                    </th>
                    <th onClick={() => handleChuaSort('lich')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${chuaSortField === 'lich' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                      <div className="flex items-center gap-1"><span>Lịch bảo trì</span>{chuaSortField === 'lich' && (chuaSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                    </th>
                    <th onClick={() => handleChuaSort('loai_hd')} className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors hover:bg-slate-100 ${chuaSortField === 'loai_hd' ? 'text-blue-600 font-bold bg-blue-50/60' : ''}`}>
                      <div className="flex items-center gap-1"><span>Loại HĐ</span>{chuaSortField === 'loai_hd' && (chuaSortAsc ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />)}</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chuaBaoTri.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Tất cả các máy đến hạn trong tháng này đã được bảo trì!</td></tr>
                  ) : chuaBaoTriPaged.pageItems.map((kh) => (
                    <tr key={kh.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{kh.ma_may}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{kh.ten_khach_hang}</td>
                      <td className="px-4 py-3 text-slate-500">{kh.model || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{moTaLichBaoTri(kh.thang_bao_tri)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-100">{kh.loai_hd}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </ListFrame>
        )}
      </div>
      )}

      {hoanRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><PauseCircle className="w-4 h-4 text-amber-600" /> Tạm hoãn bảo trì cả nhóm</h3>
              <button onClick={() => setHoanRow(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div className="text-sm">
                <div className="font-semibold text-slate-800">{hoanRow.ten}</div>
                <div className="t2 text-slate-500">Áp dụng cho toàn bộ <b>{hoanRow.ids.length}</b> máy của nhóm này.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Tạm hoãn từ tháng</label>
                  <MonthField value={hoanTu} onChange={setHoanTu} className="h-9 px-3 text-xs w-full" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Đến hết tháng</label>
                  <MonthField value={hoanDen} onChange={setHoanDen} className="h-9 px-3 text-xs w-full" />
                  {hoanDen
                    ? <button type="button" onClick={() => setHoanDen('')} className="t2 text-slate-400 hover:text-slate-600">✕ bỏ (dừng vô hạn)</button>
                    : <span className="t2 text-slate-400">Để trống = dừng vô hạn</span>}
                </div>
              </div>
              <p className="t2 text-slate-500 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                Trong khoảng này nhóm sẽ KHÔNG bị tính "chưa bảo trì". Hết tháng kết thúc, hệ thống tự theo dõi lại. Vô hại với máy không có HĐBT.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200">
              <button onClick={clearHoan} disabled={hoanBusy || !hoanRow.tam_tu}
                className="px-3 py-2 rounded-md text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Bỏ tạm hoãn
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setHoanRow(null)} disabled={hoanBusy} className="px-3 py-2 rounded-md text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">Hủy</button>
                <button onClick={applyHoan} disabled={hoanBusy} className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
                  {hoanBusy ? 'Đang lưu…' : 'Áp dụng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmNode}
    </div>
  )
}
