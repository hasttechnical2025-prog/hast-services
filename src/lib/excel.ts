// Xuất .xlsx (exceljs) — tái dùng cho mọi màn /v2. Dùng CHUNG, giữ đúng style bản admin
// (header xanh HSTC, freeze dòng tiêu đề, cột tự rộng). Quy tắc: xuất Excel, KHÔNG CSV.
export async function exportRowsToExcel(filename: string, headers: string[], rows: any[][]): Promise<void> {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')

  const h = ws.addRow(headers)
  h.font = { bold: true, color: { argb: 'FF1E3A8A' } }
  h.alignment = { vertical: 'middle' }
  h.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB6CDE4' } } }
  })

  for (const r of rows) ws.addRow(r.map(v => v == null ? '' : v))

  headers.forEach((hd, i) => {
    let max = String(hd).length
    for (const r of rows) { const v = r[i]; const len = v == null ? 0 : String(v).length; if (len > max) max = len }
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, max + 2))
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = String(filename).replace(/[\\/:*?"<>|]+/g, '-')
  a.href = url
  a.download = `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
