// table rows as the database returns them (snake_case, numeric as number, dates as YYYY-MM-DD text)

export interface ClientRow {
  id: string
  code: string
  name: string
  status: string
  price: number
  discount: number
  finance_mode: 'Shared' | 'Per day'
  wedding_date: string | null
  completion_previous_status: string | null
  sort_order: number | null
  deleted_at: string | null
}

export interface EventRow {
  id: string
  client_id: string
  package_id: string | null
  type: string
  event_date: string | null
  status: string
  booking_status: string | null
  booking_override: boolean
  price: number
  discount: number
  quotation: number | null
}

export interface ProjectRow {
  id: string
  event_id: string
  stage: number
  stage_names: string[]
  completed_stages: string[]
}

export interface PackageRow {
  id: string
  client_id: string
  name: string
  price: number
  discount: number
  drive_link: string | null
}

export interface DeliveryItemRow {
  id: string
  package_id: string
  kind: 'deliverable' | 'complimentary'
  label: string
  position: number
  quantity: number | null
  duration: string | null
  status: string
  delivered_quantity: number | null
  delivered_date: string | null
  notes: string | null
  needs_review: boolean
  retired_at: string | null
}

export interface PaymentRow {
  id: string
  client_id: string
  event_id: string | null
  package_id: string | null
  amount: number
  paid_on: string | null
  source_date_unknown: boolean
  stage: string
}

export interface StagePlanRow {
  client_id: string
  stage: string
  target: number
}

export interface EnquiryRow {
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

export interface EventTeamRow {
  event_id: string
  member_id: string
  role: string | null
}

export interface TeamMemberRow {
  id: string
  name: string
  role: string | null
  phone: string | null
}

export interface AssignmentRow {
  id: string
  event_id: string
  member_id: string
  service: string
  charge: number
  paid: number
}

export interface ExpenseRow {
  id: string
  client_id: string | null
  event_id: string | null
}

export interface TaskRow {
  id: string
  title: string
  due: string
  client_id: string | null
  event_id: string | null
  project_id: string | null
}
