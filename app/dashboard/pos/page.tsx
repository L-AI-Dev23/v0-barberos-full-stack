"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  ShoppingCart,
  Check,
  Banknote,
  Smartphone,
  Split,
  Heart,
  Lock,
  History,
} from "lucide-react";
import type {
  Service,
  Product,
  LoyaltyClient,
  Profile,
  CartItem,
  ServiceCategory,
  ProductCategory,
  Organization,
  CashRegister,
} from "@/lib/types/database";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

export default function POSPage() {
  const { profile, isAdmin } = useAuth();
  const supabase = createClient();

  const [mode, setMode] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variablePriceDialogOpen, setVariablePriceDialogOpen] = useState(false);
  const [pendingVariableService, setPendingVariableService] = useState<Service | null>(null);
  const [variablePriceInput, setVariablePriceInput] = useState("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [applyCoupon, setApplyCoupon] = useState<boolean>(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "yape" | "mixto"
  >("efectivo");
  const [cashAmount, setCashAmount] = useState("");
  const [yapeAmount, setYapeAmount] = useState("");
  const [tipAmount, setTipAmount] = useState("");

  // Fetch data
  const { data: services } = useSWR<Service[]>(
    profile?.organization_id ? "pos-services" : null,
    async () => {
      const { data } = await supabase
        .from("services")
        .select("*, category:service_categories(*)")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: products } = useSWR<Product[]>(
    profile?.organization_id ? "pos-products" : null,
    async () => {
      const { data } = await supabase
        .from("products")
        .select("*, category:product_categories(*)")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: serviceCategories } = useSWR<ServiceCategory[]>(
    profile?.organization_id ? "pos-service-categories" : null,
    async () => {
      const { data } = await supabase
        .from("service_categories")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: productCategories } = useSWR<ProductCategory[]>(
    profile?.organization_id ? "pos-product-categories" : null,
    async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: clients } = useSWR<LoyaltyClient[]>(
    profile?.organization_id ? "pos-clients" : null,
    async () => {
      const { data } = await supabase
        .from("loyalty_clients")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: employees } = useSWR<Profile[]>(
    profile?.organization_id ? "pos-employees" : null,
    async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("full_name");
      return data || [];
    },
  );

  const { data: organization } = useSWR<Organization>(
    profile?.organization_id ? "pos-org" : null,
    async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile!.organization_id)
        .single();
      return data;
    },
  );

  // Currently open cash register (sales are blocked without one)
  const { data: openRegister } = useSWR<CashRegister | null>(
    profile?.organization_id ? "pos-open-register" : null,
    async () => {
      const { data } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    { refreshInterval: 30000 },
  );

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);

  // Recent completed sales, for the "Historial" panel where a mistaken
  // sale can be deleted (this immediately reduces daily revenue, payment
  // method totals, and the open register's expected amounts, since those
  // are all computed live from this table).
  const {
    data: salesHistory,
    mutate: mutateSalesHistory,
  } = useSWR(
    historyDialogOpen && profile?.organization_id ? "pos-sales-history" : null,
    async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, employee:profiles(*), client:loyalty_clients(*)")
        .eq("organization_id", profile!.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  );

  async function handleDeleteSale(saleId: string) {
    if (!confirm("¿Eliminar esta venta? Esta acción no se puede deshacer.")) return;
    setDeletingSaleId(saleId);
    try {
      await supabase.from("sale_items").delete().eq("sale_id", saleId);
      const { error } = await supabase.from("sales").delete().eq("id", saleId);
      if (error) throw error;
      mutateSalesHistory();
    } catch (error) {
      console.error("Error deleting sale:", error);
      alert("No se pudo eliminar la venta. Intenta nuevamente.");
    }
    setDeletingSaleId(null);
  }

  // Default the employee selector to the logged-in user (admin or not).
  // Admins can still change it afterwards; non-admins keep it locked.
  useEffect(() => {
    if (profile && !selectedEmployee) {
      setSelectedEmployee(profile.id);
    }
  }, [profile, selectedEmployee]);

  const categories =
    mode === "services" ? serviceCategories : productCategories;
  const items = mode === "services" ? services : products;

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesCategory =
        !selectedCategory || item.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, selectedCategory]);

  // Get selected client coupons
  const selectedClientData = clients?.find((c) => c.id === selectedClient);
  const clientCoupons = selectedClientData?.coupons || 0;

  // Calculate discount based on configured coupon percentage.
  // Applies over the services in the cart (not products).
  const couponDiscountPercent = organization?.coupon_discount_percent || 0;
  const servicesSubtotal = cart
    .filter((item) => item.type === "service")
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  // If we applied the coupon but there are no services in the cart, untoggle it
  if (applyCoupon && servicesSubtotal === 0) {
    setApplyCoupon(false);
  }

  const discount =
    applyCoupon && couponDiscountPercent > 0
      ? Math.round(servicesSubtotal * (couponDiscountPercent / 100) * 100) / 100
      : 0;

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const total = cartTotal - discount;
  const totalCommission = cart.reduce(
    (sum, item) => sum + item.commission * item.quantity,
    0,
  );

  // Payment amounts (parsed from string inputs)
  const parsedCash = parseFloat(cashAmount) || 0;
  const parsedYape = parseFloat(yapeAmount) || 0;
  const parsedTip = parseFloat(tipAmount) || 0;
  const amountPaid =
    paymentMethod === "efectivo"
      ? parsedCash
      : paymentMethod === "yape"
        ? parsedYape
        : parsedCash + parsedYape;
  const paymentDifference = Math.round((total - amountPaid) * 100) / 100;
  const paymentMatches = Math.abs(paymentDifference) < 0.01;

  function openPaymentDialog() {
    // Pre-fill the amount(s) with the sale total for convenience
    setPaymentMethod("efectivo");
    setCashAmount(total.toFixed(2));
    setYapeAmount("");
    setTipAmount("");
    setPaymentDialogOpen(true);
  }

  function handlePaymentMethodChange(method: "efectivo" | "yape" | "mixto") {
    setPaymentMethod(method);
    if (method === "efectivo") {
      setCashAmount(total.toFixed(2));
      setYapeAmount("");
    } else if (method === "yape") {
      setYapeAmount(total.toFixed(2));
      setCashAmount("");
    } else {
      setCashAmount("");
      setYapeAmount("");
    }
  }

  function addToCart(
    item: Service | Product,
    type: "service" | "product",
    overridePrice?: number,
    overrideCommission?: number,
  ) {
    const existingIndex =
      overridePrice === undefined
        ? cart.findIndex((c) => c.id === item.id && c.type === type)
        : -1; // Los servicios de precio variable siempre se agregan como línea nueva

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity++;
      setCart(newCart);
    } else {
      const cartItem: CartItem = {
        id: item.id,
        type,
        name: item.name,
        price:
          overridePrice !== undefined
            ? overridePrice
            : type === "service"
              ? (item as Service).cost
              : (item as Product).sale_price,
        commission:
          overrideCommission !== undefined
            ? overrideCommission
            : type === "service"
              ? (item as Service).commission
              : 0,
        quantity: 1,
        selectedOption: type === "service" && (item as Service).opciones && (item as Service).opciones!.length > 0
          ? (item as Service).opciones![0]
          : null,
        ...(type === "service"
          ? { service: item as Service }
          : { product: item as Product }),
      };
      setCart([...cart, cartItem]);
    }
  }

  function handleItemClick(item: Service | Product, type: "service" | "product") {
    if (type === "service" && (item as Service).variable_price) {
      setPendingVariableService(item as Service);
      setVariablePriceInput("");
      setVariablePriceDialogOpen(true);
      return;
    }
    addToCart(item, type);
  }

  function confirmVariablePrice() {
    if (!pendingVariableService) return;
    const price = parseFloat(variablePriceInput);
    if (isNaN(price) || price <= 0) {
      alert("Ingresa un precio válido.");
      return;
    }
    const pct = pendingVariableService.commission_percent ?? 40;
    const commission = Number(((price * pct) / 100).toFixed(2));
    addToCart(pendingVariableService, "service", price, commission);
    setVariablePriceDialogOpen(false);
    setPendingVariableService(null);
    setVariablePriceInput("");
  }

  function updateQuantity(index: number, delta: number) {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  }

  function removeItem(index: number) {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  }

  async function completeSale() {
    if (!profile?.organization_id || !selectedEmployee || cart.length === 0)
      return;
    if (!openRegister) {
      alert("Debes abrir la caja antes de registrar ventas.");
      return;
    }
    setProcessing(true);

    try {
      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          organization_id: profile.organization_id,
          employee_id: selectedEmployee,
          client_id: selectedClient || null,
          total,
          total_commission: totalCommission,
          payment_method: paymentMethod,
          cash_amount: paymentMethod === "yape" ? 0 : parsedCash,
          yape_amount: paymentMethod === "efectivo" ? 0 : parsedYape,
          tip_amount: parsedTip,
          cash_register_id: openRegister.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        item_type: item.type,
        service_id: item.type === "service" ? item.id : null,
        product_id: item.type === "product" ? item.id : null,
        quantity: item.quantity,
        unit_price: item.price,
        commission: item.commission,
        opcion_seleccionada: item.type === "service" ? item.selectedOption : null,
      }));

      await supabase.from("sale_items").insert(saleItems);

      // Update product stock
      for (const item of cart) {
        if (item.type === "product") {
          await supabase
            .rpc("decrement_stock", {
              product_id: item.id,
              amount: item.quantity,
            })
            .catch(() => {
              // If RPC doesn't exist, do it manually
              supabase
                .from("products")
                .update({ stock: (item.product?.stock || 0) - item.quantity })
                .eq("id", item.id);
            });
        }
      }

      // Update loyalty stamps if client selected
      if (selectedClient) {
        const serviceCount = cart
          .filter((item) => item.type === "service")
          .reduce((sum, item) => sum + item.quantity, 0);

        if (serviceCount > 0 || applyCoupon) {
          const client = clients?.find((c) => c.id === selectedClient);
          if (client) {
            const totalStamps = client.stamps + serviceCount;
            let additionalCoupons = 0;
            let finalStamps = totalStamps;

            // If stamps >= 5, create coupon and reset
            if (totalStamps >= 5) {
              additionalCoupons = Math.floor(totalStamps / 5);
              finalStamps = totalStamps % 5;
            }

            let finalCoupons = client.coupons + additionalCoupons;

            if (applyCoupon) {
              finalCoupons -= 1;
            }

            await supabase
              .from("loyalty_clients")
              .update({ stamps: finalStamps, coupons: finalCoupons })
              .eq("id", selectedClient);
          }
        }
      }

      // Reset cart
      setCart([]);
      setSelectedClient("");
      setApplyCoupon(false);
      setPaymentDialogOpen(false);
      setPaymentMethod("efectivo");
      setCashAmount("");
      setYapeAmount("");
      setTipAmount("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error completing sale:", error);
      alert("Error al registrar la venta. Intenta nuevamente.");
    }

    setProcessing(false);
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
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as "services" | "products");
              setSelectedCategory(null);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="services" className="flex-1">
                Servicios
              </TabsTrigger>
              <TabsTrigger value="products" className="flex-1">
                Productos
              </TabsTrigger>
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
                variant={selectedCategory === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Badge>
              {categories.map((cat) => (
                <Badge
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "outline"}
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
              {filteredItems?.map((item) => {
                const cartQty = cart
                  .filter((c) => c.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0)
                const inCart = cartQty > 0
                return (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-colors relative ${
                      inCart
                        ? "border-primary border-2 bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-primary"
                    }`}
                    onClick={() =>
                      handleItemClick(item, mode === "services" ? "service" : "product")
                    }
                  >
                    {inCart && (
                      <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="font-medium truncate flex-1">{item.name}</p>
                        {mode === "services" && (item as Service).opciones && (item as Service).opciones!.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                            {(item as Service).opciones!.length} {(item as Service).opciones!.length === 1 ? 'opción' : 'opciones'}
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {mode === "services" && (item as Service).variable_price
                          ? "Precio variable"
                          : formatCurrency(
                              mode === "services"
                                ? (item as Service).cost
                                : (item as Product).sale_price,
                            )}
                      </p>
                      {mode === "products" && (
                        <p className="text-xs text-muted-foreground">
                          Stock: {(item as Product).stock}
                        </p>
                      )}
                      {inCart && (
                        <p className="text-xs font-semibold text-primary mt-1">
                          En el carrito{cartQty > 1 ? ` ×${cartQty}` : ""}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile separator */}
      <div className="lg:hidden border-t pt-4" />

      {/* Right side - Cart */}
      <Card className="lg:w-96 flex flex-col lg:h-full overflow-hidden">
        <CardHeader className="pb-2 shrink-0 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Carrito
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryDialogOpen(true)}
          >
            <History className="h-4 w-4 mr-1.5" />
            Historial
          </Button>
        </CardHeader>
        
        {/* Contenedor principal del carrito que usa flex y oculta desbordamientos externos */}
        <CardContent className="flex-1 flex flex-col min-h-0 p-6 pt-0">
          
          {/* ScrollArea interno para toda la zona de contenido (items y selectores) */}
          <ScrollArea className="flex-1 min-h-0 pr-4 -mr-4">
            <div className="space-y-4 py-2">
              {/* Cart Items */}
              {cart.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Carrito vacío
                </p>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, index) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center gap-2"
                    >
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
                        <span className="w-6 text-center text-sm">
                          {item.quantity}
                        </span>
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

              {/* Client Selector */}
              <div className="space-y-2 pt-2">
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
              <div className="space-y-2">
                <Label>Cupón</Label>
                <Select
                  value={applyCoupon ? "apply" : "none"}
                  onValueChange={(val) => setApplyCoupon(val === "apply")}
                  disabled={!selectedClient || clientCoupons <= 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin cupón" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {!selectedClient
                        ? "Seleccione un cliente primero"
                        : clientCoupons <= 0
                          ? "El cliente no tiene cupones disponibles"
                          : "No aplicar cupón"}
                    </SelectItem>
                    {selectedClient && clientCoupons > 0 && (
                      <SelectItem value="apply">
                        Aplicar cupón ({clientCoupons} disponibles)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Employee Selector */}
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

              {/* Option selectors for services in cart */}
              {cart.map((cartItem, index) => {
                if (cartItem.type === "service" && cartItem.service?.opciones && cartItem.service.opciones.length > 0) {
                  return (
                    <div key={`opt-${cartItem.id}-${index}`} className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Opción de estilo para {cartItem.name}
                      </Label>
                      <Select
                        value={cartItem.selectedOption || ""}
                        onValueChange={(val) => {
                          const newCart = [...cart];
                          newCart[index].selectedOption = val;
                          setCart(newCart);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                        <SelectContent>
                          {cartItem.service.opciones.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </ScrollArea>

          {/* Checkout Section - Fija en la parte baja */}
          <div className="space-y-3 pt-4 border-t mt-auto shrink-0 bg-card">
            <div>
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

            {!openRegister && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-3">
                <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  La caja está cerrada. Ábrela desde el{" "}
                  <a href="/dashboard" className="underline font-medium">
                    Panel
                  </a>{" "}
                  para poder registrar ventas.
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={
                cart.length === 0 ||
                !selectedEmployee ||
                processing ||
                !openRegister
              }
              onClick={openPaymentDialog}
            >
              {success ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  ¡Venta completada!
                </>
              ) : (
                "Completar venta"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center rounded-lg bg-muted px-4 py-3">
              <span className="text-muted-foreground">Total a cobrar</span>
              <span className="text-xl font-bold">{formatCurrency(total)}</span>
            </div>

            {/* Payment method selector */}
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === "efectivo" ? "default" : "outline"}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => handlePaymentMethodChange("efectivo")}
                >
                  <Banknote className="h-4 w-4" />
                  <span className="text-xs">Efectivo</span>
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "yape" ? "default" : "outline"}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => handlePaymentMethodChange("yape")}
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="text-xs">Yape</span>
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === "mixto" ? "default" : "outline"}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => handlePaymentMethodChange("mixto")}
                >
                  <Split className="h-4 w-4" />
                  <span className="text-xs">Mixto</span>
                </Button>
              </div>
            </div>

            {/* Amount inputs based on method */}
            {paymentMethod === "efectivo" && (
              <div className="space-y-2">
                <Label>Monto en efectivo</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {paymentMethod === "yape" && (
              <div className="space-y-2">
                <Label>Monto por Yape</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={yapeAmount}
                  onChange={(e) => setYapeAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {paymentMethod === "mixto" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1 text-xs">
                    <Banknote className="h-3 w-3" /> Efectivo
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1 text-xs">
                    <Smartphone className="h-3 w-3" /> Yape
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={yapeAmount}
                    onChange={(e) => setYapeAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}

            {/* Payment validation feedback */}
            {!paymentMatches && (
              <p className="text-sm text-destructive">
                {paymentDifference > 0
                  ? `Falta ${formatCurrency(paymentDifference)} por cubrir el total.`
                  : `El monto ingresado excede el total por ${formatCurrency(Math.abs(paymentDifference))}.`}
              </p>
            )}

            {/* Tip - optional, doesn't affect the sale total */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Propina (opcional)
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                La propina no se suma al total de la venta, es un extra para el empleado.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
              disabled={processing}
            >
              Cancelar
            </Button>
            <Button
              onClick={completeSale}
              disabled={!paymentMatches || processing}
            >
              {processing ? "Procesando..." : "Confirmar venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variable price prompt */}
      <Dialog open={variablePriceDialogOpen} onOpenChange={setVariablePriceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Precio de {pendingVariableService?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="variable-price-input">
                Precio para este servicio
              </Label>
              <Input
                id="variable-price-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 80.00"
                value={variablePriceInput}
                onChange={(e) => setVariablePriceInput(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                La comisión será el{" "}
                {pendingVariableService?.commission_percent ?? 40}% de este
                precio.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVariablePriceDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={confirmVariablePrice}>Agregar al carrito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales history dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de ventas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Últimas ventas completadas. Eliminar una venta hecha por error reduce
            automáticamente lo registrado en caja e ingresos.
          </p>
          {!salesHistory ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : salesHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Aún no hay ventas registradas.
            </p>
          ) : (
            <div className="space-y-3">
              {salesHistory.map((sale: any) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{formatCurrency(sale.total)}</p>
                      <Badge variant="outline" className="capitalize">
                        {sale.payment_method}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(sale.created_at).toLocaleString("es-PE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {sale.employee?.full_name || "Empleado"}
                      {sale.client?.name ? ` · ${sale.client.name}` : ""}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      disabled={deletingSaleId === sale.id}
                      onClick={() => handleDeleteSale(sale.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}