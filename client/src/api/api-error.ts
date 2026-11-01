// a failed API call: the server's message plus its HTTP status, so callers can tell e.g. 403 from 500
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
