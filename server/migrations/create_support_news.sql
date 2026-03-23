CREATE TABLE IF NOT EXISTS public.support_news (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  summary text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  cover_image_url text,
  tone text NOT NULL DEFAULT 'cobalt' CHECK (tone IN ('cobalt', 'emerald', 'amber', 'rose')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.support_news_views (
  news_id uuid NOT NULL REFERENCES public.support_news(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (news_id, user_id)
);

CREATE INDEX IF NOT EXISTS support_news_status_idx ON public.support_news(status);
CREATE INDEX IF NOT EXISTS support_news_published_idx ON public.support_news(pinned, published_at DESC);
CREATE INDEX IF NOT EXISTS support_news_views_user_idx ON public.support_news_views(user_id, viewed_at DESC);

CREATE OR REPLACE FUNCTION public.sync_support_news_timestamps()
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

DROP TRIGGER IF EXISTS support_news_sync_timestamps ON public.support_news;
CREATE TRIGGER support_news_sync_timestamps
BEFORE INSERT OR UPDATE ON public.support_news
FOR EACH ROW
EXECUTE FUNCTION public.sync_support_news_timestamps();

ALTER TABLE public.support_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_news_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view published support news" ON public.support_news;
CREATE POLICY "Authenticated users can view published support news"
ON public.support_news FOR SELECT
USING (
  status = 'published'
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can insert support news" ON public.support_news;
CREATE POLICY "Admins can insert support news"
ON public.support_news FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update support news" ON public.support_news;
CREATE POLICY "Admins can update support news"
ON public.support_news FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can delete support news" ON public.support_news;
CREATE POLICY "Admins can delete support news"
ON public.support_news FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Users can view own support news views" ON public.support_news_views;
CREATE POLICY "Users can view own support news views"
ON public.support_news_views FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Users can insert own support news views" ON public.support_news_views;
CREATE POLICY "Users can insert own support news views"
ON public.support_news_views FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own support news views" ON public.support_news_views;
CREATE POLICY "Users can update own support news views"
ON public.support_news_views FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
