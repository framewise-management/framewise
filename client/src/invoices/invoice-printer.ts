import { AmountWords } from '@framewise/shared/amount-words.ts'
import { StudioLocale } from '@framewise/shared/studio-locale.ts'

export interface IssuedDocument {
  id: string
  number: string
  document_kind: string
  snapshot: {
    issuedAt: string
    company: Record<string, unknown>
    client: { name?: string; address?: string | null; phone?: string | null; email?: string | null }
    bookingName: string
    date: string | null
    payment: { amount: number; stage: string; method: string; transaction_reference?: string | null }
    quote: number
    received: number
    outstanding: number
    notes: string
  }
}

export class InvoicePrinter {
  static print(document: IssuedDocument, target: Window): void {
    const { snapshot: s } = document
    const company = s.company
    const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: StudioLocale.currency, maximumFractionDigits: 2 }).format(amount || 0)
    const field = (key: string) => escape(String(company[key] || ''))
    target.document.open()
    target.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escape(document.number)}</title><style>
      *{box-sizing:border-box}body{font:15px/1.55 Arial,sans-serif;color:#20211f;margin:0;background:#f4f3ef}.sheet{max-width:780px;margin:40px auto;background:white;padding:56px 64px;min-height:900px}.top{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding-bottom:28px}.brand{font-size:23px;font-weight:700}.muted{color:#6c6c67}.label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#777}.title{font-size:32px;margin:34px 0 6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:32px 0}.amount{font-size:32px;font-weight:700;margin:8px 0}.line{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #eee}.footer{margin-top:52px;border-top:1px solid #ddd;padding-top:20px;color:#555}.actions{max-width:780px;margin:16px auto;text-align:right}button{padding:10px 18px;background:#272a27;color:white;border:0;border-radius:4px;cursor:pointer}@media print{body{background:white}.sheet{margin:0 auto;padding:30px;min-height:0}.actions{display:none}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><main class="sheet">
      <header class="top"><div><div class="brand">${field('company') || field('name') || 'Studio'}</div><div>${field('address')}</div><div>${field('phone')} ${field('email')}</div>${field('gst_number') ? `<div>GSTIN: ${field('gst_number')}</div>` : ''}</div><div style="text-align:right"><div class="label">Payment receipt</div><strong>${escape(document.number)}</strong><div class="muted">Issued ${escape(s.issuedAt.slice(0, 10))}</div></div></header>
      <h1 class="title">Payment received</h1><p class="muted">This receipt acknowledges money received; it does not create a new charge.</p>
      <section class="grid"><div><div class="label">Received from</div><strong>${escape(s.client.name || '')}</strong><div>${escape(s.client.address || '')}</div><div>${escape(s.client.phone || '')}</div><div>${escape(s.client.email || '')}</div></div><div><div class="label">Booking</div><strong>${escape(s.bookingName || 'Photography booking')}</strong><div>Payment stage: ${escape(s.payment.stage || '')}</div><div>Method: ${escape(s.payment.method || '')}</div>${s.payment.transaction_reference ? `<div>Reference: ${escape(s.payment.transaction_reference)}</div>` : ''}</div></section>
      <div class="label">Amount received</div><div class="amount">${money(s.payment.amount)}</div><div>${escape(AmountWords.inr(s.payment.amount))}</div>
      <section style="margin-top:35px"><div class="line"><span>Booking total</span><strong>${money(s.quote)}</strong></div><div class="line"><span>Total received to date</span><strong>${money(s.received)}</strong></div><div class="line"><span>Outstanding balance</span><strong>${money(s.outstanding)}</strong></div><p class="muted">Balances shown as of the issue date.</p></section>
      <footer class="footer">${escape(s.notes || 'Thank you for your payment.')}</footer></main></body></html>`)
    target.document.close()
    target.focus()
  }
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
