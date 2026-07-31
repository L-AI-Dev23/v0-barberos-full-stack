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
import { Plus, MoreVertical, Pencil, Trash2, FolderPlus, Settings, AlertTriangle, Sparkles } from 'lucide-react'
import type { Product, ProductCategory } from '@/lib/types/database'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

export default function InventoryPage() {
  const { profile, isAdmin } = useAuth()
  const supabase = createClient()
  
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  
  const [categoryName, setCategoryName] = useState('')
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productSalePrice, setProductSalePrice] = useState('')
  const [productCostPrice, setProductCostPrice] = useState('')
  const [productStock, setProductStock] = useState('')
  const [productCategoryId, setProductCategoryId] = useState<string>('')
  const [productImagen, setProductImagen] = useState('')
  const [productBeneficios, setProductBeneficios] = useState('')
  const [minStockThreshold, setMinStockThreshold] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: categories, mutate: mutateCategories } = useSWR<ProductCategory[]>(
    profile?.organization_id ? 'product-categories' : null,
    async () => {
      const { data } = await supabase
        .from('product_categories')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: products, mutate: mutateProducts } = useSWR<Product[]>(
    profile?.organization_id ? 'products' : null,
    async () => {
      const { data } = await supabase
        .from('products')
        .select('*, category:product_categories(*)')
        .eq('organization_id', profile!.organization_id)
        .order('name')
      return data || []
    }
  )

  const { data: orgSettings, mutate: mutateSettings } = useSWR(
    profile?.organization_id ? 'org-settings' : null,
    async () => {
      const { data } = await supabase
        .from('organizations')
        .select('min_stock_threshold')
        .eq('id', profile!.organization_id)
        .single()
      return data
    }
  )

  const profit = (Number(productSalePrice) || 0) - (Number(productCostPrice) || 0)

  async function handleSaveCategory() {
    if (!profile?.organization_id || !categoryName.trim()) return
    setSaving(true)

    if (editingCategory) {
      await supabase
        .from('product_categories')
        .update({ name: categoryName.trim() })
        .eq('id', editingCategory.id)
    } else {
      await supabase
        .from('product_categories')
        .insert({ name: categoryName.trim(), organization_id: profile.organization_id })
    }

    setCategoryName('')
    setEditingCategory(null)
    setCategoryModalOpen(false)
    setSaving(false)
    mutateCategories()
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Delete this category? Products in this category will become uncategorized.')) return
    await supabase.from('product_categories').delete().eq('id', id)
    mutateCategories()
    mutateProducts()
  }

  async function handleSaveProduct() {
    if (!profile?.organization_id || !productName.trim() || !productSalePrice || !productCostPrice || !productStock) return
    setSaving(true)

    const productData = {
      name: productName.trim(),
      description: productDescription.trim() || null,
      sale_price: parseFloat(productSalePrice),
      cost_price: parseFloat(productCostPrice),
      stock: parseInt(productStock),
      category_id: productCategoryId || null,
      organization_id: profile.organization_id,
      imagen: productImagen.trim() || null,
      beneficios: productBeneficios.trim() || null,
    }

    if (editingProduct) {
      await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id)
    } else {
      await supabase.from('products').insert(productData)
    }

    resetProductForm()
    setProductModalOpen(false)
    setSaving(false)
    mutateProducts()
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm('Delete this product?')) return
    await supabase.from('products').delete().eq('id', id)
    mutateProducts()
  }

  async function handleSaveSettings() {
    if (!profile?.organization_id) return
    setSaving(true)
    await supabase
      .from('organizations')
      .update({ min_stock_threshold: parseInt(minStockThreshold) || 5 })
      .eq('id', profile.organization_id)
    setSaving(false)
    setSettingsModalOpen(false)
    mutateSettings()
  }

  function resetProductForm() {
    setProductName('')
    setProductDescription('')
    setProductSalePrice('')
    setProductCostPrice('')
    setProductStock('')
    setProductCategoryId('')
    setProductImagen('')
    setProductBeneficios('')
    setEditingProduct(null)
  }

  function openEditCategory(cat: ProductCategory) {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setCategoryModalOpen(true)
  }

  function openEditProduct(prod: Product) {
    setEditingProduct(prod)
    setProductName(prod.name)
    setProductDescription(prod.description || '')
    setProductSalePrice(prod.sale_price.toString())
    setProductCostPrice(prod.cost_price.toString())
    setProductStock(prod.stock.toString())
    setProductCategoryId(prod.category_id || '')
    setProductImagen(prod.imagen || '')
    setProductBeneficios(prod.beneficios || '')
    setProductModalOpen(true)
  }

  function openSettings() {
    setMinStockThreshold(orgSettings?.min_stock_threshold?.toString() || '5')
    setSettingsModalOpen(true)
  }

  const threshold = orgSettings?.min_stock_threshold || 5

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-muted-foreground">Gestiona tus productos y stock</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={openSettings} className="md:px-3">
                  <Settings className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Configuración</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configuración de inventario</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Umbral de stock mínimo</Label>
                    <Input
                      type="number"
                      placeholder="5"
                      value={minStockThreshold}
                      onChange={(e) => setMinStockThreshold(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Los productos en o por debajo de esta cantidad mostrarán alertas de stock bajo.
                    </p>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                    {saving ? 'Guardando...' : 'Guardar configuración'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

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
                      placeholder="ej., Productos para el cabello"
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

            <Dialog open={productModalOpen} onOpenChange={(open) => {
              setProductModalOpen(open)
              if (!open) resetProductForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="md:px-3">
                  <Plus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Crear producto</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Editar producto' : 'Crear producto'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <Input
                      placeholder="ej., Gel para cabello"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Textarea
                      placeholder="Descripción del producto..."
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Precio de venta (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={productSalePrice}
                        onChange={(e) => setProductSalePrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Precio de costo (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={productCostPrice}
                        onChange={(e) => setProductCostPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Ganancia</Label>
                      <Input
                        value={formatCurrency(profit)}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Stock *</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={productStock}
                        onChange={(e) => setProductStock(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Select value={productCategoryId} onValueChange={setProductCategoryId}>
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
                    <Label>Beneficios</Label>
                    <Input
                      placeholder="ej., Fijación extrema, Sin residuos, Brillo natural"
                      value={productBeneficios}
                      onChange={(e) => setProductBeneficios(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL de la Imagen</Label>
                    <Input
                      placeholder="ej., https://images.unsplash.com/..."
                      value={productImagen}
                      onChange={(e) => setProductImagen(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleSaveProduct} 
                    disabled={saving || !productName.trim() || !productSalePrice || !productCostPrice || !productStock} 
                    className="w-full"
                  >
                    {saving ? 'Guardando...' : (editingProduct ? 'Actualizar' : 'Crear')}
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

      {/* Products Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((product) => {
          const isLowStock = product.stock <= (product.min_stock || threshold)
          return (
            <Card key={product.id} className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-all duration-300 border border-border/80 p-0 py-0 pt-0 pb-0 gap-0">
              {/* Header Image or Premium Fallback */}
              <div className="h-60 w-full relative bg-muted flex items-center justify-center overflow-hidden border-b border-border/40">
                {product.imagen ? (
                  <img
                    src={product.imagen}
                    alt={product.name}
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
                      <CardTitle className="text-lg font-bold text-foreground mr-1 truncate flex items-center gap-2">
                        {product.name}
                        {isLowStock && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                      </CardTitle>
                      {product.category && (
                        <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 shrink-0">
                          {product.category.name}
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted/80 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditProduct(product)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteProduct(product.id)} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {product.description && (
                    <p className="text-sm text-muted-foreground/90 leading-relaxed line-clamp-2">{product.description}</p>
                  )}
                  {product.beneficios && (
                    <div className="text-xs bg-muted/60 p-3 rounded-lg border border-border/50">
                      <p className="font-bold text-[10px] text-violet-600/80 dark:text-violet-400/80 uppercase tracking-widest mb-1">Beneficios</p>
                      <p className="text-foreground/90 italic font-medium">{product.beneficios}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm pt-4 border-t border-border/60">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Precio</p>
                    <p className="font-semibold text-foreground text-sm mt-0.5">{formatCurrency(product.sale_price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ganancia</p>
                    <p className="font-semibold text-green-600 dark:text-green-500 text-sm mt-0.5">{formatCurrency(product.sale_price - product.cost_price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Stock</p>
                    <p className={`font-semibold text-sm mt-0.5 ${isLowStock ? 'text-amber-500' : 'text-foreground'}`}>{product.stock}</p>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {(!products || products.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Sin productos aún. {isAdmin && 'Crea tu primer producto para comenzar.'}</p>
        </div>
      )}
    </div>
  )
}