import type { Session } from '../api/session.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'

export function LoginPage({ session }: { session: Session }) {
  const { error, busy, onSubmit } = useSubmit(async fd => {
    await session.signIn(String(fd.get('email')), String(fd.get('password')))
  })
  return (
    <main className="content">
      <section className="panel" style={{ maxWidth: 420, margin: '10vh auto' }}>
        <h1>Sign in</h1>
        <p className="subtext">Framewise studio workspace.</p>
        <form autoComplete="off" onSubmit={onSubmit}>
          <p className="form-error" role="alert">{error}</p>
          <div className="field-grid">
            <Field name="email" label="Email" type="email" required wide />
            <Field name="password" label="Password" type="password" required wide />
          </div>
          <div className="modal-footer"><button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
        </form>
      </section>
    </main>
  )
}
