'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Minus, Trash2, User, ShoppingCart, Check } from 'lucide-react'
import type { Service, Product, LoyaltyClient, Profile, CartItem, ServiceCategory, ProductCategory, LoyaltyCoupon } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function POSPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  
  const [mode, setMode] = useState<'services' | 'products'>('services')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedCoupon, setSelectedCoupon] = useState<string>('')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch data
  const { data: services } = useSWR<Service[]>(
    profile?.organization_id ? 'pos-services' : null,
    async () => {
      const { data } = await supabase
        .from('services')
        .select('*, category:service_categories(*)')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: products } = useSWR<Product[]>(
    profile?.organization_id ? 'pos-products' : null,
    async () => {
      const { data } = await supabase
        .from('products')
        .select('*, category:product_categories(*)')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: serviceCategories } = useSWR<ServiceCategory[]>(
    profile?.organization_id ? 'pos-service-categories' : null,
    async () => {
      const { data } = await supabase
        .from('service_categories')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: productCategories } = useSWR<ProductCategory[]>(
    profile?.organization_id ? 'pos-product-categories' : null,
    async () => {
      const { data } = await supabase
        .from('product_categories')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: clients } = useSWR<LoyaltyClient[]>(
    profile?.organization_id ? 'pos-clients' : null,
    async () => {
      const { data } = await supabase
        .from('loyalty_clients')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: employees } = useSWR<Profile[]>(
    profile?.organization_id ? 'pos-employees' : null,
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('full_name')
      return data || []
    }
  )

  const { data: availableCoupons } = useSWR<LoyaltyCoupon[]>(
    selectedClient ? `pos-coupons-${selectedClient}` : null,
    async () => {
      const { data } = await supabase
        .from('loyalty_coupons')
        .select('*')
        .eq('client_id', selectedClient)
        .eq('status', 'disponible')
      return data || []
    }
  )

  // Set default employee for non-admin users
  useState(() => {
    if (!isAdmin && profile) {
      setSelectedEmployee(profile.id)
    }
  })

  const categories = mode === 'services' ? serviceCategories : productCategories
  const items = mode === 'services' ? services : products

  const filteredItems = useMemo(() => {
    if (!items) return []
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = !selectedCategory || item.category_id === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [items, search, selectedCategory])

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = selectedCoupon ? cartTotal : 0
  const total = cartTotal - discount
  const totalCommission = cart.reduce((sum, item) => sum + item.commission * item.quantity, 0)

  function addToCart(item: Service | Product, type: 'service' | 'product') {
    const existingIndex = cart.findIndex(c => c.id === item.id && c.type === type)
    
    if (existingIndex >= 0) {
      const newCart = [...cart]
      newCart[existingIndex].quantity++
      setCart(newCart)
    } else {
      const cartItem: CartItem = {
        id: item.id,
        type,
        name: item.name,
        price: type === 'service' ? (item as Service).cost : (item as Product).sale_price,
        commission: type === 'service' ? (item as Service).commission : 0,
        quantity: 1,
        ...(type === 'service' ? { service: item as Service } : { product: item as Product }),
      }
      setCart([...cart, cartItem])
    }
  }

  function updateQuantity(index: number, delta: number) {
    const newCart = [...cart]
    newCart[index].quantity += delta
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1)
    }
    setCart(newCart)
  }

  function removeItem(index: number) {
    const newCart = [...cart]
    newCart.splice(index, 1)
    setCart(newCart)
  }

  async function completeSale() {
    if (!profile?.organization_id || !selectedEmployee || cart.length === 0) return
    setProcessing(true)

    try {
      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: profile.organization_id,
          employee_id: selectedEmployee,
          client_id: selectedClient || null,
          total,
          total_commission: totalCommission,
        })
        .select()
        .single()

      if (saleError) throw saleError

      // Create sale items
      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        item_type: item.type,
        service_id: item.type === 'service' ? item.id : null,
        product_id: item.type === 'product' ? item.id : null,
        quantity: item.quantity,
        unit_price: item.price,
        commission: item.commission,
      }))

      await supabase.from('sale_items').insert(saleItems)

      // Update product stock
      for (const item of cart) {
        if (item.type === 'product') {
          await supabase.rpc('decrement_stock', {
            product_id: item.id,
            amount: item.quantity
          }).catch(() => {
            // If RPC doesn't exist, do it manually
            supabase
              .from('products')
              .update({ stock: (item.product?.stock || 0) - item.quantity })
              .eq('id', item.id)
          })
        }
      }

      // Update loyalty stamps if client selected
      if (selectedClient) {
        const serviceCount = cart
          .filter(item => item.type === 'service')
          .reduce((sum, item) => sum + item.quantity, 0)
        
        if (serviceCount > 0) {
          const client = clients?.find(c => c.id === selectedClient)
          if (client) {
            const totalStamps = client.stamps + serviceCount
            
            // If stamps >= 5, create coupon and reset
            if (totalStamps >= 5) {
              await supabase
                .from('loyalty_coupons')
                .insert({
                  organization_id: profile.organization_id,
                  client_id: selectedClient,
                  description: 'Corte gratis',
                  status: 'disponible'
                })
              
              // Reset stamps to remainder
              await supabase
                .from('loyalty_clients')
                .update({ stamps: totalStamps % 5 })
                .eq('id', selectedClient)
            } else {
              // Just update stamps
              await supabase
                .from('loyalty_clients')
                .update({ stamps: totalStamps })
                .eq('id', selectedClient)
            }
          }
        }
      }

      // Mark coupon as used if selected
      if (selectedCoupon) {
        await supabase
          .from('loyalty_coupons')
          .update({ 
            status: 'usado',
            used_at: new Date().toISOString(),
            sale_id: sale.id
          })
          .eq('id', selectedCoupon)
      }

      // Reset cart
      setCart([])
      setSelectedClient('')
      setSelectedCoupon('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

    } catch (error) {
      console.error('Error completing sale:', error)
      alert('Error completing sale. Please try again.')
    }

    setProcessing(false)
  }

  return (
    <div className="lg:h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-6">
      {/* Left side - Items */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="space-y-4 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">P.O.S.</h1>
          </div>

          {/* Mode Toggle */}
          <Tabs value={mode} onValueChange={(v) => {
            setMode(v as 'services' | 'products')
            setSelectedCategory(null)
          }}>
            <TabsList className="w-full">
              <TabsTrigger value="services" className="flex-1">Servicios</TabsTrigger>
              <TabsTrigger value="products" className="flex-1">Productos</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filters */}
          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Badge>
              {categories.map((cat) => (
                <Badge
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Items Grid */}
        <div className="lg:flex-1 lg:overflow-hidden">
          <ScrollArea className="h-auto lg:h-full">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pr-4">
              {filteredItems?.map((item) => (
                <Card
                  key={item.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => addToCart(item, mode === 'services' ? 'service' : 'product')}
                >
                  <CardContent className="p-4">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(mode === 'services' ? (item as Service).cost : (item as Product).sale_price)}
                    </p>
                    {mode === 'products' && (
                      <p className="text-xs text-muted-foreground">
                        Stock: {(item as Product).stock}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile separator */}
      <div className="lg:hidden border-t pt-4" />

      {/* Right side - Cart */}
      <Card className="lg:w-96 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Carrito
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Cart Items */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Carrito vacío
              </p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)} x {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(index, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(index, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Checkout Section */}
          <div className="space-y-4 pt-4 border-t mt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Seleccionar cliente (opcional)
              </Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin cliente seleccionado" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} ({client.stamps}/5 estampillas)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Coupon Selector */}
            {selectedClient && availableCoupons && availableCoupons.length > 0 && (
              <div className="space-y-2">
                <Label>Cupón</Label>
                <Select value={selectedCoupon} onValueChange={setSelectedCoupon}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin cupón" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin cupón</SelectItem>
                    {availableCoupons.map((coupon) => (
                      <SelectItem key={coupon.id} value={coupon.id}>
                        {coupon.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Seleccionar empleado</Label>
              <Select 
                value={selectedEmployee} 
                onValueChange={setSelectedEmployee}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona empleado" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Comisión</span>
                <span>{formatCurrency(totalCommission)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm mb-1 text-green-600">
                  <span className="text-muted-foreground">Cupón aplicado</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || !selectedEmployee || processing}
              onClick={completeSale}
            >
              {processing ? 'Procesando...' : success ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  ¡Venta completada!
                </>
              ) : (
                'Completar venta'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
