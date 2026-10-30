import { useId } from 'react'
import { PhoneField } from './phone-field.tsx'

export type Option = string | readonly [string, string]

interface FieldProps {
  name: string
  label: string
  value?: string | number | null
  type?: string
  options?: readonly Option[]
  required?: boolean
  disabled?: boolean
  wide?: boolean
  min?: number
  placeholder?: string
  // inline editing: called with the new value when it changed and the field loses focus
  onSave?: (value: string) => void
  onChange?: (value: string) => void
}

// legacy .field markup; uncontrolled unless onChange is given, read with FormData on submit
export function Field({ name, label, value, type = 'text', options, required, disabled, wide, min, placeholder, onSave, onChange }: FieldProps) {
  const id = useId()
  if (type === 'tel') return <PhoneField name={name} label={label} value={value} required={required} disabled={disabled} wide={wide} onSave={onSave} onChange={onChange} />
  const initial = value ?? ''
  const common = {
    id, name, required, disabled, autoComplete: 'off',
    ...(onChange ? { value: initial, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(e.target.value) } : { defaultValue: initial }),
    onBlur: onSave ? (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { if (e.target.value !== String(initial)) onSave(e.target.value) } : undefined,
  }
  const control = options
    ? <select {...common}>{options.map(o => { const [v, t] = typeof o === 'string' ? [o, o] : o; return <option key={v} value={v}>{t}</option> })}</select>
    : type === 'textarea'
      ? <textarea {...common} placeholder={placeholder} />
      : <input {...common} type={type} min={min ?? (type === 'number' ? 0 : undefined)} step={type === 'number' ? 1 : undefined} placeholder={placeholder} />
  return (
    <div className={'field' + (wide || type === 'textarea' ? ' wide' : '')}>
      <label htmlFor={id}>{label}</label>
      {control}
    </div>
  )
}
