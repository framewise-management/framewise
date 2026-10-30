export class StudioLocale {
  static readonly currency = 'INR'
  static readonly timeZone = 'Asia/Kolkata'

  // the studio's calendar date (YYYY-MM-DD), not the server's
  static today(now: Date = new Date()): string {
    return now.toLocaleDateString('en-CA', { timeZone: StudioLocale.timeZone })
  }
}
