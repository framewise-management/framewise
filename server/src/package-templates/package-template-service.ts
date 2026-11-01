import { Pricing } from '@framewise/shared/pricing.ts'
import type { Change, Database, Row } from '../db/database.ts'
import { HttpError } from '../http/http-error.ts'
import type { CatalogService, ServiceCatalog } from '../service-catalog/service-catalog.ts'

export interface PackageTemplate {
  id: string
  name: string
  // with use_service_prices, always the current total of its services
  price: number
  use_service_prices: boolean
  active: boolean
  services: Pick<CatalogService, 'id' | 'name' | 'tag' | 'price'>[]
  created_at: string
}

// the studio's reusable packages, managed under Setup: a name plus services from the catalog
export class PackageTemplateService {
  static readonly editable = ['name', 'price', 'use_service_prices', 'service_ids', 'active'] as const

  readonly #db: Database
  readonly #catalog: ServiceCatalog

  constructor(db: Database, catalog: ServiceCatalog) {
    this.#db = db
    this.#catalog = catalog
  }

  async list(): Promise<PackageTemplate[]> {
    const [templates, links, services] = await Promise.all([
      this.#db.select<TemplateRow>('package_templates'),
      this.#db.select<LinkRow>('package_template_services'),
      this.#catalog.list(),
    ])
    const byId = new Map(services.map(s => [s.id, s]))
    return templates.map(t => {
      const included = links.filter(l => l.package_template_id === t.id).sort((a, b) => a.position - b.position).flatMap(l => {
        const s = byId.get(l.service_id)
        return s ? [{ id: s.id, name: s.name, tag: s.tag, price: s.price }] : []
      })
      const price = t.use_service_prices ? Pricing.servicesTotal(included.map(s => s.price)) : t.price
      return { id: t.id, name: t.name, price, use_service_prices: t.use_service_prices, active: t.active, services: included, created_at: t.created_at }
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  async create(input: Row): Promise<PackageTemplate> {
    const id = crypto.randomUUID()
    const useServicePrices = input.use_service_prices === undefined ? false : flag(input.use_service_prices, 'Invalid price option')
    const serviceIds = input.service_ids === undefined ? [] : ids(input.service_ids)
    const row: Row = { id, name: name(input.name), use_service_prices: useServicePrices, price: await this.#price(useServicePrices, serviceIds, input.price) }
    if ('active' in input) row.active = flag(input.active, 'Invalid package visibility')
    await this.#db.apply([{ op: 'insert', table: 'package_templates', row }, ...links(id, serviceIds)])
    return this.#view(id)
  }

  async update(id: string, input: Row): Promise<PackageTemplate> {
    const current = (await this.list()).find(t => t.id === id)
    if (!current) throw new HttpError(404, 'Record not found')
    const set: Row = {}
    if ('name' in input) set.name = name(input.name)
    if ('active' in input) set.active = flag(input.active, 'Invalid package visibility')
    if ('use_service_prices' in input) set.use_service_prices = flag(input.use_service_prices, 'Invalid price option')
    const serviceIds = 'service_ids' in input ? ids(input.service_ids) : current.services.map(s => s.id)
    if ('use_service_prices' in input || 'service_ids' in input || 'price' in input) {
      const useServicePrices = (set.use_service_prices ?? current.use_service_prices) as boolean
      set.price = await this.#price(useServicePrices, serviceIds, 'price' in input || useServicePrices ? input.price : current.price)
    }
    if (!Object.keys(set).length) throw new HttpError(400, 'No changes provided')
    const changes: Change[] = [{ op: 'update', table: 'package_templates', match: { id }, set }]
    if ('service_ids' in input) changes.push({ op: 'delete', table: 'package_template_services', match: { package_template_id: id }, optional: true }, ...links(id, serviceIds))
    await this.#db.apply(changes)
    return this.#view(id)
  }

  async remove(id: string): Promise<void> {
    await this.#db.apply([{ op: 'delete', table: 'package_templates', match: { id } }])
  }

  // the server sets the price when it comes from services; any price the client sent is ignored then
  async #price(useServicePrices: boolean, serviceIds: string[], given: unknown): Promise<number> {
    const services = new Map((await this.#catalog.list()).map(s => [s.id, s]))
    for (const s of serviceIds) if (!services.has(s)) throw new HttpError(400, 'Choose services from your service list')
    if (useServicePrices) {
      if (!serviceIds.length) throw new HttpError(400, 'Add at least one service to price the package from its services')
      return Pricing.servicesTotal(serviceIds.map(s => services.get(s)!.price))
    }
    if (typeof given !== 'number' || !Number.isFinite(given) || given < 0) throw new HttpError(400, 'Enter a package price of zero or more')
    return given
  }

  async #view(id: string): Promise<PackageTemplate> {
    return (await this.list()).find(t => t.id === id)!
  }
}

interface TemplateRow { id: string; name: string; price: number; use_service_prices: boolean; active: boolean; created_at: string }
interface LinkRow { package_template_id: string; service_id: string; position: number }

function links(packageId: string, serviceIds: string[]): Change[] {
  return serviceIds.map((service_id, position) => ({ op: 'insert', table: 'package_template_services', row: { package_template_id: packageId, service_id, position } }))
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new HttpError(400, 'Send service_ids as a list')
  return [...new Set(value as string[])]
}

function flag(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, message)
  return value
}

function name(value: unknown): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new HttpError(400, 'Enter the package name')
  return result
}
