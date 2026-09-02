'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Pencil, Trash2, FolderPlus, Sparkles } from 'lucide-react'
import type { Service, ServiceCategory } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function ServicesPage() {
  const { profile, isAdmin, hasPermission } = useAuth()
  const canManage = isAdmin || hasPermission('services')
  const supabase = createClient()
  
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null)
  const [editingService, setEditingService] = useState<Service | null>(null)
  
  const [categoryName, setCategoryName] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceCost, setServiceCost] = useState('')
  const [serviceCommission, setServiceCommission] = useState('')
  const [serviceCommissionNuevo, setServiceCommissionNuevo] = useState('')
  const [servicePriceType, setServicePriceType] = useState<'fijo' | 'variable'>('fijo')
  const [serviceCommissionPercent, setServiceCommissionPercent] = useState('')
  const [serviceCommissionPercentNuevo, setServiceCommissionPercentNuevo] = useState('')
  const [serviceCategoryId, setServiceCategoryId] = useState<string>('')
  const [serviceIncluye, setServiceIncluye] = useState('')
  const [serviceImagen, setServiceImagen] = useState('')
  const [serviceOpciones, setServiceOpciones] = useState('')
  const [serviceMode, setServiceMode] = useState<'servicio' | 'ejemplo' | 'servicio_interno'>('servicio')
  const [saving, setSaving] = useState(false)

  const { data: categories, mutate: mutateCategories } = useSWR<ServiceCategory[]>(
    profile?.organization_id ? 'service-categories' : null,
    async () => {
      const { data } = await supabase
        .from('service_categories')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: services, mutate: mutateServices } = useSWR<Service[]>(
    profile?.organization_id ? 'services' : null,
    async () => {
      const { data } = await supabase
        .from('services')
        .select('*, category:service_categories(*)')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const profit = (Number(serviceCost) || 0) - (Number(serviceCommission) || 0)

  async function handleSaveCategory() {
    if (!profile?.organization_id || !categoryName.trim()) return
    setSaving(true)

    if (editingCategory) {
      await supabase
        .from('service_categories')
        .update({ name: categoryName.trim() })
        .eq('id', editingCategory.id)
    } else {
      await supabase
        .from('service_categories')
        .insert({ name: categoryName.trim(), organization_id: profile.organization_id })
    }

    setCategoryName('')
    setEditingCategory(null)
    setCategoryModalOpen(false)
    setSaving(false)
    mutateCategories()
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Delete this category? Services in this category will become uncategorized.')) return
    await supabase.from('service_categories').delete().eq('id', id)
    mutateCategories()
    mutateServices()
  }

  async function handleSaveService() {
    if (!profile?.organization_id || !serviceName.trim()) return
    if (servicePriceType === 'fijo' && (!serviceCost || !serviceCommission)) return
    if (servicePriceType === 'variable' && !serviceCommissionPercent) return
    setSaving(true)

    const opcionesArray = serviceOpciones.trim()
      ? serviceOpciones.split(',').map(o => o.trim()).filter(Boolean)
      : null

    const serviceData = {
      name: serviceName.trim(),
      description: serviceDescription.trim() || null,
      cost: servicePriceType === 'fijo' ? parseFloat(serviceCost) : 0,
      commission: servicePriceType === 'fijo' ? parseFloat(serviceCommission) : 0,
      commission_nuevo:
        servicePriceType === 'fijo' && serviceCommissionNuevo.trim() !== ''
          ? parseFloat(serviceCommissionNuevo)
          : null,
      variable_price: servicePriceType === 'variable',
      commission_percent: servicePriceType === 'variable' ? parseFloat(serviceCommissionPercent) : null,
      commission_percent_nuevo:
        servicePriceType === 'variable' && serviceCommissionPercentNuevo.trim() !== ''
          ? parseFloat(serviceCommissionPercentNuevo)
          : null,
      category_id: serviceCategoryId || null,
      organization_id: profile.organization_id,
      incluye: serviceIncluye.trim() || null,
      imagen: serviceImagen.trim() || null,
      opciones: opcionesArray,
      mode: serviceMode,
    }

    if (editingService) {
      await supabase
        .from('services')
        .update(serviceData)
        .eq('id', editingService.id)
    } else {
      await supabase.from('services').insert(serviceData)
    }

    resetServiceForm()
    setServiceModalOpen(false)
    setSaving(false)
    mutateServices()
  }

  async function handleDeleteService(id: string) {
    if (!confirm('Delete this service?')) return
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) {
      console.error('Error deleting service:', error)
      alert(`No se pudo eliminar el servicio: ${error.message}`)
    } else {
      mutateServices()
    }
  }

  function resetServiceForm() {
    setServiceName('')
    setServiceDescription('')
    setServiceCost('')
    setServiceCommission('')
    setServiceCommissionNuevo('')
    setServicePriceType('fijo')
    setServiceCommissionPercent('')
    setServiceCommissionPercentNuevo('')
    setServiceCategoryId('')
    setServiceIncluye('')
    setServiceImagen('')
    setServiceOpciones('')
    setServiceMode('servicio')
    setEditingService(null)
  }

  function openEditCategory(cat: ServiceCategory) {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setCategoryModalOpen(true)
  }

  function openEditService(svc: Service) {
    setEditingService(svc)
    setServiceName(svc.name)
    setServiceDescription(svc.description || '')
    setServiceCost(svc.cost.toString())
    setServiceCommission(svc.commission.toString())
    setServiceCommissionNuevo(svc.commission_nuevo != null ? svc.commission_nuevo.toString() : '')
    setServicePriceType(svc.variable_price ? 'variable' : 'fijo')
    setServiceCommissionPercent(svc.commission_percent != null ? svc.commission_percent.toString() : '')
    setServiceCommissionPercentNuevo(svc.commission_percent_nuevo != null ? svc.commission_percent_nuevo.toString() : '')
    setServiceCategoryId(svc.category_id || '')
    setServiceIncluye(svc.incluye || '')
    setServiceImagen(svc.imagen || '')
    setServiceOpciones(svc.opciones ? svc.opciones.join(', ') : '')
    setServiceMode(svc.mode === 'ejemplo' ? 'ejemplo' : svc.mode === 'servicio_interno' ? 'servicio_interno' : 'servicio')
    setServiceModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Servicios</h1>
          <p className="text-muted-foreground">Gestiona los servicios de tu barbería</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={categoryModalOpen} onOpenChange={(open) => {
              setCategoryModalOpen(open)
              if (!open) {
                setCategoryName('')
                setEditingCategory(null)
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="md:px-3">
                  <FolderPlus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Crear categoría</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? 'Editar categoría' : 'Crear categoría'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nombre de la categoría</Label>
                    <Input
                      placeholder="ej., Cortes de cabello"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveCategory} disabled={saving || !categoryName.trim()} className="w-full">
                    {saving ? 'Guardando...' : (editingCategory ? 'Actualizar' : 'Crear')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={serviceModalOpen} onOpenChange={(open) => {
              setServiceModalOpen(open)
              if (!open) resetServiceForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="md:px-3">
                  <Plus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Crear servicio</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingService ? 'Editar servicio' : 'Crear servicio'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <Input
                      placeholder="ej., Corte clásico"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Textarea
                      placeholder="Descripción del servicio..."
                      value={serviceDescription}
                      onChange={(e) => setServiceDescription(e.target.value)}
                    />
                  </div>
                  {servicePriceType === 'fijo' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Precio (S/) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={serviceCost}
                            onChange={(e) => setServiceCost(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Comisión (S/) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={serviceCommission}
                            onChange={(e) => setServiceCommission(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ganancia</Label>
                          <Input
                            value={formatCurrency(profit)}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Comisión nuevo (S/)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={serviceCommissionNuevo}
                          onChange={(e) => setServiceCommissionNuevo(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Comisión que gana un barbero marcado como "Nuevo" (en fase de prueba) por este
                          servicio. Si se deja vacío, se usa la misma comisión estándar.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Comisión (%) *</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          placeholder="ej., 40"
                          value={serviceCommissionPercent}
                          onChange={(e) => setServiceCommissionPercent(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          El precio se ingresa al momento de completar la venta en el P.O.S. La comisión
                          se calculará como este porcentaje sobre el precio ingresado.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Comisión nuevo (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          placeholder="ej., 30"
                          value={serviceCommissionPercentNuevo}
                          onChange={(e) => setServiceCommissionPercentNuevo(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Porcentaje de comisión para barberos marcados como "Nuevo". Si se deja vacío, se
                          usa el mismo porcentaje estándar.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Categoría</Label>
                      <Select value={serviceCategoryId} onValueChange={setServiceCategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de precio</Label>
                      <Select value={servicePriceType} onValueChange={(v) => setServicePriceType(v as 'fijo' | 'variable')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo de precio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fijo">Fijo</SelectItem>
                          <SelectItem value="variable">Variable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={serviceMode} onValueChange={(v) => setServiceMode(v as 'servicio' | 'ejemplo' | 'servicio_interno')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="servicio">Servicio</SelectItem>
                        <SelectItem value="ejemplo">Ejemplo</SelectItem>
                        <SelectItem value="servicio_interno">Servicio interno</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      "Ejemplo" ya no se puede vender en el P.O.S. ni agendar en reservas: solo se
                      muestra como referencia (imagen, nombre y descripción) en la sección "Estilos".
                      "Servicio interno" sí se puede vender en el P.O.S., pero no aparece en la página
                      de reservas para que los clientes lo agenden.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Incluye (Servicios adicionales / interno)</Label>
                    <Input
                      placeholder="ej., Lavado de cabello, Toalla caliente"
                      value={serviceIncluye}
                      onChange={(e) => setServiceIncluye(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Opciones (separadas por comas)</Label>
                    <Input
                      placeholder="ej., Low, Mid, High"
                      value={serviceOpciones}
                      onChange={(e) => setServiceOpciones(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL de la Imagen</Label>
                    <Input
                      placeholder="ej., https://images.unsplash.com/..."
                      value={serviceImagen}
                      onChange={(e) => setServiceImagen(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleSaveService} 
                    disabled={
                      saving ||
                      !serviceName.trim() ||
                      (servicePriceType === 'fijo' ? (!serviceCost || !serviceCommission) : !serviceCommissionPercent)
                    } 
                    className="w-full"
                  >
                    {saving ? 'Guardando...' : (editingService ? 'Actualizar' : 'Crear')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-sm">
              <span>{cat.name}</span>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openEditCategory(cat)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteCategory(cat.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Services Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services?.map((service) => (
          <Card key={service.id} className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300 border border-border/80 p-0 py-0 pt-0 pb-0 gap-0">
            {/* Header Image or Premium Fallback */}
            <div className="h-60 w-full relative bg-muted flex items-center justify-center overflow-hidden border-b border-border/40">
              {service.imagen ? (
                <img
                  src={service.imagen}
                  alt={service.name}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 flex flex-col items-center justify-center gap-2">
                  <Sparkles className="h-8 w-8 text-violet-500/40 animate-pulse" />
                  <span className="text-xs text-muted-foreground/40 font-semibold tracking-widest uppercase select-none">BarberOS</span>
                </div>
              )}
            </div>

            <div className="px-5 pt-4 pb-5 flex-1 flex flex-col justify-between gap-3">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold text-foreground mr-1 truncate">{service.name}</CardTitle>
                    {service.category && (
                      <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 shrink-0">
                        {service.category.name}
                      </span>
                    )}
                    {service.opciones && service.opciones.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        {service.opciones.length} {service.opciones.length === 1 ? 'opción' : 'opciones'}
                      </span>
                    )}
                    {service.mode === 'ejemplo' && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                        Ejemplo
                      </span>
                    )}
                    {service.mode === 'servicio_interno' && (
                      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                        Interno
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted/80 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditService(service)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteService(service.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {service.description && (
                  <p className="text-sm text-muted-foreground/90 leading-relaxed line-clamp-2">{service.description}</p>
                )}
                {service.incluye && (
                  <div className="text-xs bg-muted/60 p-3 rounded-lg border border-border/50">
                    <p className="font-bold text-[10px] text-violet-600/80 dark:text-violet-400/80 uppercase tracking-widest mb-1">Incluye</p>
                    <p className="text-foreground/90 italic font-medium">{service.incluye}</p>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-sm pt-4 border-t border-border/60">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Precio</p>
                  <p className="font-semibold text-foreground text-[15px] mt-0.5">
                    {service.variable_price ? 'Variable' : formatCurrency(service.cost)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Comisión</p>
                  <p className="font-semibold text-foreground text-[15px] mt-0.5">
                    {service.variable_price
                      ? `${service.commission_percent ?? 0}%`
                      : formatCurrency(service.commission)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ganancia</p>
                  <p className="font-semibold text-green-600 dark:text-green-500 text-[15px] mt-0.5">
                    {service.variable_price
                      ? `${100 - (service.commission_percent ?? 0)}%`
                      : formatCurrency(service.cost - service.commission)}
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Comisión nuevo</p>
                <p className="font-semibold text-foreground text-[15px] mt-0.5">
                  {service.variable_price
                    ? `${service.commission_percent_nuevo ?? service.commission_percent ?? 0}%`
                    : formatCurrency(service.commission_nuevo ?? service.commission)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {(!services || services.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Sin servicios aún. {canManage && 'Crea tu primer servicio para comenzar.'}</p>
        </div>
      )}
    </div>
  )
}