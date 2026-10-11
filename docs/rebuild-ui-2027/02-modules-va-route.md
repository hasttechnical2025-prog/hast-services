# 02 — Kiểm kê module, cây route & thứ tự port

Nguồn chuẩn cây tab: `src/lib/tabs.ts` (TAB_TREE) + state điều hướng trong `src/app/admin/page.tsx`.
**Kiểm kê dưới đây đã đối chiếu code (2026-10-11)** — gồm cả tab cháu/chắt nội bộ KHÔNG khai trong `tabs.ts`.

## 0. State điều hướng thực tế (admin/page.tsx)
Mỗi tab cha có 1 biến state riêng (không phải 1 router trung tâm) — khi port sang route phải gom về URL:

| Tab cha | State | Giá trị (tab con) |
|---|---|---|
| `cong_viec` | `congTacTab` | `giao_viec`(mặc định) · `hoan_phieu` · `bao_cao_khach` · `cham_soc_kh` |
| `theo_doi_may` | `monitorTab` | `bao_tri` · `giam_dinh` |
| `kho_hang` | `khoTab` | `ton_kho`(mặc định) · `dat_hang` · `thong_ke` · `gia_niem_yet` · `may_thue` · `phieu_de_nghi` |
| `tai_chinh` | `taiChinhTab` | `cong_no`(mặc định) · `thue_cpc` · `kanban` · `phi_bao_tri` |
| `quan_ly` | `quanLyTab` | `nhat_ky`(mặc định) · `khach_hang` · `khach_cum` · `bao_cao` · `nghi_phep` |
| `he_thong` | `systemTab` | `tai_khoan`(mặc định) · `cai_dat` · `danh_muc` · `audit` · `tro_ly_log` · `doi_mat_khau` |

## 1. Kiểm kê module (office `/admin`) — đầy đủ cấp 3/cấp 4

| # | Tab cha | Tab con (cấp 2) | Tab cháu nội bộ (cấp 3/4) | Component |
|---|---|---|---|---|
| 1 | **Sổ công tác** `cong_viec` | Giao việc `giao_viec` (mặc định, lõi) | — | `admin/page.tsx` (lõi, inline) |
|   |  | Hoàn phiếu `hoan_phieu` | — | lõi (inline) |
|   |  | Báo cáo sửa chữa `bao_cao_khach` | **Chờ gửi · Đã gửi** (state `tab`) | `BaoCaoKhachTool` |
|   |  | Chăm sóc KH `cham_soc_kh` | **Cần chăm sóc · Danh sách · Pipeline · KPI** (state `view`=can/ds/pipeline/kpi) | `CskhTool.tsx` |
| 2 | **Theo dõi máy** `theo_doi_may` | Bảo trì `bao_tri` | **Đã bảo trì · Chưa bảo trì · Tạm dừng · Đối chiếu năm · Thống kê** (khai trong `tabs.ts`, state `subTab`) | `BaoTriTool` + `SoTheoDoiPrint` (in) |
|   |  | Giám định `giam_dinh` | 1 view + modal **Làm báo giá** (lọc Chưa/Đã báo giá) | `GiamDinhTool` + `BaoGiaEditor` |
| 3 | **Kho hàng** `kho_hang` | Tồn kho `ton_kho` (mặc định) | — | `InventoryManagementTool` |
|   |  | Đặt hàng `dat_hang` | — (có badge số dòng) | `DatHangTool` |
|   |  | Thống kê nhập `thong_ke` | gồm panel **Cảnh báo tồn kho** + **Hàng về** (inline) | `NhapHangThangTool` |
|   |  | Giá niêm yết `gia_niem_yet` | — | `GiaNiemYetTool` |
|   |  | Kho máy thuê `may_thue` | — | `KhoMayThueTool.tsx` |
|   |  | Phiếu đề nghị `phieu_de_nghi` | — (in A4 BM38) | `PhieuDeNghiModule.tsx` |
| 4 | **Tài chính** `tai_chinh` | Công nợ `cong_no` (mặc định) | 1 view (gom phiếu theo cụm → báo giá → tách HĐ / đẩy Kanban); modal **Đối chiếu sao kê NH**, **Chưa vào cụm** | `CongNoTool` + `BaoGiaEditor` |
|   |  | Thuê / CPC `thue_cpc` | **UI THỰC TẾ = 3 tab** (state `sub`): `danh_sach`("Danh sách máy" = gộp `don_gia`+`khung`) · `counter`("Nhập counter" = gộp `counter`+`bang_ke`) · `canh_bao_muc`("Cảnh báo vật tư"). ⚠️ `tabs.ts` vẫn giữ **5 key quyền** (`don_gia`/`counter`/`khung`/`bang_ke`/`canh_bao_muc`) để guard. | `ThueCpcModule.tsx` |
|   |  | Phí bảo trì `phi_bao_tri` | — (gom theo Số HĐDV) | `PhiBaoTriModule.tsx` |
|   |  | Kanban Hóa đơn `kanban` | lọc nội bộ col3 (thanh toán/tuổi nợ) + Export Excel theo phòng ban | `KanbanHdTool.tsx` |
| 5 | **Quản lý** `quan_ly` | Báo cáo KTV `nhat_ky` | — | `BaoCaoKtvTool` |
|   |  | Danh sách khách hàng `khach_hang` | — | `CustomerListTool` |
|   |  | Khách hàng cụm `khach_cum` | **scope** (state): `both`·`cum`·`kd` + **đối chiếu minVoice** | `KhachCumTool` |
|   |  | Báo cáo tháng `bao_cao` | — (xuất .docx theo template) | `BaoCaoThangTool` |
|   |  | Nghỉ phép `nghi_phep` | — | `NghiPhepDuyet.tsx` |
| 6 | **Hệ thống** `he_thong` | **6 tab con** (state `systemTab`): Cài đặt `cai_dat` · Tài khoản `tai_khoan` · Danh mục `danh_muc` · Audit `audit` · Nhật ký Trợ lý `tro_ly_log` · Đổi mật khẩu `doi_mat_khau` | `cai_dat`→`CaiDatHeThongTool` (cấu hình + phân quyền tab); `tai_khoan`→`UserManagementTool`; `danh_muc`→`DanhMucTool`+`AliasTool`; `audit`→`AuditLogsTool`; `tro_ly_log`→`TroLyLogTool`; `doi_mat_khau`→`DoiMatKhauTool` (mọi role) | trong `admin/page.tsx` |
| 7 | Trợ lý AI `tro_ly` | nút nổi (không phải tab điều hướng) | — | `TroLyAI` |

**Tool hành động (không phải tab nav — nằm rải trong lõi/các tab):** `DedupeReportsTool` (gộp trùng), `ImportJobsTool` (nhập phiếu PDF), `MucMayThueTool` (ngưỡng mực máy thuê), `ExcelTool` (import Excel chung), `ThuTienPanel` (thu tiền/đặt cọc). Khi port phải đính đúng chỗ nút đang nằm.

**Standalone (ngoài `/admin`, ĐỀU có đăng nhập — KHÔNG có cổng public no-auth):**
- `/` — đăng nhập / landing (office).
- `/ktv` — app kỹ thuật viên (`ktv/page.tsx`, có trang in).
- `/m` — office mobile (5 tab).
- `/admin/scan` — quét QR nhận việc (`admin/scan/page.tsx`).
- `/kho-thue` — **CHỈ ĐỌC** tra cứu Kho máy thuê cho role `kinh_doanh`/`admin` (login client-side). `/kho-may-thue` = redirect alias.
- `/lenh-xuat-hang` — Lệnh xuất hàng (kinh doanh), login riêng, có trang in.

**Export / trang in (server routes `src/app/api/*` — GIỮ NGUYÊN, UI mới chỉ gọi lại):**
- **CSV (client, BOM UTF-8, đúng dữ liệu đã lọc):** trong `admin/page.tsx`, `KanbanHdTool`, `ThueCpcModule`, `KhoMayThueTool`, `admin/scan`.
- **.docx (server):** `bbbg` (biên bản bàn giao) · `bbgd`/`bao-gia` (báo giá) · `dntt` (đề nghị thanh toán) · `bao-cao` (báo cáo tháng) · `bao-cao-ktv` · `kho-may-thue/bien-ban` · `thue-cpc/bang-ke/export` · `lenh-xuat/print`.
- **.xlsx (server):** `kanban-hd/export` (công nợ cho kthc pivot).
- **Trang in `window.print` (client):** `SoTheoDoiPrint` (Sổ theo dõi máy, 2×A4 ngang) · `PhieuDeNghiModule` (BM38) · `ktv/page.tsx` · `lenh-xuat-hang`.

## 2. Cây route CHỐT (base `/v2`, path segment `[tab]`, mã hoá theo UI thực tế)
> Quy ước đã chốt 2026-10-11: (a) tab cháu dùng **path segment** `[tab]` (không `?tab=`) để chuột phải mở tab mới / bookmark / code-split theo segment; (b) URL **theo UI thực tế**, không theo key quyền thô (ThueCpc 3 tab, Hệ thống 6 tab); key quyền `tabs.ts` chỉ dùng để guard.
```
/(auth)/login                        ← màn đăng nhập (nay là `/`)
/v2                                   → redirect module mặc định theo role
/v2/so-cong-tac/
    giao-viec                         (mặc định tab cha; lõi hằng ngày)
    hoan-phieu
    bao-cao-sua-chua/[tab]            (cho-gui | da-gui)
    cham-soc-kh/[view]                (can | ds | pipeline | kpi)
/v2/theo-doi-may/
    bao-tri/[tab]                     (da-bao-tri | chua-bao-tri | tam-dung | doi-chieu | thong-ke)
    giam-dinh
/v2/kho-hang/[tab]                    (ton-kho | dat-hang | thong-ke | gia-niem-yet | may-thue | phieu-de-nghi)
/v2/tai-chinh/
    cong-no
    thue-cpc/[tab]                    (danh-sach | counter | canh-bao-vat-tu)   ← 3 tab theo UI
    phi-bao-tri
    kanban
/v2/quan-ly/[tab]                     (bao-cao-ktv | khach-hang | khach-cum | bao-cao-thang | nghi-phep)
/v2/he-thong/[tab]                    (cai-dat | tai-khoan | danh-muc | audit | tro-ly-log | doi-mat-khau)
```
**Standalone giữ nguyên route hiện có** (port/giữ tuỳ nhu cầu, không bắt buộc vào `/v2`): `/ktv`, `/m`, `/admin/scan`, `/kho-thue` (+ `/kho-may-thue` alias), `/lenh-xuat-hang`.

- **Layout** `app/v2/layout.tsx` = auth guard + shell (header + chuông + provider + realtime). Các trang con mỏng, chỉ ghép `features/*`.
- **Guard theo quyền**: `roleCanTab/subVisible` chuyển thành kiểm tra ở layout/segment; vào route không có quyền → redirect module mặc định của role. Với ThueCpc 3 tab: guard theo key quyền gộp (ví dụ tab `danh-sach` hiện khi có `don_gia` HOẶC `khung`, đúng như code hiện tại).
- **Mặc định mỗi tab cha** (load `/v2/kho-hang` không có `[tab]`): redirect tới tab mặc định ở bảng §0 (hoặc tab đầu tiên role được xem).
- **Slug tab cháu** = chuyển key snake_case → kebab (`da_bao_tri`→`da-bao-tri`); riêng ThueCpc đổi tên cho dễ đọc: `danh_sach`→`danh-sach`, `canh_bao_muc`→`canh-bao-vat-tu`.

## 3. Thứ tự port (ưu tiên theo tần suất office dùng)
1. **GĐ0 — Nền**: Design System (`ui/*`) + provider (`SessionProvider`, `SharedDataProvider`, `RealtimeProvider`) + `app/v2/layout.tsx` + 1 trang demo (vd Giao việc read-only) để chốt khung.
2. Sổ công tác › **Giao việc** (lõi hằng ngày).
3. Sổ công tác › **Hoàn phiếu**.
4. Kho hàng › **Tồn kho**, **Đặt hàng**.
5. Tài chính › **Công nợ**, **Kanban Hóa đơn**.
6. Theo dõi máy › **Bảo trì**, **Giám định**.
7. Tài chính › **Thuê/CPC**, **Phí bảo trì**.
8. Quản lý › (Báo cáo KTV, Khách hàng, Khách cụm, Báo cáo tháng, Nghỉ phép).
9. Sổ công tác › **Báo cáo sửa chữa**, **CSKH**.
10. **Hệ thống**.
11. **/ktv**, **/m** (có thể làm song song sớm nếu KTV cần).

## 4. Checklist parity (áp cho MỖI module trước khi thành mặc định)
- [ ] **Tải dữ liệu** đúng (gồm danh sách dài > 1000 dòng dùng `selectAll`).
- [ ] **Bộ lọc + tìm kiếm** đủ như bản cũ.
- [ ] **Sort cột** mọi bảng.
- [ ] **CRUD** đầy đủ (tạo/sửa/xóa/trạng thái) + **confirm** bằng `ConfirmDialog`.
- [ ] **Realtime**: đổi từ máy khác tự cập nhật (broadcast + poll), không cần F5.
- [ ] **Export** (CSV đúng dữ liệu đã lọc + BOM; .docx nếu có).
- [ ] **Phân quyền** theo role (ẩn/hiện đúng `DEFAULT_TAB_VIS`).
- [ ] **Quy tắc hiển thị**: tiền `#.###`, ngày `DD/MM/YYYY`, chặn Enter/Esc.
- [ ] **Responsive** tới bề rộng điện thoại.
- [ ] **Chuông/alert** liên quan vẫn đúng.
- [ ] **Edge case** nghiệp vụ đã biết (cuốn ngày, trả kho, bù trừ công nợ, gộp hóa đơn…) không hồi quy.
- [ ] **Deep-link + mở tab mới** hoạt động (load thẳng URL vẫn auth + hiện đúng).

## 5. Cutover từng module
1. Module đạt parity → thêm link/đổi mặc định cho nhóm đó sang `/v2`.
2. Theo dõi 1 nhịp (vài ngày) → nếu ổn, bỏ lối cũ.
3. Khi tất cả xong → `/admin` chỉ còn redirect sang `/v2`; tag release; giữ code cũ 1–2 release để lùi.
