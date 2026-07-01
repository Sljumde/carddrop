import { getSheetsClient } from './sheets'

export type ApiQuotaSummary = {
  provider: string
  keyNo: number
  envKey: string
  dailyCap: number
  usedToday: number
  remaining: number
  status: string
}

type ProviderQuotaConfig = ApiQuotaSummary & {
  defaultDailyCap: number
}

type ApiQuotaRow = ApiQuotaSummary & {
  date: string
  rowNumber: number
  lastError: string
}

const SHEET_NAME = 'API_QUOTA'
const HEADERS = ['Date', 'Provider', 'Key No', 'Env Key', 'Daily Cap', 'Used Today', 'Remaining', 'Status', 'Last Error']

const PROVIDERS: ProviderQuotaConfig[] = [
  { provider: 'Groq', keyNo: 1, envKey: 'GROQ_API_KEY_1', dailyCap: 1000, usedToday: 0, remaining: 1000, status: 'ACTIVE', defaultDailyCap: 1000 },
  { provider: 'Groq', keyNo: 2, envKey: 'GROQ_API_KEY_2', dailyCap: 1000, usedToday: 0, remaining: 1000, status: 'ACTIVE', defaultDailyCap: 1000 },
  { provider: 'Groq', keyNo: 3, envKey: 'GROQ_API_KEY_3', dailyCap: 1000, usedToday: 0, remaining: 1000, status: 'ACTIVE', defaultDailyCap: 1000 },
  { provider: 'Gemini', keyNo: 1, envKey: 'GOOGLE_AI_API_KEY_1', dailyCap: 10, usedToday: 0, remaining: 10, status: 'ACTIVE', defaultDailyCap: 10 },
  { provider: 'Gemini', keyNo: 2, envKey: 'GOOGLE_AI_API_KEY_2', dailyCap: 10, usedToday: 0, remaining: 10, status: 'ACTIVE', defaultDailyCap: 10 },
  { provider: 'Gemini', keyNo: 3, envKey: 'GOOGLE_AI_API_KEY_3', dailyCap: 10, usedToday: 0, remaining: 10, status: 'ACTIVE', defaultDailyCap: 10 },
  { provider: 'OCR', keyNo: 1, envKey: 'OCR_API_KEY_1', dailyCap: 500, usedToday: 0, remaining: 500, status: 'ACTIVE', defaultDailyCap: 500 },
]

const toNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const getToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const isQuotaError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  const status = (error as { status?: number })?.status
  return status === 429 || /quota|rate.?limit|too many requests|resource exhausted/i.test(message)
}

export class ApiQuotaTracker {
  private sheets = getSheetsClient()
  private spreadsheetId = process.env.GOOGLE_SHEET_ID!
  private rows: ApiQuotaRow[] = []
  readonly today = getToday()

  static async create() {
    const tracker = new ApiQuotaTracker()
    await tracker.ensureSheet()
    await tracker.ensureHeaders()
    await tracker.reloadRows()
    await tracker.ensureTodayRows()
    return tracker
  }

  private async ensureSheet() {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title',
    })

    const exists = spreadsheet.data.sheets?.some(sheet => sheet.properties?.title === SHEET_NAME)
    if (exists) return

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    })
  }

  private async ensureHeaders() {
    const current = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A1:I1`,
    }).catch(() => null)

    const values = current?.data.values?.[0] || []
    const matches = HEADERS.every((header, index) => values[index] === header)
    if (matches) return

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    })
  }

  private async reloadRows() {
    const result = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A2:I`,
    }).catch(() => ({ data: { values: [] as string[][] } }))

    this.rows = (result.data.values || []).map((row, index) => {
      const dailyCap = toNumber(row[4])
      const usedToday = toNumber(row[5])
      return {
        date: row[0] || '',
        provider: row[1] || '',
        keyNo: toNumber(row[2]),
        envKey: row[3] || '',
        dailyCap,
        usedToday,
        remaining: Math.max(dailyCap - usedToday, 0),
        status: row[7] || 'ACTIVE',
        lastError: row[8] || '',
        rowNumber: index + 2,
      }
    })
  }

  private getPreviousCap(envKey: string, fallback: number) {
    const previous = this.rows.slice().reverse().find(row => row.envKey === envKey && row.dailyCap > 0)
    return previous?.dailyCap || fallback
  }

  private async ensureTodayRows() {
    const values = PROVIDERS
      .filter(provider => !this.rows.some(row => row.date === this.today && row.envKey === provider.envKey))
      .map(provider => {
        const cap = this.getPreviousCap(provider.envKey, provider.defaultDailyCap)
        return [this.today, provider.provider, provider.keyNo, provider.envKey, cap, 0, cap, 'ACTIVE', '']
      })

    if (values.length > 0) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_NAME}!A:I`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      })
      await this.reloadRows()
    }
  }

  private getTodayRow(envKey: string) {
    return this.rows.find(row => row.date === this.today && row.envKey === envKey)
  }

  async canUse(envKey: string) {
    await this.reloadRows()
    const row = this.getTodayRow(envKey)
    if (!row) return { allowed: false, reason: 'quota row missing' }
    if (row.status === 'QUOTA_OVER') return { allowed: false, reason: 'quota over' }
    if (row.remaining <= 0) return { allowed: false, reason: 'no remaining quota' }
    return { allowed: true, reason: '' }
  }

  async incrementUsed(envKey: string) {
    await this.reloadRows()
    const row = this.getTodayRow(envKey)
    if (!row) throw new Error(`Quota row missing for ${envKey}`)

    const usedToday = row.usedToday + 1
    const remaining = Math.max(row.dailyCap - usedToday, 0)

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!F${row.rowNumber}:H${row.rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[usedToday, remaining, row.status || 'ACTIVE']] },
    })

    await this.reloadRows()
  }

  async recordResult(envKey: string, error?: unknown) {
    await this.reloadRows()
    const row = this.getTodayRow(envKey)
    if (!row) return

    const status = error && isQuotaError(error) ? 'QUOTA_OVER' : 'ACTIVE'
    const lastError = status === 'QUOTA_OVER'
      ? error instanceof Error ? error.message : String(error || '')
      : row.lastError

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!H${row.rowNumber}:I${row.rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status, lastError]] },
    })

    await this.reloadRows()
  }

  async getSummary(): Promise<ApiQuotaSummary[]> {
    await this.reloadRows()
    return PROVIDERS.map(provider => {
      const row = this.getTodayRow(provider.envKey)
      const dailyCap = row?.dailyCap || provider.defaultDailyCap
      const usedToday = row?.usedToday || 0
      return {
        provider: provider.provider,
        keyNo: provider.keyNo,
        envKey: provider.envKey,
        dailyCap,
        usedToday,
        remaining: Math.max(dailyCap - usedToday, 0),
        status: row?.status || 'ACTIVE',
      }
    })
  }
}

