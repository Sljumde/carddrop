import { google } from 'googleapis'

export const getSheetsClient = () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
  const fixed = raw.replace(/\n/g, '\\n')
  const credentials = JSON.parse(fixed)

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return google.sheets({ version: 'v4', auth })
}

export const formatSheetTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export const toShortDisplayTimestamp = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/)
  if (!match) return value

  const [, day, month, year, hour, minute] = match
  return `${day}-${month}-${year.slice(-2)} ${hour}:${minute}`
}
