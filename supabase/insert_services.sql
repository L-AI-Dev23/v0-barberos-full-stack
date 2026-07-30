-- SQL Script to insert TAPER FADE, MOHICANO, MULLET, and BURST FADE services with options
DO $$
DECLARE
    v_category_id UUID;
    v_organization_id UUID;
BEGIN
    -- Buscamos el ID de la categoría 'Cortes' y su respectiva organización
    SELECT id, organization_id INTO v_category_id, v_organization_id
    FROM public.service_categories
    WHERE name ILIKE 'Cortes'
    LIMIT 1;

    -- Si la categoría existe, insertamos los nuevos servicios
    IF v_category_id IS NOT NULL THEN
        INSERT INTO public.services (name, description, cost, commission, category_id, organization_id, incluye, opciones, imagen)
        VALUES 
            (
                'TAPER FADE', 
                'Degradado', 
                30.00, 
                12.00, 
                v_category_id, 
                v_organization_id, 
                'Limpieza de cejas , Diseño , Mascarilla , Lavado de cabello', 
                ARRAY['Low', 'Mid', 'High'], 
                'https://i.pinimg.com/236x/4a/ce/ce/c3/4acec31e3d3d987fbb14588362dbe0b7.jpg'
            ),
            (
                'MOHICANO', 
                'Degradado', 
                30.00, 
                12.00, 
                v_category_id, 
                v_organization_id, 
                'Limpieza de cejas , Diseño , Mascarilla , Lavado de cabello', 
                ARRAY['Low', 'Mid', 'High'], 
                'https://i.pinimg.com/236x/4a/ce/ce/c3/4acec31e3d3d987fbb14588362dbe0b7.jpg'
            ),
            (
                'MULLET', 
                'Degradado', 
                30.00, 
                12.00, 
                v_category_id, 
                v_organization_id, 
                'Limpieza de cejas , Diseño , Mascarilla , Lavado de cabello', 
                ARRAY['Low', 'Mid', 'High'], 
                'https://i.pinimg.com/236x/4a/ce/ce/c3/4acec31e3d3d987fbb14588362dbe0b7.jpg'
            ),
            (
                'BURST FADE', 
                'Degradado', 
                30.00, 
                12.00, 
                v_category_id, 
                v_organization_id, 
                'Limpieza de cejas , Diseño , Mascarilla , Lavado de cabello', 
                ARRAY['Low', 'Mid', 'High'], 
                'https://i.pinimg.com/236x/4a/ce/ce/c3/4acec31e3d3d987fbb14588362dbe0b7.jpg'
            )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
