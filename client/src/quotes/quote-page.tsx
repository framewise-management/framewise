import { useEffect, useMemo, useState } from 'react'
import { Quote, type SharedQuote } from '@framewise/shared/quote.ts'
import { Format } from '../ui/format.ts'
import { PublicQuoteApi } from './public-quote-api.ts'
import './quotes.css'

export function QuotePage({ studioId, token }: { studioId: string; token: string }) {
  const api = useMemo(() => new PublicQuoteApi(studioId, token), [studioId, token])
  const [quote, setQuote] = useState<SharedQuote | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [code, setCode] = useState('')
  useEffect(() => {
    let active = true
    setQuote(null); setError(''); setConsent(false); setCode('')
    api.get().then(q => { if (active) setQuote(q) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [api])
  const accept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { setQuote(await api.accept(code, consent)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (!quote) return <main className="public-quote"><h1>Your quotation</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading your quote…'}</p>{error && <button onClick={() => location.reload()}>Try again</button>}</main>
  const s = quote.snapshot
  const available = quote.status === 'Sent' && !Quote.expired(quote.expires_at)
  return <main className="public-quote">
    <header><p>{s.company}</p><h1>Your quotation</h1><p>Prepared for {s.clientName}</p><p className="subtext">Issued {Format.date(quote.created_at.slice(0, 10))} · Valid until {Format.date(quote.expires_at.slice(0, 10))}</p></header>
    {quote.status === 'Accepted' && <section className="panel" role="status"><h2>Booking confirmed</h2><p>Your quote and terms were accepted. Your events are booked with the studio.</p><p>Accepted {Format.date(quote.accepted_at?.slice(0, 10))}</p></section>}
    <section><h2>Your events</h2>{s.events.map(e => <article className="quote-row" key={e.id}><h3>{e.type}</h3><p>{Format.date(e.date)} · {e.start?.slice(0, 5)}–{e.end?.slice(0, 5)}</p><p>{e.venue}{e.city ? `, ${e.city}` : ''}</p><p>{e.services.join(' · ')}</p></article>)}</section>
    <section><h2>Services and pricing</h2>{s.lines.map((line, i) => <article className="quote-row" key={i}><div className="line-items"><h3>{line.name}</h3><strong>{Format.money(line.total)}</strong></div><p className="subtext">Price {Format.money(line.price)} · Discount {Format.money(line.discount)}</p>{line.deliverables.length > 0 && <ul>{line.deliverables.map((item, j) => <li key={j}>{item}</li>)}</ul>}</article>)}<div className="line-items quote-total"><strong>Total</strong><strong>{Format.money(s.total)}</strong></div></section>
    {s.paymentPlan.length > 0 && <section><h2>Payment schedule</h2>{s.paymentPlan.map(p => <div className="line-items" key={p.stage}><span>{p.stage}</span><strong>{Format.money(p.target)}</strong></div>)}</section>}
    <section><h2>Terms and conditions</h2>{s.terms.map((t, i) => <article className="quote-row" key={i}><h3>{t.title}</h3><p className="quote-terms">{t.body}</p></article>)}</section>
    {available ? <form className="panel quote-accept" onSubmit={accept}>
      <h2>Confirm your booking</h2>
      <label className="quote-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required disabled={busy} /><span>I agree to this quote and the terms and conditions above.</span></label>
      <div className="field"><label htmlFor="quote-code">Confirmation code</label><input id="quote-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required disabled={busy} /></div>
      <p className="subtext">Use the confirmation code supplied by the studio. No email or SMS is sent.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !consent || code.length !== 6}>{busy ? 'Confirming…' : 'Confirm booking'}</button>
    </form> : quote.status !== 'Accepted' && <p role="status">This quote is expired or replaced. Please ask the studio for a new link.</p>}
    <button className="quote-print" onClick={() => window.print()}>Print / Save PDF</button>
  </main>
}
