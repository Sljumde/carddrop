export type ScanAttemptLog = {
  provider: string
  keyIndex: number
  mode: 'ocr' | 'ocr-text-cleanup' | 'vision'
  model: string
  duration: number
  status: string
  error: string
}

type LogAttemptInput = Omit<ScanAttemptLog, 'duration' | 'error'> & {
  startedAt: number
  error?: unknown
}

export const formatScanError = (error: unknown) => {
  if (!error) return ''
  if (error instanceof Error) return error.message
  return String(error)
}

export const logScanAttempt = (input: LogAttemptInput): ScanAttemptLog => {
  const entry: ScanAttemptLog = {
    provider: input.provider,
    keyIndex: input.keyIndex,
    mode: input.mode,
    model: input.model,
    duration: Date.now() - input.startedAt,
    status: input.status,
    error: formatScanError(input.error),
  }

  console.info('[scan-attempt]', JSON.stringify(entry))
  return entry
}

