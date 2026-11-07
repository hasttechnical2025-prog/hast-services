// Rung phản hồi ngắn khi bấm nút quan trọng trên mobile (Nhận việc / Bắt đầu / Hoàn thành…).
// Cho KTV ngoài hiện trường (nắng, găng tay, ồn) biết chắc "đã bấm trúng". Không hỗ trợ (iOS
// Safari) thì bỏ qua êm. ms: 15 = chạm nhẹ; [10,40,10] = nhịp đôi cho hành động xác nhận lớn.
export function haptic(pattern: number | number[] = 15): void {
  try { (navigator as any)?.vibrate?.(pattern) } catch { /* không hỗ trợ */ }
}
