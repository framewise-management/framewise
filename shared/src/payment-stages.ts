export type StageStatus = 'Received' | 'Not set' | 'Not required' | 'Paid' | 'Partially paid' | 'Pending'

export interface StagePayment {
  stage?: string | null
  amount: number
}

export interface StageSummary<P extends StagePayment> {
  name: string
  rows: P[]
  received: number
  target: number | undefined
  pending: number | null
  status: StageStatus
}

export class PaymentStages {
  static readonly core: readonly string[] = ['Booking Amount', 'On Event', 'After Event', 'Delivery', 'Album Printing']

  // folds the older stage names ('Booking', 'On-event', …) into the core names; anything else is kept as a custom stage
  static name(value: string | null | undefined): string {
    const name = String(value || 'Other').trim()
    return OLD_NAMES[name.toLowerCase()] || name
  }

  // one client's payments against that client's stage targets
  static summary<P extends StagePayment>(payments: readonly P[], plans: Readonly<Record<string, number>> = {}): StageSummary<P>[] {
    const names = [...new Set([...PaymentStages.core, ...Object.keys(plans), ...payments.map(p => PaymentStages.name(p.stage))])]
    return names.map(name => {
      const rows = payments.filter(p => PaymentStages.name(p.stage) === name)
      const received = rows.reduce((n, p) => n + p.amount, 0)
      const target = plans[name]
      return { name, rows, received, target, pending: target === undefined ? null : Math.max(0, target - received), status: stageStatus(received, target) }
    })
  }
}

const OLD_NAMES: Readonly<Record<string, string>> = {
  'booking': 'Booking Amount',
  'booking amount': 'Booking Amount',
  'on-event': 'On Event',
  'on event': 'On Event',
  'after event': 'After Event',
  'album printing': 'Album Printing',
  'delivery': 'Delivery',
}

function stageStatus(received: number, target: number | undefined): StageStatus {
  if (target === undefined) return received ? 'Received' : 'Not set'
  if (target === 0 && !received) return 'Not required'
  return received >= target ? 'Paid' : received ? 'Partially paid' : 'Pending'
}
