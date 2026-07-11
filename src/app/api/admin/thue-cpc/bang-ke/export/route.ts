import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireRole } from '@/lib/session'
import { docSoTien } from '@/lib/report/bao-gia'

const TEN_CONG_TY = 'Công ty CP Siêu Thanh Hà Nội'

const money = (v: any) => Math.round(Number(v) || 0).toLocaleString('vi-VN')
const num = (v: any) => (v === null || v === undefined || v === '' ? '' : (Number(v) || 0).toLocaleString('vi-VN'))
const fmtDMY = (d: any) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`
}
// định mức hiển thị: cam kết tối thiểu ưu tiên, ngược lại định mức miễn phí
const dinhMucHienThi = (mienPhi: any, camKet: any) => (Number(camKet) > 0 ? Number(camKet) : Number(mienPhi) || 0)

// GET ?id=&chan_trang=1|0 : xuất bảng kê .docx từ template
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const chanTrang = searchParams.get('chan_trang') !== '0' // mặc định hiện chân trang chữ ký
    if (!id) return NextResponse.json({ error: 'Thiếu id bảng kê' }, { status: 400 })

    const { data: bk, error } = await supabaseAdmin
      .from('soct_thue_cpc_bk')
      .select('*, soct_thue_cpc_hop_dong_khung(ten_hop_dong, phi_co_ban)')
      .eq('id', id)
      .single()
    if (error) throw error

    const { data: ct, error: ctErr } = await supabaseAdmin
      .from('soct_thue_cpc_bk_ct')
      .select(`*, soct_khach_hang(
        ten_khach_hang, dia_chi, ma_may, model, vi_tri_dat_may, nguoi_lien_he, email, ngay_lap_may,
        ngay_chot_so, don_gia_bw, don_gia_mau, dinh_muc_mien_phi_bw, dinh_muc_mien_phi_mau,
        cam_ket_toi_thieu_bw, cam_ket_toi_thieu_mau
      )`)
      .eq('id_bk', id)
    if (ctErr) throw ctErr

    const rows = ct || []
    const [nam, thang] = String(bk.thang_nam).split('-')
    const gop = bk.loai === 'gop'
    const kh0: any = rows[0]?.soct_khach_hang || {}

    // Thông tin đầu bảng
    const data: Record<string, any> = {
      TEN_KH: gop ? (bk.soct_thue_cpc_hop_dong_khung?.ten_hop_dong || '') : (kh0.ten_khach_hang || ''),
      DIA_CHI: gop ? '' : (kh0.dia_chi || ''),
      MA_MAY: gop ? '' : (kh0.ma_may || ''),
      MODEL: gop ? '' : (kh0.model || ''),
      VI_TRI_DAT_MAY: gop ? '' : (kh0.vi_tri_dat_may || ''),
      NGAY_LAP_MAY: gop ? '' : fmtDMY(kh0.ngay_lap_may),
      NGAY_CHOT: gop ? '' : (kh0.ngay_chot_so || ''),
      NGUOI_LIEN_HE: gop ? '' : (kh0.nguoi_lien_he || ''),
      EMAIL: gop ? '' : (kh0.email || ''),
      THANG: String(Number(thang)),
      NAM: nam,
      VAT_PHAN_TRAM: num(bk.vat_rate),
      DON_GIA_BW: gop ? '' : money(kh0.don_gia_bw),
      DON_GIA_MAU: gop ? '' : money(kh0.don_gia_mau),
      TEN_CONG_TY,
      NGAY_LAP_BANG_KE: (() => { const d = new Date(bk.created_at); return `ngày ${String(d.getDate()).padStart(2, '0')} tháng ${String(d.getMonth() + 1).padStart(2, '0')} năm ${d.getFullYear()}` })(),
      PHI_TOI_THIEU_THANG: money(gop ? (bk.soct_thue_cpc_hop_dong_khung?.phi_co_ban ?? 0) : (rows[0]?.phi_thue_co_dinh ?? 0)),
      TONG_TRUOC_VAT: money(bk.tong_truoc_vat),
      TONG_SAU_VAT: money(bk.tong_sau_vat),
      BANG_CHU: docSoTien(Math.round(Number(bk.tong_sau_vat) || 0)),
      HIEN_CHAN_TRANG: chanTrang,
    }

    // Dòng Đen/Màu
    if (!gop) {
      const r: any = rows[0] || {}
      const tienDen = Math.round((r.so_bw_tinh_phi || 0) * (kh0.don_gia_bw || 0))
      const tienMau = Math.round((r.so_mau_tinh_phi || 0) * (kh0.don_gia_mau || 0))
      Object.assign(data, {
        DEN_NGAY_DAU: '', DEN_NGAY_CUOI: '',
        DEN_SO_DAU: num(r.so_bw_dau_ky), DEN_SO_CUOI: num(r.so_bw_cuoi_ky),
        DEN_SO_SU_DUNG: num((r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0)),
        DEN_DINH_MUC: num(dinhMucHienThi(kh0.dinh_muc_mien_phi_bw, kh0.cam_ket_toi_thieu_bw)),
        DEN_SO_TINH_PHI: num(r.so_bw_tinh_phi), DEN_DON_GIA: money(kh0.don_gia_bw), DEN_THANH_TIEN: money(tienDen),
        MAU_NGAY_DAU: '', MAU_NGAY_CUOI: '',
        MAU_SO_DAU: num(r.so_mau_dau_ky), MAU_SO_CUOI: num(r.so_mau_cuoi_ky),
        MAU_SO_SU_DUNG: num((r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0)),
        MAU_DINH_MUC: num(dinhMucHienThi(kh0.dinh_muc_mien_phi_mau, kh0.cam_ket_toi_thieu_mau)),
        MAU_SO_TINH_PHI: num(r.so_mau_tinh_phi), MAU_DON_GIA: money(kh0.don_gia_mau), MAU_THANH_TIEN: money(tienMau),
      })
    } else {
      // Gộp nhiều máy: template chỉ có 1 dòng -> gộp tổng (chỉ số đầu/cuối để trống vì nhiều máy)
      const sum = (f: (x: any) => number) => rows.reduce((s: number, r: any) => s + f(r), 0)
      const tienDen = rows.reduce((s: number, r: any) => s + (r.so_bw_tinh_phi || 0) * (r.soct_khach_hang?.don_gia_bw || 0), 0)
      const tienMau = rows.reduce((s: number, r: any) => s + (r.so_mau_tinh_phi || 0) * (r.soct_khach_hang?.don_gia_mau || 0), 0)
      Object.assign(data, {
        DEN_NGAY_DAU: '', DEN_NGAY_CUOI: '', DEN_SO_DAU: '', DEN_SO_CUOI: '',
        DEN_SO_SU_DUNG: num(sum((r) => (r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0))),
        DEN_DINH_MUC: '', DEN_SO_TINH_PHI: num(sum((r) => r.so_bw_tinh_phi || 0)), DEN_DON_GIA: '', DEN_THANH_TIEN: money(tienDen),
        MAU_NGAY_DAU: '', MAU_NGAY_CUOI: '', MAU_SO_DAU: '', MAU_SO_CUOI: '',
        MAU_SO_SU_DUNG: num(sum((r) => (r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0))),
        MAU_DINH_MUC: '', MAU_SO_TINH_PHI: num(sum((r) => r.so_mau_tinh_phi || 0)), MAU_DON_GIA: '', MAU_THANH_TIEN: money(tienMau),
      })
    }

    // Render docx
    const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', 'bang-ke-thue-cpc-template.docx')
    const zip = new PizZip(fs.readFileSync(tplPath))
    const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(data)
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const tenFile = `Bang-ke-${(data.TEN_KH || 'KH').toString()}-${bk.thang_nam}`
    const ascii = tenFile.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, '-')
    const utf8 = encodeURIComponent(`${tenFile}.docx`)

    return new NextResponse(buf as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${ascii}.docx"; filename*=UTF-8''${utf8}`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting bang-ke docx:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
