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
  const { profile, isAdmin } = useAuth()
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
  const [serviceCategoryId, setServiceCategoryId] = useState<string>('')
  const [serviceIncluye, setServiceIncluye] = useState('')
  const [serviceImagen, setServiceImagen] = useState('')
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
    if (!profile?.organization_id || !serviceName.trim() || !serviceCost || !serviceCommission) return
    setSaving(true)

    const serviceData = {
      name: serviceName.trim(),
      description: serviceDescription.trim() || null,
      cost: parseFloat(serviceCost),
      commission: parseFloat(serviceCommission),
      category_id: serviceCategoryId || null,
      organization_id: profile.organization_id,
      incluye: serviceIncluye.trim() || null,
      imagen: serviceImagen.trim() || null,
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
    await supabase.from('services').delete().eq('id', id)
    mutateServices()
  }

  function resetServiceForm() {
    setServiceName('')
    setServiceDescription('')
    setServiceCost('')
    setServiceCommission('')
    setServiceCategoryId('')
    setServiceIncluye('')
    setServiceImagen('')
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
    setServiceCategoryId(svc.category_id || '')
    setServiceIncluye(svc.incluye || '')
    setServiceImagen(svc.imagen || '')
    setServiceModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="text-muted-foreground">Gestiona los servicios de tu barbería</p>
        </div>
        {isAdmin && (
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
                    <Label>Incluye (Servicios adicionales / interno)</Label>
                    <Input
                      placeholder="ej., Lavado de cabello, Toalla caliente"
                      value={serviceIncluye}
                      onChange={(e) => setServiceIncluye(e.target.value)}
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
                    disabled={saving || !serviceName.trim() || !serviceCost || !serviceCommission} 
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
              {isAdmin && (
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
          <Card key={service.id} className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300 border border-border/80">
            {/* Header Image or Premium Fallback */}
            <div className="h-44 w-full relative bg-muted flex items-center justify-center overflow-hidden border-b border-border/40">
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

            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-4">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">{service.name}</CardTitle>
                {service.category && (
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-400 mt-1">
                    {service.category.name}
                  </span>
                )}
              </div>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted/80">
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
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between pt-2 pb-5">
              <div className="space-y-4">
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
              
              <div className="grid grid-cols-3 gap-2 text-sm pt-4 border-t border-border/60 mt-5">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Precio</p>
                  <p className="font-extrabold text-foreground text-[15px] mt-0.5">{formatCurrency(service.cost)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Comisión</p>
                  <p className="font-extrabold text-foreground text-[15px] mt-0.5">{formatCurrency(service.commission)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ganancia</p>
                  <p className="font-extrabold text-green-600 dark:text-green-500 text-[15px] mt-0.5">{formatCurrency(service.cost - service.commission)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!services || services.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Sin servicios aún. {isAdmin && 'Crea tu primer servicio para comenzar.'}</p>
        </div>
      )}
    </div>
  )
}
