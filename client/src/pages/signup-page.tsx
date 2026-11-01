import { useState } from 'react'
import type { Session } from '../api/session.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'

export function SignupPage({ session }: { session: Session }) {
  const [sentTo, setSentTo] = useState('')
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const email = String(fd.get('email'))
    const password = String(fd.get('password'))
    if (password !== String(fd.get('confirm'))) throw new Error('The passwords do not match')
    if (await session.signUp(email, password, location.origin + location.pathname)) setSentTo(email)
    else location.hash = ''
  })
  return (
    <main className="content">
      <section className="panel" style={{ maxWidth: 420, margin: '10vh auto' }}>
        <h1>Create your studio</h1>
        {sentTo ? (
          <p className="subtext">We sent a confirmation link to {sentTo}. Open it, then sign in to name your studio.</p>
        ) : (
          <>
            <p className="subtext">Start with your login; you'll name the studio next.</p>
            <form autoComplete="off" onSubmit={onSubmit}>
              <p className="form-error" role="alert">{error}</p>
              <div className="field-grid">
                <Field name="email" label="Email" type="email" required wide />
                <Field name="password" label="Password" type="password" required wide />
                <Field name="confirm" label="Confirm password" type="password" required wide />
              </div>
              <div className="modal-footer"><button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
            </form>
          </>
        )}
        <p className="subtext">Already have a login? <a href="#" style={{ textDecoration: 'underline' }}>Sign in</a></p>
      </section>
    </main>
  )
}
