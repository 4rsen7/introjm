# Supabase migrations

Виконання міграцій: **Supabase Dashboard → SQL Editor** — вставте вміст файлу міграції та натисніть Run.

## 20250214_fix_workspace_members_rls.sql

Усуває помилку **infinite recursion** на `workspace_members`. Безпека: без `USING (true)`, один INSERT (owner або invited), усі виклики `auth.uid()`/`auth.jwt()` обгорнуті в `(select ...)` для продуктивності.

## 20250215_rls_workspace_content_for_members.sql

Дозволяє **учасникам воркспейсу** читати контент через функцію `is_workspace_accessible(ws_id)` (SECURITY DEFINER). Виправлення для лінтера: один SELECT на таблицю (drop дубльованих `*_owner_access`), `auth.uid()` у `(select auth.uid())`. Для політик **system_logs** та **workspace_invites** у Dashboard у виразі політики замініть `auth.uid()` на `(select auth.uid())` та `auth.jwt()` на `(select auth.jwt())`.

Переконайтесь, що на бекенді використовується **service_role** ключ (`SUPABASE_SERVICE_KEY` у `.env`).
