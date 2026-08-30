-- Create the restricted application role for the application to use
CREATE ROLE bta_app WITH LOGIN PASSWORD 'bta_app_password';

-- Revoke all by default to be safe
REVOKE ALL PRIVILEGES ON DATABASE bta_test FROM bta_app;

-- Grant connect and schema usage
GRANT CONNECT ON DATABASE bta_test TO bta_app;
GRANT USAGE, CREATE ON SCHEMA public TO bta_app;

-- Wait, Prisma migrate deploy requires schema modification permissions.
-- We will run migrations as "postgres" (superuser).
-- But the application will connect as "bta_app".
-- We need to ensure that "bta_app" can access all tables created in the public schema by "postgres".

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bta_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bta_app;

-- NOTE: "bta_app" is intentionally NOT a superuser and does NOT have BYPASSRLS.
-- This guarantees that Row-Level Security policies will be enforced against it.
