ALTER TABLE public.learning_materials
ADD COLUMN IF NOT EXISTS locale text;

UPDATE public.learning_materials
SET locale = 'uk'
WHERE locale IS NULL OR locale = '';

ALTER TABLE public.learning_materials
ALTER COLUMN locale SET DEFAULT 'uk',
ALTER COLUMN locale SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'learning_materials_locale_check'
      AND conrelid = 'public.learning_materials'::regclass
  ) THEN
    ALTER TABLE public.learning_materials
    ADD CONSTRAINT learning_materials_locale_check CHECK (locale IN ('uk', 'en'));
  END IF;
END;
$$;

ALTER TABLE public.support_news
ADD COLUMN IF NOT EXISTS locale text;

UPDATE public.support_news
SET locale = 'uk'
WHERE locale IS NULL OR locale = '';

ALTER TABLE public.support_news
ALTER COLUMN locale SET DEFAULT 'uk',
ALTER COLUMN locale SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_news_locale_check'
      AND conrelid = 'public.support_news'::regclass
  ) THEN
    ALTER TABLE public.support_news
    ADD CONSTRAINT support_news_locale_check CHECK (locale IN ('uk', 'en'));
  END IF;
END;
$$;

ALTER TABLE public.learning_materials
DROP CONSTRAINT IF EXISTS learning_materials_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS learning_materials_slug_locale_uidx
ON public.learning_materials(slug, locale);

CREATE INDEX IF NOT EXISTS learning_materials_locale_status_idx
ON public.learning_materials(locale, status, featured, sort_order, published_at DESC);

CREATE INDEX IF NOT EXISTS support_news_locale_status_idx
ON public.support_news(locale, status, pinned, published_at DESC);

NOTIFY pgrst, 'reload schema';
