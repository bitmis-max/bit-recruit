-- Harden EXECUTE grants on public functions (Supabase security advisor:
-- anon_security_definer_function_executable).
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default and Postgres grants it to PUBLIC; earlier migrations only revoked
-- from PUBLIC for some functions. Rules after this migration:
--   * anon may execute only submit_application and get_application_by_token.
--   * trigger functions are not callable through the API at all (triggers
--     still fire: EXECUTE is not checked when a trigger runs).
--   * other functions stay executable by authenticated (RLS policies and the
--     app's RPC calls need them) and service_role.
begin;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname, p.prorettype
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.prorettype = 'trigger'::regtype then
      execute format('revoke execute on function %s from authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname in ('submit_application', 'get_application_by_token') then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    end if;
  end loop;
end $$;

-- New functions created later by this role are not callable by anon unless a
-- migration grants it explicitly.
alter default privileges in schema public revoke execute on functions from anon;

commit;
