import type { Database } from '../db/database.ts'

export interface StudioProfileView {
  company: string
}

// who the signed-in studio is, for the app's header
export class StudioProfile {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async get(): Promise<StudioProfileView> {
    const [studio] = await this.#db.select<StudioProfileView>('studios')
    return { company: studio.company }
  }
}
