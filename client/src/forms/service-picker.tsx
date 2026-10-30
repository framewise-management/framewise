import { StudioLists } from '@framewise/shared/studio-lists.ts'

// checkboxes named `name`; read with FormData.getAll(name), or controlled through onChange
export function ServicePicker({ name, selected, onChange }: { name: string; selected: readonly string[]; onChange?: (services: string[]) => void }) {
  const options = [...new Set([...StudioLists.services, ...selected])]
  return (
    <fieldset className="service-picker wide">
      <legend>Required services</legend>
      <div className="service-options">
        {options.map(s => (
          <label key={s}>
            <input type="checkbox" name={name} value={s}
              {...(onChange
                ? { checked: selected.includes(s), onChange: e => onChange(e.target.checked ? [...selected, s] : selected.filter(x => x !== s)) }
                : { defaultChecked: selected.includes(s) })} />
            {s}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
