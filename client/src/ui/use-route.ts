import { useEffect, useState } from 'react'

// hash routes like the legacy app: #/clients/<id> -> ['clients', '<id>']
export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const changed = () => setHash(location.hash)
    addEventListener('hashchange', changed)
    return () => removeEventListener('hashchange', changed)
  }, [])
  const parts = hash.replace(/^#\/?/, '').split('/')
  return [parts[0] || 'dashboard', ...parts.slice(1)]
}
