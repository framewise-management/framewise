import { useEffect, useRef } from 'react'

export interface ModalContent {
  title: string
  body: React.ReactNode
  kind?: string
}

// the legacy bottom sheet: a native <dialog class="sheet">
export function Modal({ content, onClose }: { content: ModalContent; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    document.body.classList.add('sheet-open')
    return () => document.body.classList.remove('sheet-open')
  }, [])
  return (
    <dialog ref={ref} className={'sheet ' + (content.kind || 'form')} aria-labelledby="modal-title" onClose={onClose}>
      <div className="modal-head"><h2 id="modal-title">{content.title}</h2><button type="button" onClick={onClose} aria-label="Close dialog">×</button></div>
      <div className="modal-body">{content.body}</div>
    </dialog>
  )
}
