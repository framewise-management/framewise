import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// the signed-in staff member, via Supabase Auth; the token goes to our own API
export class Session {
  readonly #auth: SupabaseClient['auth']

  constructor(url: string, anonKey: string) {
    this.#auth = createClient(url, anonKey).auth
  }

  async email(): Promise<string | null> {
    return (await this.#auth.getSession()).data.session?.user.email ?? null
  }

  async token(): Promise<string | null> {
    return (await this.#auth.getSession()).data.session?.access_token ?? null
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.#auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  async signOut(): Promise<void> {
    await this.#auth.signOut()
  }

  onChange(listener: () => void): () => void {
    const { data } = this.#auth.onAuthStateChange(() => listener())
    return () => data.subscription.unsubscribe()
  }
}
