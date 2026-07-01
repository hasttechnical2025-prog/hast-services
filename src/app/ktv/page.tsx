export default function KtvMobileWeb() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 shadow-md">
        <h1 className="text-xl font-bold">KTV - Sổ công tác</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 mb-4">
          <h2 className="font-semibold text-slate-800 mb-2">Thông tin tài khoản</h2>
          <p className="text-sm text-slate-500">Chưa đăng nhập</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
          <h2 className="font-semibold text-slate-800 mb-4">Danh sách công việc</h2>
          <p className="text-sm text-slate-500">Không có công việc nào được giao hôm nay.</p>
        </div>
      </main>
    </div>
  )
}
