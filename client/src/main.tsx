import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Agentation } from 'agentation'
import { ApiClient } from './api/api-client.ts'
import { Session } from './api/session.ts'
import { StudioProvider } from './data/studio-context.tsx'
import { LoginPage } from './pages/login-page.tsx'
import { Shell } from './pages/shell.tsx'
import './style.css'
import './workspace.css'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env')

const session = new Session(url, anonKey)
const api = new ApiClient(session)

createRoot(document.getElementById('root')!).render(<StrictMode><App />{import.meta.env.DEV && <Agentation />}</StrictMode>)

function App() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const check = () => { session.email().then(setEmail) }
    check()
    return session.onChange(check)
  }, [])
  if (email === undefined) return null
  if (!email) return <LoginPage session={session} />
  return <StudioProvider api={api}><Shell email={email} onSignOut={() => session.signOut()} /></StudioProvider>
}
