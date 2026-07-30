-- Add selected option field (opcion_seleccionada) to public.appointments table
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS opcion_seleccionada TEXT;
