# Spec — Tính đúng "Thời hạn hợp đồng" khi in Sổ theo dõi máy

**Trạng thái:** ĐANG CODE (11/11/2026). Không schema, không migration.

## 1. Sự cố
Modal/in hàng loạt Sổ theo dõi máy điền `Thời hạn hợp đồng` = `[ngay_het_han_hdbt] → [ngay_het_han_hdbt + 1 năm]`. Lấy **ngày hết hạn làm ngày BẮT ĐẦU** → ra kỳ tương lai sai. Ví dụ máy 22954 hết hạn 30/09/2027, sổ in ra "30/09/2027 → 30/09/2028" (sai), đúng phải là **30/09/2026 → 30/09/2027**.

## 2. Gốc rễ
Record máy chỉ lưu **ngày hết hạn** (`ngay_het_han_hdbt`), không lưu ngày bắt đầu. Code đoán sai chiều. Thêm nữa, năm trong ngày hết hạn **lúc cũ lúc mới** tùy office đã ký lại hợp đồng chưa → không đáng tin để tính kỳ.

## 3. Nguyên tắc (hợp đồng LUÔN 1 năm)
**Bỏ hẳn phụ thuộc vào NĂM đang lưu.** Chỉ mượn **ngày/tháng** (mốc kỷ niệm HĐ, vd 30/09) từ `ngay_het_han_hdbt`; để **ngày in (hôm nay, giờ VN)** quyết định kỳ:

- Mốc năm nay = `30/09/<năm hiện tại>`.
- Nếu **hôm nay < mốc năm nay** → `từ = 30/09/(năm nay − 1)`, `đến = 30/09/năm nay`.
- Nếu **hôm nay ≥ mốc năm nay** → `từ = 30/09/năm nay`, `đến = 30/09/(năm nay + 1)`.

Tức `đến` = mốc kỷ niệm sắp tới tính từ hôm nay; `từ = đến − 1 năm`. **Năm đang lưu không tham gia tính.**

### Hệ quả: 2 tình huống thực tế đều đúng (mốc 30/09, in đầu 10/2026)
| Tình huống | `ngay_het_han_hdbt` lưu | Kết quả MỚI |
|---|---|---|
| (a) in **trước** khi ký mới | 30/09/2026 (cũ) | 30/09/2026 → 30/09/2027 ✓ |
| (b) in **sau** khi ký mới | 30/09/2027 (mới) | 30/09/2026 → 30/09/2027 ✓ |

→ Cả hai ra **cùng một kỳ đúng**, bất kể office đã cập nhật hết hạn hay chưa.

## 4. Thực thi
- Thêm helper dùng chung trong `src/components/SoTheoDoiPrint.tsx`:
  `kyHopDongTheoMoc(base: string, now?: Date): { tu: string; den: string }` — base = `ngay_het_han_hdbt` (YYYY-MM-DD). Rỗng/không hợp lệ → `{ '', '' }`.
- Dùng helper ở **cả 2 chỗ**: `autoMan()` (in hàng loạt, ~dòng 191‑193) và `openModal()` (modal 1 máy, ~dòng 233‑238).
- So sánh theo chuỗi `YYYY-MM-DD` (an toàn timezone); hôm nay theo **giờ VN** (`+7h`).

## 5. Vùng xám (chấp nhận, KHÔNG thêm nút)
Office in **sớm hẳn** trước mốc (vd in giữa tháng 8 cho kỳ bắt đầu 30/09) → helper trả kỳ đang kết thúc thay vì kỳ sắp bắt đầu. **Ô "Thời hạn" trong modal vẫn sửa tay được** → office tự chỉnh ca hiếm này. (Theo chốt: KHÔNG làm nút "Kỳ kế tiếp".) In hàng loạt không có ô sửa tay nhưng cũng hiếm khi in sớm hẳn.

## 6. Không thuộc phạm vi
Không thêm cột ngày bắt đầu HĐ; không migration; không đụng logic khác của sổ (QR, 12 ô ghi tay). Liên quan [[so-theo-doi-may-print]], [[format-rules]].
