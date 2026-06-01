-- I3 (launch audit 2026-06-01): make audit_logs truly append-only.
-- 0013 already revoked insert/update/delete from the `authenticated` role, but
-- appendAudit() writes via the SERVICE ROLE, which bypasses RLS *and* table
-- grants. So a compromised service key (or a buggy worker) could still UPDATE or
-- DELETE audit rows — an audit trail you can rewrite is not an audit trail.
--
-- A BEFORE UPDATE/DELETE trigger raises unconditionally, so the rows are
-- immutable even to the service role / table owner via normal DML. Inserts are
-- unaffected (append still works). Truncate is separately blocked.
create or replace function audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', TG_OP
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists audit_logs_no_update on audit_logs;
create trigger audit_logs_no_update
  before update on audit_logs
  for each row execute function audit_logs_immutable();

drop trigger if exists audit_logs_no_delete on audit_logs;
create trigger audit_logs_no_delete
  before delete on audit_logs
  for each row execute function audit_logs_immutable();

drop trigger if exists audit_logs_no_truncate on audit_logs;
create trigger audit_logs_no_truncate
  before truncate on audit_logs
  for each statement execute function audit_logs_immutable();

comment on function audit_logs_immutable is
  'I3: enforces audit_logs append-only by raising on any UPDATE/DELETE/TRUNCATE, even for the service role.';
