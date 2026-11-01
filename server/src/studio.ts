import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ClientService } from './clients/client-service.ts'
import type { Database } from './db/database.ts'
import { SupabaseDatabase } from './db/supabase-database.ts'
import { EnquiryService } from './enquiries/enquiry-service.ts'
import { EventService } from './events/event-service.ts'
import { ExpenseService } from './expenses/expense-service.ts'
import { ApiServer, type StudioServices } from './http/api-server.ts'
import { InvoiceService } from './invoices/invoice-service.ts'
import { SupabaseTokenVerifier } from './http/supabase-token-verifier.ts'
import { PackageService } from './packages/package-service.ts'
import { PaymentService } from './payments/payment-service.ts'
import { ProjectService } from './projects/project-service.ts'
import { TaskService } from './tasks/task-service.ts'
import { TeamService } from './team/team-service.ts'
import { TermsService } from './terms/terms-service.ts'
import { PaymentSettings } from './settings/payment-settings.ts'
import { StudioProfile } from './studios/studio-profile.ts'
import { StudioOnboarding } from './studios/studio-onboarding.ts'
import { QuoteService } from './quotes/quote-service.ts'

// wiring shared by local start-up (main.ts), the Vercel function (vercel.ts) and the create-studio script
export class Studio {
  static fromEnv(env: NodeJS.ProcessEnv): ApiServer {
    const supabase = Studio.supabase(env)
    return new ApiServer({
      auth: new SupabaseTokenVerifier(supabase),
      onboarding: new StudioOnboarding(supabase),
      servicesFor: studioId => Studio.services(new SupabaseDatabase(supabase, studioId)),
    })
  }

  // the service-role client; a server-side client must not try to keep a browser session
  static supabase(env: NodeJS.ProcessEnv): SupabaseClient {
    const url = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  }

  // every service for one studio, all sharing its scoped database; cheap enough to build per request
  static services(db: Database, today?: () => string): StudioServices {
    const events = new EventService(db, today)
    const packages = new PackageService(db)
    return {
      clients: new ClientService(db, events, packages),
      quotes: new QuoteService(db),
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
      invoices: new InvoiceService(db),
      profile: new StudioProfile(db),
    }
  }
}
