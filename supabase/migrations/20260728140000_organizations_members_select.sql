-- Allow authenticated org members to read their own organization (required for dashboard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_members_select'
  ) THEN
    CREATE POLICY organizations_members_select ON public.organizations
      FOR SELECT
      TO authenticated
      USING (
        id IN (
          SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
