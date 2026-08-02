export type UserRole = 'admin' | 'employee'

export interface Organization {
  id: string
  name: string
  logo_url: string | null
  coupon_service_id: string | null
  coupon_discount_percent: number | null
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
  whatsapp_instance_name: string | null
  whatsapp_connected: boolean
  created_at: string
  updated_at: string
}

export type PublicOrganization = Pick<
  Organization,
  'id' | 'name' | 'logo_url' | 'coupon_discount_percent'
>

export interface WhatsAppRule {
  id: string
  organization_id: string
  name: string
  trigger_event: 'booking_created' | 'booking_completed' | 'reminder_30m' | 'custom_days'
  days_delay: number | null
  message_template: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MessageTemplate {
  id: string
  organization_id: string
  name: string
  message: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  organization_id: string
  module_permissions: ModulePermissions
  work_schedule: WorkSchedule
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export interface ModulePermissions {
  dashboard?: boolean
  services?: boolean
  inventory?: boolean
  collaborators?: boolean
  pos?: boolean
  loyalty?: boolean
  appointments?: boolean
  configuration?: boolean
  cash_register?: boolean
}

export interface WorkSchedule {
  [day: string]: {
    enabled: boolean
    start: string
    end: string
  }
}

export interface InvitationCode {
  id: string
  code: string
  organization_id: string
  created_by: string
  module_permissions: ModulePermissions
  used: boolean
  used_by: string | null
  used_at: string | null
  created_at: string
}

export interface ServiceCategory {
  id: string
  name: string
  organization_id: string
  created_at: string
}

export interface Service {
  id: string
  name: string
  description: string | null
  cost: number
  commission: number
  category_id: string | null
  organization_id: string
  created_at: string
  updated_at: string
  category?: ServiceCategory
  incluye?: string | null
  imagen?: string | null
  opciones?: string[] | null
  variable_price?: boolean
  commission_percent?: number | null
  mode?: 'servicio' | 'ejemplo'
}

export interface ProductCategory {
  id: string
  name: string
  organization_id: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  sale_price: number
  cost_price: number
  stock: number
  min_stock: number | null
  category_id: string | null
  organization_id: string
  created_at: string
  updated_at: string
  category?: ProductCategory
  imagen?: string | null
  beneficios?: string | null
}

export interface LoyaltyClient {
  id: string
  name: string
  organization_id: string
  stamps: number
  coupons: number
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  organization_id: string
  employee_id: string
  client_id: string | null
  total: number
  total_commission: number
  payment_method: 'efectivo' | 'yape' | 'mixto'
  cash_amount: number
  yape_amount: number
  tip_amount: number
  cash_register_id: string | null
  created_at: string
  employee?: Profile
  client?: LoyaltyClient
  items?: SaleItem[]
}

export interface CashRegister {
  id: string
  organization_id: string
  opened_by: string
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  opening_cash: number
  opening_yape: number
  closing_cash: number | null
  closing_yape: number | null
  expected_cash: number | null
  expected_yape: number | null
  status: 'open' | 'closed'
  notes: string | null
  created_at: string
  opener?: Profile
  closer?: Profile
}

export interface SaleItem {
  id: string
  sale_id: string
  item_type: 'service' | 'product'
  service_id: string | null
  product_id: string | null
  quantity: number
  unit_price: number
  commission: number
  created_at: string
  service?: Service
  product?: Product
  opcion_seleccionada?: string | null
}

export interface OrganizationQRCode {
  id: string
  organization_id: string
  qr_code: string
  created_at: string
}

export interface Appointment {
  id: string
  organization_id: string
  client_id: string | null
  service_id: string
  employee_id: string | null
  appointment_time: string
  status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada'
  notes: string | null
  opcion_seleccionada?: string | null
  created_at: string
  updated_at: string
  client?: LoyaltyClient
  service?: Service
  employee?: Profile
}

export interface CartItem {
  id: string
  type: 'service' | 'product'
  name: string
  price: number
  commission: number
  quantity: number
  service?: Service
  product?: Product
  selectedOption?: string | null
}