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
  Plus,
  UserPlus,
  Send,
  ArrowUpDown,
} from "lucide-react";
import type {
  LoyaltyClient,
  Sale,
  SaleItem,
  Service,
  Organization,
  WhatsAppRule,
  MessageTemplate,
} from "@/lib/types/database";
import { normalizePhone, isValidPhone } from "@/lib/utils/phone";

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
  const [sortBy, setSortBy] = useState<"name" | "stamps" | "last_visit">(
    "name",
  );
  const [selectedClient, setSelectedClient] = useState<LoyaltyClient | null>(
    null,
  );
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedCouponDiscount, setSelectedCouponDiscount] =
    useState<string>("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // New client dialog
  const [newClientDialogOpen, setNewClientDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [savingNewClient, setSavingNewClient] = useState(false);

  // Message template selected in client detail dialog
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // WhatsApp States
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'qr' | 'connected'>('disconnected');
  
  const [newRule, setNewRule] = useState<Partial<WhatsAppRule>>({
    name: "",
    trigger_event: "booking_created",
    days_delay: null,
    message_template: ""
  });

  const [newTemplate, setNewTemplate] = useState<Partial<MessageTemplate>>({
    name: "",
    message: "",
  });

  const loyaltyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/sedes`
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

  const { data: messageTemplates, mutate: mutateTemplates } = useSWR<
    MessageTemplate[]
  >(
    profile?.organization_id ? "message-templates" : null,
    async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("*")
        .eq("organization_id", profile!.organization_id)
        .order("name");
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

  const filteredClients = (
    clients?.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    ) || []
  ).slice().sort((a, b) => {
    if (sortBy === "stamps") {
      return b.stamps - a.stamps;
    }
    if (sortBy === "last_visit") {
      // Los que llevan más tiempo sin volver primero (última actualización más antigua)
      return (
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      );
    }
    return a.name.localeCompare(b.name);
  });

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

  function openClientDialog(client: LoyaltyClient) {
    setSelectedClient(client);
    setSelectedTemplateId("");
    setClientDialogOpen(true);
  }

  function openNewClientDialog() {
    setNewClientName("");
    setNewClientPhone("");
    setNewClientError(null);
    setNewClientDialogOpen(true);
  }

  async function saveNewClient() {
    if (!profile?.organization_id) return;
    if (!newClientName.trim()) {
      setNewClientError("Ingresa el nombre del cliente.");
      return;
    }
    if (!isValidPhone(newClientPhone)) {
      setNewClientError("Ingresa un número de celular válido (9 dígitos).");
      return;
    }

    setSavingNewClient(true);
    setNewClientError(null);

    const normalized = normalizePhone(newClientPhone.trim());

    const { error } = await supabase.from("loyalty_clients").insert({
      name: newClientName.trim(),
      phone: normalized,
      organization_id: profile.organization_id,
      stamps: 0,
    });

    if (error) {
      setNewClientError(
        error.code === "23505"
          ? "Ya existe un cliente registrado con ese número."
          : "No se pudo registrar al cliente. Intenta de nuevo.",
      );
      setSavingNewClient(false);
      return;
    }

    setSavingNewClient(false);
    setNewClientDialogOpen(false);
    mutateClients();
  }

  function sendTemplateToClient() {
    if (!selectedClient?.phone || !selectedTemplateId) return;
    const template = messageTemplates?.find(
      (t) => t.id === selectedTemplateId,
    );
    if (!template) return;

    const number = normalizePhone(selectedClient.phone);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(
      template.message,
    )}`;
    window.open(url, "_blank");
  }

  async function saveNewTemplate() {
    if (
      !profile?.organization_id ||
      !newTemplate.name?.trim() ||
      !newTemplate.message?.trim()
    )
      return;
    await supabase.from("message_templates").insert({
      organization_id: profile.organization_id,
      name: newTemplate.name.trim(),
      message: newTemplate.message.trim(),
    });
    setNewTemplate({ name: "", message: "" });
    mutateTemplates();
  }

  async function deleteTemplate(id: string) {
    await supabase.from("message_templates").delete().eq("id", id);
    mutateTemplates();
  }

  function openConfigModal() {
    setSelectedCouponDiscount(
      organization?.coupon_discount_percent
        ? String(organization.coupon_discount_percent)
        : "",
    );
    setConfigModalOpen(true);
  }

  async function connectWhatsApp() {
    if (!profile?.organization_id) return;
    setLoadingQr(true);
    setQrImage(null);
    setConnectionStatus('disconnected');
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: profile.organization_id })
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
        await supabase
          .from("organizations")
          .update({ whatsapp_connected: true })
          .eq("id", profile.organization_id);
        mutateOrg();
      } else if (data.status === 'qr') {
        setConnectionStatus('qr');
        setQrImage(data.qrCode);
      } else {
        alert(data.error || data.message || 'Error al conectar');
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al intentar conectar');
    } finally {
      setLoadingQr(false);
    }
  }

  async function checkConnectionState() {
    if (!profile?.organization_id) return;
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: profile.organization_id })
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openMessagesModal() {
    setMessagesModalOpen(true);
    setTimeout(() => {
      checkConnectionState();
    }, 200);
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
      .update({
        coupon_discount_percent: selectedCouponDiscount
          ? Number(selectedCouponDiscount)
          : null,
      })
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openMessagesModal} className="md:px-3">
              <MessageSquare className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Mensajes</span>
            </Button>
            <Button variant="outline" onClick={openConfigModal} className="md:px-3">
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Configurar</span>
            </Button>
            <Button onClick={generateQR} disabled={generating} className="md:px-3">
              <QrCode className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{generating ? "Generando..." : "Generar código QR"}</span>
            </Button>
            <Button onClick={openNewClientDialog} className="md:px-3">
              <UserPlus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Cliente</span>
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

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as typeof sortBy)}
        >
          <SelectTrigger className="w-full sm:w-[240px]">
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nombre (A-Z)</SelectItem>
            <SelectItem value="stamps">Más sellos primero</SelectItem>
            <SelectItem value="last_visit">
              Más tiempo sin volver primero
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clients Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card
            key={client.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => openClientDialog(client)}
          >
            <CardContent>
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

      {/* Client Detail Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedClient?.name}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6 py-2">
              {/* Basic info */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {selectedClient.phone || "Sin número registrado"}
                </div>
                <div className="text-muted-foreground">
                  Miembro desde{" "}
                  {new Date(selectedClient.created_at).toLocaleDateString(
                    "es-PE",
                  )}
                </div>
              </div>

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

              {/* Send template message */}
              <div className="space-y-2">
                <Label>Enviar mensaje de WhatsApp</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedTemplateId}
                    onValueChange={setSelectedTemplateId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecciona una plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {messageTemplates?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                      {messageTemplates?.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No hay plantillas creadas
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={!selectedTemplateId || !selectedClient.phone}
                    onClick={sendTemplateToClient}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Puedes crear plantillas nuevas desde el botón "Mensajes".
                </p>
              </div>

              {/* Purchase / service history, matching P.O.S. sales history style */}
              <div>
                <h3 className="font-semibold mb-3">Historial de servicios</h3>
                <ScrollArea className="h-[300px]">
                  {clientHistory && clientHistory.length > 0 ? (
                    <div className="space-y-3 pr-4">
                      {clientHistory.map((sale) => (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">
                                {formatCurrency(sale.total)}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {new Date(sale.created_at).toLocaleString(
                                "es-PE",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                              {sale.items && sale.items.length > 0
                                ? ` · ${sale.items
                                    .map(
                                      (item) =>
                                        `${item.quantity}x ${
                                          item.service?.name ||
                                          item.product?.name
                                        }`,
                                    )
                                    .join(", ")}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Sin historial de servicios
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Client Dialog */}
      <Dialog
        open={newClientDialogOpen}
        onOpenChange={setNewClientDialogOpen}
      >
        <DialogContent className="w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Nombre</Label>
              <Input
                id="new-client-name"
                placeholder="Ej. Juan Pérez"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-phone">Número de celular</Label>
              <Input
                id="new-client-phone"
                type="tel"
                placeholder="Ej. 987654321"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A este número se enviarán los mensajes automáticos de
                WhatsApp. Si el cliente ya tiene este número registrado,
                podrá ingresar directamente desde la página de reservas.
              </p>
            </div>
            {newClientError && (
              <p className="text-sm text-destructive">{newClientError}</p>
            )}
            <Button
              onClick={saveNewClient}
              disabled={savingNewClient}
              className="w-full"
            >
              {savingNewClient ? "Guardando..." : "Registrar cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de cupones</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label>Descuento del cupón</Label>
              <p className="text-sm text-muted-foreground">
                Selecciona el porcentaje de descuento que aplicará el cupón
                sobre el precio del servicio cuando un cliente acumule 5
                sellos.
              </p>
              <Select
                value={selectedCouponDiscount}
                onValueChange={setSelectedCouponDiscount}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar porcentaje" />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((pct) => (
                    <SelectItem key={pct} value={String(pct)}>
                      {pct}% de descuento
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
        <DialogContent className="w-full sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Mensajes y Recordatorios de WhatsApp
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 min-h-0">
            <div className="space-y-8 py-4">
              {/* WhatsApp Connection Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Conexión WhatsApp
                </h3>
                <p className="text-sm text-muted-foreground">
                  Vincula el WhatsApp de tu negocio escaneando un código QR. No necesitas configurar nada más.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={connectWhatsApp}
                    disabled={loadingQr}
                    className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                  >
                    {loadingQr ? "Generando QR..." : (connectionStatus === 'connected' ? "Reconectar" : "Conectar Celular (Ver QR)")}
                  </Button>

                  {connectionStatus === 'connected' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse"></span>
                      WhatsApp Conectado y Activo
                    </span>
                  )}
                </div>

                {qrImage && connectionStatus === 'qr' && (
                  <Card className="mt-4 max-w-sm mx-auto">
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-sm font-semibold">Escanea el código QR desde tu celular</CardTitle>
                      <p className="text-xs text-muted-foreground">Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular un dispositivo</p>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-6">
                      <img src={qrImage} alt="WhatsApp QR Code" className="w-64 h-64 border rounded p-2 bg-white" />
                      <Button variant="ghost" size="sm" onClick={connectWhatsApp} className="mt-4 text-xs">
                        ¿Ya lo escaneaste? Validar conexión
                      </Button>
                    </CardContent>
                  </Card>
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

              <div className="border-t pt-8 space-y-4">
                <h3 className="text-lg font-semibold">
                  Plantillas de mensajes
                </h3>
                <p className="text-sm text-muted-foreground">
                  Crea plantillas para enviar manualmente a un cliente desde
                  su ficha en el programa de fidelidad, listas para enviar
                  con un clic.
                </p>

                {/* Templates List */}
                <div className="space-y-3">
                  {messageTemplates?.map((template) => (
                    <Card key={template.id}>
                      <CardContent className="p-4 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{template.name}</p>
                          <p className="text-sm bg-muted p-2 rounded-md mt-2">
                            {template.message}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {messageTemplates?.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No hay plantillas creadas.
                    </p>
                  )}
                </div>

                {/* Create New Template */}
                <Card className="border-dashed mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plus className="h-4 w-4" /> Nueva plantilla
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nombre de la plantilla</Label>
                      <Input
                        placeholder="Ej. Descuento"
                        value={newTemplate.name}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mensaje</Label>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Hola, hoy tenemos un descuento del 20% en todos nuestros servicios..."
                        value={newTemplate.message}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            message: e.target.value,
                          })
                        }
                      />
                    </div>
                    <Button onClick={saveNewTemplate} className="w-full">
                      Añadir plantilla
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}