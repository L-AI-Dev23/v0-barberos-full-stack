-- Add includes (incluye) and image (imagen) fields to public.services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS incluye TEXT,
ADD COLUMN IF NOT EXISTS imagen TEXT;
