-- Deterministic relational fixtures required by API integration/E2E tests.
-- Authentication remains test-seeded in apps/api/src/auth/users.ts; these rows
-- satisfy real PostgreSQL foreign keys and RLS policies.
INSERT INTO organizations (id, name, plan)
VALUES
  ('00000000-0000-0000-0000-0000000000aa', 'Org A', 'trial'),
  ('00000000-0000-0000-0000-0000000000bb', 'Org B', 'trial')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan;

INSERT INTO users (id, org_id, email, name, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000aa', 'org_admin@org-a.com', 'Org Admin A', 'org_admin'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000aa', 'workspace_admin@org-a.com', 'WS Admin A', 'workspace_admin'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-0000000000bb', 'org_admin@org-b.com', 'Org Admin B', 'org_admin')
ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role;
