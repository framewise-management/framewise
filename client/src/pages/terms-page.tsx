import { useCallback, useEffect, useState } from 'react'
import { useStudio } from '../data/studio-context.tsx'
import { Field } from '../ui/field.tsx'
import { Empty } from '../ui/icon.tsx'
import { useSubmit } from '../ui/use-submit.ts'

interface Term { id: string; title: string; body: string; active: boolean }

export function TermsPage() {
  const studio = useStudio()
  const [terms, setTerms] = useState<Term[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setTerms(await studio.api.get<Term[]>('/terms')); setError('') }
    catch (err) { setError((err as Error).message) }
  }, [studio.api])
  useEffect(() => { void load() }, [load])
  const edit = (term?: Term) => studio.open(term ? 'Edit clause' : 'Add clause', <TermForm term={term} reload={load} />)
  const toggle = async (term: Term) => {
    try { await studio.api.patch(`/terms/${term.id}`, { active: !term.active }); await load() }
    catch (err) { setError((err as Error).message) }
  }
  const remove = (term: Term) => studio.open('Delete clause?', <><p>Delete “{term.title}” from your clause library?</p><div className="modal-footer"><button onClick={studio.close}>Cancel</button><button className="danger" onClick={async () => {
    try { await studio.api.delete(`/terms/${term.id}`); studio.close(); await load(); studio.toast('Clause deleted') }
    catch (err) { studio.toast((err as Error).message) }
  }}>Delete clause</button></div></>)
  return <>
    <a className="back" href="#/setup">← Setup</a>
    <div className="heading workspace-heading"><div><span className="workspace-kicker">Setup / Studio</span><h1>Terms &amp; Conditions</h1><p className="subtext">Keep your studio’s clauses together in one place.</p></div><button className="primary" onClick={() => edit()}>＋ Add clause</button></div>
    <div className="workspace-list-heading"><h2>Clause library</h2>{terms && <span>{terms.length} {terms.length === 1 ? 'clause' : 'clauses'}</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!terms && !error && <p className="subtext">Loading clauses…</p>}
    {terms?.length === 0 && <Empty title="No clauses yet" text="Add your first clause to build your library."><button onClick={() => edit()}>Add clause</button></Empty>}
    {terms && terms.length > 0 && <div className="terms-list">{terms.map(term => <article className="term-card" key={term.id}>
      <div className="term-card-head"><div><h2>{term.title}</h2><span className={term.active ? 'term-status' : 'term-status hidden-status'}>{term.active ? 'Active' : 'Hidden'}</span></div><div className="term-actions"><button className="small" onClick={() => void toggle(term)}>{term.active ? 'Hide' : 'Show'}</button><button className="small" onClick={() => edit(term)}>Edit</button><button className="small danger" onClick={() => remove(term)}>Delete</button></div></div>
      <p>{term.body}</p>
    </article>)}</div>}
  </>
}

function TermForm({ term, reload }: { term?: Term; reload: () => Promise<void> }) {
  const studio = useStudio()
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const body = { title: fd.get('title'), body: fd.get('body') }
    if (term) await studio.api.patch(`/terms/${term.id}`, body)
    else await studio.api.post('/terms', body)
    studio.close()
    await reload()
    studio.toast(term ? 'Clause updated' : 'Clause added')
  })
  return <form autoComplete="off" onSubmit={onSubmit}><p className="form-error" role="alert">{error}</p><div className="field-grid"><Field name="title" label="Clause title" value={term?.title} placeholder="e.g. Cancellation policy" required wide /><Field name="body" label="Clause text" value={term?.body} type="textarea" required wide /></div><div className="modal-footer"><button type="button" onClick={studio.close}>Cancel</button><button type="submit" className="primary" disabled={busy}>{term ? 'Save changes' : 'Add clause'}</button></div></form>
}
