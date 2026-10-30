// the legacy app's line icons, by name
const PATHS = {
  home: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  clients: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  enquiries: 'M21 11a8 8 0 0 1-8 8H5l-3 3V5h19z M6 7h11 M6 11h7',
  calendar: 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18',
  projects: 'M3 7h18v14H3z M3 7V3h7l3 4',
  finance: 'M3 5h18v15H3z M16 10h5 M7 10h4 M7 15h2',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 22v-3a7 7 0 0 1 14 0v3',
  tasks: 'M9 5h12 M9 12h12 M9 19h12 M2 5l2 2 3-4 M2 12l2 2 3-4 M2 19l2 2 3-4',
  reports: 'M4 21V10 M10 21V4 M16 21V13 M22 21H2',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  call: 'M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2',
  chat: 'M21 11a9 9 0 0 1-9 9H7l-4 2 1-5a9 9 0 1 1 17-6 M8 8l2 3 3 2 3-2',
  note: 'M4 4h10 M4 4v16h16V10 M12 15l8-8-3-3-8 8-1 4z',
} as const

export type IconName = keyof typeof PATHS | 'more'

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'more' ? <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></> : <path d={PATHS[name]} />}
    </svg>
  )
}

export function Tag({ value }: { value: string | null | undefined }) {
  return <span className={'tag ' + (value || '').toLowerCase()}>{value}</span>
}

export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{text}</p>{children}</div>
}
