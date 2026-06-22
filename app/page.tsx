'use client'

import { useState, useRef, useCallback } from 'react'
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

export default function Home() {
  const [stage, setStage] = useState<Stage>('capture')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string>('')
  const [imageMime, setImageMime] = useState<string>('image/jpeg')
  const [cardData, setCardData] = useState<CardData>({
    name: '', email: '', phone: '', company: '', designation: '', website: ''
  })
  const [remarks, setRemarks] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [scanTime, setScanTime] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleImage = useCallback((file: File) => {
    const mime = file.type || 'image/jpeg'
    setImageMime(mime)
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setImagePreview(result)
      // Strip data URL prefix to get pure base64
      const base64 = result.split(',')[1]
      setImageBase64(base64)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImage(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleImage(file)
  }

  const handleScan = async () => {
    if (!imageBase64) return
    setStage('scanning')
    const start = Date.now()
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: imageMime }),
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
        body: JSON.stringify({ ...cardData, remarks }),
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
    setStage('capture')
    setImagePreview(null)
    setImageBase64('')
    setCardData({ name: '', email: '', phone: '', company: '', designation: '', website: '' })
    setRemarks('')
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
            <span className={styles.logoIcon}>⬡</span>
            <span className={styles.logoText}>CardDrop</span>
          </div>
          <p className={styles.tagline}>Scan · Review · Save</p>
        </div>

        {/* STAGE: CAPTURE */}
        {stage === 'capture' && (
          <div className={styles.card}>
            <div
              className={styles.dropzone}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Card preview" className={styles.preview} />
              ) : (
                <div className={styles.dropContent}>
                  <span className={styles.dropIcon}>🪪</span>
                  <p className={styles.dropTitle}>Drop card here</p>
                  <p className={styles.dropSub}>or tap to upload</p>
                </div>
              )}
            </div>

            <div className={styles.btnRow}>
              <button
                className={styles.btnSecondary}
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 Camera
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => fileInputRef.current?.click()}
              >
                🖼️ Gallery
              </button>
            </div>

            {imagePreview && (
              <button className={styles.btnPrimary} onClick={handleScan}>
                Scan Card →
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
          </div>
        )}

        {/* STAGE: SCANNING */}
        {stage === 'scanning' && (
          <div className={styles.card}>
            {imagePreview && (
              <img src={imagePreview} alt="Scanning" className={styles.previewSmall} />
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
                <span className={styles.badge}>✓ Scanned in {scanTime}s</span>
                {imagePreview && (
                  <img src={imagePreview} alt="Card" className={styles.thumbNail} />
                )}
              </div>
              <p className={styles.reviewHint}>Review and edit before saving</p>
            </div>

            <div className={styles.fields}>
              {([
                { key: 'name', label: 'Name', icon: '👤', placeholder: 'Full name' },
                { key: 'company', label: 'Company', icon: '🏢', placeholder: 'Company name' },
                { key: 'designation', label: 'Designation', icon: '💼', placeholder: 'Job title' },
                { key: 'email', label: 'Email', icon: '✉️', placeholder: 'email@example.com' },
                { key: 'phone', label: 'Phone', icon: '📞', placeholder: '+91 98765 43210' },
                { key: 'website', label: 'Website', icon: '🌐', placeholder: 'www.example.com' },
              ] as const).map(({ key, label, icon, placeholder }) => (
                <div key={key} className={styles.field}>
                  <label className={styles.fieldLabel}>
                    <span>{icon}</span> {label}
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
                  <span>📝</span> Remarks
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Met at booth 12, interested in bulk gifting..."
                  rows={3}
                />
              </div>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnGhost} onClick={handleReset}>
                ← Rescan
              </button>
              <button className={styles.btnPrimary} onClick={handleSubmit}>
                Save to Sheet →
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
              <div className={styles.doneIcon}>✓</div>
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
              <div className={styles.errorIcon}>✕</div>
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
