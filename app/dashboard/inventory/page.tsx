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
import { Plus, MoreVertical, Pencil, Trash2, FolderPlus, Settings, AlertTriangle } from 'lucide-react'
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
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">Manage your products and stock</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={openSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Inventory Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Minimum Stock Threshold</Label>
                    <Input
                      type="number"
                      placeholder="5"
                      value={minStockThreshold}
                      onChange={(e) => setMinStockThreshold(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Products at or below this quantity will show in low stock alerts.
                    </p>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                    {saving ? 'Saving...' : 'Save Settings'}
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
                <Button variant="outline" size="sm">
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Category Name</Label>
                    <Input
                      placeholder="e.g., Hair Products"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveCategory} disabled={saving || !categoryName.trim()} className="w-full">
                    {saving ? 'Saving...' : (editingCategory ? 'Update' : 'Create')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={productModalOpen} onOpenChange={(open) => {
              setProductModalOpen(open)
              if (!open) resetProductForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Edit Product' : 'Create Product'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input
                      placeholder="e.g., Hair Gel"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Product description..."
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sale Price (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={productSalePrice}
                        onChange={(e) => setProductSalePrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cost Price (S/) *</Label>
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
                      <Label>Profit</Label>
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
                    <Label>Category</Label>
                    <Select value={productCategoryId} onValueChange={setProductCategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleSaveProduct} 
                    disabled={saving || !productName.trim() || !productSalePrice || !productCostPrice || !productStock} 
                    className="w-full"
                  >
                    {saving ? 'Saving...' : (editingProduct ? 'Update' : 'Create')}
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
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteCategory(cat.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Products Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((product) => {
          const isLowStock = product.stock <= (product.min_stock || threshold)
          return (
            <Card key={product.id} className={isLowStock ? 'border-amber-500' : ''}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {product.name}
                    {isLowStock && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  </CardTitle>
                  {product.category && (
                    <p className="text-xs text-muted-foreground">{product.category.name}</p>
                  )}
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEditProduct(product)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteProduct(product.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardHeader>
              <CardContent>
                {product.description && (
                  <p className="text-sm text-muted-foreground mb-3">{product.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-muted-foreground">Sale Price</p>
                    <p className="font-medium">{formatCurrency(product.sale_price)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cost Price</p>
                    <p className="font-medium">{formatCurrency(product.cost_price)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <p className="text-muted-foreground text-xs">Profit</p>
                    <p className="font-medium text-green-600">{formatCurrency(product.sale_price - product.cost_price)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Stock</p>
                    <p className={`font-bold text-lg ${isLowStock ? 'text-amber-500' : ''}`}>{product.stock}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {(!products || products.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No products yet. {isAdmin && 'Create your first product to get started.'}</p>
        </div>
      )}
    </div>
  )
}
