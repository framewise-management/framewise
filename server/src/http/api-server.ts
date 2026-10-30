import type { Server } from 'node:http'
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
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
import { Body } from './body.ts'
import { HttpError } from './http-error.ts'
import type { TokenVerifier } from './supabase-token-verifier.ts'

export interface ApiServerDeps {
  auth: TokenVerifier
  clients: ClientService
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
}

export class ApiServer {
  readonly #app: Express

  constructor({ auth, clients, events, enquiries, packages, payments, team, expenses, projects, tasks, terms, paymentSettings }: ApiServerDeps) {
    const app = express()
    app.use(express.json({ limit: '1mb' }))
    app.get('/health', (_req, res) => { res.json({ ok: true }) })

    const api = express.Router()
    api.use(requireUser(auth))

    api.get('/payment-settings', async (_req, res) => { res.json(await paymentSettings.get()) })
    api.put('/payment-settings', async (req, res) => { res.json(await paymentSettings.update(Body.pick(req.body, ['payment_conditions', 'payment_modes', 'upi_id', 'bank_details', 'gst_number', 'payment_notes', 'invoice_prefix', 'invoice_padding']))) })

    api.get('/terms', async (_req, res) => { res.json(await terms.list()) })
    api.post('/terms', async (req, res) => { res.status(201).json(await terms.create(Body.pick(req.body, ['title', 'body']))) })
    api.patch('/terms/:id', async (req, res) => { res.json(await terms.update(req.params.id, Body.pick(req.body, ['title', 'body', 'active']))) })
    api.delete('/terms/:id', async (req, res) => { await terms.remove(req.params.id); res.status(204).end() })

    api.get('/clients', async (_req, res) => { res.json(await clients.list()) })
    api.get('/clients/deleted', async (_req, res) => { res.json(await clients.deleted()) })
    api.put('/clients/order', async (req, res) => { await clients.reorder(Body.list(req.body?.ids, 'ids')); res.status(204).end() })
    api.post('/clients', async (req, res) => {
      const { client, days, packages: plans } = req.body ?? {}
      const row = Body.pick(client, ClientService.editable)
      const list = Body.list<DayInput>(days, 'days')
      res.status(201).json(plans === undefined ? await clients.create(row, list) : await clients.createPackaged(row, list, Body.list<PackagePlan>(plans, 'packages')))
    })
    api.patch('/clients/:id', async (req, res) => { res.json(await clients.update(req.params.id, Body.pick(req.body, ClientService.editable))) })
    api.delete('/clients/:id', async (req, res) => { await clients.remove(req.params.id); res.status(204).end() })
    api.post('/clients/:id/restore', async (req, res) => { await clients.restore(req.params.id); res.status(204).end() })
    api.post('/clients/:id/events', async (req, res) => { res.status(201).json(await events.addDays(req.params.id, Body.list<DayInput>(req.body?.days, 'days'))) })

    api.get('/events', async (_req, res) => { res.json(await events.list()) })
    api.patch('/events/:id', async (req, res) => { res.json(await events.update(req.params.id, Body.pick(req.body, EventService.editable))) })
    api.patch('/events/:id/team/:memberId', async (req, res) => { await events.setTeamRole(req.params.id, req.params.memberId, req.body?.role); res.status(204).end() })
    api.delete('/events/:id', async (req, res) => { await events.remove(req.params.id); res.status(204).end() })

    api.get('/enquiries', async (_req, res) => { res.json(await enquiries.list()) })
    api.post('/enquiries', async (req, res) => { res.status(201).json(await enquiries.create(Body.pick(req.body, EnquiryService.editable))) })
    api.patch('/enquiries/:id', async (req, res) => { res.json(await enquiries.update(req.params.id, Body.pick(req.body, EnquiryService.editable))) })
    api.delete('/enquiries/:id', async (req, res) => { await enquiries.remove(req.params.id); res.status(204).end() })
    api.post('/enquiries/:id/convert', async (req, res) => { res.json(await enquiries.convert(req.params.id)) })

    api.get('/packages', async (_req, res) => { res.json(await packages.list()) })
    api.post('/clients/:id/packages', async (req, res) => { res.status(201).json(await packages.create(req.params.id, Body.pick(req.body, PackageService.editable) as PackageInput)) })
    api.patch('/packages/:id', async (req, res) => { res.json(await packages.update(req.params.id, Body.pick(req.body, PackageService.editable) as PackageInput)) })
    api.put('/packages/:id/items', async (req, res) => { res.json(await packages.saveItems(req.params.id, Body.list<ItemEdit>(req.body?.items, 'items'))) })
    api.patch('/packages/:id/delivery', async (req, res) => {
      const body = Body.pick(req.body, ['drive_link', 'items'])
      res.json(await packages.updateDelivery(req.params.id, { ...body, items: body.items === undefined ? undefined : Body.list<StatusEdit>(body.items, 'items') }))
    })

    api.get('/payments', async (_req, res) => { res.json(await payments.list()) })
    api.post('/payments', async (req, res) => { res.status(201).json(await payments.create(Body.pick(req.body, PaymentService.editable))) })
    api.patch('/payments/:id', async (req, res) => { res.json(await payments.edit(req.params.id, Body.pick(req.body, PaymentService.editable))) })
    api.get('/stage-plans', async (_req, res) => { res.json(await payments.stagePlans()) })
    api.put('/clients/:id/stage-plans', async (req, res) => { res.json(await payments.setStagePlan(req.params.id, Body.pick(req.body?.plan, Object.keys(req.body?.plan ?? {})))) })

    api.get('/team', async (_req, res) => { res.json(await team.members()) })
    api.post('/team', async (req, res) => { res.status(201).json(await team.addMember(Body.pick(req.body, TeamService.memberFields))) })
    api.patch('/team/:id', async (req, res) => { res.json(await team.updateMember(req.params.id, Body.pick(req.body, TeamService.memberFields))) })
    api.delete('/team/:id', async (req, res) => { await team.removeMember(req.params.id); res.status(204).end() })
    api.get('/assignments', async (_req, res) => { res.json(await team.assignments()) })
    api.post('/assignments', async (req, res) => { res.status(201).json(await team.assign(Body.pick(req.body, TeamService.assignmentFields))) })
    api.patch('/assignments/:id', async (req, res) => { res.json(await team.updateAssignment(req.params.id, Body.pick(req.body, TeamService.assignmentFields))) })
    api.delete('/assignments/:id', async (req, res) => { await team.unassign(req.params.id); res.status(204).end() })

    api.get('/expenses', async (_req, res) => { res.json(await expenses.list()) })
    api.post('/expenses', async (req, res) => { res.status(201).json(await expenses.create(Body.pick(req.body, ExpenseService.editable))) })
    api.patch('/expenses/:id', async (req, res) => { res.json(await expenses.update(req.params.id, Body.pick(req.body, ExpenseService.editable))) })
    api.delete('/expenses/:id', async (req, res) => { await expenses.remove(req.params.id); res.status(204).end() })

    api.get('/projects', async (_req, res) => { res.json(await projects.list()) })
    api.patch('/projects/:id', async (req, res) => { res.json(await projects.update(req.params.id, Body.pick(req.body, ProjectService.editable))) })
    api.delete('/projects/:id', async (req, res) => { await projects.remove(req.params.id); res.status(204).end() })

    api.get('/tasks', async (_req, res) => { res.json(await tasks.list()) })
    api.post('/tasks', async (req, res) => { res.status(201).json(await tasks.create(Body.pick(req.body, TaskService.editable))) })
    api.patch('/tasks/:id', async (req, res) => { res.json(await tasks.update(req.params.id, Body.pick(req.body, TaskService.editable))) })
    api.delete('/tasks/:id', async (req, res) => { await tasks.remove(req.params.id); res.status(204).end() })

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

function requireUser(auth: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (!token || !(await auth.verify(token))) throw new HttpError(401, 'Sign in again')
    next()
  }
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
  } else if (err instanceof DatabaseError && USER_ERRORS[err.code]) {
    res.status(USER_ERRORS[err.code]).json({ error: err.message })
  } else if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Send valid JSON' })
  } else {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
}
