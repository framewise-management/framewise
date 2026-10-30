import { useState } from 'react'
import { useStudio } from '../data/studio-context.tsx'
import { EventCard } from './event-card.tsx'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dateKey = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function CalendarPage() {
  const { data, today } = useStudio()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1)
  const [selected, setSelected] = useState<string | null>(null)
  const monthName = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const events = data.events.filter(e => e.event_date?.startsWith(dateKey(year, month, 1).slice(0, 7)) && data.isActive(e))
  const shown = selected ? events.filter(e => e.event_date === selected) : events
  const firstDay = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const groups = [...new Set(shown.map(e => e.event_date!))]
  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1)
    setYear(next.getFullYear()); setMonth(next.getMonth()); setSelected(null)
  }
  const goToday = () => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7)) - 1); setSelected(null) }
  const selectedLabel = selected ? new Date(selected + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : monthName
  return <>
    <div className="heading workspace-heading"><div><span className="workspace-kicker">Your schedule</span><h1>Calendar</h1><p className="subtext">See your month at a glance, or select a date for its events.</p></div></div>
    <div className="calendar-layout">
      <section className="calendar-picker" aria-label="Choose a date">
        <div className="calendar-picker-head"><div><span className="calendar-label">MONTH</span><h2>{monthName}</h2></div><div className="calendar-arrows"><button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><button onClick={() => changeMonth(1)} aria-label="Next month">›</button></div></div>
        <div className="calendar-grid calendar-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{Array.from({ length: firstDay }, (_, i) => <span key={'blank' + i} />)}{Array.from({ length: days }, (_, i) => {
          const date = dateKey(year, month, i + 1)
          const count = events.filter(e => e.event_date === date).length
          return <button key={date} className={'calendar-date' + (selected === date ? ' selected' : '') + (date === today ? ' today' : '')} aria-label={`${date}, ${count} ${count === 1 ? 'event' : 'events'}`} aria-pressed={selected === date} onClick={() => setSelected(date)}><span>{i + 1}</span>{count > 0 && <i aria-hidden="true" />}</button>
        })}</div>
        <div className="calendar-picker-foot"><span><i /> Event scheduled</span><button onClick={goToday}>Today</button></div>
      </section>
      <section className="calendar-agenda" aria-live="polite">
        <div className="calendar-agenda-head"><div><span className="calendar-label">{selected ? 'SELECTED DATE' : 'MONTH OVERVIEW'}</span><h2>{selectedLabel}</h2><p className="subtext">{shown.length} {shown.length === 1 ? 'event' : 'events'} {selected ? 'on this day' : 'this month'}</p></div>{selected && <button className="small" onClick={() => setSelected(null)}>View whole month</button>}</div>
        {groups.length ? <div className="calendar-groups">{groups.map(date => <div className="calendar-group" key={date}><h3>{new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>{shown.filter(e => e.event_date === date).map(e => <EventCard key={e.id} event={e} />)}</div>)}</div> : <div className="calendar-empty"><strong>{selected ? 'Nothing scheduled for this day' : 'No events scheduled this month'}</strong><p>{selected ? 'Choose another date or return to the month overview.' : 'Events with a confirmed or tentative date will appear here.'}</p></div>}
      </section>
    </div>
  </>
}
