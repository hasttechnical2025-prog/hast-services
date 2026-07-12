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
// Số/tiền = 0 (hoặc rỗng) -> để TRỐNG (tránh in "0" gây rối cho máy chỉ có bản đen trắng)
const numB = (v: any) => (Number(v) > 0 ? Number(v).toLocaleString('vi-VN') : '')
const moneyB = (v: any) => (Number(v) > 0 ? Math.round(Number(v)).toLocaleString('vi-VN') : '')
// Hiển thị '-' khi bằng 0 (cột số bản tính phí / thành tiền, giống mẫu giấy)
const dash = (v: any) => (Number(v) > 0 ? (Number(v)).toLocaleString('vi-VN') : '-')
const fmtDMY = (d: any) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`
}
// định mức hiển thị: cam kết tối thiểu ưu tiên, ngược lại định mức miễn phí
const dinhMuc = (mienPhi: any, camKet: any) => (Number(camKet) > 0 ? Number(camKet) : Number(mienPhi) || 0)
const ngayLapBangKe = (created: any) => { const d = new Date(created); return `Hà Nội, ngày ${String(d.getDate()).padStart(2, '0')} tháng ${String(d.getMonth() + 1).padStart(2, '0')} năm ${d.getFullYear()}` }

function render(templateFile: string, data: Record<string, any>) {
  const tplPath = path.join(process.cwd(), 'src', 'lib', 'report', templateFile)
  const zip = new PizZip(fs.readFileSync(tplPath))
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render(data)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// GET ?id=&chan_trang=1|0 : xuất bảng kê .docx (rieng -> đơn máy, gop -> đa máy)
export async function GET(request: Request) {
  try {
    const session = await requireRole('admin', 'tech_admin', 'staff')
    if (!session) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const chanTrang = searchParams.get('chan_trang') !== '0'
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
        cam_ket_toi_thieu_bw, cam_ket_toi_thieu_mau, phi_thue_thang
      )`)
      .eq('id_bk', id)
    if (ctErr) throw ctErr

    const rows = ct || []
    const [nam, thang] = String(bk.thang_nam).split('-')
    const common = {
      THANG: String(Number(thang)), NAM: nam,
      TEN_CONG_TY, NGAY_LAP_BANG_KE: ngayLapBangKe(bk.created_at),
      BANG_CHU: docSoTien(Math.round(Number(bk.tong_sau_vat) || 0)),
      HIEN_CHAN_TRANG: chanTrang,
      VAT: num(bk.vat_rate),
      TONG_TRUOC_VAT: money(bk.tong_truoc_vat), TONG_SAU_VAT: money(bk.tong_sau_vat),
    }

    let buf: Buffer
    let tenFile: string

    if (bk.loai === 'gop') {
      // ---- MẪU B: đa máy ----
      const kh0: any = rows[0]?.soct_khach_hang || {}
      let sdD = 0, sdM = 0, tpD = 0, tpM = 0, ttD = 0, ttM = 0
      const ds = rows.map((r: any, i: number) => {
        const kh = r.soct_khach_hang || {}
        const tienDen = (r.so_bw_tinh_phi || 0) * (kh.don_gia_bw || 0)
        const tienMau = (r.so_mau_tinh_phi || 0) * (kh.don_gia_mau || 0)
        sdD += (r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0)
        sdM += (r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0)
        tpD += r.so_bw_tinh_phi || 0; tpM += r.so_mau_tinh_phi || 0
        ttD += tienDen; ttM += tienMau
        return {
          stt: String(i + 1), ma: kh.ma_may || '', ten: kh.model || '',
          gia: Number(kh.phi_thue_thang) > 0 ? money(kh.phi_thue_thang) : '',
          dk_ngay: '', dk_den: numB(r.so_bw_dau_ky), dk_mau: numB(r.so_mau_dau_ky),
          ck_ngay: '', ck_den: numB(r.so_bw_cuoi_ky), ck_mau: numB(r.so_mau_cuoi_ky),
          sd_den: numB((r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0)), sd_mau: numB((r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0)),
          mp_den: numB(dinhMuc(kh.dinh_muc_mien_phi_bw, kh.cam_ket_toi_thieu_bw)), mp_mau: numB(dinhMuc(kh.dinh_muc_mien_phi_mau, kh.cam_ket_toi_thieu_mau)),
          tp_den: dash(r.so_bw_tinh_phi), tp_mau: dash(r.so_mau_tinh_phi),
          dg_den: numB(kh.don_gia_bw), dg_mau: numB(kh.don_gia_mau),
          card: '', tt_den: dash(tienDen), tt_mau: dash(tienMau),
          tt_may_bc: moneyB(r.thanh_tien), vat_tien: '', tong: '',
        }
      })
      const data = {
        ...common,
        TEN_KH: bk.soct_thue_cpc_hop_dong_khung?.ten_hop_dong || '',
        DIA_CHI: kh0.dia_chi || '', DIA_CHI_MAY: kh0.vi_tri_dat_may || '',
        GIA_THUE_CO_BAN: moneyB(bk.soct_thue_cpc_hop_dong_khung?.phi_co_ban ?? 0),
        TONG_SD_DEN: numB(sdD), TONG_SD_MAU: numB(sdM),
        TONG_TP_DEN: dash(tpD), TONG_TP_MAU: dash(tpM),
        TONG_CARD: '', TONG_TT_DEN: dash(ttD), TONG_TT_MAU: dash(ttM),
        TONG_MAY_BC: money(bk.tong_truoc_vat),
        TONG_VAT: money(Number(bk.tong_sau_vat) - Number(bk.tong_truoc_vat)),
        TONG_CONG: money(bk.tong_sau_vat),
        ds,
      }
      buf = render('bang-ke-da-may.docx', data)
      tenFile = `Bang-ke-thue-may-${data.TEN_KH || 'KH'}-${bk.thang_nam}`
    } else {
      // ---- MẪU A: đơn máy ----
      const r: any = rows[0] || {}
      const kh: any = r.soct_khach_hang || {}
      const tienDen = (r.so_bw_tinh_phi || 0) * (kh.don_gia_bw || 0)
      const tienMau = (r.so_mau_tinh_phi || 0) * (kh.don_gia_mau || 0)
      const data = {
        ...common,
        TEN_KH: kh.ten_khach_hang || '', DIA_CHI: kh.dia_chi || '', VI_TRI_DAT_MAY: kh.vi_tri_dat_may || '',
        NGAY_CHOT: kh.ngay_chot_so || '', MA_MAY: kh.ma_may || '', NGUOI_LIEN_HE: kh.nguoi_lien_he || '',
        MODEL: kh.model || '', EMAIL: kh.email || '', EOD: fmtDMY(kh.ngay_lap_may),
        DON_GIA_BW: numB(kh.don_gia_bw), DON_GIA_MAU: numB(kh.don_gia_mau),
        NGAY_DAU: '', NGAY_CUOI: '',
        DEN_SO_DAU: numB(r.so_bw_dau_ky), DEN_SO_CUOI: numB(r.so_bw_cuoi_ky),
        DEN_SD: numB((r.so_bw_cuoi_ky || 0) - (r.so_bw_dau_ky || 0)),
        DEN_MF: numB(dinhMuc(kh.dinh_muc_mien_phi_bw, kh.cam_ket_toi_thieu_bw)),
        DEN_TP: dash(r.so_bw_tinh_phi), DEN_DG: numB(kh.don_gia_bw), DEN_TT: dash(tienDen),
        MAU_SO_DAU: numB(r.so_mau_dau_ky), MAU_SO_CUOI: numB(r.so_mau_cuoi_ky),
        MAU_SD: numB((r.so_mau_cuoi_ky || 0) - (r.so_mau_dau_ky || 0)),
        MAU_MF: numB(dinhMuc(kh.dinh_muc_mien_phi_mau, kh.cam_ket_toi_thieu_mau)),
        MAU_TP: dash(r.so_mau_tinh_phi), MAU_DG: numB(kh.don_gia_mau), MAU_TT: dash(tienMau),
        PHI_TOI_THIEU_THANG: moneyB(r.phi_thue_co_dinh),
      }
      buf = render('bang-ke-don-may.docx', data)
      tenFile = `Bang-ke-ban-chup-${data.TEN_KH || 'KH'}-${bk.thang_nam}`
    }

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
