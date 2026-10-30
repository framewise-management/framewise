export type CalendarState = 'Canceled' | 'Lost' | 'Confirmed' | 'Tentative'

export class Booking {
  static readonly statuses: readonly string[] = ['Quote Sent', 'Booked', 'Negotiation', 'Tentative', 'Canceled', 'Lost']
  static readonly clientStatuses: readonly string[] = [...Booking.statuses, 'Confirmed', 'Completed']
  static readonly enquiryStatuses: readonly string[] = ['New', 'Contacted', 'Follow-up', ...Booking.statuses, 'Confirmed']
  static readonly closed: readonly string[] = ['Canceled', 'Lost']
  static readonly won: readonly string[] = ['Booked', 'Confirmed', 'Completed']

  // a closed client overrides its events; otherwise the event's own booking status wins
  static state(event: { bookingStatus?: string }, client?: { status?: string }): CalendarState {
    const state = client?.status && Booking.closed.includes(client.status) ? client.status : event.bookingStatus || client?.status
    if (state === 'Canceled' || state === 'Lost') return state
    return state && Booking.won.includes(state) ? 'Confirmed' : 'Tentative'
  }
}
