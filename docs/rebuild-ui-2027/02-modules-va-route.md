# 02 — Kiểm kê module, cây route & thứ tự port

Nguồn chuẩn cây tab: `src/lib/tabs.ts` (TAB_TREE). Dưới đây bám theo đó.

## 1. Kiểm kê module (office `/admin`)

| # | Tab cha | Tab con | Tab cháu (cấp 3) | Component hiện tại (tham chiếu) |
|---|---|---|---|---|
| 1 | **Sổ công tác** `cong_viec` | Giao việc `giao_viec` (mặc định) | — | `admin/page.tsx` (lõi) |
|   |  | Hoàn phiếu `hoan_phieu` | — |  |
|   |  | Báo cáo sửa chữa `bao_cao_khach` | — |  |
|   |  | Chăm sóc KH `cham_soc_kh` | (nội bộ) Cần chăm sóc · Danh sách · Pipeline · KPI | `CskhTool.tsx` |
| 2 | **Theo dõi máy** `theo_doi_may` | Bảo trì `bao_tri` | Đã/Chưa bảo trì · Tạm dừng · Đối chiếu năm · Thống kê | `BaoTriTool` |
|   |  | Giám định `giam_dinh` | — |  |
| 3 | **Kho hàng** `kho_hang` | Tồn kho · Đặt hàng · Thống kê nhập · Giá niêm yết · Kho máy thuê · Phiếu đề nghị | (Thuê/CPC: xem dưới) | KhoHangTool, DatHangTool, `PhieuDeNghiModule` |
| 4 | **Tài chính** `tai_chinh` | Công nợ `cong_no` | — | cong-no tool |
|   |  | Thuê / CPC `thue_cpc` | Đơn giá HĐ · Nhập counter · Hợp đồng khung · Bảng kê · Cảnh báo vật tư | `ThueCpcModule.tsx` |
|   |  | Phí bảo trì `phi_bao_tri` | — |  |
|   |  | Kanban Hóa đơn `kanban` | — | `KanbanHdTool.tsx` |
| 5 | **Quản lý** `quan_ly` | Báo cáo KTV `nhat_ky` · Danh sách khách hàng `khach_hang` · Khách hàng cụm `khach_cum` · Báo cáo tháng `bao_cao` · Nghỉ phép `nghi_phep` | — | nhiều tool |
| 6 | **Hệ thống** `he_thong` | (users, phân quyền tab, cấu hình…) | — | trong `admin/page.tsx` |
| 7 | Trợ lý AI `tro_ly` | nút nổi, không phải tab điều hướng | — | `TroLyAI` |

**Mặt khác (standalone, ngoài `/admin`):**
- `/ktv` — app kỹ thuật viên.
- `/m` — office mobile (5 tab).
- `/` — đăng nhập / landing.
- ⚠️ **Cần khảo sát ở session mới**: cổng tra cứu công khai (nếu có), các trang in (`SoTheoDoiPrint`…), export .docx (BBBG/ĐNTT/báo cáo tháng/báo giá).

> TODO (session mới): mở từng tool xác nhận **tab cháu + nút hành động + export** để không sót khi port.

## 2. Cây route đề xuất (base `/v2` khi chạy song song)
```
/(auth)/login
/v2                              → redirect tới module mặc định theo role
/v2/so-cong-tac/
    giao-viec
    hoan-phieu
    bao-cao-sua-chua
    cham-soc-kh?view=can|ds|pipeline|kpi     (hoặc /cham-soc-kh/[view])
/v2/theo-doi-may/
    bao-tri/[tab]                (da|chua|tam-dung|doi-chieu|thong-ke)
    giam-dinh
/v2/kho-hang/[tab]               (ton-kho|dat-hang|thong-ke|gia-niem-yet|may-thue|phieu-de-nghi)
/v2/tai-chinh/
    cong-no
    thue-cpc/[tab]               (don-gia|counter|khung|bang-ke|canh-bao-muc)
    phi-bao-tri
    kanban
/v2/quan-ly/[tab]                (bao-cao-ktv|khach-hang|khach-cum|bao-cao-thang|nghi-phep)
/v2/he-thong/[tab]
```
- **Layout** `app/v2/layout.tsx` = auth guard + shell (header + chuông + provider + realtime). Các trang con mỏng, chỉ ghép `features/*`.
- **Guard theo quyền**: `roleCanTab/subVisible` chuyển thành kiểm tra ở layout/segment; vào route không có quyền → redirect module mặc định.
- **Tab cháu**: dùng `[tab]` segment (URL đẹp, mở tab mới được) hoặc `?tab=` nếu muốn nhẹ. Thống nhất 1 cách.

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
