import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { Change, Database, Row } from './database.ts'
import { DatabaseError } from './database-error.ts'

// in-process Postgres with the real migrations, for tests
export class PgliteDatabase implements Database {
  readonly #pg: PGlite

  private constructor(pg: PGlite) {
    this.#pg = pg
  }

  static async create(): Promise<PgliteDatabase> {
    const pg = new PGlite()
    // roles that Supabase provides and the migrations revoke from
    await pg.exec('create role anon; create role authenticated; create role service_role;')
    for (const file of (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort())
      await pg.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'))
    return new PgliteDatabase(pg)
  }

  get pg(): PGlite {
    return this.#pg
  }

  async select<T extends object = Row>(table: string, match: Row = {}): Promise<T[]> {
    const keys = Object.keys(match).map(quote).join(', ')
    const where = keys ? `where (${keys}) = (select ${keys} from jsonb_populate_record(null::${quote(table)}, $1))` : ''
    const sql = `select coalesce(jsonb_agg(to_jsonb(t)), '[]') as rows from ${quote(table)} t ${where}`
    return (await this.#run<{ rows: T[] }>(sql, keys ? [JSON.stringify(match)] : []))[0].rows
  }

  async apply(changes: readonly Change[]): Promise<Row[][]> {
    return (await this.#run<{ result: Row[][] }>('select apply_changes($1) as result', [JSON.stringify(changes)]))[0].result
  }

  async #run<T>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      return (await this.#pg.query<T>(sql, params)).rows
    } catch (e) {
      const err = e as { code?: string; message: string }
      throw new DatabaseError(err.code ?? 'XX000', err.message)
    }
  }
}

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url)

function quote(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"'
}
