// Điều hướng sau đăng nhập theo VAI TRÒ × THIẾT BỊ.
// Dùng CHUNG cho trang /login (form mật khẩu) và PasskeyLoginButton (vân tay/Face ID)
// để mọi lối đăng nhập đều đáp đúng một chỗ, không lệch nhau.

/** Thiết bị di động? (User-Agent điện thoại hoặc màn hình hẹp < 768px) */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768
}

/**
 * Đường dẫn đích sau khi đăng nhập thành công.
 * - ktv            -> /ktv (luôn, cả PC lẫn mobile)
 * - kinh_doanh     -> /lenh-xuat-hang (bản PC; app tự chặn kinh_doanh trên mobile)
 * - admin/tech_admin trên MOBILE -> /m (Office Mobile gọn, đi hiện trường)
 * - còn lại (admin/tech_admin PC, staff, kthc) -> /qlkt
 *   (staff/kthc KHÔNG có bản /m: OFFICE_ROLES=['admin','tech_admin'] -> luôn /qlkt)
 */
export function postLoginPath(role: string): string {
  if (role === 'ktv') return '/ktv'
  if (role === 'kinh_doanh') return '/lenh-xuat-hang'
  if (isMobileDevice() && (role === 'admin' || role === 'tech_admin')) return '/m'
  return '/qlkt'
}
