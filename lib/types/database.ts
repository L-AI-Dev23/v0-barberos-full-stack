export type UserRole = 'admin' | 'employee'

export interface Organization {
  id: string
  name: string
  logo_url: string | null
  coupon_service_id: string | null
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
  whatsapp_instance_name: string | null
  whatsapp_connected: boolean
  created_at: string
  updated_at: string
}

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

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  organization_id: string
  module_permissions: ModulePermissions
  work_schedule: WorkSchedule
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
  created_at: string
  employee?: Profile
  client?: LoyaltyClient
  items?: SaleItem[]
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
}
