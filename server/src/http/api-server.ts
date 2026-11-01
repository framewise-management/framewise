import type { Server } from 'node:http'
import express, { type ErrorRequestHandler, type Express, type RequestHandler, type Response } from 'express'
import { PricingError } from '@framewise/shared/pricing-error.ts'
import { ClientService, type PackagePlan } from '../clients/client-service.ts'
import { DatabaseError } from '../db/database-error.ts'
import { EnquiryService } from '../enquiries/enquiry-service.ts'
import { EventService, type DayInput } from '../events/event-service.ts'
import { ExpenseService } from '../expenses/expense-service.ts'
import type { ItemEdit, StatusEdit } from '../packages/delivery-edits.ts'
import { PackageService, type PackageInput } from '../packages/package-service.ts'
import { PaymentService } from '../payments/payment-service.ts'
import { ProjectService } from '../projects/project-service.ts'
import { TaskService } from '../tasks/task-service.ts'
import { TeamService } from '../team/team-service.ts'
import { TermsService } from '../terms/terms-service.ts'
import { PaymentSettings } from '../settings/payment-settings.ts'
import { StudioProfile } from '../studios/studio-profile.ts'
import type { StudioOnboarding } from '../studios/studio-onboarding.ts'
import { QuoteService } from '../quotes/quote-service.ts'
import { Body } from './body.ts'
import { HttpError } from './http-error.ts'
import { InvoiceService } from '../invoices/invoice-service.ts'
import type { SignedInUser, TokenVerifier } from './supabase-token-verifier.ts'

export interface ApiServerDeps {
  auth: TokenVerifier
  onboarding: Pick<StudioOnboarding, 'createForUser'>
  // the services of one studio, built per request for the signed-in user's studio
  servicesFor(studioId: string): StudioServices
}

export interface StudioServices {
  clients: ClientService
  quotes: QuoteService
  events: EventService
  enquiries: EnquiryService
  packages: PackageService
  payments: PaymentService
  team: TeamService
  expenses: ExpenseService
  projects: ProjectService
  tasks: TaskService
  terms: TermsService
  paymentSettings: PaymentSettings
  invoices: InvoiceService
  profile: StudioProfile
}

export class ApiServer {
  readonly #app: Express

  constructor({ auth, onboarding, servicesFor }: ApiServerDeps) {
    const app = express()
    app.use(express.json({ limit: '1mb' }))
    app.get('/health', (_req, res) => { res.json({ ok: true }) })

    const publicQuote = express.Router()
    publicQuote.use((_req, res, next) => {
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' })
      next()
    })
    publicQuote.get('/:studio/:token', async (req, res) => {
      if (!/^[a-f0-9-]{36}$/i.test(req.params.studio)) throw new HttpError(404, 'Quote not found')
      res.json(await servicesFor(req.params.studio).quotes.view(req.params.token))
    })
    publicQuote.post('/:studio/:token/accept', async (req, res) => {
      if (!/^[a-f0-9-]{36}$/i.test(req.params.studio)) throw new HttpError(404, 'Quote not found')
      res.json(await servicesFor(req.params.studio).quotes.accept(req.params.token, req.body?.code, req.body?.consent))
    })
    app.use('/api/public/quotes', publicQuote)

    // self sign-up: the one signed-in route that works before the login has a studio
    app.post('/api/studios', async (req, res) => {
      const user = await signedIn(auth, req.headers.authorization)
      if (user.studioId) throw new HttpError(409, 'This login already has a studio')
      const { company, client_code_prefix } = Body.pick(req.body, ['company', 'client_code_prefix'])
      res.status(201).json(await onboarding.createForUser(user.userId, { company: company as string, clientCodePrefix: client_code_prefix as string | undefined }))
    })

    const api = express.Router()
    api.use(requireStudio(auth, servicesFor))

    api.get('/studio', async (_req, res) => { res.json(await services(res).profile.get()) })

    api.get('/payment-settings', async (_req, res) => { res.json(await services(res).paymentSettings.get()) })
    api.put('/payment-settings', async (req, res) => { res.json(await services(res).paymentSettings.update(Body.pick(req.body, ['payment_conditions', 'payment_modes', 'upi_id', 'bank_details', 'gst_number', 'payment_notes', 'invoice_prefix', 'invoice_padding']))) })

    api.get('/terms', async (_req, res) => { res.json(await services(res).terms.list()) })
    api.post('/terms', async (req, res) => { res.status(201).json(await services(res).terms.create(Body.pick(req.body, ['title', 'body']))) })
    api.patch('/terms/:id', async (req, res) => { res.json(await services(res).terms.update(req.params.id, Body.pick(req.body, ['title', 'body', 'active']))) })
    api.delete('/terms/:id', async (req, res) => { await services(res).terms.remove(req.params.id); res.status(204).end() })

    api.get('/clients/:id/quotes', async (req, res) => { res.json(await services(res).quotes.list(req.params.id)) })
    api.post('/clients/:id/quotes', async (req, res) => { res.status(201).json(await services(res).quotes.create(req.params.id)) })

    api.get('/clients', async (_req, res) => { res.json(await services(res).clients.list()) })
    api.get('/clients/deleted', async (_req, res) => { res.json(await services(res).clients.deleted()) })
    api.put('/clients/order', async (req, res) => { await services(res).clients.reorder(Body.list(req.body?.ids, 'ids')); res.status(204).end() })
    api.post('/clients', async (req, res) => {
      const { client, days, packages: plans } = req.body ?? {}
      const row = Body.pick(client, ClientService.editable)
      const list = Body.list<DayInput>(days, 'days')
      res.status(201).json(plans === undefined ? await services(res).clients.create(row, list) : await services(res).clients.createPackaged(row, list, Body.list<PackagePlan>(plans, 'packages')))
    })
    api.patch('/clients/:id', async (req, res) => { res.json(await services(res).clients.update(req.params.id, Body.pick(req.body, ClientService.editable))) })
    api.delete('/clients/:id', async (req, res) => { await services(res).clients.remove(req.params.id); res.status(204).end() })
    api.post('/clients/:id/restore', async (req, res) => { await services(res).clients.restore(req.params.id); res.status(204).end() })
    api.post('/clients/:id/events', async (req, res) => { res.status(201).json(await services(res).events.addDays(req.params.id, Body.list<DayInput>(req.body?.days, 'days'))) })

    api.get('/events', async (_req, res) => { res.json(await services(res).events.list()) })
    api.patch('/events/:id', async (req, res) => { res.json(await services(res).events.update(req.params.id, Body.pick(req.body, EventService.editable))) })
    api.patch('/events/:id/team/:memberId', async (req, res) => { await services(res).events.setTeamRole(req.params.id, req.params.memberId, req.body?.role); res.status(204).end() })
    api.delete('/events/:id', async (req, res) => { await services(res).events.remove(req.params.id); res.status(204).end() })

    api.get('/enquiries', async (_req, res) => { res.json(await services(res).enquiries.list()) })
    api.post('/enquiries', async (req, res) => { res.status(201).json(await services(res).enquiries.create(Body.pick(req.body, EnquiryService.editable))) })
    api.patch('/enquiries/:id', async (req, res) => { res.json(await services(res).enquiries.update(req.params.id, Body.pick(req.body, EnquiryService.editable))) })
    api.delete('/enquiries/:id', async (req, res) => { await services(res).enquiries.remove(req.params.id); res.status(204).end() })
    api.post('/enquiries/:id/convert', async (req, res) => { res.json(await services(res).enquiries.convert(req.params.id)) })

    api.get('/packages', async (_req, res) => { res.json(await services(res).packages.list()) })
    api.post('/clients/:id/packages', async (req, res) => { res.status(201).json(await services(res).packages.create(req.params.id, Body.pick(req.body, PackageService.editable) as PackageInput)) })
    api.patch('/packages/:id', async (req, res) => { res.json(await services(res).packages.update(req.params.id, Body.pick(req.body, PackageService.editable) as PackageInput)) })
    api.put('/packages/:id/items', async (req, res) => { res.json(await services(res).packages.saveItems(req.params.id, Body.list<ItemEdit>(req.body?.items, 'items'))) })
    api.patch('/packages/:id/delivery', async (req, res) => {
      const body = Body.pick(req.body, ['drive_link', 'items'])
      res.json(await services(res).packages.updateDelivery(req.params.id, { ...body, items: body.items === undefined ? undefined : Body.list<StatusEdit>(body.items, 'items') }))
    })

    api.get('/clients/:id/invoices', async (req, res) => { res.json(await services(res).invoices.clientDocuments(req.params.id)) })
    api.post('/payments/:id/receipt', async (req, res) => { res.json(await services(res).invoices.issueReceipt(req.params.id)) })
    api.get('/invoices/:id', async (req, res) => { res.json(await services(res).invoices.get(req.params.id)) })

    api.get('/payments', async (_req, res) => { res.json(await services(res).payments.list()) })
    api.post('/payments', async (req, res) => { res.status(201).json(await services(res).payments.create(Body.pick(req.body, PaymentService.editable))) })
    api.patch('/payments/:id', async (req, res) => { res.json(await services(res).payments.edit(req.params.id, Body.pick(req.body, PaymentService.editable))) })
    api.get('/stage-plans', async (_req, res) => { res.json(await services(res).payments.stagePlans()) })
    api.put('/clients/:id/stage-plans', async (req, res) => { res.json(await services(res).payments.setStagePlan(req.params.id, Body.pick(req.body?.plan, Object.keys(req.body?.plan ?? {})))) })

    api.get('/team', async (_req, res) => { res.json(await services(res).team.members()) })
    api.post('/team', async (req, res) => { res.status(201).json(await services(res).team.addMember(Body.pick(req.body, TeamService.memberFields))) })
    api.patch('/team/:id', async (req, res) => { res.json(await services(res).team.updateMember(req.params.id, Body.pick(req.body, TeamService.memberFields))) })
    api.delete('/team/:id', async (req, res) => { await services(res).team.removeMember(req.params.id); res.status(204).end() })
    api.get('/assignments', async (_req, res) => { res.json(await services(res).team.assignments()) })
    api.post('/assignments', async (req, res) => { res.status(201).json(await services(res).team.assign(Body.pick(req.body, TeamService.assignmentFields))) })
    api.patch('/assignments/:id', async (req, res) => { res.json(await services(res).team.updateAssignment(req.params.id, Body.pick(req.body, TeamService.assignmentFields))) })
    api.delete('/assignments/:id', async (req, res) => { await services(res).team.unassign(req.params.id); res.status(204).end() })

    api.get('/expenses', async (_req, res) => { res.json(await services(res).expenses.list()) })
    api.post('/expenses', async (req, res) => { res.status(201).json(await services(res).expenses.create(Body.pick(req.body, ExpenseService.editable))) })
    api.patch('/expenses/:id', async (req, res) => { res.json(await services(res).expenses.update(req.params.id, Body.pick(req.body, ExpenseService.editable))) })
    api.delete('/expenses/:id', async (req, res) => { await services(res).expenses.remove(req.params.id); res.status(204).end() })

    api.get('/projects', async (_req, res) => { res.json(await services(res).projects.list()) })
    api.patch('/projects/:id', async (req, res) => { res.json(await services(res).projects.update(req.params.id, Body.pick(req.body, ProjectService.editable))) })
    api.delete('/projects/:id', async (req, res) => { await services(res).projects.remove(req.params.id); res.status(204).end() })

    api.get('/tasks', async (_req, res) => { res.json(await services(res).tasks.list()) })
    api.post('/tasks', async (req, res) => { res.status(201).json(await services(res).tasks.create(Body.pick(req.body, TaskService.editable))) })
    api.patch('/tasks/:id', async (req, res) => { res.json(await services(res).tasks.update(req.params.id, Body.pick(req.body, TaskService.editable))) })
    api.delete('/tasks/:id', async (req, res) => { await services(res).tasks.remove(req.params.id); res.status(204).end() })

    app.use('/api', api)
    app.use((_req, res) => { res.status(404).json({ error: 'Not found' }) })
    app.use(handleErrors)
    this.#app = app
  }

  get app(): Express {
    return this.#app
  }

  // Express 5 hands listen errors (e.g. port already in use) to this callback instead of throwing
  listen(port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = this.#app.listen(port, error => (error ? reject(error) : resolve(server)))
    })
  }
}

function requireStudio(auth: TokenVerifier, servicesFor: ApiServerDeps['servicesFor']): RequestHandler {
  return async (req, res, next) => {
    const user = await signedIn(auth, req.headers.authorization)
    if (!user.studioId) throw new HttpError(403, 'This login is not linked to a studio')
    res.locals.services = servicesFor(user.studioId)
    next()
  }
}

async function signedIn(auth: TokenVerifier, header: string | undefined): Promise<SignedInUser> {
  const token = header?.match(/^Bearer (.+)$/)?.[1]
  const user = token ? await auth.verify(token) : null
  if (!user) throw new HttpError(401, 'Sign in again')
  return user
}

function services(res: Response): StudioServices {
  return res.locals.services
}

// Postgres codes whose message is meant for the user: rule triggers, checks, bad values, missing links
const USER_ERRORS: Readonly<Record<string, number>> = {
  P0001: 400, '23514': 400, '23502': 400, '23503': 400, '22P02': 400, '22007': 400, '22008': 400, '22003': 400,
  '23505': 409, P0002: 404,
}

// Express recognises error handlers by their four declared parameters
const handleErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
  } else if (err instanceof PricingError) {
    res.status(400).json({ error: err.message })
  } else if (err instanceof DatabaseError && USER_ERRORS[err.code]) {
    res.status(USER_ERRORS[err.code]).json({ error: err.message })
  } else if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Send valid JSON' })
  } else {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
}
