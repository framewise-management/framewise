export type Row = Record<string, unknown>

export type Change =
  | { op: 'insert'; table: string; row: Row }
  | { op: 'update'; table: string; match: Row; set: Row; optional?: boolean }
  | { op: 'delete'; table: string; match: Row; optional?: boolean }

// Supabase in production, PGlite in tests. Rows come back as JSON (numeric as number, dates as text) from both.
// Failures are DatabaseError with the Postgres SQLSTATE; PostgREST's own read errors (PGRST…) can only reach the user as a 500.
// Each instance works for one studio: every read and write is limited to its rows, and the 'studios' table means its own row.
export interface Database {
  // equality match only: never pass null, it matches nothing in either implementation
  select<T extends object = Row>(table: string, match?: Row): Promise<T[]>
  // all changes commit together or not at all; returns the affected rows of each change
  apply(changes: readonly Change[]): Promise<Row[][]>
}
