import { PaymentStages } from '@framewise/shared/payment-stages.ts'
import { useStudio } from '../data/studio-context.tsx'
import { Field } from '../ui/field.tsx'
import { Format } from '../ui/format.ts'
import { useSubmit } from '../ui/use-submit.ts'

// expected amount per payment stage; leaving a stage blank means no target
export function StagePlanForm({ clientId }: { clientId: string }) {
  const studio = useStudio()
  const stages = studio.data.stages(clientId)
  const { error, busy, onSubmit } = useSubmit(async fd => {
    const plan: Record<string, number> = {}
    for (const s of stages) {
      const v = String(fd.get('stage:' + s.name) ?? '')
      if (v !== '') plan[s.name] = Number(v)
    }
    const custom = String(fd.get('new_stage') || '').trim()
    if (custom) {
      const name = PaymentStages.name(custom)
      if (stages.some(s => s.name === name)) throw new Error('Use the existing stage field for ' + name)
      if (fd.get('new_target') === '') throw new Error('Enter the custom stage expected amount')
      plan[name] = Number(fd.get('new_target'))
    }
    await studio.save(() => studio.api.put(`/clients/${clientId}/stage-plans`, { plan }), 'Stage amounts saved')
  })
  return (
    <form autoComplete="off" onSubmit={onSubmit}>
      <p className="form-error" role="alert">{error}</p>
      <p className="subtext">Quotation {Format.money(studio.data.quote(clientId))}. Targets together cannot exceed it.</p>
      <div className="field-grid">
        {stages.map(s => <Field key={s.name} name={'stage:' + s.name} label={s.name} value={s.target ?? ''} type="number" />)}
        <Field name="new_stage" label="Custom stage" placeholder="e.g. Travel" />
        <Field name="new_target" label="Custom stage amount (₹)" type="number" />
      </div>
      <div className="modal-footer">
        <button type="button" onClick={studio.close}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>Save stage amounts</button>
      </div>
    </form>
  )
}
