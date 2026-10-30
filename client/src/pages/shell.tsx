import { useStudio } from '../data/studio-context.tsx'
import { EnquiryForm } from '../forms/enquiry-form.tsx'
import { NewClientForm } from '../forms/new-client-form.tsx'
import { PaymentForm } from '../forms/payment-form.tsx'
import { Format } from '../ui/format.ts'
import { Empty, Icon, type IconName } from '../ui/icon.tsx'
import { useRoute } from '../ui/use-route.ts'
import { CalendarPage } from './calendar-page.tsx'
import { ClientDetail } from './client-detail.tsx'
import { ClientsPage } from './clients-page.tsx'
import { EnquiriesPage } from './enquiries-page.tsx'
import { TeamManagement } from './team-management.tsx'
import { ProjectsPage } from './projects-page.tsx'
import { TermsPage } from './terms-page.tsx'
import { PaymentSettingsPage } from './payment-settings-page.tsx'

const NAV: [route: string, label: string, icon: IconName][] = [
  ['dashboard', 'Home', 'home'], ['clients', 'Clients', 'clients'], ['enquiries', 'Enquiries', 'enquiries'], ['calendar', 'Calendar', 'calendar'],
  ['projects', 'Projects', 'projects'], ['finance', 'Finance', 'finance'], ['tasks', 'Tasks', 'tasks'],
  ['reports', 'Reports', 'reports'], ['setup', 'Setup', 'settings'],
]
const PRIMARY = ['dashboard', 'clients', 'calendar', 'tasks']

export function Shell({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const studio = useStudio()
  const [route, id] = useRoute()
  const title = NAV.find(n => n[0] === route)?.[1] ?? (route === 'more' ? 'More' : route === 'team' ? 'Team Management' : route === 'terms' ? 'Terms & Conditions' : route === 'payment-settings' ? 'Payment & Invoice' : 'Home')
  const quick = () => studio.open('Quick Add', (
    <div className="quick-list">
      {([['New enquiry', 'Start a conversation', 'enquiries', <EnquiryForm />], ['New client', 'Create a couple’s profile', 'clients', <NewClientForm />], ['Add payment', 'Update the balance', 'finance', <PaymentForm />]] as const)
        .map(([label, sub, icon, form]) => (
          <button key={label} onClick={() => studio.open(label, form)}><span className="quick-icon"><Icon name={icon} /></span><span className="quick-label">{label}<small>{sub}</small></span></button>
        ))}
    </div>
  ), 'quick-sheet')
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/dashboard"><span className="brand-mark" aria-hidden="true">F</span><span><strong>Framewise</strong><small>STUDIO WORKSPACE</small></span></a>
        <nav aria-label="Desktop navigation">
          {NAV.map(([r, label, icon]) => <a key={r} href={'#/' + r} className={r === route || (r === 'setup' && ['team', 'terms', 'payment-settings'].includes(route)) ? 'active' : ''} aria-current={r === route ? 'page' : undefined}><Icon name={icon} />{label}</a>)}
        </nav>
        <div className="sidebar-foot">{email}<br /><button className="small" onClick={onSignOut}>Sign out</button></div>
      </aside>
      <main className="main">
        <header className="topbar">
          <a className="mobile-brand" href="#/dashboard"><strong>Framewise</strong></a>
          <span className="crumb">{title}</span>
          <div className="topbar-actions">
            <span className="subtext desktop-date">{Format.date(studio.today)}</span>
            <button className="primary top-quick" onClick={quick}><span aria-hidden="true">＋</span><span>Quick Add</span></button>
          </div>
        </header>
        <div className={'content' + (route === 'clients' && id ? ' profile-content' : route === 'calendar' ? ' calendar-content' : '')}>
          <Page route={route} id={id} onSignOut={onSignOut} />
          <footer>Saved to the studio database · Framewise</footer>
        </div>
      </main>
      <button className="quick-fab" onClick={quick} aria-label="Quick Add">＋</button>
      <nav className="bottom-nav" aria-label="Main navigation">
        {([['dashboard', 'Home', 'home'], ['clients', 'Clients', 'clients'], ['calendar', 'Calendar', 'calendar'], ['tasks', 'Tasks', 'tasks'], ['more', 'More', 'more']] as const).map(([r, label, icon]) => {
          const active = r === 'more' ? !PRIMARY.includes(route) : route === r
          return <a key={r} href={'#/' + r} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></a>
        })}
      </nav>
    </div>
  )
}

function Page({ route, id, onSignOut }: { route: string; id?: string; onSignOut: () => void }) {
  if (route === 'calendar') return <CalendarPage />
  if (route === 'clients') return id ? <ClientDetail key={id} id={id} /> : <ClientsPage />
  if (route === 'enquiries') return <EnquiriesPage />
  if (route === 'more') return <More onSignOut={onSignOut} />
  if (route === 'team') return <TeamManagement />
  if (route === 'terms') return <TermsPage />
  if (route === 'payment-settings') return <PaymentSettingsPage />
  if (route === 'projects') return <ProjectsPage />
  if (route === 'setup') return <><div className="heading workspace-heading"><div><span className="workspace-kicker">Your workspace</span><h1>Setup</h1><p className="subtext">Manage your team and studio details.</p></div></div><div className="workspace-list-heading"><h2>Studio settings</h2></div><div className="more-list setup-list"><a href="#/team" className="more-item"><span className="more-icon"><Icon name="team" /></span><span><strong>Team Management</strong><small>Add people and manage their roles</small></span><span className="more-chevron" aria-hidden="true">›</span></a><a href="#/payment-settings" className="more-item"><span className="more-icon"><Icon name="finance" /></span><span><strong>Payment &amp; Invoice</strong><small>Payment preferences and invoice numbering</small></span><span className="more-chevron" aria-hidden="true">›</span></a><a href="#/terms" className="more-item"><span className="more-icon"><Icon name="note" /></span><span><strong>Terms &amp; Conditions</strong><small>Manage your clause library</small></span><span className="more-chevron" aria-hidden="true">›</span></a></div></>
  const label = route === 'team' ? 'Team Management' : NAV.find(n => n[0] === route)?.[1]
  if (!label) return <Empty title="Page not found" text="Return to the studio workspace."><a className="linked" href="#/dashboard">Home</a></Empty>
  return (
    <>
      <div className="heading"><div><h1>{label}</h1><p className="subtext">Coming in the next update.</p></div></div>
      <Empty title={label + ' is being moved over'} text="Clients, payments and enquiries already work here. This page arrives in the next UI slice."><a className="linked" href="#/clients">Go to Clients</a></Empty>
    </>
  )
}

function More({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <div className="heading"><div><h1>More</h1><p className="subtext">The rest of your studio, one tap away.</p></div></div>
      <div className="more-list">
        {NAV.filter(([r]) => !PRIMARY.includes(r)).map(([r, label, icon]) => (
          <a key={r} href={'#/' + r} className="more-item"><span className="more-icon"><Icon name={icon} /></span><span><strong>{label}</strong></span><span className="more-chevron" aria-hidden="true">›</span></a>
        ))}
        <button className="more-item" onClick={onSignOut}><span><strong>Sign out</strong></span></button>
      </div>
    </>
  )
}

