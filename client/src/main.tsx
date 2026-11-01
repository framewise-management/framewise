import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Agentation } from 'agentation'
import { ApiClient } from './api/api-client.ts'
import { ApiError } from './api/api-error.ts'
import { Session } from './api/session.ts'
import { StudioProvider } from './data/studio-context.tsx'
import { CreateStudioPage } from './pages/create-studio-page.tsx'
import { LoginPage } from './pages/login-page.tsx'
import { SignupPage } from './pages/signup-page.tsx'
import { Shell } from './pages/shell.tsx'
import { QuotePage } from './quotes/quote-page.tsx'
import './style.css'
import './workspace.css'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env')

const session = new Session(url, anonKey)
const api = new ApiClient(session)

createRoot(document.getElementById('root')!).render(<StrictMode><App />{import.meta.env.DEV && <Agentation />}</StrictMode>)

function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const change = () => setHash(location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  const quote = hash.match(/^#\/quote\/([a-f0-9-]{36})\/([a-f0-9]{64})$/i)
  if (quote) return <QuotePage key={hash} studioId={quote[1]} token={quote[2]} />
  return <Workspace signup={hash === '#/signup'} />
}

function Workspace({ signup }: { signup: boolean }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  // false: signed in, but the login has no studio yet (403 from the API)
  const [linked, setLinked] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    const check = () => { session.email().then(setEmail) }
    check()
    return session.onChange(check)
  }, [])
  useEffect(() => {
    if (!email) return
    setLinked(undefined)
    api.get('/studio').then(() => setLinked(true), e => setLinked(!(e instanceof ApiError && e.status === 403)))
  }, [email])
  if (email === undefined) return null
  if (!email) return signup ? <SignupPage session={session} /> : <LoginPage session={session} />
  if (linked === undefined) return null
  if (!linked) return <CreateStudioPage api={api} email={email} onCreated={() => setLinked(true)} onSignOut={() => session.signOut()} />
  return <StudioProvider api={api}><Shell email={email} onSignOut={() => session.signOut()} /></StudioProvider>
}
