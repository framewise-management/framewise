import type { SupabaseClient } from '@supabase/supabase-js'
import type { Change, Database, Row } from './database.ts'
import { DatabaseError } from './database-error.ts'

export class SupabaseDatabase implements Database {
  readonly #client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.#client = client
  }

  async select<T extends object = Row>(table: string, match: Row = {}): Promise<T[]> {
    const { data, error } = await this.#client.from(table).select('*').match(match)
    if (error) throw new DatabaseError(error.code, error.message)
    return data as T[]
  }

  async apply(changes: readonly Change[]): Promise<Row[][]> {
    const { data, error } = await this.#client.rpc('apply_changes', { changes })
    if (error) throw new DatabaseError(error.code, error.message)
    return data as Row[][]
  }
}
