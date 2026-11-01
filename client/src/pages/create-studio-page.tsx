import type { ApiClient } from '../api/api-client.ts'
import { Field } from '../ui/field.tsx'
import { useSubmit } from '../ui/use-submit.ts'

// shown to a signed-in login that isn't linked to a studio yet
export function CreateStudioPage({ api, email, onCreated, onSignOut }: { api: ApiClient; email: string; onCreated: () => void; onSignOut: () => void }) {
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const prefix = String(fd.get('client_code_prefix')).trim()
    await api.post('/studios', { company: String(fd.get('company')), ...(prefix ? { client_code_prefix: prefix } : {}) })
    onCreated()
  })
  return (
    <main className="content">
      <section className="panel" style={{ maxWidth: 420, margin: '10vh auto' }}>
        <h1>Name your studio</h1>
        <p className="subtext">Signed in as {email}. You'll be the studio's owner.</p>
        <form autoComplete="off" onSubmit={onSubmit}>
          <p className="form-error" role="alert">{error}</p>
          <div className="field-grid">
            <Field name="company" label="Studio name" required wide />
            <Field name="client_code_prefix" label="Client code prefix (optional)" placeholder="e.g. AC-" wide />
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onSignOut}>Sign out</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create studio'}</button>
          </div>
        </form>
      </section>
    </main>
  )
}
