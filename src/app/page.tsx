import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
        <h1 className="text-3xl font-bold mb-6 text-slate-800">Tech-Service App</h1>
        <p className="mb-8 text-slate-600">Hệ thống Quản lý Giao việc & Kho hàng</p>

        <div className="flex flex-col gap-4">
          <Link
            href="/admin"
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
          >
            Dashboard Admin (Văn phòng)
          </Link>

          <Link
            href="/ktv"
            className="w-full py-3 px-4 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition font-medium"
          >
            Sổ công tác Mobile (KTV)
          </Link>
        </div>
      </div>
    </main>
  )
}
