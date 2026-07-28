-- WhatsApp schema: organization credentials, client phone, rules table

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS whatsapp_api_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_instance_name TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false;

ALTER TABLE public.loyalty_clients
ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS public.whatsapp_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_event TEXT NOT NULL,
    days_delay INTEGER,
    message_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_rules'
      AND policyname = 'Enable read access for all users of the organization'
  ) THEN
    CREATE POLICY "Enable read access for all users of the organization" ON public.whatsapp_rules
      FOR SELECT USING (
        auth.uid() IN (
          SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_rules'
      AND policyname = 'Enable insert for admins of the organization'
  ) THEN
    CREATE POLICY "Enable insert for admins of the organization" ON public.whatsapp_rules
      FOR INSERT WITH CHECK (
        auth.uid() IN (
          SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_rules'
      AND policyname = 'Enable update for admins of the organization'
  ) THEN
    CREATE POLICY "Enable update for admins of the organization" ON public.whatsapp_rules
      FOR UPDATE USING (
        auth.uid() IN (
          SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_rules'
      AND policyname = 'Enable delete for admins of the organization'
  ) THEN
    CREATE POLICY "Enable delete for admins of the organization" ON public.whatsapp_rules
      FOR DELETE USING (
        auth.uid() IN (
          SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
      );
  END IF;
END $$;

-- Public-facing organization data without WhatsApp credentials
CREATE OR REPLACE VIEW public.organizations_public AS
SELECT
  id,
  name,
  logo_url,
  coupon_service_id,
  created_at,
  updated_at
FROM public.organizations;

GRANT SELECT ON public.organizations_public TO anon, authenticated;

-- Block anonymous direct reads of organizations (use organizations_public instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_anon_no_direct_select'
  ) THEN
    CREATE POLICY organizations_anon_no_direct_select ON public.organizations
      AS RESTRICTIVE
      FOR SELECT
      TO anon
      USING (false);
  END IF;
END $$;

-- RPC used by the WhatsApp reminder cron
CREATE OR REPLACE FUNCTION public.get_appointments_in_30m()
RETURNS TABLE (
  id UUID,
  client_id UUID,
  organization_id UUID,
  appointment_time TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.client_id,
    a.organization_id,
    a.appointment_time
  FROM public.appointments a
  WHERE a.status IN ('pendiente', 'confirmada')
    AND a.appointment_time >= now() + interval '25 minutes'
    AND a.appointment_time <= now() + interval '35 minutes';
$$;

REVOKE ALL ON FUNCTION public.get_appointments_in_30m() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointments_in_30m() TO service_role;
