export class CalendarDate {
  readonly #text: string

  private constructor(text: string) {
    this.#text = text
  }

  // YYYY-MM-DD that exists on the calendar (rejects 2023-02-29)
  static parse(value: string | null | undefined): CalendarDate | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
    const d = new Date(value + 'T12:00:00Z')
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === value ? new CalendarDate(value) : null
  }

  toString(): string {
    return this.#text
  }
}
