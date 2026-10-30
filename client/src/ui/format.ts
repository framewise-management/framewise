import { StudioLocale } from '@framewise/shared/studio-locale.ts'

export class Format {
  static money(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: StudioLocale.currency, maximumFractionDigits: 0 }).format(value || 0)
  }

  static date(value: string | null | undefined): string {
    return value ? new Date(value + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'
  }

  static time(value: string | null | undefined): string {
    return (value || '').slice(0, 5)
  }

  static initials(name: string): string {
    return name.split(' ').filter(x => x && x !== '&').slice(0, 2).map(x => x[0]).join('')
  }

  // 10-digit Indian numbers get the 91 country code, for tel: and WhatsApp links
  static phone(value: string | null | undefined): string {
    const n = String(value || '').replace(/\D/g, '')
    return n.length === 10 ? '91' + n : n.length >= 7 && n.length <= 15 ? n : ''
  }
}
