-- Zivvvo sync — re-expose the zivvvo schema to PostgREST.
--
-- 001 sets `pgrst.db_schemas = 'public, zivvvo'`, but an earlier troubleshooting
-- step (`alter role authenticator reset pgrst.db_schemas` / a dashboard toggle)
-- dropped `zivvvo` from the exposed set and wedged the schema cache:
--   GET /rest/v1/zivvvo/attempts -> 503 PGRST002
-- while /rest/v1/ still answers (401/200). Root cause is the schema missing
-- from the GUC, not the client or the tables.
--
-- STRICTLY ADDITIVE. Idempotent — safe to re-run.
alter role authenticator set pgrst.db_schemas = 'public, zivvvo';
notify pgrst, 'reload schema';