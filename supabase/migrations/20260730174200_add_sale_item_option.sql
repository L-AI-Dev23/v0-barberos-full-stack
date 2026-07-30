-- Add selected option field (opcion_seleccionada) to public.sale_items table
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS opcion_seleccionada TEXT;
