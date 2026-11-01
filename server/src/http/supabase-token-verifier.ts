import type { SupabaseClient } from '@supabase/supabase-js'
import { DatabaseError } from '../db/database-error.ts'

export interface SignedInUser {
  userId: string
  // null when the login is valid but not linked to a studio
  studioId: string | null
}

export interface TokenVerifier {
  // the user of a valid Supabase access token, otherwise null
  verify(token: string): Promise<SignedInUser | null>
}

// ponytail: one studio_members lookup per request; cache briefly by user id if it ever shows up in latency
export class SupabaseTokenVerifier implements TokenVerifier {
  readonly #client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async verify(token: string): Promise<SignedInUser | null> {
    const { data, error } = await this.#client.auth.getClaims(token)
    if (error || !data?.claims.sub) return null
    const userId = String(data.claims.sub)
    const member = await this.#client.from('studio_members').select('studio_id').eq('user_id', userId).maybeSingle()
    if (member.error) throw new DatabaseError(member.error.code, member.error.message)
    return { userId, studioId: member.data?.studio_id ?? null }
  }
}
