-- Unique phone per organization for client lookup by celular
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_clients_org_phone_unique
  ON public.loyalty_clients (organization_id, phone)
  WHERE phone IS NOT NULL;
