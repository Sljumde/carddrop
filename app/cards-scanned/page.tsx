'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import styles from './page.module.css'

type ScannedCard = {
  timestamp: string
  submittedAt: string
  name: string
  email: string
  phone: string
  company: string
  designation: string
  website: string
  remarks: string
  submittedBy: string
}

export default function CardsScannedPage() {
  const [cards, setCards] = useState<ScannedCard[]>([])
  const [submitted, setSubmitted] = useState(0)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCards = useCallback(async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)

    try {
      const res = await fetch(`/api/cards-scanned?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load cards scanned')

      setCards(json.cards || [])
      setSubmitted(json.submitted || 0)
      setTotal(json.total || 0)
    } catch (err: any) {
      setError(err.message || 'Could not load cards scanned')
    } finally {
      setLoading(false)
    }
  }, [fromDate, query, toDate])

  useEffect(() => {
    const timer = window.setTimeout(loadCards, 250)
    return () => window.clearTimeout(timer)
  }, [loadCards])

  const clearFilters = () => {
    setQuery('')
    setFromDate('')
    setToDate('')
  }

  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <img src="/gauflora-logo.png" alt="Gauflora" className={styles.logoImage} />
            <div>
              <h1>CARDS SCANNED</h1>
              <p>Submitted business card records</p>
            </div>
          </div>
          <Link href="/" className={styles.backLink}>
            Scan New Card
          </Link>
        </header>

        <section className={styles.filters}>
          <div className={styles.kpi}>
            <span>Submitted</span>
            <strong>{submitted}</strong>
            <small>{total} total records</small>
          </div>

          <label className={styles.filterField}>
            <span>From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>

          <label className={styles.filterField}>
            <span>To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>

          <label className={styles.searchField}>
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, phone, email, submitted by..."
            />
          </label>

          <button className={styles.clearButton} onClick={clearFilters} type="button">
            Clear
          </button>
        </section>

        <section className={styles.tableCard}>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Phone No</th>
                  <th>Email</th>
                  <th>Submitted By</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>Loading cards...</td>
                  </tr>
                ) : cards.length > 0 ? (
                  cards.map((card, index) => (
                    <tr key={`${card.submittedAt}-${index}`}>
                      <td>{card.timestamp || '-'}</td>
                      <td>{card.name || '-'}</td>
                      <td>{card.company || '-'}</td>
                      <td>{card.phone || '-'}</td>
                      <td>{card.email || '-'}</td>
                      <td>{card.submittedBy || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>No cards match these filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
