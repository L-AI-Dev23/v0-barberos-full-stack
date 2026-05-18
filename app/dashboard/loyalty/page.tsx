"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Heart,
  User,
  Search,
  Copy,
  Check,
  Gift,
  Settings,
  MessageSquare,
  Phone,
  Trash2,
  Plus
} from "lucide-react";
import type {
  LoyaltyClient,
  Sale,
  SaleItem,
  Service,
  Organization,
  WhatsAppRule
} from "@/lib/types/database";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

export default function LoyaltyPage() {
  const { profile, isAdmin } = useAuth();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<LoyaltyClient | null>(
    null,
  );
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedCouponService, setSelectedCouponService] =
    useState<string>("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // WhatsApp States
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const [waApiUrl, setWaApiUrl] = useState("");
  const [waApiKey, setWaApiKey] = useState("");
  const [waInstance, setWaInstance] = useState("");
  const [savingWaConfig, setSavingWaConfig] = useState(false);
  
  const [newRule, setNewRule] = useState<Partial<WhatsAppRule>>({
    name: "",
    trigger_event: "booking_created",
    days_delay: null,
    message_template: ""
  });

  const loyaltyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/loyalty/${profile?.organization_id}`
      : "";

  const { data: clients, mutate: mutateClients } = useSWR<LoyaltyClient[]>(
    profile?.organization_id ? "loyalty-clients" : null,
    async () => {
      const { data } = await supabase
        .from("loyalty_clients")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const { data: qrCode, mutate: mutateQr } = useSWR(
    profile?.organization_id && isAdmin ? "org-qr" : null,
    async () => {
      const { data } = await supabase
        .from("organization_qr_codes")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .single();
      return data;
    },
  );

  const { data: clientHistory } = useSWR<(Sale & { items: SaleItem[] })[]>(
    selectedClient ? `client-history-${selectedClient.id}` : null,
    async () => {
      const { data } = await supabase
        .from("sales")
        .select(
          "*, items:sale_items(*, service:services(*), product:products(*))",
        )
        .eq("client_id", selectedClient!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  );

  const { data: organization, mutate: mutateOrg } = useSWR<Organization>(
    profile?.organization_id ? "org-config" : null,
    async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile!.organization_id)
        .single();
      return data;
    },
  );

  const { data: whatsappRules, mutate: mutateRules } = useSWR<WhatsAppRule[]>(
    profile?.organization_id ? "whatsapp-rules" : null,
    async () => {
      const { data } = await supabase
        .from("whatsapp_rules")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("created_at", { ascending: true });
      return data || [];
    },
  );

  const { data: services } = useSWR<Service[]>(
    profile?.organization_id ? "loyalty-services" : null,
    async () => {
      const { data } = await supabase
        .from("services")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
      return data || [];
    },
  );

  const filteredClients =
    clients?.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    ) || [];

  async function generateQR() {
    if (!profile?.organization_id) return;
    setGenerating(true);

    const qrValue = loyaltyUrl;

    if (qrCode) {
      await supabase
        .from("organization_qr_codes")
        .update({ qr_code: qrValue })
        .eq("organization_id", profile.organization_id);
    } else {
      await supabase.from("organization_qr_codes").insert({
        organization_id: profile.organization_id,
        qr_code: qrValue,
      });
    }

    mutateQr();
    setGenerating(false);
    setQrModalOpen(true);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(loyaltyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openClientSheet(client: LoyaltyClient) {
    setSelectedClient(client);
    setClientSheetOpen(true);
  }

  function openConfigModal() {
    setSelectedCouponService(organization?.coupon_service_id || "");
    setConfigModalOpen(true);
  }

  function openMessagesModal() {
    setWaApiUrl(organization?.whatsapp_api_url || "");
    setWaApiKey(organization?.whatsapp_api_key || "");
    setWaInstance(organization?.whatsapp_instance_name || "");
    setMessagesModalOpen(true);
  }

  async function saveWaConfig() {
    if (!profile?.organization_id) return;
    setSavingWaConfig(true);
    await supabase
      .from("organizations")
      .update({
        whatsapp_api_url: waApiUrl,
        whatsapp_api_key: waApiKey,
        whatsapp_instance_name: waInstance,
        whatsapp_connected: true
      })
      .eq("id", profile.organization_id);
    mutateOrg();
    setSavingWaConfig(false);
  }

  async function saveNewRule() {
    if (!profile?.organization_id || !newRule.name || !newRule.message_template) return;
    await supabase.from("whatsapp_rules").insert({
      organization_id: profile.organization_id,
      name: newRule.name,
      trigger_event: newRule.trigger_event,
      days_delay: newRule.trigger_event === 'custom_days' ? newRule.days_delay : null,
      message_template: newRule.message_template,
      is_active: true
    });
    setNewRule({
      name: "",
      trigger_event: "booking_created",
      days_delay: null,
      message_template: ""
    });
    mutateRules();
  }

  async function deleteRule(id: string) {
    await supabase.from("whatsapp_rules").delete().eq("id", id);
    mutateRules();
  }

  async function saveConfig() {
    if (!profile?.organization_id) return;
    setSavingConfig(true);

    await supabase
      .from("organizations")
      .update({ coupon_service_id: selectedCouponService || null })
      .eq("id", profile.organization_id);

    mutateOrg();
    setSavingConfig(false);
    setConfigModalOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programa de fidelidad</h1>
          <p className="text-muted-foreground">Gestiona tus clientes leales</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openMessagesModal}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Mensajes
            </Button>
            <Button variant="outline" onClick={openConfigModal}>
              <Settings className="h-4 w-4 mr-2" />
              Configurar
            </Button>
            <Button onClick={generateQR} disabled={generating}>
              <QrCode className="h-4 w-4 mr-2" />
              {generating ? "Generando..." : "Generar código QR"}
            </Button>
          </div>
        )}
      </div>

      {/* QR Code Display */}
      {qrModalOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Código QR de fidelidad
            </CardTitle>
            <CardDescription>
              Los clientes pueden escanear este código para acceder a su tarjeta
              de fidelidad
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-lg">
              <QRCodeSVG value={loyaltyUrl} size={200} />
            </div>
            <div className="flex items-center gap-2 w-full max-w-md">
              <Input value={loyaltyUrl} readOnly className="text-sm" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setQrModalOpen(false)}>
              Cerrar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Clients Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card
            key={client.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => openClientSheet(client)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Miembro desde{" "}
                    {new Date(client.created_at).toLocaleDateString("es-PE")}
                  </p>
                </div>
              </div>

              {/* Loyalty Card Preview */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Progreso de fidelidad
                  </span>
                  <span className="text-sm">{client.stamps}/5</span>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 h-8 rounded flex items-center justify-center ${
                        i < client.stamps ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      {i < client.stamps ? (
                        <Heart className="h-4 w-4 text-primary-foreground fill-current" />
                      ) : (
                        <Heart className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
                {client.coupons > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-sm text-green-600 font-medium">
                    <Gift className="h-4 w-4" />
                    {client.coupons}{" "}
                    {client.coupons === 1
                      ? "cupón disponible"
                      : "cupones disponibles"}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>
            {search
              ? "No se encontraron clientes que coincidan con tu búsqueda."
              : "Sin clientes de fidelidad aún."}
          </p>
        </div>
      )}

      {/* Client Detail Sheet */}
      <Sheet open={clientSheetOpen} onOpenChange={setClientSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selectedClient?.name}</SheetTitle>
          </SheetHeader>
          {selectedClient && (
            <div className="space-y-6 py-6">
              {/* Loyalty Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <h3 className="font-semibold">Tarjeta de fidelidad</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedClient.stamps}/5 sellos recolectados
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-12 w-12 rounded-full flex items-center justify-center ${
                          i < selectedClient.stamps ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        {i < selectedClient.stamps ? (
                          <Heart className="h-6 w-6 text-primary-foreground fill-current" />
                        ) : (
                          <Heart className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedClient.coupons > 0 && (
                    <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 rounded-lg text-center">
                      <Gift className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {selectedClient.coupons}{" "}
                        {selectedClient.coupons === 1
                          ? "cupón disponible"
                          : "cupones disponibles"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Purchase History */}
              <div>
                <h3 className="font-semibold mb-3">Historial de compras</h3>
                <ScrollArea className="h-[300px]">
                  {clientHistory && clientHistory.length > 0 ? (
                    <div className="space-y-3 pr-4">
                      {clientHistory.map((sale) => (
                        <Card key={sale.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-sm text-muted-foreground">
                                {new Date(sale.created_at).toLocaleDateString()}
                              </p>
                              <p className="font-medium">
                                {formatCurrency(sale.total)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              {sale.items?.map((item) => (
                                <p key={item.id} className="text-sm">
                                  {item.quantity}x{" "}
                                  {item.service?.name || item.product?.name}
                                </p>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Sin historial de compras
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Config Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de cupones</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label>Servicio del cupón</Label>
              <p className="text-sm text-muted-foreground">
                Selecciona el servicio que será gratuito cuando un cliente
                acumule un cupón (al completar 5 sellos).
              </p>
              <Select
                value={selectedCouponService}
                onValueChange={setSelectedCouponService}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar servicio" />
                </SelectTrigger>
                <SelectContent>
                  {services?.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={saveConfig}
              disabled={savingConfig}
              className="w-full"
            >
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Messages Modal */}
      <Dialog open={messagesModalOpen} onOpenChange={setMessagesModalOpen}>
        <DialogContent className="w-full sm:max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Mensajes y Recordatorios de WhatsApp
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-8 py-4">
              {/* WhatsApp Connection Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Conexión WhatsApp (API No Oficial)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>API URL</Label>
                    <Input 
                      placeholder="Ej. https://api.whatsapp-gateway.com" 
                      value={waApiUrl}
                      onChange={(e) => setWaApiUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instance Name / Token</Label>
                    <Input 
                      placeholder="Ej. barberia_main" 
                      value={waInstance}
                      onChange={(e) => setWaInstance(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>API Key</Label>
                    <Input 
                      type="password"
                      placeholder="Tu API Key secreta" 
                      value={waApiKey}
                      onChange={(e) => setWaApiKey(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={saveWaConfig} disabled={savingWaConfig}>
                  {savingWaConfig ? "Guardando..." : "Guardar conexión"}
                </Button>
                {organization?.whatsapp_connected && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="h-4 w-4" /> Conexión guardada
                  </p>
                )}
              </div>

              <div className="border-t pt-8 space-y-4">
                <h3 className="text-lg font-semibold">Configurador de Mensajes</h3>
                
                {/* Rules List */}
                <div className="space-y-3">
                  {whatsappRules?.map(rule => (
                    <Card key={rule.id}>
                      <CardContent className="p-4 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{rule.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Evento: {
                              rule.trigger_event === 'booking_created' ? 'Cita Creada' :
                              rule.trigger_event === 'booking_completed' ? 'Cita Completada' :
                              rule.trigger_event === 'reminder_30m' ? 'Recordatorio 30m antes' :
                              `Días después: ${rule.days_delay}`
                            }
                          </p>
                          <p className="text-sm bg-muted p-2 rounded-md mt-2">
                            {rule.message_template}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteRule(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {whatsappRules?.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No hay reglas configuradas.</p>
                  )}
                </div>

                {/* Create New Rule */}
                <Card className="border-dashed mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plus className="h-4 w-4" /> Nueva regla
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nombre de la regla</Label>
                        <Input 
                          placeholder="Ej. Recordatorio 30m" 
                          value={newRule.name}
                          onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Evento disparador</Label>
                        <Select 
                          value={newRule.trigger_event} 
                          onValueChange={(v) => setNewRule({...newRule, trigger_event: v as any})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="booking_created">Al crear la cita</SelectItem>
                            <SelectItem value="booking_completed">Al completar cita</SelectItem>
                            <SelectItem value="reminder_30m">30 minutos antes</SelectItem>
                            <SelectItem value="custom_days">Días personalizados</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {newRule.trigger_event === 'custom_days' && (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Días de retraso</Label>
                          <Input 
                            type="number"
                            placeholder="Ej. 5" 
                            value={newRule.days_delay || ''}
                            onChange={(e) => setNewRule({...newRule, days_delay: parseInt(e.target.value)})}
                          />
                        </div>
                      )}

                      <div className="space-y-2 md:col-span-2">
                        <Label>Plantilla del mensaje</Label>
                        <p className="text-xs text-muted-foreground">Variables: {'{nombre_cliente}'}, {'{fecha_cita}'}, {'{hora_cita}'}</p>
                        <textarea 
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder="Hola {nombre_cliente}, tienes una cita..."
                          value={newRule.message_template}
                          onChange={(e) => setNewRule({...newRule, message_template: e.target.value})}
                        />
                      </div>
                    </div>
                    <Button onClick={saveNewRule} className="w-full">
                      Añadir Regla
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
