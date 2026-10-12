'use client'
import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import DateField from '@/components/DateField'
import { TAB_ROLES, TAB_TREE, DEFAULT_TAB_VIS } from '@/lib/tabs'

// Port NGUYÊN CaiDatHeThongTool từ admin (y hệt): cấu hình hệ thống + ma trận PHÂN QUYỀN tab
// (role × tab/tab con/tab cháu). Gọi lại /api/admin/cau-hinh, /api/admin/ngay-nghi.
export function CaiDatHeThongTool({ cauHinh, onUpdateSuccess, showNotification }: { cauHinh: Record<string, string>, onUpdateSuccess: () => void, showNotification: (type: 'success' | 'error', msg: string) => void }) {
  const [cfg, setCfg] = useState({
    app_ten: cauHinh.app_ten || '',
    vp_lat: cauHinh.vp_lat || '',
    vp_lng: cauHinh.vp_lng || '',
    repeat_ngay: cauHinh.repeat_ngay || '30',
    hdbt_canh_bao_thang: cauHinh.hdbt_canh_bao_thang || '2',
    nguong_ton_thap: cauHinh.nguong_ton_thap || '0',
    phieu_cung_canh_bao_ngay: cauHinh.phieu_cung_canh_bao_ngay || '3',
    counter_bao_truoc_ngay: cauHinh.counter_bao_truoc_ngay || '3',
    counter_chuyen_ky_ngay: cauHinh.counter_chuyen_ky_ngay || '20',
    muc_canh_bao_con_trang: cauHinh.muc_canh_bao_con_trang || '2000',
    gsheet_thue_id: cauHinh.gsheet_thue_id || '',
    gsheet_thue_tab: cauHinh.gsheet_thue_tab || 'Danh sách',
    bao_cao_khach_loai: cauHinh.bao_cao_khach_loai || 'Sửa máy',
    bao_cao_cho_phep_ngay: cauHinh.bao_cao_cho_phep_ngay || '7',
    phien_van_phong_ngay: cauHinh.phien_van_phong_ngay || '7',
    phien_ktv_ngay: cauHinh.phien_ktv_ngay || '30',
    mac_dinh_hom_nay: (cauHinh.mac_dinh_hom_nay ?? '1') !== '0',
    auto_bao_tri: (cauHinh.auto_bao_tri ?? '1') !== '0',
    geocode_import: (cauHinh.geocode_import ?? '1') !== '0',
    bao_tri: (cauHinh.bao_tri ?? '0') === '1',
    bao_tri_key: cauHinh.bao_tri_key || '',
    hd_ban_ten: cauHinh.hd_ban_ten || '',
    hd_ban_mst: cauHinh.hd_ban_mst || '',
    hd_ban_dia_chi: cauHinh.hd_ban_dia_chi || '',
    hd_ban_dien_thoai: cauHinh.hd_ban_dien_thoai || '',
    hd_ban_email: cauHinh.hd_ban_email || '',
    hd_ban_stk1: cauHinh.hd_ban_stk1 || '',
    hd_ban_stk2: cauHinh.hd_ban_stk2 || '',
    kd_khach_pham_vi: cauHinh.kd_khach_pham_vi || 'rieng',
    kd_khach_quyen_sua: cauHinh.kd_khach_quyen_sua || 'chu_so_huu',
  })
  const [tabVis, setTabVis] = useState<Record<string, Record<string, boolean>>>(() => {
    let parsed: any = {}; try { parsed = JSON.parse(cauHinh.tab_visibility || '{}') } catch {}
    const merged: Record<string, Record<string, boolean>> = {}
    for (const [role] of TAB_ROLES) merged[role] = { ...DEFAULT_TAB_VIS[role], ...(parsed[role] || {}) }
    return merged
  })
  const [saving, setSaving] = useState(false)
  const toggleTab = (role: string, tab: string) => setTabVis(p => ({ ...p, [role]: { ...p[role], [tab]: !p[role][tab] } }))

  // v2: Kanban đã tách thành MENU CẤP 1 (không còn là tab con Tài chính). Nên trong ma trận
  // phân quyền cũng nhấc nó ra làm 1 DÒNG CẤP 1 riêng (ngay sau Tài chính), nhưng VẪN ghi/đọc
  // đúng key 'tai_chinh.kanban' (không migrate DB). Dòng cấp 1 có key = 'tai_chinh.kanban',
  // không subs → ô tick độc lập với bật/tắt Tài chính, khớp cách v2 gating Kanban.
  const matrixTree = useMemo(() => {
    const out: typeof TAB_TREE = []
    for (const t of TAB_TREE) {
      if (t.key === 'tai_chinh') {
        out.push({ ...t, subs: t.subs.filter(s => s.key !== 'kanban') })
        out.push({ key: 'tai_chinh.kanban', label: 'Kanban Hóa đơn', subs: [] })
      } else {
        out.push(t)
      }
    }
    return out
  }, [])

  const [ngayNghiList, setNgayNghiList] = useState<{ ngay: string, ghi_chu: string }[]>([])
  const [newNgayNghi, setNewNgayNghi] = useState("")
  const [newGhiChuNghi, setNewGhiChuNghi] = useState("")
  const [loadingNghi, setLoadingNghi] = useState(false)

  const fetchNgayNghi = async () => {
    setLoadingNghi(true)
    try {
      const res = await fetch('/api/admin/ngay-nghi')
      const j = await res.json()
      if (res.ok) setNgayNghiList(j.data || [])
    } catch { /* bỏ qua */ }
    finally { setLoadingNghi(false) }
  }
  useEffect(() => { fetchNgayNghi() }, [])

  const handleAddNgayNghi = async () => {
    if (!newNgayNghi) return showNotification('error', 'Vui lòng chọn ngày')
    try {
      const res = await fetch('/api/admin/ngay-nghi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ngay: newNgayNghi, ghi_chu: newGhiChuNghi }) })
      if (res.ok) { showNotification('success', 'Đã thêm ngày nghỉ lễ'); setNewNgayNghi(""); setNewGhiChuNghi(""); fetchNgayNghi() }
      else { const err = await res.json(); showNotification('error', err.error) }
    } catch { showNotification('error', 'Lỗi kết nối') }
  }

  const handleDeleteNgayNghi = async (ngay: string) => {
    try {
      const res = await fetch(`/api/admin/ngay-nghi?ngay=${ngay}`, { method: 'DELETE' })
      if (res.ok) { showNotification('success', 'Đã xóa ngày nghỉ lễ'); fetchNgayNghi() }
    } catch { showNotification('error', 'Lỗi kết nối') }
  }

  const save = async () => {
    setSaving(true)
    const items = {
      app_ten: cfg.app_ten, vp_lat: cfg.vp_lat, vp_lng: cfg.vp_lng,
      repeat_ngay: String(parseInt(cfg.repeat_ngay) || 30),
      hdbt_canh_bao_thang: String(parseInt(cfg.hdbt_canh_bao_thang) || 2),
      nguong_ton_thap: String(parseInt(cfg.nguong_ton_thap) || 0),
      phieu_cung_canh_bao_ngay: String(parseInt(cfg.phieu_cung_canh_bao_ngay) || 3),
      counter_bao_truoc_ngay: String(parseInt(cfg.counter_bao_truoc_ngay) || 3),
      counter_chuyen_ky_ngay: String(Math.min(31, Math.max(1, parseInt(cfg.counter_chuyen_ky_ngay) || 20))),
      muc_canh_bao_con_trang: String(parseInt(cfg.muc_canh_bao_con_trang) || 2000),
      gsheet_thue_id: cfg.gsheet_thue_id.trim(),
      gsheet_thue_tab: cfg.gsheet_thue_tab.trim() || 'Danh sách',
      bao_cao_khach_loai: cfg.bao_cao_khach_loai.trim() || 'Sửa máy',
      bao_cao_cho_phep_ngay: String(Number.isFinite(parseInt(cfg.bao_cao_cho_phep_ngay)) ? parseInt(cfg.bao_cao_cho_phep_ngay) : 7),
      phien_van_phong_ngay: String(parseInt(cfg.phien_van_phong_ngay) || 7),
      phien_ktv_ngay: String(parseInt(cfg.phien_ktv_ngay) || 30),
      mac_dinh_hom_nay: cfg.mac_dinh_hom_nay ? '1' : '0',
      auto_bao_tri: cfg.auto_bao_tri ? '1' : '0',
      geocode_import: cfg.geocode_import ? '1' : '0',
      bao_tri: cfg.bao_tri ? '1' : '0',
      bao_tri_key: cfg.bao_tri_key.trim(),
      hd_ban_ten: cfg.hd_ban_ten.trim(),
      hd_ban_mst: cfg.hd_ban_mst.trim(),
      hd_ban_dia_chi: cfg.hd_ban_dia_chi.trim(),
      hd_ban_dien_thoai: cfg.hd_ban_dien_thoai.trim(),
      hd_ban_email: cfg.hd_ban_email.trim(),
      hd_ban_stk1: cfg.hd_ban_stk1.trim(),
      hd_ban_stk2: cfg.hd_ban_stk2.trim(),
      kd_khach_pham_vi: cfg.kd_khach_pham_vi,
      kd_khach_quyen_sua: cfg.kd_khach_quyen_sua,
      tab_visibility: JSON.stringify(tabVis),
    }
    try {
      const res = await fetch('/api/admin/cau-hinh', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      if (res.ok) { showNotification('success', 'Đã lưu cài đặt hệ thống.'); onUpdateSuccess() }
      else { const e = await res.json(); showNotification('error', e.error) }
    } catch { showNotification('error', 'Lỗi kết nối!') } finally { setSaving(false) }
  }

  const numField = (label: string, key: 'repeat_ngay' | 'hdbt_canh_bao_thang' | 'nguong_ton_thap' | 'vp_lat' | 'vp_lng' | 'phien_van_phong_ngay' | 'phien_ktv_ngay' | 'phieu_cung_canh_bao_ngay' | 'counter_bao_truoc_ngay' | 'counter_chuyen_ky_ngay' | 'muc_canh_bao_con_trang' | 'bao_cao_cho_phep_ngay', hint?: string, step?: string) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <Input value={(cfg as any)[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })} className="bg-white" inputMode="decimal" {...(step ? { step } : {})} />
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* CHẾ ĐỘ BẢO TRÌ */}
      <div className={`border rounded-lg p-6 space-y-3 ${cfg.bao_tri ? 'border-red-300 bg-red-50/60' : 'border-slate-200 bg-slate-50/50'}`}>
        <h3 className="text-lg font-semibold text-slate-700">Chế độ bảo trì</h3>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" checked={cfg.bao_tri} onChange={(e) => setCfg({ ...cfg, bao_tri: e.target.checked })} className="w-4 h-4 accent-red-600 mt-0.5" />
          <span>
            <b>Khóa app — chỉ Admin vào được</b>
            <span className="block text-xs text-slate-500 mt-0.5">
              Bật: mọi KTV / Tech Admin / Staff bị chặn (cả PC lẫn mobile) và thấy màn &quot;Hệ thống đang bảo trì&quot;;
              đăng nhập cũng bị từ chối; <b>cron nhắc báo cáo và toàn bộ tin Telegram tạm dừng</b>.
              Nhớ bấm <b>Lưu cấu hình</b>. Có hiệu lực sau vài giây.
            </span>
          </span>
        </label>
        {cfg.bao_tri && (
          <p className="text-xs text-red-700 bg-red-100 border border-red-200 rounded px-2 py-1.5">
            ⚠️ Đang chọn khóa app. Sau khi Lưu, chỉ tài khoản <b>Admin</b> dùng được — bỏ tick rồi Lưu để mở lại.
          </p>
        )}
        <div className="space-y-1 max-w-md pt-1 border-t border-slate-200">
          <label className="text-xs font-semibold text-slate-600">Khóa vào app khi đang bảo trì</label>
          <Input value={cfg.bao_tri_key} onChange={(e) => setCfg({ ...cfg, bao_tri_key: e.target.value })} placeholder="VD: mokhoa2026" className="bg-white" />
          <p className="text-xs text-slate-400">
            Màn báo bảo trì <b>cố ý không có nút đăng nhập</b> (để không lộ là app bị khóa chủ đích).
            Nếu Admin lỡ đăng xuất, mở lại app bằng link kín:
            {' '}<b className="text-slate-600 font-mono">…/?qt={cfg.bao_tri_key.trim() || 'khóa'}</b> rồi đăng nhập như bình thường.
            Để trống = không có link kín (chỉ vào lại được bằng SQL). Chỉ Admin thấy ô này.
          </p>
        </div>
      </div>

      {/* CHUNG */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Chung</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-semibold text-slate-600">Tên ứng dụng (tiêu đề)</label>
            <Input value={cfg.app_ten} onChange={(e) => setCfg({ ...cfg, app_ten: e.target.value })} placeholder="VD: HAST Dashboard" className="bg-white" />
          </div>
          {numField('Vĩ độ VP (lat)', 'vp_lat', 'Dùng để tính KM tới khách', 'any')}
          {numField('Kinh độ VP (lng)', 'vp_lng', 'VD: 105.809180', 'any')}
        </div>
      </div>

      {/* GOOGLE SHEET */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Google Sheet — đồng bộ counter máy thuê</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Spreadsheet ID</label>
            <Input value={cfg.gsheet_thue_id} onChange={(e) => setCfg({ ...cfg, gsheet_thue_id: e.target.value })} placeholder="Lấy từ URL: docs.google.com/spreadsheets/d/<ID>/edit" className="bg-white" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tên tab (sheet)</label>
            <Input value={cfg.gsheet_thue_tab} onChange={(e) => setCfg({ ...cfg, gsheet_thue_tab: e.target.value })} placeholder="Danh sách" className="bg-white" />
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">Cần chia sẻ sheet (quyền Xem) cho email <b>service account</b> đã cấu hình ở máy chủ (env <code>GOOGLE_SA_EMAIL</code>). Cột tháng <code>MM/YYYY</code> = kỳ tương ứng; ô counter dạng <code>đen/màu</code>. Nút đồng bộ nằm ở tab <b>Thuê/CPC › Nhập counter</b>.</p>
      </div>

      {/* NGƯỜI BÁN TRÊN HÓA ĐƠN */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Người bán trên hóa đơn</h3>
        <p className="text-xs text-slate-500 leading-relaxed">Hiển thị ở <b>bản xem trước hóa đơn</b> (Kanban HĐ → chốt chặn bàn giao → &quot;Xem như hóa đơn&quot;). Để trống ô nào thì dùng mặc định (CTCP Siêu Thanh Hà Nội). Đây chỉ là bản xem trước nội bộ — hóa đơn hợp lệ vẫn phát hành trên M-invoice.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Đơn vị bán hàng</label>
            <Input value={cfg.hd_ban_ten} onChange={(e) => setCfg({ ...cfg, hd_ban_ten: e.target.value })} placeholder="CÔNG TY CỔ PHẦN SIÊU THANH HÀ NỘI" className="bg-white" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã số thuế</label>
            <Input value={cfg.hd_ban_mst} onChange={(e) => setCfg({ ...cfg, hd_ban_mst: e.target.value })} placeholder="0100233103" className="bg-white" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Điện thoại</label>
            <Input value={cfg.hd_ban_dien_thoai} onChange={(e) => setCfg({ ...cfg, hd_ban_dien_thoai: e.target.value })} placeholder="02438223888" className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Địa chỉ</label>
            <Input value={cfg.hd_ban_dia_chi} onChange={(e) => setCfg({ ...cfg, hd_ban_dia_chi: e.target.value })} placeholder="Số 5, phố Nguyễn Ngọc Vũ, Phường Thanh Xuân, Thành phố Hà Nội, Việt Nam" className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <Input value={cfg.hd_ban_email} onChange={(e) => setCfg({ ...cfg, hd_ban_email: e.target.value })} placeholder="sieuthanh@sieuthanh.com.vn" className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Số tài khoản 1</label>
            <Input value={cfg.hd_ban_stk1} onChange={(e) => setCfg({ ...cfg, hd_ban_stk1: e.target.value })} placeholder="0671100009007 - Ngân hàng TMCP Quân Đội - Chi nhánh Hoàn Kiếm" className="bg-white" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Số tài khoản 2</label>
            <Input value={cfg.hd_ban_stk2} onChange={(e) => setCfg({ ...cfg, hd_ban_stk2: e.target.value })} placeholder="0011000025298 - Ngân hàng TMCP Ngoại thương Việt Nam – Chi nhánh SGD" className="bg-white" />
          </div>
        </div>
      </div>

      {/* DANH MỤC KHÁCH KINH DOANH */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Danh mục khách — Kinh doanh (Lệnh xuất hàng)</h3>
        <p className="text-xs text-slate-500 leading-relaxed">Chính sách danh mục khách của phòng Kinh doanh. MST luôn <b>duy nhất toàn hệ thống</b> (trừ khách lẻ không MST).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Phạm vi xem danh sách khách</label>
            <select value={cfg.kd_khach_pham_vi} onChange={(e) => setCfg({ ...cfg, kd_khach_pham_vi: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="rieng">Riêng — mỗi người chỉ thấy khách mình tạo</option>
              <option value="saleadmin_all">Quản lý xem toàn bộ — NV thấy của mình</option>
              <option value="chung">Chung — cả phòng thấy chung</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Quyền thêm/sửa/khóa khách</label>
            <select value={cfg.kd_khach_quyen_sua} onChange={(e) => setCfg({ ...cfg, kd_khach_quyen_sua: e.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="chu_so_huu">Chủ sở hữu tự sửa — mỗi NV quản khách của mình</option>
              <option value="chi_sale_admin">Chỉ quản lý KD (sale_admin) — NV chỉ chọn</option>
            </select>
            <p className="text-[11px] text-slate-400">Khi &quot;chỉ sale_admin&quot;: NV không thêm/sửa được nhưng vẫn thấy toàn bộ để chọn.</p>
          </div>
        </div>
      </div>

      {/* NGHIỆP VỤ */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Nghiệp vụ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {numField('Cửa sổ "đã sửa gần đây" (ngày)', 'repeat_ngay', 'Đánh dấu máy vừa sửa trong N ngày')}
          {numField('Cảnh báo HĐBT trước (tháng)', 'hdbt_canh_bao_thang')}
          {numField('Ngưỡng tồn thấp (đỏ khi ≤)', 'nguong_ton_thap')}
          {numField('Cảnh báo trễ nộp phiếu (ngày)', 'phieu_cung_canh_bao_ngay')}
          {numField('Báo trước hạn lấy counter (ngày)', 'counter_bao_truoc_ngay', 'Máy thuê/CPC: cảnh báo trước N ngày tới hạn chốt số')}
          {numField('Cảnh báo sắp hết mực (còn ≤ trang)', 'muc_canh_bao_con_trang', 'Máy thuê: counter ÷ định lượng, còn ≤ N trang thì cảnh báo để office liên hệ khách. Mặc định 2000')}
          {numField('Ngày chuyển kỳ counter', 'counter_chuyen_ky_ngay', 'Máy chốt số ngày ≤ N thuộc kỳ THÁNG TRƯỚC (đọc vào ngày D tháng sau); chốt > N thuộc kỳ THÁNG NÀY (đọc vào ngày D chính tháng). Cũng là mốc dropdown mặc định nhảy kỳ. Mặc định 20')}
          {numField('KTV nộp báo cáo trễ tối đa (ngày)', 'bao_cao_cho_phep_ngay', 'Cho phép nộp/sửa báo cáo lùi về N ngày. 0 = chỉ hôm nay')}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Loại việc cần báo cáo khách</label>
            <Input value={cfg.bao_cao_khach_loai} onChange={(e) => setCfg({ ...cfg, bao_cao_khach_loai: e.target.value })} placeholder="Sửa máy" className="bg-white" />
            <p className="text-[11px] text-slate-400">KTV Hoàn thành các loại việc này mới hiện ô "Báo cáo sửa chữa". Nhiều loại cách nhau dấu phẩy.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.mac_dinh_hom_nay} onChange={(e) => setCfg({ ...cfg, mac_dinh_hom_nay: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Sổ công tác mặc định lọc việc hôm nay
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.auto_bao_tri} onChange={(e) => setCfg({ ...cfg, auto_bao_tri: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Tự đánh dấu bảo trì khi việc &quot;Bảo trì&quot; hoàn thành
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={cfg.geocode_import} onChange={(e) => setCfg({ ...cfg, geocode_import: e.target.checked })} className="w-4 h-4 accent-blue-600" />
            Tự tính tọa độ &amp; KM khi import CSV khách hàng (dòng thiếu Km)
          </label>
        </div>
      </div>

      {/* NGÀY NGHỈ LỄ */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Ngày nghỉ Lễ / Tết</h3>
        <p className="text-sm text-slate-500">Các ngày KTV không đi làm (trừ T7, CN). Dùng để ẩn trên lịch nộp báo cáo KTV và bỏ qua khi bot nhắc nhở.</p>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Ngày nghỉ</label>
            <DateField value={newNgayNghi} onChange={setNewNgayNghi} heightClass="h-10" className="w-36" />
          </div>
          <div className="space-y-1 flex-1 max-w-sm">
            <label className="text-xs font-semibold text-slate-600">Lý do nghỉ (Tùy chọn)</label>
            <Input placeholder="VD: Nghỉ lễ 30/4" value={newGhiChuNghi} onChange={(e) => setNewGhiChuNghi(e.target.value)} className="bg-white h-10" />
          </div>
          <Button onClick={handleAddNgayNghi} className="h-10 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" /> Thêm ngày
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {loadingNghi ? <span className="text-sm text-slate-400">Đang tải...</span> : ngayNghiList.length === 0 ? <span className="text-sm text-slate-400">Chưa khai báo ngày nghỉ nào.</span> : ngayNghiList.map((n) => (
            <div key={n.ngay} className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md text-sm shadow-sm">
              <span className="font-semibold text-slate-700">{n.ngay.split('-').reverse().join('/')}</span>
              {n.ghi_chu && <span className="text-slate-400 text-xs">— {n.ghi_chu}</span>}
              <button onClick={() => handleDeleteNgayNghi(n.ngay)} className="ml-1 text-slate-400 hover:text-red-500" title="Xóa">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* PHIÊN ĐĂNG NHẬP */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-4">
        <h3 className="text-lg font-semibold text-slate-700">Phiên đăng nhập</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {numField('Văn phòng — giữ đăng nhập (ngày)', 'phien_van_phong_ngay', 'Admin / Tech Admin / Staff. Áp dụng cho lần đăng nhập kế tiếp')}
          {numField('KTV (mật khẩu) — giữ đăng nhập (ngày)', 'phien_ktv_ngay', 'KTV đăng nhập bằng QR trên điện thoại vẫn giữ dài hạn riêng')}
        </div>
      </div>

      {/* PHÂN QUYỀN TAB */}
      <div className="border border-slate-200 rounded-lg p-6 bg-slate-50/50 space-y-3">
        <h3 className="text-lg font-semibold text-slate-700">Phân quyền hiển thị tab</h3>
        <p className="text-sm text-slate-500">Bật/tắt tab lớn, <b>tab con và tab cháu</b> cho từng role. <b>Admin luôn thấy tất cả</b>; <b>Sổ công tác</b> luôn hiện; <b>Hệ thống</b> chỉ admin; <b>KTV</b> chỉ dùng app mobile. Tắt tab cha sẽ ẩn toàn bộ tab con/cháu. Lưu ý: đây là <b>ẩn/hiện giao diện</b> — API vẫn kiểm quyền tới cấp tab con (tab cháu chung API nên chỉ ẩn cho gọn).</p>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden inline-block">
          <table className="text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Tab</th>
                {TAB_ROLES.map(([role, label]) => <th key={role} className="px-6 py-2 text-center font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrixTree.flatMap(t => [
                <tr key={t.key}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{t.label}{t.alwaysOn && <span className="ml-1 text-[10px] font-normal text-slate-400">(luôn hiện)</span>}</td>
                  {TAB_ROLES.map(([role]) => (
                    <td key={role} className="px-6 py-2 text-center">
                      <input type="checkbox" disabled={t.alwaysOn} checked={t.alwaysOn ? true : !!tabVis[role]?.[t.key]} onChange={() => toggleTab(role, t.key)} className="w-4 h-4 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" />
                    </td>
                  ))}
                </tr>,
                ...t.subs.flatMap(s => [
                  <tr key={`${t.key}.${s.key}`} className="bg-slate-50/40">
                    <td className="pl-10 pr-4 py-2 text-slate-600">↳ {s.label}</td>
                    {TAB_ROLES.map(([role]) => {
                      const parentOn = t.alwaysOn ? true : !!tabVis[role]?.[t.key]
                      return (
                        <td key={role} className="px-6 py-2 text-center">
                          <input type="checkbox" disabled={!parentOn} checked={parentOn && (tabVis[role]?.[`${t.key}.${s.key}`] ?? true)} onChange={() => toggleTab(role, `${t.key}.${s.key}`)} className="w-4 h-4 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" />
                        </td>
                      )
                    })}
                  </tr>,
                  ...(s.subs || []).map(([g, gLabel]) => (
                    <tr key={`${t.key}.${s.key}.${g}`} className="bg-slate-50/70">
                      <td className="pl-16 pr-4 py-2 text-slate-500 text-xs">↳ {gLabel}</td>
                      {TAB_ROLES.map(([role]) => {
                        const parentOn = t.alwaysOn ? true : !!tabVis[role]?.[t.key]
                        const subOn = parentOn && (tabVis[role]?.[`${t.key}.${s.key}`] ?? true)
                        return (
                          <td key={role} className="px-6 py-2 text-center">
                            <input type="checkbox" disabled={!subOn} checked={subOn && (tabVis[role]?.[`${t.key}.${s.key}.${g}`] ?? true)} onChange={() => toggleTab(role, `${t.key}.${s.key}.${g}`)} className="w-4 h-4 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" />
                          </td>
                        )
                      })}
                    </tr>
                  )),
                ]),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="h-10">{saving ? 'Đang lưu...' : 'Lưu cài đặt'}</Button>
      </div>
    </div>
  )
}
