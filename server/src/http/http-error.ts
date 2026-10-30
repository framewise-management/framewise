// thrown by services and routes; the message is shown to the user as-is
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
