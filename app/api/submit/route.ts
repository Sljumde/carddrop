import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, company, designation, website, remarks } = await req.json()

    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
    // Fix common issue: literal newlines in private_key getting escaped wrong
    const fixed = raw.replace(/\n/g, '\\n')
    const credentials = JSON.parse(fixed)

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp, name, email, phone, company, designation, website, remarks]],
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Sheets submit error:', err)
    return NextResponse.json({ error: err.message || 'Submit failed' }, { status: 500 })
  }
}