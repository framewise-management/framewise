import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Booking } from './booking.ts'

const { bookingState } = await import(new URL('../../legacy/dist/business.js', import.meta.url).href)

test('calendar state matches legacy bookingState for every event/client combination', () => {
  const statuses = [undefined, '', 'Quote Sent', 'Booked', 'Negotiation', 'Tentative', 'Canceled', 'Lost', 'Confirmed', 'Completed']
  for (const eventStatus of statuses) {
    const event = { bookingStatus: eventStatus }
    assert.equal(Booking.state(event), bookingState(event), `${eventStatus} / no client`)
    for (const clientStatus of statuses) {
      const client = { status: clientStatus }
      assert.equal(Booking.state(event, client), bookingState(event, client), `${eventStatus} / ${clientStatus}`)
    }
  }
})
