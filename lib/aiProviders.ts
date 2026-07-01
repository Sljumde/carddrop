import { GoogleGenerativeAI } from '@google/generative-ai'
import { logScanAttempt, type ScanAttemptLog } from './scanLogger'
import type { ScanImageInput } from './ocrFallback'
import type { ApiQuotaTracker } from './apiQuota'

export type BusinessCardData = {
  name: string
  email: string
  phone: string
  company: string
  designation: string
  website: string
}

export type AiScanMode = 'ocr-text-cleanup' | 'vision'

export type AiScanSuccess = {
  success: true
  data: BusinessCardData
  providerUsed: string
  modelUsed: string
  modeUsed: AiScanMode
  attempts: ScanAttemptLog[]
  errors: string[]
}

export type AiScanFailure = {
  success: false
  attempts: ScanAttemptLog[]
  errors: string[]
}

const EMPTY_CARD: BusinessCardData = {
  name: '',
  email: '',
  phone: '',
  company: '',
  designation: '',
  website: '',
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503])
const REQUEST_TIMEOUT_MS = 45000

const groqTextModel = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile'
const groqVisionModel = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
const geminiTextModel = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const geminiVisionModel = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

const extractionPrompt = `You are a business card scanner.
Return clean valid JSON only. No markdown, no prose, no comments.
Do not guess. Use an empty string for missing fields.
If multiple phone numbers exist, join them with comma.

Required JSON shape:
{"name":"","email":"","phone":"","company":"","designation":"","website":""}`

const textCleanupPrompt = (ocrText: string) => `${extractionPrompt}

Extract the fields from this OCR text:
${ocrText}`

const visionPrompt = `${extractionPrompt}

Extract the fields from the provided business card image or images. If front and back are provided, combine details from both sides.`

const providerKeys = () => [
  ...[1, 2, 3].map(index => ({
    provider: 'groq' as const,
    keyIndex: index,
    envKey: `GROQ_API_KEY_${index}`,
    apiKey: process.env[`GROQ_API_KEY_${index}`],
  })),
  ...[1, 2, 3].map(index => ({
    provider: 'gemini' as const,
    keyIndex: index,
    envKey: `GOOGLE_AI_API_KEY_${index}`,
    apiKey: process.env[`GOOGLE_AI_API_KEY_${index}`],
  })),
]

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

const extractJsonObject = (text: string) => {
  const cleaned = text.replace(/```json|```/gi, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Model did not return a JSON object')
  return JSON.parse(match[0])
}

const normalizeCardData = (value: any): BusinessCardData => {
  const normalized = { ...EMPTY_CARD }

  for (const key of Object.keys(normalized) as Array<keyof BusinessCardData>) {
    const raw = value?.[key]
    if (Array.isArray(raw)) {
      normalized[key] = raw.filter(Boolean).map(item => String(item).trim()).filter(Boolean).join(', ')
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      normalized[key] = String(raw).trim()
    }
  }

  return normalized
}

const parseBusinessCardJson = (text: string) => normalizeCardData(extractJsonObject(text))

const isRetryable = (status: number, error?: unknown) => {
  if (RETRYABLE_STATUSES.has(status)) return true
  return error instanceof Error && error.message.toLowerCase().includes('timeout')
}

const callGroqText = async (apiKey: string, prompt: string, model: string) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(json?.error?.message || `Groq failed with status ${response.status}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return json?.choices?.[0]?.message?.content || ''
}

const callGroqVision = async (apiKey: string, images: ScanImageInput[], model: string) => {
  const content = [
    { type: 'text', text: visionPrompt },
    ...images.map(image => ({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType || 'image/jpeg'};base64,${image.imageBase64}`,
      },
    })),
  ]

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(json?.error?.message || `Groq failed with status ${response.status}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return json?.choices?.[0]?.message?.content || ''
}

const callGeminiText = async (apiKey: string, prompt: string, modelName: string) => {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

const callGeminiVision = async (apiKey: string, images: ScanImageInput[], modelName: string) => {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })
  const result = await model.generateContent([
    visionPrompt,
    ...images.map(image => ({
      inlineData: {
        data: image.imageBase64,
        mimeType: image.mimeType || 'image/jpeg',
      },
    })),
  ])
  return result.response.text()
}

const getStatus = (error: unknown) => {
  const status = (error as { status?: number })?.status
  return typeof status === 'number' ? status : 0
}

export const runAiFailover = async ({
  mode,
  ocrText,
  images,
  quota,
}: {
  mode: AiScanMode
  ocrText?: string
  images: ScanImageInput[]
  quota?: ApiQuotaTracker
}): Promise<AiScanSuccess | AiScanFailure> => {
  const attempts: ScanAttemptLog[] = []
  const errors: string[] = []

  for (const key of providerKeys()) {
    if (!key.apiKey) {
      errors.push(`${key.provider.toUpperCase()} key ${key.keyIndex} is not configured`)
      continue
    }

    const model = key.provider === 'groq'
      ? mode === 'vision' ? groqVisionModel : groqTextModel
      : mode === 'vision' ? geminiVisionModel : geminiTextModel

    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now()
      let status = 0

      try {
        if (quota) {
          const quotaCheck = await quota.canUse(key.envKey)
          if (!quotaCheck.allowed) {
            errors.push(`${key.provider}-${key.keyIndex} skipped: ${quotaCheck.reason}`)
            break
          }
          await quota.incrementUsed(key.envKey)
        }

        const text = await withTimeout(
          key.provider === 'groq'
            ? mode === 'vision'
              ? callGroqVision(key.apiKey, images, model)
              : callGroqText(key.apiKey, textCleanupPrompt(ocrText || ''), model)
            : mode === 'vision'
              ? callGeminiVision(key.apiKey, images, model)
              : callGeminiText(key.apiKey, textCleanupPrompt(ocrText || ''), model)
        )

        const data = parseBusinessCardJson(text)
        attempts.push(logScanAttempt({
          provider: key.provider,
          keyIndex: key.keyIndex,
          mode,
          model,
          startedAt,
          status: 'success',
        }))
        if (quota) await quota.recordResult(key.envKey)

        return {
          success: true,
          data,
          providerUsed: `${key.provider}-${key.keyIndex}`,
          modelUsed: model,
          modeUsed: mode,
          attempts,
          errors,
        }
      } catch (error) {
        status = getStatus(error)
        if (quota) await quota.recordResult(key.envKey, error)
        attempts.push(logScanAttempt({
          provider: key.provider,
          keyIndex: key.keyIndex,
          mode,
          model,
          startedAt,
          status: `failed:${status || 'network'}`,
          error,
        }))
        errors.push(`${key.provider}-${key.keyIndex} ${mode}: ${error instanceof Error ? error.message : String(error)}`)

        if (attempt === 1 && isRetryable(status, error)) continue
        break
      }
    }
  }

  return { success: false, attempts, errors }
}
