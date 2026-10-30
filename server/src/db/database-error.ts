// code is the Postgres SQLSTATE (e.g. 23514 check violation, P0002 no rows)
export class DatabaseError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
