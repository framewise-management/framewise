import { useEffect, useState } from 'react'
import type { SharedQuote } from '@framewise/shared/quote.ts'
import { useStudio } from '../data/studio-context.tsx'
import { Format } from '../ui/format.ts'
import './quotes.css'

export function ClientQuotes({ clientId }: { clientId: string }) {
  const studio = useStudio()
  const [quotes, setQuotes] = useState<StaffQuote[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    studio.api.get<StaffQuote[]>(`/clients/${clientId}/quotes`).then(q => { if (active) setQuotes(q) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [studio.api, clientId])
  const create = async () => {
    setBusy(true); setError('')
    try {
      const q = await studio.api.post<StaffQuote>(`/clients/${clientId}/quotes`)
      setQuotes(old => [q, ...old.map(p => p.status === 'Sent' ? { ...p, status: 'Superseded' as const } : p)])
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="panel">
    <h2>Quotes and acceptance</h2>
    <p>Save the client’s event dates, services, pricing and payment schedule first. Active terms from Settings are included.</p>
    <p className="subtext">Each link is valid for 7 days. Creating a new quote replaces any pending link. Changes to booking details require a new quote.</p>
    <p className="subtext">Current confirmation code: <strong>111111</strong>. This fixed code also works in production; no email or phone is verified.</p>
    <button className="primary" disabled={busy || loading} onClick={create}>{busy ? 'Creating…' : 'Create quote link'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && <p role="status">Loading quotes…</p>}
    {!loading && !quotes.length && <p>No quotes yet.</p>}
    {quotes.map(q => {
      const link = `${location.origin}/#/quote/${q.studio_id}/${q.token}`
      return <article className="quote-row" key={q.id}>
        <div className="line-items"><strong>{Format.money(q.snapshot.total)}</strong><span>{q.status}</span></div>
        <p>Created {Format.date(q.created_at.slice(0, 10))} · Expires {Format.date(q.expires_at.slice(0, 10))}</p>
        <label className="field">Shareable quote link<input className="quote-share-link" readOnly value={link} onFocus={e => e.currentTarget.select()} /></label>
        <div className="actions"><a className="linked" href={link} target="_blank" rel="noopener noreferrer">Preview quote</a><button className="small" onClick={() => navigator.clipboard.writeText(link).then(() => studio.toast('Quote link copied')).catch(() => studio.toast('Select and copy the link above'))}>Copy link</button></div>
      </article>
    })}
  </section>
}

interface StaffQuote extends SharedQuote { token: string; studio_id: string }
