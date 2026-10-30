export type Row = Record<string, unknown>

export type Change =
  | { op: 'insert'; table: string; row: Row }
  | { op: 'update'; table: string; match: Row; set: Row; optional?: boolean }
  | { op: 'delete'; table: string; match: Row; optional?: boolean }

// Supabase in production, PGlite in tests. Rows come back as JSON (numeric as number, dates as text) from both.
export interface Database {
  select<T extends object = Row>(table: string, match?: Row): Promise<T[]>
  // all changes commit together or not at all; returns the affected rows of each change
  apply(changes: readonly Change[]): Promise<Row[][]>
}
