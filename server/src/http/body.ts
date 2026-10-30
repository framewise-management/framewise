import type { Row } from '../db/database.ts'
import { HttpError } from './http-error.ts'

export class Body {
  // the request body as a row of allowed fields only, so callers can't write ids, codes or timestamps
  static pick(body: unknown, allowed: readonly string[]): Row {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a JSON object')
    const unknown = Object.keys(body).filter(k => !allowed.includes(k))
    if (unknown.length) throw new HttpError(400, 'Unknown fields: ' + unknown.join(', '))
    return { ...body }
  }

  static list<T>(value: unknown, name: string): T[] {
    if (!Array.isArray(value)) throw new HttpError(400, `Send ${name} as a list`)
    return value
  }
}
