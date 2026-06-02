-- #15 (build pass 2026-06-02): privacy soft-delete + AML retention countdown.
-- deleteMyAccountAction previously only wrote a "[SIMULATED]" audit line. Now it
-- soft-deletes the vendor and starts a retention deadline; a daemon purge can
-- hard-delete/anonymize after aml_retention_until (AML hold).
alter table vendors add column if not exists deleted_at timestamptz;
alter table vendors add column if not exists aml_retention_until timestamptz;

comment on column vendors.deleted_at is '#15: account soft-deleted at this instant; row purged/anonymized after aml_retention_until.';
comment on column vendors.aml_retention_until is '#15: hard-delete/anonymize allowed after this instant (AML hold). Set on deletion request.';
