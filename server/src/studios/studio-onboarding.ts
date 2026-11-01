import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface NewStudio {
  company: string
  ownerEmail: string
  clientCodePrefix?: string
}

export interface CreatedStudio {
  studioId: string
  ownerEmail: string
  temporaryPassword: string
}

// sets up a studio and its owner's login; run by the operator, never by the API.
// Supabase Auth and the database can't share a transaction, so a failed step undoes the earlier ones.
export class StudioOnboarding {
  readonly #client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async create({ company, ownerEmail, clientCodePrefix = '' }: NewStudio): Promise<CreatedStudio> {
    const name = company.trim()
    const email = ownerEmail.trim().toLowerCase()
    if (!name) throw new Error('Give the studio a name')
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Give a valid owner email')
    if (!/^[A-Za-z0-9_-]{0,16}$/.test(clientCodePrefix)) throw new Error('Client code prefix: up to 16 letters, numbers, - or _')

    const temporaryPassword = randomBytes(12).toString('base64url')
    const user = await this.#client.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true })
    if (user.error || !user.data.user) throw new Error(`Could not create the login: ${user.error?.message}`)
    const userId = user.data.user.id

    const studio = await this.#client.from('studios').insert({ company: name, client_code_prefix: clientCodePrefix }).select('id').single()
    if (studio.error) {
      await this.#client.auth.admin.deleteUser(userId)
      throw new Error(`Could not create the studio: ${studio.error.message}`)
    }
    const member = await this.#client.from('studio_members').insert({ user_id: userId, studio_id: studio.data.id })
    if (member.error) {
      await this.#client.from('studios').delete().eq('id', studio.data.id)
      await this.#client.auth.admin.deleteUser(userId)
      throw new Error(`Could not link the login to the studio: ${member.error.message}`)
    }
    return { studioId: studio.data.id, ownerEmail: email, temporaryPassword }
  }
}
