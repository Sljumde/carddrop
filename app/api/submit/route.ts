import { NextRequest, NextResponse } from 'next/server'
import { formatSheetTimestamp, getSheetsClient } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, company, designation, website, remarks, submittedBy } = await req.json()
    const sheets = getSheetsClient()
    const timestamp = formatSheetTimestamp()

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: 'CARDS SCANNED!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp, name, email, phone, company, designation, website, remarks, submittedBy]],
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Sheets submit error:', err)
    return NextResponse.json({ error: err.message || 'Submit failed' }, { status: 500 })
  }
}
