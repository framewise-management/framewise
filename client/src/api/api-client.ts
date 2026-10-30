import type { Session } from './session.ts'

// calls the Express API with the signed-in user's token; server errors come back as { error } and are thrown with that message
export class ApiClient {
  readonly #session: Session

  constructor(session: Session) {
    this.#session = session
  }

  get<T>(path: string): Promise<T> {
    return this.#send<T>('GET', path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.#send<T>('POST', path, body)
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.#send<T>('PATCH', path, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.#send<T>('PUT', path, body)
  }

  delete(path: string): Promise<void> {
    return this.#send<void>('DELETE', path)
  }

  async #send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.#session.token()
    const res = await fetch('/api' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 204) return undefined as T
    const json = (await res.json().catch(() => ({ error: `Server error (${res.status})` }))) as { error?: string }
    if (!res.ok) throw new Error(json.error || `Server error (${res.status})`)
    return json as T
  }
}
