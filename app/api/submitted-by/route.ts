import { NextResponse } from 'next/server'
import { getSheetsClient } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sheets = getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: 'SETTINGS!A2:A',
    })

    const names = (res.data.values || [])
      .map(row => (row[0] || '').trim())
      .filter(Boolean)

    return NextResponse.json({ success: true, names })
  } catch (err: any) {
    console.error('Submitted by settings error:', err)
    return NextResponse.json({ error: err.message || 'Could not load submitter names' }, { status: 500 })
  }
}
