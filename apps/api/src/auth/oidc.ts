/**
 * OIDC id_token verification — RS256 via jose JWKS when OIDC_JWKS_URL set, fallback to local JWT.
 */
import { verifyToken as verifyJwt } from "./jwt";

export interface OidcClaims {
  sub: string;
  email?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
}

export async function verifyIdToken(idToken: string, expectedIssuer?: string, expectedAudience?: string): Promise<OidcClaims> {
  const jwksUrl = process.env.OIDC_JWKS_URL;
  if (jwksUrl) {
    try {
      const { createRemoteJWKSet, jwtVerify } = await import("jose");
      const JWKS = createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(idToken, JWKS, { issuer: expectedIssuer, audience: expectedAudience });
      return payload as unknown as OidcClaims;
    } catch (e) {
      throw new Error(`OIDC JWKS verification failed: ${String((e as Error).message)}`);
    }
  }
  const payload = verifyJwt(idToken) as unknown as OidcClaims & { orgId?: string };
  if (expectedIssuer && payload.iss !== expectedIssuer) throw new Error(`Invalid issuer: ${payload.iss}`);
  if (expectedAudience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(expectedAudience)) throw new Error(`Invalid audience: ${payload.aud}`);
  }
  return payload as OidcClaims;
}
