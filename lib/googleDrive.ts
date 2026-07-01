import { Readable } from 'stream'
import { google } from 'googleapis'

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

const getServiceAccountCredentials = () => {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if (rawJson) {
    return JSON.parse(rawJson.replace(/\n/g, '\\n'))
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey,
    }
  }

  return null
}

const uploadWithDriveApi = async ({
  imageBase64,
  mimeType,
  name,
}: {
  imageBase64: string
  mimeType: string
  name: string
}): Promise<DriveUploadResult> => {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const credentials = getServiceAccountCredentials()

  if (!folderId || !credentials) {
    throw new Error('Google Drive upload is not configured')
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
  const drive = google.drive({ version: 'v3', auth })
  const buffer = Buffer.from(imageBase64, 'base64')

  const result = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from([buffer]),
    },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })

  const fileId = result.data.id
  const fileUrl = result.data.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '')

  if (!fileId || !fileUrl) {
    throw new Error('Google Drive upload did not return fileId and fileUrl')
  }

  return {
    driveFileId: fileId,
    driveFileUrl: fileUrl,
    name,
  }
}

const uploadWithAppsScript = async ({
  imageBase64,
  mimeType,
  name,
}: {
  imageBase64: string
  mimeType: string
  name: string
}): Promise<DriveUploadResult> => {
  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET

  if (!uploadUrl) throw new Error('APPS_SCRIPT_UPLOAD_URL is not configured')
  if (!secret) throw new Error('APPS_SCRIPT_UPLOAD_SECRET is not configured')

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

export const uploadCardImageToDrive = async ({
  imageBase64,
  mimeType = 'image/jpeg',
  side = 'card',
  index = 0,
}: UploadCardImageInput): Promise<DriveUploadResult> => {
  const name = buildFileName(mimeType, side, index)
  const hasAppsScriptConfig = Boolean(
    process.env.APPS_SCRIPT_UPLOAD_URL && process.env.APPS_SCRIPT_UPLOAD_SECRET
  )
  const hasDriveApiConfig = Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID
      && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY))
  )

  if (hasAppsScriptConfig) {
    return uploadWithAppsScript({ imageBase64, mimeType, name })
  }

  if (hasDriveApiConfig) {
    return uploadWithDriveApi({ imageBase64, mimeType, name })
  }

  return uploadWithAppsScript({ imageBase64, mimeType, name })
}
