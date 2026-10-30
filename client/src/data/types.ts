// API rows, as the server returns them

export interface Client {
  id: string
  code: string
  name: string
  bride: string | null
  groom: string | null
  phone: string | null
  email: string | null
  address: string | null
  lead_source: string | null
  budget: string | null
  wedding_date: string | null
  package_name: string | null
  price: number
  discount: number
  finance_mode: 'Shared' | 'Per day'
  status: string
  due: string | null
  notes: string | null
  sort_order: number | null
}

export interface StudioEvent {
  id: string
  client_id: string
  package_id: string | null
  day_number: number | null
  type: string
  event_date: string | null
  start_time: string | null
  end_time: string | null
  time_not_recorded: boolean
  venue: string
  city: string | null
  services: string[]
  status: string
  booking_status: string | null
  booking_override: boolean
  price: number
  discount: number
  quotation: number | null
  notes: string | null
  team: string[]
  team_roles: Record<string, string>
}

export interface DeliveryItem {
  id: string
  kind: 'deliverable' | 'complimentary'
  label: string
  quantity: number | null
  duration: string | null
  status: string
}

export interface Package {
  id: string
  client_id: string
  name: string
  price: number
  discount: number
  bill_to: string | null
  invoice_reference: string | null
  drive_link: string | null
  events: string[]
  items: DeliveryItem[]
}

export interface Payment {
  id: string
  client_id: string
  event_id: string | null
  package_id: string | null
  amount: number
  paid_on: string | null
  source_date_unknown: boolean
  stage: string
  method: string
  transaction_reference: string | null
  reference: string | null
  invoice_requested: boolean
  notes: string | null
}

export interface Enquiry {
  id: string
  name: string
  bride: string | null
  groom: string | null
  phone: string | null
  email: string | null
  city: string | null
  lead_source: string | null
  budget: string | null
  wedding_date: string | null
  followup: string | null
  package_name: string | null
  price: number
  discount: number
  status: string
  client_id: string | null
  notes: string | null
}

export interface StagePlan {
  client_id: string
  stage: string
  target: number
}

export interface TeamMember {
  id: string
  name: string
  role: string | null
  phone: string | null
}

export interface Lists {
  clients: Client[]
  events: StudioEvent[]
  packages: Package[]
  payments: Payment[]
  enquiries: Enquiry[]
  stagePlans: StagePlan[]
  team: TeamMember[]
}
