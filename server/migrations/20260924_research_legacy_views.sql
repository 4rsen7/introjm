-- Apply AFTER 20260924_research_core.sql, before PRODUCT_SCOPE_ENABLED=true.
-- PostgreSQL 15+ is required for security_invoker. These service-only views
-- scope legacy route reads, updates and deletes, including broad user-id queries.
BEGIN;

DO $$
DECLARE
    table_name text;
    predicate text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'workspaces', 'plans', 'subscriptions',
        'workspace_members', 'workspace_invites', 'interviews', 'interview_folders',
        'journeys', 'personas', 'portraits', 'metrics',
        'workspace_period_usage', 'workspace_usage_counters'
    ] LOOP
        IF to_regclass('public.' || table_name) IS NULL THEN
            RAISE EXCEPTION 'Required legacy table public.% is missing; reconcile schema before enabling Research', table_name;
        END IF;
        IF table_name IN ('workspaces', 'plans', 'subscriptions') THEN
            predicate := 'product_key = ''iterojm''';
        ELSE
            predicate := 'workspace_id IS NULL OR workspace_id IN (SELECT id FROM public.workspaces WHERE product_key = ''iterojm'')';
        END IF;
        -- There is only one table in FROM, preserving automatic updatability.
        EXECUTE format(
            'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true, security_barrier = true) AS SELECT * FROM public.%I WHERE %s WITH LOCAL CHECK OPTION',
            'iterojm_' || table_name, table_name, predicate
        );
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', 'iterojm_' || table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', 'iterojm_' || table_name);
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
