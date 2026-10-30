import { useState } from 'react'

// a form's submit handler with the server's error message shown in .form-error
export function useSubmit(action: (form: FormData, el: HTMLFormElement) => Promise<void>) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await action(new FormData(e.currentTarget), e.currentTarget)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, onSubmit, setError }
}
