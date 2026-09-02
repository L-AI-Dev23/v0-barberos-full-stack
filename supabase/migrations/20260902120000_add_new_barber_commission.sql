-- Add "comisión nuevo" fields to services (paid to barbers still in trial
-- status) and an employee_status field to profiles to flag which barbers
-- are "nuevo" (new/trial) vs "estandar" (regular commission).

ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS commission_nuevo NUMERIC,
ADD COLUMN IF NOT EXISTS commission_percent_nuevo NUMERIC;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_status TEXT NOT NULL DEFAULT 'estandar'
  CHECK (employee_status IN ('nuevo', 'estandar'));
