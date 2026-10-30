import { useId, useState } from 'react'

interface PhoneFieldProps {
  name: string
  label: string
  value?: string | number | null
  required?: boolean
  disabled?: boolean
  wide?: boolean
  onSave?: (value: string) => void
  onChange?: (value: string) => void
}

export function PhoneField({ name, label, value, required, disabled, wide, onSave, onChange }: PhoneFieldProps) {
  const id = useId()
  const original = String(value ?? '')
  const parts = original.trim().match(/^\+(\d{1,3})\s+(\d[\d\s-]*)$/)
  const digits = original.replace(/\D/g, '')
  const [code, setCode] = useState(parts?.[1] ?? '91')
  const [number, setNumber] = useState(parts ? parts[2].replace(/\D/g, '') : digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits)
  const [changed, setChanged] = useState(false)
  const combined = number ? `+${code} ${number}` : ''
  const update = (nextCode: string, nextNumber: string) => {
    setCode(nextCode)
    setNumber(nextNumber)
    setChanged(true)
    onChange?.(nextNumber ? `+${nextCode} ${nextNumber}` : '')
  }

  return (
    <div className={'field' + (wide ? ' wide' : '')} onBlur={e => {
      if (changed && !e.currentTarget.contains(e.relatedTarget as Node | null)) onSave?.(combined)
    }}>
      <label htmlFor={id}>{label}</label>
      <div className="phone-fields">
        <input aria-label="Country code" type="tel" inputMode="numeric" autoComplete="off" pattern="\+[0-9]{1,3}" value={code ? `+${code}` : ''} placeholder="+" required={!!number} disabled={disabled} onChange={e => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 3)
          update(next, number)
        }} />
        <input id={id} type="tel" inputMode="numeric" autoComplete="off" pattern="[0-9]{10}" value={number} required={required} disabled={disabled} onChange={e => update(code, e.target.value.replace(/\D/g, '').slice(0, 10))} />
        <input type="hidden" name={name} value={changed ? combined : original} disabled={disabled} />
      </div>
    </div>
  )
}
