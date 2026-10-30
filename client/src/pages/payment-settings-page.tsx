import { useEffect, useState } from 'react'
import { useStudio } from '../data/studio-context.tsx'
import { Field } from '../ui/field.tsx'

interface Condition { label: string; percent: number }
interface PaymentConfig { payment_conditions: Condition[]; payment_modes: string[]; upi_id: string; bank_details: string; gst_number: string; payment_notes: string; invoice_prefix: string; invoice_padding: number; next_invoice: number }
const MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card']

export function PaymentSettingsPage() {
  const studio = useStudio()
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { studio.api.get<PaymentConfig>('/payment-settings').then(setConfig).catch(err => setError((err as Error).message)) }, [studio.api])
  const change = <K extends keyof PaymentConfig>(key: K, value: PaymentConfig[K]) => setConfig(c => c ? { ...c, [key]: value } : c)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!config) return
    setBusy(true); setError('')
    try { setConfig(await studio.api.put<PaymentConfig>('/payment-settings', config)); studio.toast('Payment settings saved') }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const total = config?.payment_conditions.reduce((sum, row) => sum + row.percent, 0) ?? 0
  return <>
    <a className="back" href="#/setup">← Setup</a>
    <div className="heading workspace-heading"><div><span className="workspace-kicker">Setup / Studio</span><h1>Payment &amp; Invoice</h1><p className="subtext">Set your payment preferences and invoice numbering.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!config && !error && <p className="subtext">Loading payment settings…</p>}
    {config && <form className="payment-setup" autoComplete="off" onSubmit={save}>
      <section className="panel"><h2>Payment conditions</h2><p className="subtext">Set your standard instalments. Percentages must total 100%.</p>
        <div className="instalment-list">{config.payment_conditions.map((row, index) => <div className="instalment-row" key={index}>
          <label>Instalment name<input value={row.label} required onChange={e => change('payment_conditions', config.payment_conditions.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} placeholder="e.g. On booking" /></label>
          <label>Percentage<input type="number" min="0" max="100" step="any" required value={row.percent} onChange={e => change('payment_conditions', config.payment_conditions.map((item, i) => i === index ? { ...item, percent: Number(e.target.value) } : item))} /></label>
          <button type="button" className="small" onClick={() => change('payment_conditions', config.payment_conditions.filter((_, i) => i !== index))} aria-label={`Remove instalment ${index + 1}`}>Remove</button>
        </div>)}</div>
        <div className="instalment-footer"><button type="button" className="small" onClick={() => change('payment_conditions', [...config.payment_conditions, { label: '', percent: 0 }])}>＋ Add instalment</button>{config.payment_conditions.length > 0 && <span>{total}% of 100%</span>}</div>
      </section>
      <section className="panel"><h2>Payment methods</h2><p className="subtext">Choose the ways clients can pay you.</p><fieldset className="service-picker"><legend>Accepted methods</legend><div className="service-options">{MODES.map(mode => <label key={mode}><input type="checkbox" checked={config.payment_modes.includes(mode)} onChange={e => change('payment_modes', e.target.checked ? [...config.payment_modes, mode] : config.payment_modes.filter(m => m !== mode))} />{mode}</label>)}</div></fieldset>
        <div className="field-grid"><Field name="upi_id" label="UPI ID" value={config.upi_id} onChange={v => change('upi_id', v)} /><Field name="gst" label="GST number" value={config.gst_number} onChange={v => change('gst_number', v)} /><Field name="bank" label="Bank account details" type="textarea" value={config.bank_details} onChange={v => change('bank_details', v)} wide /><Field name="notes" label="Invoice notes" type="textarea" value={config.payment_notes} onChange={v => change('payment_notes', v)} wide /></div>
      </section>
      <section className="panel"><h2>Invoice numbering</h2><p className="subtext">Changes apply to new invoice numbers.</p><div className="field-grid"><Field name="prefix" label="Invoice prefix" value={config.invoice_prefix} onChange={v => change('invoice_prefix', v)} /><Field name="padding" label="Number of digits" type="number" min={3} value={config.invoice_padding} onChange={v => change('invoice_padding', Number(v))} /></div><p className="invoice-number-preview">Next invoice: <strong>{config.invoice_prefix + String(config.next_invoice).padStart(Math.max(3, Math.min(10, config.invoice_padding || 3)), '0')}</strong></p></section>
      <div><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>}
  </>
}
