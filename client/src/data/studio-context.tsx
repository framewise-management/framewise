import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { StudioLocale } from '@framewise/shared/studio-locale.ts'
import type { ApiClient } from '../api/api-client.ts'
import { Modal, type ModalContent } from '../ui/modal.tsx'
import { StudioData } from './studio-data.ts'

export interface Studio {
  api: ApiClient
  data: StudioData
  today: string
  open(title: string, body: React.ReactNode, kind?: string): void
  close(): void
  toast(message: string): void
  // run a change on the server, then reload everything; errors are left to the caller's form
  save(change: () => Promise<unknown>, message: string, keepOpen?: boolean): Promise<void>
}

const StudioContext = createContext<Studio | null>(null)

export function useStudio(): Studio {
  const studio = useContext(StudioContext)
  if (!studio) throw new Error('useStudio outside StudioProvider')
  return studio
}

export function StudioProvider({ api, children }: { api: ApiClient; children: React.ReactNode }) {
  const [data, setData] = useState<StudioData | null>(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalContent | null>(null)
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const reload = useCallback(async () => setData(await StudioData.load(api)), [api])
  useEffect(() => { reload().catch(e => setError(e.message)) }, [reload])

  const toast = useCallback((text: string) => {
    setMessage(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), 3200)
  }, [])

  if (error) return <main className="content"><h1>Could not load the studio</h1><p className="subtext">{error}</p><button onClick={() => location.reload()}>Try again</button></main>
  if (!data) return <main className="content"><p className="subtext">Loading the studio…</p></main>

  const studio: Studio = {
    api, data, today: StudioLocale.today(),
    open: (title, body, kind) => setModal({ title, body, kind }),
    close: () => setModal(null),
    toast,
    save: async (change, text, keepOpen) => {
      await change()
      await reload()
      if (!keepOpen) setModal(null)
      toast(text)
    },
  }
  return (
    <StudioContext.Provider value={studio}>
      {children}
      {modal && <Modal key={modal.title} content={modal} onClose={() => setModal(null)} />}
      <div id="toast" role="status" style={{ display: message ? 'block' : 'none' }}>{message}</div>
    </StudioContext.Provider>
  )
}
