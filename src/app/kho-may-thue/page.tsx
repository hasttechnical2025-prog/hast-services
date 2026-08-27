import { redirect } from 'next/navigation'

// Alias: /kho-may-thue -> /kho-thue (trang CHỈ ĐỌC cho phòng Kinh doanh tra cứu kho máy thuê).
// Giữ để link cũ /kho-may-thue mà các phòng ban đang dùng vẫn hoạt động.
export default function KhoMayThueAlias() {
  redirect('/kho-thue')
}
