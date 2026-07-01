import { NextRequest, NextResponse } from 'next/server'
import { runAiFailover, type BusinessCardData } from '@/lib/aiProviders'
import { uploadCardImageToDrive, type DriveUploadResult } from '@/lib/googleDrive'
import { isUsableOcrText, runOcr, type ScanImageInput } from '@/lib/ocrFallback'

export const runtime = 'nodejs'

const emptyCardData: BusinessCardData = {
  name: '',
  email: '',
  phone: '',
  company: '',
  designation: '',
  website: '',
}

const normalizeImages = (body: any): ScanImageInput[] => {
  const scanImages = Array.isArray(body.images) && body.images.length > 0
    ? body.images
    : [{ imageBase64: body.imageBase64, mimeType: body.mimeType, side: 'front' }]

  return scanImages
    .filter((image: any) => image?.imageBase64)
    .map((image: any, index: number) => ({
      imageBase64: String(image.imageBase64),
      mimeType: image.mimeType || 'image/jpeg',
      side: image.side || (index === 0 ? 'front' : `image-${index + 1}`),
    }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validImages = normalizeImages(body)

    if (validImages.length === 0) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const driveFiles: DriveUploadResult[] = []
    try {
      for (let index = 0; index < validImages.length; index++) {
        const image = validImages[index]
        driveFiles.push(await uploadCardImageToDrive({ ...image, index }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Apps Script image upload failed:', error)

      return NextResponse.json({
        success: false,
        imageSaved: false,
        scanFailed: true,
        driveFileId: '',
        driveFileUrl: '',
        driveFiles,
        providerUsed: '',
        modelUsed: '',
        modeUsed: '',
        ocrText: '',
        data: emptyCardData,
        errors: [message],
        error: message,
      }, { status: 502 })
    }

    const primaryDriveFile = driveFiles[0]
    const ocr = await runOcr(validImages)
    const errors = [...ocr.errors]
    const ocrUsable = isUsableOcrText(ocr.text)

    if (ocrUsable) {
      const cleanup = await runAiFailover({
        mode: 'ocr-text-cleanup',
        ocrText: ocr.text,
        images: validImages,
      })
      errors.push(...cleanup.errors)

      if (cleanup.success) {
        return NextResponse.json({
          success: true,
          imageSaved: true,
          scanFailed: false,
          driveFileId: primaryDriveFile.driveFileId,
          driveFileUrl: primaryDriveFile.driveFileUrl,
          driveFiles,
          providerUsed: cleanup.providerUsed,
          modelUsed: cleanup.modelUsed,
          modeUsed: cleanup.modeUsed,
          ocrText: ocr.text,
          data: cleanup.data,
          errors,
        })
      }
    }

    const vision = await runAiFailover({
      mode: 'vision',
      images: validImages,
    })
    errors.push(...vision.errors)

    if (vision.success) {
      return NextResponse.json({
        success: true,
        imageSaved: true,
        scanFailed: false,
        driveFileId: primaryDriveFile.driveFileId,
        driveFileUrl: primaryDriveFile.driveFileUrl,
        driveFiles,
        providerUsed: vision.providerUsed,
        modelUsed: vision.modelUsed,
        modeUsed: vision.modeUsed,
        ocrText: ocr.text,
        data: vision.data,
        errors,
      })
    }

    return NextResponse.json({
      success: true,
      imageSaved: true,
      scanFailed: true,
      driveFileId: primaryDriveFile.driveFileId,
      driveFileUrl: primaryDriveFile.driveFileUrl,
      driveFiles,
      providerUsed: '',
      modelUsed: '',
      modeUsed: '',
      ocrText: ocr.text,
      data: emptyCardData,
      errors,
    })

  } catch (err: any) {
    console.error('Scan pipeline error:', err)
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 })
  }
}
