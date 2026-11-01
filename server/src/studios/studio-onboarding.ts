import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from '../http/http-error.ts'

export interface NewStudio {
  company: string
  ownerEmail: string
  clientCodePrefix?: string
}

export interface StudioDetails {
  company: string
  clientCodePrefix?: string
}

export interface CreatedStudio {
  studioId: string
  ownerEmail: string
  temporaryPassword: string
}

// sets up a studio for a login: the operator's script creates the login too, self sign-up brings its own.
// Supabase Auth and the database can't share a transaction, so a failed step undoes the earlier ones.
export class StudioOnboarding {
  readonly #client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async create({ company, ownerEmail, clientCodePrefix = '' }: NewStudio): Promise<CreatedStudio> {
    const details = checkDetails({ company, clientCodePrefix })
    const email = ownerEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'Give a valid owner email')

    const temporaryPassword = randomBytes(12).toString('base64url')
    const user = await this.#client.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true })
    if (user.error || !user.data.user) throw new Error(`Could not create the login: ${user.error?.message}`)
    const userId = user.data.user.id

    try {
      const studioId = await this.#createStudio(userId, details)
      return { studioId, ownerEmail: email, temporaryPassword }
    } catch (err) {
      await this.#client.auth.admin.deleteUser(userId)
      throw err
    }
  }

  // for a signed-in login that has no studio yet
  async createForUser(userId: string, details: StudioDetails): Promise<{ id: string; company: string }> {
    const checked = checkDetails(details)
    return { id: await this.#createStudio(userId, checked), company: checked.company }
  }

  async #createStudio(userId: string, { company, clientCodePrefix }: Required<StudioDetails>): Promise<string> {
    const studio = await this.#client.from('studios').insert({ company, client_code_prefix: clientCodePrefix }).select('id').single()
    if (studio.error) throw new Error(`Could not create the studio: ${studio.error.message}`)
    const member = await this.#client.from('studio_members').insert({ user_id: userId, studio_id: studio.data.id })
    if (member.error) {
      await this.#client.from('studios').delete().eq('id', studio.data.id)
      if (member.error.code === '23505') throw new HttpError(409, 'This login already has a studio')
      throw new Error(`Could not link the login to the studio: ${member.error.message}`)
    }
    return studio.data.id
  }
}

function checkDetails({ company, clientCodePrefix = '' }: StudioDetails): Required<StudioDetails> {
  const name = typeof company === 'string' ? company.trim() : ''
  if (!name) throw new HttpError(400, 'Give the studio a name')
  if (typeof clientCodePrefix !== 'string' || !/^[A-Za-z0-9_-]{0,16}$/.test(clientCodePrefix)) {
    throw new HttpError(400, 'Client code prefix: up to 16 letters, numbers, - or _')
  }
  return { company: name, clientCodePrefix }
}
