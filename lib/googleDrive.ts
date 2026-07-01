export type DriveUploadResult = {
  driveFileId: string
  driveFileUrl: string
  name: string
}

type UploadCardImageInput = {
  imageBase64: string
  mimeType?: string
  side?: string
  index?: number
}

type AppsScriptUploadResponse = {
  success?: boolean
  fileId?: string
  fileUrl?: string
  error?: string
}

const REQUEST_TIMEOUT_MS = 30000

const extensionForMime = (mimeType: string) => {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('heic')) return 'heic'
  return 'jpg'
}

const withTimeout = async <T>(operation: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Apps Script upload timeout')), timeoutMs)
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const buildFileName = (mimeType: string, side = 'card', index = 0) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = side ? `_${side}_${index + 1}` : `_${index + 1}`
  return `card_scan_${timestamp}${suffix}.${extensionForMime(mimeType)}`
}

export const uploadCardImageToDrive = async ({
  imageBase64,
  mimeType = 'image/jpeg',
  side = 'card',
  index = 0,
}: UploadCardImageInput): Promise<DriveUploadResult> => {
  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET

  if (!uploadUrl) throw new Error('APPS_SCRIPT_UPLOAD_URL is not configured')
  if (!secret) throw new Error('APPS_SCRIPT_UPLOAD_SECRET is not configured')

  const name = buildFileName(mimeType, side, index)
  const response = await withTimeout(fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      fileName: name,
      mimeType,
      base64: imageBase64,
    }),
  }))

  const json = await response.json().catch(() => null) as AppsScriptUploadResponse | null

  if (!response.ok) {
    throw new Error(json?.error || `Apps Script upload failed with status ${response.status}`)
  }

  if (!json?.success || !json.fileId || !json.fileUrl) {
    throw new Error(json?.error || 'Apps Script upload did not return fileId and fileUrl')
  }

  return {
    driveFileId: json.fileId,
    driveFileUrl: json.fileUrl,
    name,
  }
}
