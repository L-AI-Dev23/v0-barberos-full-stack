-- Update organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS whatsapp_api_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_instance_name TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false;

-- Update loyalty_clients table
ALTER TABLE public.loyalty_clients
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create whatsapp_rules table
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

-- RLS for whatsapp_rules
ALTER TABLE public.whatsapp_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users of the organization" ON public.whatsapp_rules
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id
        )
    );

CREATE POLICY "Enable insert for admins of the organization" ON public.whatsapp_rules
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
    );

CREATE POLICY "Enable update for admins of the organization" ON public.whatsapp_rules
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
    );

CREATE POLICY "Enable delete for admins of the organization" ON public.whatsapp_rules
    FOR DELETE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE organization_id = whatsapp_rules.organization_id AND role = 'admin'
        )
    );
