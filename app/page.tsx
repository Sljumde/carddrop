'use client'

import Link from 'next/link'
import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './page.module.css'

type CardData = {
  name: string
  email: string
  phone: string
  company: string
  designation: string
  website: string
}

type Stage = 'capture' | 'scanning' | 'review' | 'submitting' | 'done' | 'error'
type CardSide = 'front' | 'back'

export default function Home() {
  const [stage, setStage] = useState<Stage>('capture')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string>('')
  const [imageMime, setImageMime] = useState<string>('image/jpeg')
  const [backImagePreview, setBackImagePreview] = useState<string | null>(null)
  const [backImageBase64, setBackImageBase64] = useState<string>('')
  const [backImageMime, setBackImageMime] = useState<string>('image/jpeg')
  const [activeSide, setActiveSide] = useState<CardSide>('front')
  const [cardData, setCardData] = useState<CardData>({
    name: '', email: '', phone: '', company: '', designation: '', website: ''
  })
  const [remarks, setRemarks] = useState('')
  const [submittedBy, setSubmittedBy] = useState('')
  const [submitterOptions, setSubmitterOptions] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [scanTime, setScanTime] = useState(0)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraOpen(false)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !streamRef.current) return

    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(() => {
      setCameraError('Camera opened, but the preview could not start. Please try again.')
    })
  }, [isCameraOpen])

  useEffect(() => {
    fetch('/api/submitted-by')
      .then(res => res.json())
      .then(json => {
        if (json.success) setSubmitterOptions(json.names || [])
      })
      .catch(() => {})
  }, [])

  const setImageFromDataUrl = useCallback((dataUrl: string, mime = 'image/jpeg', side: CardSide = activeSide) => {
    const base64 = dataUrl.split(',')[1] || ''

    if (side === 'back') {
      setBackImageMime(mime)
      setBackImagePreview(dataUrl)
      setBackImageBase64(base64)
      return
    }

    setImageMime(mime)
    setImagePreview(dataUrl)
    setImageBase64(base64)
  }, [activeSide])

  const activeImagePreview = activeSide === 'back' ? backImagePreview : imagePreview
  const hasAnyImage = Boolean(imageBase64 || backImageBase64)

  const clearActiveSideImage = useCallback(() => {
    if (activeSide === 'back') {
      setBackImagePreview(null)
      setBackImageBase64('')
      return
    }

    setImagePreview(null)
    setImageBase64('')
  }, [activeSide])

  const handleSideChange = useCallback((side: CardSide) => {
    stopCamera()
    setCameraError('')
    setActiveSide(side)
  }, [stopCamera])

  const handleImage = useCallback((file: File) => {
    const mime = file.type || 'image/jpeg'
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setImageFromDataUrl(result, mime)
    }
    reader.readAsDataURL(file)
    stopCamera()
  }, [setImageFromDataUrl, stopCamera])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImage(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleImage(file)
  }

  const handleOpenGallery = () => {
    stopCamera()
    fileInputRef.current?.click()
  }

  const handleOpenCamera = async () => {
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click()
      return
    }

    try {
      stopCamera()
      clearActiveSideImage()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      setIsCameraOpen(true)
    } catch (err: any) {
      setCameraError(err?.message || 'Camera could not be opened. Please allow camera access and try again.')
    }
  }

  const handleCapturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera is still loading. Please try again in a moment.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Could not capture from this camera.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setImageFromDataUrl(canvas.toDataURL('image/jpeg', 0.92), 'image/jpeg')
    stopCamera()
  }

  const handleScan = async () => {
    if (!hasAnyImage) return
    setStage('scanning')
    const start = Date.now()
    try {
      const images = [
        imageBase64 ? { side: 'front', imageBase64, mimeType: imageMime } : null,
        backImageBase64 ? { side: 'back', imageBase64: backImageBase64, mimeType: backImageMime } : null,
      ].filter(Boolean)

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Scan failed')
      setScanTime(Math.round((Date.now() - start) / 1000))
      setCardData(json.data)
      setStage('review')
    } catch (err: any) {
      setErrorMsg(err.message)
      setStage('error')
    }
  }

  const handleSubmit = async () => {
    setStage('submitting')
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cardData, remarks, submittedBy }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Submit failed')
      setStage('done')
    } catch (err: any) {
      setErrorMsg(err.message)
      setStage('error')
    }
  }

  const handleReset = () => {
    stopCamera()
    setStage('capture')
    setImagePreview(null)
    setImageBase64('')
    setBackImagePreview(null)
    setBackImageBase64('')
    setActiveSide('front')
    setCardData({ name: '', email: '', phone: '', company: '', designation: '', website: '' })
    setRemarks('')
    setSubmittedBy('')
    setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const updateField = (field: keyof CardData, value: string) => {
    setCardData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>
            <img src="/gauflora-logo.png" alt="Gauflora" className={styles.logoImage} />
            <span className={styles.logoText}>AI CARD SCANNER</span>
          </div>
          <p className={styles.tagline}>Scan / Review / Save</p>
          <Link href="/cards-scanned" className={styles.dashboardLink}>
            View Cards Scanned
          </Link>
        </div>

        {/* STAGE: CAPTURE */}
        {stage === 'capture' && (
          <div className={styles.card}>
            <div className={styles.sideSelector} aria-label="Card side">
              <button
                className={`${styles.sideButton} ${activeSide === 'front' ? styles.sideButtonActive : ''}`}
                onClick={() => handleSideChange('front')}
                type="button"
              >
                Front
                {imagePreview && <span className={styles.sideCheck}>Added</span>}
              </button>
              <button
                className={`${styles.sideButton} ${activeSide === 'back' ? styles.sideButtonActive : ''}`}
                onClick={() => handleSideChange('back')}
                type="button"
              >
                Back
                {backImagePreview && <span className={styles.sideCheck}>Added</span>}
              </button>
            </div>

            <div
              className={styles.dropzone}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={handleOpenGallery}
            >
              {activeImagePreview ? (
                <img src={activeImagePreview} alt={`${activeSide} side preview`} className={styles.preview} />
              ) : isCameraOpen ? (
                <div className={styles.cameraFrame} onClick={(e) => e.stopPropagation()}>
                  <video
                    ref={videoRef}
                    className={styles.cameraVideo}
                    autoPlay
                    muted
                    playsInline
                  />
                </div>
              ) : (
                <div className={styles.dropContent}>
                  <p className={styles.dropTitle}>{activeSide === 'back' ? 'Add back side' : 'Add front side'}</p>
                  <p className={styles.dropSub}>or tap to upload</p>
                </div>
              )}
            </div>

            <div className={styles.btnRow}>
              <button
                className={styles.btnSecondary}
                onClick={handleOpenCamera}
              >
                Camera
              </button>
              <button
                className={styles.btnSecondary}
                onClick={handleOpenGallery}
              >
                Gallery
              </button>
            </div>

            {cameraError && (
              <p className={styles.cameraError}>{cameraError}</p>
            )}

            {isCameraOpen && (
              <div className={styles.btnRow}>
                <button className={styles.btnGhost} onClick={stopCamera}>
                  Cancel
                </button>
                <button className={styles.btnPrimary} onClick={handleCapturePhoto}>
                  Capture Photo
                </button>
              </div>
            )}

            {hasAnyImage && (
              <button className={styles.btnPrimary} onClick={handleScan}>
                Scan {backImageBase64 ? 'Both Sides' : 'Card'}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <canvas ref={canvasRef} className={styles.hiddenCanvas} />
          </div>
        )}

        {/* STAGE: SCANNING */}
        {stage === 'scanning' && (
          <div className={styles.card}>
            {imagePreview && (
              <img src={imagePreview} alt="Scanning" className={styles.previewSmall} />
            )}
            {backImagePreview && (
              <img src={backImagePreview} alt="Scanning back side" className={styles.previewSmall} />
            )}
            <div className={styles.scanningState}>
              <div className={styles.spinner} />
              <p className={styles.scanningText}>Reading card...</p>
              <p className={styles.scanningSubtext}>Gemini is extracting details</p>
            </div>
          </div>
        )}

        {/* STAGE: REVIEW */}
        {stage === 'review' && (
          <div className={styles.card}>
            <div className={styles.reviewHeader}>
              <div className={styles.reviewMeta}>
                <span className={styles.badge}>Scanned in {scanTime}s</span>
                {imagePreview && (
                  <img src={imagePreview} alt="Card" className={styles.thumbNail} />
                )}
                {backImagePreview && (
                  <img src={backImagePreview} alt="Back side" className={styles.thumbNail} />
                )}
              </div>
              <p className={styles.reviewHint}>Review and edit before saving</p>
            </div>

            <div className={styles.fields}>
              {([
                { key: 'name', label: 'Name', placeholder: 'Full name' },
                { key: 'company', label: 'Company', placeholder: 'Company name' },
                { key: 'designation', label: 'Designation', placeholder: 'Job title' },
                { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                { key: 'phone', label: 'Phone', placeholder: '+91 98765 43210' },
                { key: 'website', label: 'Website', placeholder: 'www.example.com' },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key} className={styles.field}>
                  <label className={styles.fieldLabel}>
                    {label}
                  </label>
                  <input
                    className={styles.fieldInput}
                    value={cardData[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              ))}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Remarks
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Met at booth 12, interested in bulk gifting..."
                  rows={3}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Submitted By
                </label>
                <input
                  className={styles.fieldInput}
                  value={submittedBy}
                  onChange={(e) => setSubmittedBy(e.target.value)}
                  placeholder="Select or type name"
                  list="submitted-by-options"
                />
                <datalist id="submitted-by-options">
                  {submitterOptions.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnGhost} onClick={handleReset}>
                Rescan
              </button>
              <button className={styles.btnPrimary} onClick={handleSubmit}>
                Save to Sheet
              </button>
            </div>
          </div>
        )}

        {/* STAGE: SUBMITTING */}
        {stage === 'submitting' && (
          <div className={styles.card}>
            <div className={styles.scanningState}>
              <div className={styles.spinner} />
              <p className={styles.scanningText}>Saving...</p>
              <p className={styles.scanningSubtext}>Adding to your Google Sheet</p>
            </div>
          </div>
        )}

        {/* STAGE: DONE */}
        {stage === 'done' && (
          <div className={styles.card}>
            <div className={styles.doneState}>
              <div className={styles.doneIcon}>OK</div>
              <p className={styles.doneTitle}>Saved!</p>
              <p className={styles.doneName}>{cardData.name || 'Contact'} added to sheet</p>
              {cardData.company && (
                <p className={styles.doneCompany}>{cardData.company}</p>
              )}
              <button className={styles.btnPrimary} onClick={handleReset}>
                Scan Another Card
              </button>
            </div>
          </div>
        )}

        {/* STAGE: ERROR */}
        {stage === 'error' && (
          <div className={styles.card}>
            <div className={styles.errorState}>
              <div className={styles.errorIcon}>!</div>
              <p className={styles.errorTitle}>Something went wrong</p>
              <p className={styles.errorMsg}>{errorMsg}</p>
              <button className={styles.btnPrimary} onClick={handleReset}>
                Try Again
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
