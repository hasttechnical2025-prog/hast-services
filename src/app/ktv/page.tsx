import Link from 'next/link'

export default function KtvMobileWeb() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 shadow-md">
        <h1 className="text-xl font-bold">KTV - Sổ công tác</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 mb-4">
          <h2 className="font-semibold text-slate-800 mb-2">Thông tin tài khoản</h2>
          <p className="text-sm text-slate-500 mb-4">Chưa đăng nhập</p>

          {/* Nút liên kết tạm thời hiển thị cho mục đích UI (sau này sẽ ẩn/hiện dựa vào trạng thái login) */}
          <Link
            href="https://t.me/YOUR_BOT_USERNAME?start=TEMP_USER_ID"
            target="_blank"
            className="flex items-center justify-center gap-2 w-full py-2 bg-blue-500 text-white rounded-md font-medium text-sm hover:bg-blue-600 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.58s-.3 1.2-.8 1.58l-15.4 11.2c-.7.5-1.6.4-2.2-.2-.6-.6-.7-1.5-.2-2.2L12 12 3.4 3.6c-.5-.7-.4-1.6.2-2.2.6-.6 1.5-.7 2.2-.2l15.4 11.2Z"/></svg>
            Liên kết Telegram để nhận việc
          </Link>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
          <h2 className="font-semibold text-slate-800 mb-4">Danh sách công việc</h2>
          <p className="text-sm text-slate-500">Không có công việc nào được giao hôm nay.</p>
        </div>
      </main>
    </div>
  )
}
