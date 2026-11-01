import type { SupabaseClient } from '@supabase/supabase-js'
import type { Change, Database, Row } from './database.ts'
import { DatabaseError } from './database-error.ts'

// the service-role key bypasses row level security, so reads are scoped here; writes are scoped again inside apply_changes
export class SupabaseDatabase implements Database {
  readonly #client: SupabaseClient
  readonly #studioId: string

  constructor(client: SupabaseClient, studioId: string) {
    this.#client = client
    this.#studioId = studioId
  }

  async select<T extends object = Row>(table: string, match: Row = {}): Promise<T[]> {
    const scoped = { ...match, ...(table === 'studios' ? { id: this.#studioId } : { studio_id: this.#studioId }) }
    const { data, error } = await this.#client.from(table).select('*').match(scoped)
    if (error) throw new DatabaseError(error.code, error.message)
    return data as T[]
  }

  async apply(changes: readonly Change[]): Promise<Row[][]> {
    const { data, error } = await this.#client.rpc('apply_changes', { studio: this.#studioId, changes })
    if (error) throw new DatabaseError(error.code, error.message)
    return data as Row[][]
  }
}
