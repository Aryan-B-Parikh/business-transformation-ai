/**
 * User store — TASK-003
 * Seeded users for tests and local dev. Production would query Postgres via Prisma
 * with tenant isolation (org_id). For unit/integration tests we use an in-memory
 * map so tests run without a DB. Passwords are bcrypt-hashed.
 */

import bcrypt from "bcryptjs";

// Fixed UUIDs for deterministic tests (valid UUID v4-like)
export const ORG_A = "00000000-0000-0000-0000-0000000000aa";
export const ORG_B = "00000000-0000-0000-0000-0000000000bb";

export interface SeedUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string;
  ssoProvider?: string;
}

// Plain password for all seeded users: password123
const PLAIN = "password123";
const HASH = bcrypt.hashSync(PLAIN, 10);

export const SEED_USERS: SeedUser[] = [
  { id: "11111111-1111-1111-1111-111111111111", orgId: ORG_A, email: "org_admin@org-a.com", name: "Org Admin A", role: "org_admin", passwordHash: HASH },
  { id: "22222222-2222-2222-2222-222222222222", orgId: ORG_A, email: "workspace_admin@org-a.com", name: "WS Admin A", role: "workspace_admin", passwordHash: HASH },
  { id: "33333333-3333-3333-3333-333333333333", orgId: ORG_A, email: "contributor@org-a.com", name: "Contributor A", role: "contributor", passwordHash: HASH },
  { id: "44444444-4444-4444-4444-444444444444", orgId: ORG_A, email: "reviewer@org-a.com", name: "Reviewer A", role: "reviewer", passwordHash: HASH },
  { id: "55555555-5555-5555-5555-555555555555", orgId: ORG_A, email: "viewer@org-a.com", name: "Viewer A", role: "viewer", passwordHash: HASH },
  // Cross-tenant user for isolation tests
  { id: "66666666-6666-6666-6666-666666666666", orgId: ORG_B, email: "org_admin@org-b.com", name: "Org Admin B", role: "org_admin", passwordHash: HASH },
  // SSO user (no password, has ssoProvider)
  { id: "77777777-7777-7777-7777-777777777777", orgId: ORG_A, email: "sso_user@org-a.com", name: "SSO User", role: "contributor", passwordHash: HASH, ssoProvider: "azure_ad" },
];

const byEmail = new Map<string, SeedUser>(SEED_USERS.map((u) => [`${u.orgId}:${u.email.toLowerCase()}`, u]));
const byId = new Map<string, SeedUser>(SEED_USERS.map((u) => [u.id, u]));

// Also allow lookup by email alone (assumes unique across orgs for test convenience)
const byEmailOnly = new Map<string, SeedUser>(SEED_USERS.map((u) => [u.email.toLowerCase(), u]));

export function findUserByEmail(email: string, orgId?: string): SeedUser | undefined {
  if (orgId) {
    const v = byEmail.get(`${orgId}:${email.toLowerCase()}`);
    if (v) return v;
  }
  return byEmailOnly.get(email.toLowerCase());
}

export function findUserById(id: string): SeedUser | undefined {
  return byId.get(id);
}

export async function verifyPassword(user: SeedUser, plain: string): Promise<boolean> {
  return bcrypt.compare(plain, user.passwordHash);
}

export function listUsersByOrg(orgId: string): SeedUser[] {
  return SEED_USERS.filter((u) => u.orgId === orgId);
}

export function getSeedPlainPassword(): string {
  return PLAIN;
}
