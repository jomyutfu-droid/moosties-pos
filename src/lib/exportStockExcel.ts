import * as XLSX from 'xlsx'
import type { Ingredient } from '@/types'

function getStockStatus(ingredient: Ingredient) {
  const stockQty = Number(ingredient.stock_qty ?? 0)
  const reorderPoint = Number(ingredient.reorder_point ?? 0)
  if (stockQty <= 0) return 'หมด'
  if (reorderPoint > 0 && stockQty <= reorderPoint) return 'ใกล้หมด'
  return 'ปกติ'
}

/** ส่งออกวัตถุดิบทั้งหมดเป็นไฟล์ Excel สำหรับตรวจสอบสต๊อก */
export function exportIngredientsToExcel(ingredients: Ingredient[]) {
  const exportedAt = new Date()
  const sorted = [...ingredients].sort((a, b) => {
    const categoryCompare = (a.category || '').localeCompare(b.category || '', 'th')
    return categoryCompare || a.name.localeCompare(b.name, 'th')
  })

  const rows = sorted.map((ingredient) => {
    const stockQty = Number(ingredient.stock_qty ?? 0)
    const costPerUnit = Number(ingredient.cost_per_unit ?? 0)
    return {
      หมวดหมู่: ingredient.category?.trim() || 'ไม่ระบุหมวด',
      วัตถุดิบ: ingredient.name,
      หน่วย: ingredient.unit || '-',
      คงเหลือ: stockQty,
      จุดสั่งซื้อ: Number(ingredient.reorder_point ?? 0),
      'ต้นทุน/หน่วย': costPerUnit,
      มูลค่าสต๊อก: stockQty * costPerUnit,
      สถานะ: ingredient.is_active ? 'ใช้งาน' : 'ปิดใช้งาน',
      สถานะสต๊อก: getStockStatus(ingredient),
    }
  })

  const totalValue = rows.reduce((sum, row) => sum + row.มูลค่าสต๊อก, 0)
  const lowStockCount = rows.filter((row) => row.สถานะสต๊อก !== 'ปกติ').length
  const activeCount = sorted.filter((ingredient) => ingredient.is_active).length

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['รายงานสต๊อกคงเหลือ Moosties'],
    ['วันที่ส่งออก', exportedAt],
    [],
    ['รายการสรุป', 'จำนวน / มูลค่า'],
    ['วัตถุดิบทั้งหมด', sorted.length],
    ['กำลังใช้งาน', activeCount],
    ['ปิดใช้งาน', sorted.length - activeCount],
    ['หมดหรือใกล้หมด', lowStockCount],
    ['มูลค่าสต๊อกรวม', totalValue],
  ])
  summarySheet['!cols'] = [{ wch: 26 }, { wch: 22 }]
  if (summarySheet.B2) summarySheet.B2.z = 'yyyy-mm-dd hh:mm'
  if (summarySheet.B9) summarySheet.B9.z = '#,##0.00'

  const stockSheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'หมวดหมู่',
      'วัตถุดิบ',
      'หน่วย',
      'คงเหลือ',
      'จุดสั่งซื้อ',
      'ต้นทุน/หน่วย',
      'มูลค่าสต๊อก',
      'สถานะ',
      'สถานะสต๊อก',
    ],
  })
  stockSheet['!cols'] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
  ]
  stockSheet['!autofilter'] = { ref: `A1:I${rows.length + 1}` }

  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber += 1) {
    for (const column of ['D', 'E']) {
      const cell = stockSheet[`${column}${rowNumber}`]
      if (cell) cell.z = '#,##0.###'
    }
    for (const column of ['F', 'G']) {
      const cell = stockSheet[`${column}${rowNumber}`]
      if (cell) cell.z = '#,##0.00'
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, stockSheet, 'สต๊อกคงเหลือ')

  const datePart = exportedAt.toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `moosties-stock-${datePart}.xlsx`)
}
