import { NextRequest, NextResponse } from 'next/server'
import { getSheetsClient, toShortDisplayTimestamp } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

const parseSheetTimestamp = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (!match) return null

  const [, day, month, year, hour, minute, second] = match
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

const parseDateFilter = (value: string, endOfDay = false) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0)
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const query = (searchParams.get('q') || '').trim().toLowerCase()
    const from = parseDateFilter(searchParams.get('from') || '')
    const to = parseDateFilter(searchParams.get('to') || '', true)

    const sheets = getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: 'CARDS SCANNED!A:I',
    })

    const rows = res.data.values || []
    const dataRows = rows.slice(1).filter(row => row.some(Boolean))
    const filteredRows = dataRows.filter(row => {
      const timestamp = parseSheetTimestamp(row[0] || '')
      const haystack = row.join(' ').toLowerCase()

      if (from && (!timestamp || timestamp < from)) return false
      if (to && (!timestamp || timestamp > to)) return false
      if (query && !haystack.includes(query)) return false

      return true
    })

    const cards = filteredRows.slice().reverse().map(row => ({
      timestamp: toShortDisplayTimestamp(row[0] || ''),
      submittedAt: row[0] || '',
      name: row[1] || '',
      email: row[2] || '',
      phone: row[3] || '',
      company: row[4] || '',
      designation: row[5] || '',
      website: row[6] || '',
      remarks: row[7] || '',
      submittedBy: row[8] || '',
    }))

    return NextResponse.json({ success: true, total: dataRows.length, submitted: filteredRows.length, cards })
  } catch (err: any) {
    console.error('Cards scanned list error:', err)
    return NextResponse.json({ error: err.message || 'Could not load cards scanned' }, { status: 500 })
  }
}
