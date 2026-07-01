export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
          <div className="flex gap-4">
            <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 font-medium">Sổ công tác</button>
            <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100 font-medium">Kho hàng</button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">Công việc hôm nay</h2>
            <p className="text-slate-500">Chưa có dữ liệu giao việc...</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">Tình trạng nhập hàng</h2>
            <p className="text-slate-500">Chưa có dữ liệu đơn hàng...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
