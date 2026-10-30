import type { SupabaseClient } from '@supabase/supabase-js'

export interface TokenVerifier {
  // the user id of a valid Supabase access token, otherwise null
  verify(token: string): Promise<string | null>
}

export class SupabaseTokenVerifier implements TokenVerifier {
  readonly #client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async verify(token: string): Promise<string | null> {
    const { data, error } = await this.#client.auth.getClaims(token)
    return error || !data?.claims.sub ? null : String(data.claims.sub)
  }
}
