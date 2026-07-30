-- Add options (opciones) field as a text array to public.services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS opciones TEXT[];
