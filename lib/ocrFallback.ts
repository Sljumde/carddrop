import { logScanAttempt, type ScanAttemptLog } from './scanLogger'

export type ScanImageInput = {
  imageBase64: string
  mimeType?: string
  side?: string
}

export type OcrResult = {
  text: string
  errors: string[]
  attempts: ScanAttemptLog[]
}

const OCR_MODEL = 'ocr.space/parse-image'
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503])
const REQUEST_TIMEOUT_MS = 30000

const withTimeout = async <T>(operation: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs)
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const isRetryable = (status: number, error?: unknown) => {
  if (RETRYABLE_STATUSES.has(status)) return true
  return error instanceof Error && error.message.toLowerCase().includes('timeout')
}

export const isUsableOcrText = (text: string) => {
  const clean = text.trim()
  return (
    clean.length > 20 ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(clean) ||
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(clean) ||
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i.test(clean)
  )
}

export const runOcr = async (images: ScanImageInput[]): Promise<OcrResult> => {
  const apiKey = process.env.OCR_API_KEY_1
  const attempts: ScanAttemptLog[] = []
  const errors: string[] = []

  if (!apiKey) {
    errors.push('OCR_API_KEY_1 is not configured')
    return { text: '', errors, attempts }
  }

  const texts: string[] = []

  for (let index = 0; index < images.length; index++) {
    const image = images[index]
    let lastError: unknown

    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now()
      let status = 0

      try {
        const form = new FormData()
        form.append('apikey', apiKey)
        form.append('base64Image', `data:${image.mimeType || 'image/jpeg'};base64,${image.imageBase64}`)
        form.append('language', 'eng')
        form.append('OCREngine', '2')
        form.append('scale', 'true')
        form.append('isTable', 'false')

        const response = await withTimeout(fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          body: form,
        }))

        status = response.status
        const json = await response.json()

        if (!response.ok || json?.IsErroredOnProcessing) {
          throw new Error(json?.ErrorMessage?.join?.(', ') || json?.ErrorMessage || `OCR failed with status ${response.status}`)
        }

        const parsedText = Array.isArray(json?.ParsedResults)
          ? json.ParsedResults.map((result: any) => result?.ParsedText || '').join('\n')
          : ''

        attempts.push(logScanAttempt({
          provider: 'ocr.space',
          keyIndex: 1,
          mode: 'ocr',
          model: OCR_MODEL,
          startedAt,
          status: `success:${status}`,
        }))

        if (parsedText.trim()) texts.push(`[${image.side || `image-${index + 1}`}]\n${parsedText.trim()}`)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        attempts.push(logScanAttempt({
          provider: 'ocr.space',
          keyIndex: 1,
          mode: 'ocr',
          model: OCR_MODEL,
          startedAt,
          status: `failed:${status || 'network'}`,
          error,
        }))

        if (attempt === 1 && isRetryable(status, error)) continue
        break
      }
    }

    if (lastError) errors.push(`OCR image ${index + 1}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  }

  return { text: texts.join('\n\n').trim(), errors, attempts }
}
