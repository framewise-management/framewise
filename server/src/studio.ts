import { createClient } from '@supabase/supabase-js'
import { ClientService } from './clients/client-service.ts'
import { SupabaseDatabase } from './db/supabase-database.ts'
import { EnquiryService } from './enquiries/enquiry-service.ts'
import { EventService } from './events/event-service.ts'
import { ExpenseService } from './expenses/expense-service.ts'
import { ApiServer } from './http/api-server.ts'
import { SupabaseTokenVerifier } from './http/supabase-token-verifier.ts'
import { PackageService } from './packages/package-service.ts'
import { PaymentService } from './payments/payment-service.ts'
import { ProjectService } from './projects/project-service.ts'
import { TaskService } from './tasks/task-service.ts'
import { TeamService } from './team/team-service.ts'
import { TermsService } from './terms/terms-service.ts'
import { PaymentSettings } from './settings/payment-settings.ts'

// wiring shared by local start-up (main.ts) and the Vercel function (vercel.ts)
export class Studio {
  static fromEnv(env: NodeJS.ProcessEnv): ApiServer {
    const url = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    // the server-side client must not try to keep a browser session
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const db = new SupabaseDatabase(supabase)
    const events = new EventService(db)
    const packages = new PackageService(db)
    return new ApiServer({
      auth: new SupabaseTokenVerifier(supabase),
      clients: new ClientService(db, events, packages),
      events,
      enquiries: new EnquiryService(db),
      packages,
      payments: new PaymentService(db),
      team: new TeamService(db),
      expenses: new ExpenseService(db),
      projects: new ProjectService(db),
      tasks: new TaskService(db),
      terms: new TermsService(db),
      paymentSettings: new PaymentSettings(db),
    })
  }
}
