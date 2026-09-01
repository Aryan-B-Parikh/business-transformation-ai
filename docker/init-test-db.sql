-- Restricted application role for runtime tests.
-- Migrations are executed separately with the postgres administrator.
CREATE ROLE bta_app WITH LOGIN PASSWORD 'bta_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

REVOKE ALL PRIVILEGES ON DATABASE bta_test FROM bta_app;
GRANT CONNECT ON DATABASE bta_test TO bta_app;
GRANT USAGE ON SCHEMA public TO bta_app;

-- Migrations run as postgres, so explicitly grant runtime DML privileges after
-- migration in CI. These defaults also cover objects created by the postgres
-- role in environments that use this init script before migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bta_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bta_app;

-- Deliberately no SUPERUSER, CREATEDB, CREATEROLE, or BYPASSRLS.
