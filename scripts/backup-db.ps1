# Sao lưu database Supabase (pg_dump -Fc) về <app>/backups, có xoay vòng.
# Dùng cho Task Scheduler (chạy HÀNG TUẦN). Xem hướng dẫn: scripts/BACKUP-README.md
#
# Chuỗi kết nối để trong scripts/.backup-conn (1 dòng, ĐÃ gitignore) -> KHÔNG hardcode secret vào script.
$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot            # thư mục app (cha của scripts)
$backupDir = Join-Path $root 'backups'
$connFile  = Join-Path $PSScriptRoot '.backup-conn'      # dán chuỗi Session pooler (có mật khẩu) vào đây

# --- Kết nối ---
if (-not (Test-Path $connFile)) {
  Write-Error "Thiếu $connFile. Tạo file này và dán chuỗi kết nối 'Session pooler' của Supabase (1 dòng)."
  exit 1
}
$conn = (Get-Content $connFile -Raw).Trim()
if (-not $conn) { Write-Error "File $connFile rỗng."; exit 1 }

# --- Tìm pg_dump ---
$pgDump = $null
if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
  $pgDump = 'pg_dump'
} else {
  $cand = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1
  if ($cand) { $pgDump = $cand.FullName }
}
if (-not $pgDump) { Write-Error "Không tìm thấy pg_dump. Cài PostgreSQL client trước (xem BACKUP-README.md)."; exit 1 }

# --- Chạy dump ---
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$out   = Join-Path $backupDir "soct_$stamp.dump"

& $pgDump --dbname=$conn -Fc --no-owner --no-privileges -f $out
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump lỗi (exit $LASTEXITCODE)."; exit 1 }
$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "OK: $out ($mb MB)"

# --- Xoay vòng: giữ 8 bản gần nhất + 1 bản/tháng cho 6 tháng gần nhất, xóa còn lại ---
$all  = Get-ChildItem $backupDir -Filter 'soct_*.dump' | Sort-Object LastWriteTime -Descending
$keep = New-Object System.Collections.Generic.HashSet[string]
$all | Select-Object -First 8 | ForEach-Object { [void]$keep.Add($_.FullName) }
$all | Group-Object { $_.LastWriteTime.ToString('yyyyMM') } |
  Sort-Object Name -Descending | Select-Object -First 6 | ForEach-Object {
    $newest = $_.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    [void]$keep.Add($newest.FullName)
  }
$all | Where-Object { -not $keep.Contains($_.FullName) } | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host "Xoa ban cu: $($_.Name)"
}
Write-Host "Hoan tat. So ban dang giu: $((Get-ChildItem $backupDir -Filter 'soct_*.dump').Count)"
