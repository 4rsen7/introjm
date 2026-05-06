CREATE TABLE IF NOT EXISTS public.learning_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL,
  locale text NOT NULL DEFAULT 'uk' CHECK (locale IN ('uk', 'en')),
  title text NOT NULL,
  subtitle text,
  excerpt text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Playbook',
  cover_image_url text,
  author_name text NOT NULL DEFAULT 'IteroJM Team',
  reading_time_minutes integer CHECK (reading_time_minutes IS NULL OR reading_time_minutes > 0),
  hero_tone text NOT NULL DEFAULT 'cobalt' CHECK (hero_tone IN ('cobalt', 'emerald', 'amber', 'rose')),
  body_html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_materials_status_idx ON public.learning_materials(status);
CREATE UNIQUE INDEX IF NOT EXISTS learning_materials_slug_locale_uidx ON public.learning_materials(slug, locale);
CREATE INDEX IF NOT EXISTS learning_materials_locale_status_idx ON public.learning_materials(locale, status, featured, sort_order, published_at DESC);
CREATE INDEX IF NOT EXISTS learning_materials_featured_idx ON public.learning_materials(featured, published_at DESC);
CREATE INDEX IF NOT EXISTS learning_materials_sort_order_idx ON public.learning_materials(sort_order, published_at DESC);

CREATE OR REPLACE FUNCTION public.sync_learning_material_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = timezone('utc'::text, now());
  ELSIF NEW.status = 'draft' THEN
    NEW.published_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_materials_sync_timestamps ON public.learning_materials;
CREATE TRIGGER learning_materials_sync_timestamps
BEFORE INSERT OR UPDATE ON public.learning_materials
FOR EACH ROW
EXECUTE FUNCTION public.sync_learning_material_timestamps();

ALTER TABLE public.learning_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view published learning materials" ON public.learning_materials;
CREATE POLICY "Authenticated users can view published learning materials"
ON public.learning_materials FOR SELECT
USING (
  status = 'published'
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can insert learning materials" ON public.learning_materials;
CREATE POLICY "Admins can insert learning materials"
ON public.learning_materials FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update learning materials" ON public.learning_materials;
CREATE POLICY "Admins can update learning materials"
ON public.learning_materials FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can delete learning materials" ON public.learning_materials;
CREATE POLICY "Admins can delete learning materials"
ON public.learning_materials FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

NOTIFY pgrst, 'reload schema';
