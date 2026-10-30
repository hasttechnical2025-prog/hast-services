'use client'

import { useState } from 'react'
import { Database, Download, RotateCcw, Clock, HardDrive, ShieldAlert, Copy, Check, Terminal } from 'lucide-react'

// Hướng dẫn Sao lưu / Khôi phục CSDL (tĩnh, chỉ-đọc) — đồng bộ với scripts/BACKUP-README.md.
// Dùng String.raw để giữ nguyên dấu \ trong đường dẫn Windows & lệnh schtasks.
const APP = String.raw`D:\Claude Code\App So Cong tac`
const CMD = {
  checkVer: String.raw`& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --version`,
  conn: String.raw`postgresql://postgres.gdlsyktofnvmzajocfcs:[MẬT-KHẨU]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`,
  run: String.raw`powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Claude Code\App So Cong tac\scripts\backup-db.ps1"`,
  schedule: String.raw`schtasks /Create /TN "HAST Backup DB" /SC WEEKLY /D SUN /ST 20:00 /F /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"D:\Claude Code\App So Cong tac\scripts\backup-db.ps1\""`,
  runNow: String.raw`schtasks /Run /TN "HAST Backup DB"`,
  delSchedule: String.raw`schtasks /Delete /TN "HAST Backup DB" /F`,
  restore: String.raw`& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --dbname="postgresql://postgres.<REF-TEST>:[MẬT-KHẨU]@<host-test>:5432/postgres" --clean --if-exists --no-owner --no-privileges "D:\Claude Code\App So Cong tac\backups\soct_YYYYMMDD_HHmm.dump"`,
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 pr-11 text-[12px] leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap break-all">{code}</pre>
      <button onClick={copy} title="Copy lệnh" className={`absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md border transition ${copied ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-slate-700/80 border-slate-600 text-slate-200 hover:bg-slate-600'}`}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function Section({ icon: Icon, title, tone = 'blue', children }: { icon: any, title: string, tone?: 'blue' | 'emerald' | 'amber' | 'violet', children: React.ReactNode }) {
  const tones: Record<string, string> = { blue: 'text-blue-600 bg-blue-50', emerald: 'text-emerald-600 bg-emerald-50', amber: 'text-amber-600 bg-amber-50', violet: 'text-violet-600 bg-violet-50' }
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${tones[tone]}`}><Icon className="w-4 h-4" /></span>
        {title}
      </h3>
      <div className="space-y-3 text-sm text-slate-600 leading-relaxed">{children}</div>
    </section>
  )
}

function Step({ n, title, children }: { n: number, title: string, children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold inline-flex items-center justify-center mt-0.5">{n}</span>
      <div className="space-y-2 flex-1 min-w-0">
        <p className="font-semibold text-slate-700">{title}</p>
        {children}
      </div>
    </div>
  )
}

export function BackupGuideTool() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Giới thiệu */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-1"><Database className="w-5 h-5 text-blue-600" /> Sao lưu &amp; Khôi phục CSDL</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          App dùng Supabase gói <b>Free</b> (backup máy chủ hạn chế) nên ta <b>tự sao lưu về PC</b> bằng <code className="font-mono text-blue-700">pg_dump</code>.
          App <b>không dùng Supabase Storage</b> → toàn bộ dữ liệu nằm trong Postgres, <code className="font-mono text-blue-700">pg_dump</code> là đủ trọn vẹn.
          Backup lưu ở <code className="font-mono text-slate-700">{APP}\backups\</code> (đã gitignore). File gốc chi tiết: <code className="font-mono text-slate-700">scripts\BACKUP-README.md</code>.
        </p>
      </div>

      {/* Thiết lập lần đầu */}
      <Section icon={Download} title="Thiết lập lần đầu (chỉ làm 1 lần)" tone="blue">
        <Step n={1} title="Cài PostgreSQL client (pg_dump / pg_restore)">
          <p>Tải <b>PostgreSQL 17 trở lên</b> cho Windows tại <span className="font-mono text-blue-700">postgresql.org/download/windows</span>. Khi cài chỉ cần tick <b>“Command Line Tools”</b> (có thể bỏ “PostgreSQL Server” để khỏi bị hỏi Port/mật khẩu). Script tự dò bản mới nhất trong <span className="font-mono">C:\Program Files\PostgreSQL\…\bin</span> nên không cần thêm PATH.</p>
          <p className="text-xs text-slate-400">Kiểm tra (đổi 18 thành phiên bản đã cài):</p>
          <CodeBlock code={CMD.checkVer} />
          <p className="text-xs text-slate-400">Client phải ≥ server (Supabase PG 15/17) — 17 hoặc 18 đều đạt.</p>
        </Step>
        <Step n={2} title="Tạo file chuỗi kết nối scripts\.backup-conn">
          <p>Supabase Dashboard → nút <b>Connect</b> → <b>Connection string</b> → kiểu <b>Session pooler</b> (cổng 5432, hỗ trợ IPv4 — đừng dùng Transaction pooler 6543) → copy URI. Dán <b>đúng 1 dòng</b> vào file <span className="font-mono">scripts\.backup-conn</span> (đã gitignore), thay <span className="font-mono">[MẬT-KHẨU]</span> bằng Database password:</p>
          <CodeBlock code={CMD.conn} />
          <p className="text-xs text-slate-400">Quên mật khẩu? Project Settings → Database → Reset database password (KHÔNG ảnh hưởng app vì app dùng service-role key, không dùng mật khẩu Postgres).</p>
        </Step>
        <Step n={3} title="Chạy thử">
          <CodeBlock code={CMD.run} />
          <p className="text-xs text-slate-400">Thành công sẽ hiện <span className="font-mono text-emerald-600">OK: …\backups\soct_YYYYMMDD_HHmm.dump (x MB)</span>.</p>
        </Step>
        <Step n={4} title="Đặt lịch tự động HÀNG TUẦN (PowerShell quyền Admin)">
          <p>Chủ nhật 20:00 (đổi tùy ý):</p>
          <CodeBlock code={CMD.schedule} />
        </Step>
      </Section>

      {/* Backup hằng ngày */}
      <Section icon={Clock} title="Sao lưu định kỳ &amp; chạy tay" tone="emerald">
        <p>Sau khi đặt lịch, backup <b>tự chạy hàng tuần</b>, file đổ về <span className="font-mono text-slate-700">{APP}\backups\</span>. Xoay vòng tự động: giữ <b>8 bản gần nhất</b> + <b>1 bản/tháng cho 6 tháng</b>, bản cũ hơn tự xóa.</p>
        <p className="font-semibold text-slate-700">Muốn backup ngay lúc nào (vd trước khi chạy migration lớn):</p>
        <CodeBlock code={CMD.run} />
        <p className="font-semibold text-slate-700 pt-1">Lệnh tiện ích cho lịch:</p>
        <p className="text-xs text-slate-400">Chạy lịch ngay bây giờ:</p>
        <CodeBlock code={CMD.runNow} />
        <p className="text-xs text-slate-400">Gỡ lịch:</p>
        <CodeBlock code={CMD.delSchedule} />
        <p className="text-xs text-amber-600">⚠ PC phải đang bật vào giờ hẹn. Hay tắt máy thì chọn giờ chắc chắn mở, hoặc trong Task Scheduler tick “Run task as soon as possible after a scheduled start is missed”.</p>
      </Section>

      {/* Restore */}
      <Section icon={RotateCcw} title="Khôi phục (restore)" tone="violet">
        <p>Khôi phục vào <b>1 project Supabase TEST</b> (hoặc Postgres local) — <b className="text-rose-600">đừng restore đè lên DB đang chạy</b> trừ khi thực sự cần. Thay <span className="font-mono">&lt;REF-TEST&gt;</span>, <span className="font-mono">&lt;host-test&gt;</span>, <span className="font-mono">[MẬT-KHẨU]</span> và tên file .dump:</p>
        <CodeBlock code={CMD.restore} />
        <p className="text-xs text-slate-400"><span className="font-mono">--clean --if-exists</span> xóa đối tượng cũ trước khi nạp; <span className="font-mono">--no-owner --no-privileges</span> bỏ phân quyền của bản gốc.</p>
      </Section>

      {/* Nhắc quan trọng */}
      <Section icon={ShieldAlert} title="Phải nhớ" tone="amber">
        <ul className="space-y-2 list-none">
          <li className="flex gap-2"><ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><span><b>Secrets KHÔNG nằm trong dump.</b> Tự lưu riêng vào trình quản lý mật khẩu: <span className="font-mono text-xs">SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, CRON_SECRET</span> (ở Vercel env).</span></li>
          <li className="flex gap-2"><HardDrive className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><span><b>Quy tắc 3-2-1:</b> <span className="font-mono">backups\</span> chỉ nằm trên 1 ổ → hỏng ổ là mất. Copy định kỳ sang <b>Google Drive</b> / ổ cứng ngoài, hoặc trỏ Google Drive for Desktop đồng bộ thư mục này.</span></li>
          <li className="flex gap-2"><Terminal className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><span><b>Test khôi phục 1–2 lần/quý</b> vào project test — <i>backup chưa test coi như chưa có</i>. Và kiểm tra file mới sinh ra hàng tuần (kích thước &gt; 0).</span></li>
        </ul>
      </Section>

      <p className="text-center text-xs text-slate-400 pb-2">Project ref Supabase: <span className="font-mono">gdlsyktofnvmzajocfcs</span> · region Sydney (ap-southeast-2)</p>
    </div>
  )
}
