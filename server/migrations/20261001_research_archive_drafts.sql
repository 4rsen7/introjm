-- Archive draft studies without requiring a confirmed goal or changing study content.
-- Preserve the existing function signature, security context, access checks and grants.
CREATE OR REPLACE FUNCTION public.research_update_study(p_user_id uuid,p_study_id uuid,p_revision integer,p_title text,p_goal text,p_brief text,p_archive boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.research_studies;
BEGIN
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  PERFORM public.research_require_write(p_user_id,s.workspace_id);
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESEARCH_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR s.revision<>p_revision THEN RAISE EXCEPTION 'RESEARCH_CONFLICT'; END IF;

  IF p_archive THEN
    UPDATE public.research_studies SET archived_at=now(),revision=revision+1,updated_at=now()
      WHERE id=p_study_id RETURNING * INTO s;
    RETURN to_jsonb(s);
  END IF;

  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240 OR p_goal IS NULL OR length(btrim(p_goal)) NOT BETWEEN 1 AND 12000
    OR (p_brief IS NOT NULL AND length(p_brief)>30000) THEN RAISE EXCEPTION 'RESEARCH_INVALID_INPUT'; END IF;
  UPDATE public.research_studies SET title=btrim(p_title),goal=btrim(p_goal),brief=p_brief,revision=revision+1,
    archived_at=NULL,updated_at=now() WHERE id=p_study_id RETURNING * INTO s;
  SELECT * INTO s FROM public.research_studies WHERE id=p_study_id;
  RETURN to_jsonb(s);
END $$;
