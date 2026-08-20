# Xuất Excel công nợ / đã thanh toán (Kanban Hóa đơn) — SPEC (đã chốt, chưa code)

> Mục tiêu: cho kthc một file Excel **DỮ LIỆU THÔ** (pivot-friendly) để tự tổng hợp báo cáo
> (doanh số phòng kỹ thuật, phòng kinh doanh, từng NV kinh doanh, công nợ theo khách…).
> **KHÔNG làm màn báo cáo trong app** — kthc tự pivot trên Excel.
> Khi tiếp tục ở chat mới: bảo "code export công nợ Kanban", đọc file này.

## Nguyên tắc lớn (đã chốt qua trao đổi)

1. **File = dữ liệu thô để PIVOT**, không phải báo cáo người đọc → **bảng phẳng hoàn toàn**:
   - 1 dòng = 1 số hóa đơn. Mọi dòng đồng nhất, KHÔNG subtotal/dòng tổng xen giữa (phá PivotTable).
   - Bật **AutoFilter** + **freeze dòng header**. Header **bold**.
2. **2 sheet — tách bản chất kế toán** (cột 3 là SỐ DƯ, cột 4 là PHÁT SINH → không dùng chung 1 bộ lọc kỳ):
   - Sheet **"Cong no chua thu"** (cột 3 = `Đã lên hóa đơn`): **lũy kế đến 1 ngày cutoff**, KHÔNG chặn dưới (nếu chặn dưới sẽ giấu mất nợ cũ vẫn còn).
   - Sheet **"Da thanh toan"** (cột 4 = `Đã thanh toán`): lọc **Từ–Đến** theo ngày xuất HĐ.
3. **Gộp cả 2 phòng ban** trong cùng file, có bộ lọc chọn phòng ban. Chiều "NV kinh doanh" chỉ có ở
   lệnh xuất hàng (kinh doanh); phiếu kỹ thuật là doanh số chung phòng → cột NV để trống.
4. **Làm NGAY cho kỹ thuật** (Kanban HĐ hiện có). Khung cột Phòng ban/NV dựng sẵn; option "Kinh doanh"
   trong bộ lọc **sáng lên khi build lệnh xuất hàng** (chỉ UNION thêm nguồn, không đổi khung cột/file).

## Nút & hộp thoại

- Nút **"Xuất Excel công nợ"** ở header `KanbanHdTool` (cạnh "Tải lại"). Quyền: admin/tech_admin/staff/kthc
  (ai thấy tab đều xuất được). Độc lập với ô "Kỳ đối chiếu" của board.
- Bấm → hộp thoại:
  - **Phòng ban:** `Tất cả` / `Kỹ thuật` / `Kinh doanh` (mặc định Tất cả). *(Hiện tại "Kinh doanh" chưa có dữ liệu → để đó, sáng khi build lệnh xuất.)*
  - **① Công nợ chưa thu — Nợ tính đến ngày** `[__/__/____]` (DateField, mặc định **hôm nay**; chỉ 1 mốc).
  - **② Đã thanh toán — Từ** `[__/__/____]` **Đến** `[__/__/____]` (mặc định **01/tháng hiện tại → hôm nay**; để trống một đầu = không giới hạn đầu đó).
  - **Honor ô Tìm hiện tại** (khách/số phiếu/số HĐ): đang gõ tìm thì file lọc theo đó (lọc sao xuất vậy).
  - `[Hủy]` `[Xuất]`.

## Cột từng sheet (thứ tự trái→phải)

**Sheet "Cong no chua thu"** (21 cột):
STT · **Phòng ban** · **NV kinh doanh** · Số HĐ · Ngày HĐ · Khách hàng · MST · Địa chỉ ·
Số phiếu · SL phiếu · Trước VAT · VAT (%) · Tiền VAT · **Tổng sau VAT** · Đã thu · **Còn nợ** · **Tuổi nợ** ·
Người lập HĐ · Số ĐNTT · MF · Ghi chú.

**Sheet "Da thanh toan"** (19 cột — bỏ Còn nợ/Tuổi nợ vì đã tất toán):
STT · **Phòng ban** · **NV kinh doanh** · Số HĐ · Ngày HĐ · Khách hàng · MST · Địa chỉ ·
Số phiếu · SL phiếu · Trước VAT · VAT (%) · Tiền VAT · **Tổng sau VAT** · Đã thu · Người lập HĐ · Số ĐNTT · MF · Ghi chú.

- **VAT (%)**: mức thuế suất (số, VD `8` hiện "8%"). Đồng nhất trong HĐ → số; trộn nhiều mức → "mix"; không có → trống. *(Luật hiện 1 mức 8%; khi mix thì cell tự "mix", không cần đổi code.)*

### Ý nghĩa & nguồn cột
- **Phòng ban**: "Kỹ thuật" (từ `soct_cong_viec`) / "Kinh doanh" (từ `soct_lenh_xuat`, sau này).
- **NV kinh doanh**: tên NV (`nguoi_kinh_doanh_id`→full_name); **trống** cho dòng kỹ thuật.
- **Khách hàng / MST / Địa chỉ**: ưu tiên **cụm** (`soct_khach_cum`) nếu có, else khách lẻ.
- **Số phiếu**: gộp các `report` cùng số HĐ ("957921, 957915, …"); **SL phiếu** = đếm.
- **Trước VAT / Tiền VAT / Tổng sau VAT**: theo `getVatTuStats` (chỉ vật tư `!da_tra`;
  trước = Σ SL×đơn giá, VAT = Σ SL×đơn giá×vat/100, sau = trước+VAT).
- **Đã thu**: `so_tien_da_thu` theo số HĐ (`soct_hd_thu`). *(Lệnh xuất hàng sẽ dùng `soct_thu_tien`
  — CHỈ khoản `da_duyet`; xem [lenh-xuat-hang-spec.md](lenh-xuat-hang-spec.md).)*
- **Còn nợ** = `max(0, Tổng sau VAT − Đã thu)`. Trả dư (đã thu > tổng) → Ghi chú "(dư X)".
- **Tuổi nợ**: số ngày kể từ `ngay_xuat_hd` đến hôm nay (chỉ sheet chưa thu).
- **Người lập HĐ**: `nguoi_xuat_hd`→full_name. **Số ĐNTT**: `so_dntt`. **MF**: `mien_phi` → "x"/trống.

### Định dạng (theo AGENTS.md)
- Tiền `#.###` (`toLocaleString('vi-VN')`, `Math.round` trước). Ngày `DD/MM/YYYY`. VAT kèm `%`.
- Số HĐ / MST / Số phiếu / Số ĐNTT để **text** (không phân tách nghìn).
- Sắp xếp mỗi sheet: **Khách → Ngày HĐ** (chỉ để dễ đọc; KHÔNG có dòng cộng).

## Backend

`GET /api/admin/kanban-hd/export?phong_ban=&cutoff=&tu=&den=&q=`
- `requireRole('admin','tech_admin','staff','kthc')`.
- Trả `{ chua_thu: Ticket[], da_thanh_toan: Ticket[] }` (2 truy vấn `selectAll`, khác điều kiện ngày):
  - `chua_thu`: `trang_thai_hd = 'Đã lên hóa đơn'`, `ngay_xuat_hd <= cutoff` (bỏ nếu trống).
  - `da_thanh_toan`: `trang_thai_hd = 'Đã thanh toán'`, `ngay_xuat_hd BETWEEN tu..den` (bỏ mốc trống).
  - `phong_ban`: 'ky_thuat' → chỉ `soct_cong_viec`; 'kinh_doanh' → chỉ `soct_lenh_xuat` (sau này);
    'tat_ca' → UNION cả hai (hiện tại = chỉ kỹ thuật).
  - Lọc `q` theo tên khách(cụm/lẻ)/số phiếu/số HĐ — dùng lại logic `matchSearch` của `KanbanHdTool`.
  - Join khách+cụm, vật tư, người xuất; gắn `so_tien_da_thu` theo số HĐ (giống GET chính).
- **Client** dựng file `.xlsx` bằng `exceljs` (đã import sẵn trong component): gom theo số HĐ,
  map cột, format, AutoFilter, freeze header. Tên file `cong-no_<DD-MM-YYYY hôm nay>.xlsx`.

## Bám hạ tầng sẵn có
- Data model + công thức tiền: `src/app/api/admin/kanban-hd/route.ts` + `getVatTuStats`/`groupByHd`/`matchSearch`
  trong `src/components/KanbanHdTool.tsx`.
- Mẫu xuất Excel client bằng exceljs: hàm `exportExcel` hiện có trong `KanbanHdTool.tsx`.
- Migration-first nếu cần cột mới (hiện KHÔNG cần — mọi cột đã có tới mig 51).

## Quyết định đã chốt (không mở lại nếu không có lý do mới)
- Đơn vị dòng = **1 số HĐ**. Bảng **phẳng**, không subtotal/tổng. **2 sheet** tách chưa-thu/đã-thu.
- Cột 3 (chưa thu) = **lũy kế đến cutoff**, không chặn dưới. Cột 4 (đã thu) = **range Từ–Đến** theo ngày xuất HĐ.
- Gộp 2 phòng ban + cột **Phòng ban** & **NV kinh doanh** (NV trống cho kỹ thuật). Bộ lọc phòng ban.
- Honor ô Tìm. Trả dư → Còn nợ=0 + Ghi chú "(dư X)". **Không** cột Email kế toán. **Không** màn báo cáo trong app.
- Làm **ngay cho kỹ thuật**; "Kinh doanh" sáng khi build lệnh xuất hàng.
