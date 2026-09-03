import crypto from "crypto";

export interface KeyPair {
  kid: string;
  privateKey: string;
  publicKey: string;
  jwk: Record<string, string>;
}

let primaryKey: KeyPair | null = null;
let previousKey: KeyPair | null = null;

function extractJwk(publicKeyPem: string, kid: string): Record<string, string> {
  const key = crypto.createPublicKey(publicKeyPem);
  const jwk = key.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, kid, alg: "RS256", use: "sig" };
}

function loadKey(envPriv: string | undefined, kid: string): KeyPair {
  const trimmed = envPriv?.trim();
  if (!trimmed) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Production JWT key is missing for kid=${kid}`);
    }
    const generated = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return {
      kid,
      privateKey: generated.privateKey as string,
      publicKey: generated.publicKey as string,
      jwk: extractJwk(generated.publicKey as string, kid),
    };
  }

  const privKeyObj = crypto.createPrivateKey(trimmed);
  const publicKey = crypto.createPublicKey(privKeyObj).export({ type: "spki", format: "pem" }) as string;
  return { kid, privateKey: trimmed, publicKey, jwk: extractJwk(publicKey, kid) };
}

export function initializeKeys(): void {
  if (primaryKey) return;
  if (process.env.NODE_ENV === "production" && !process.env.JWT_PRIVATE_KEY) {
    throw new Error("CRITICAL SECURITY INVARIANT VIOLATION: Production requires JWT_PRIVATE_KEY.");
  }

  const primaryKid = process.env.JWT_KEY_ID || "primary-key-v1";
  primaryKey = loadKey(process.env.JWT_PRIVATE_KEY, primaryKid);

  if (process.env.JWT_PREVIOUS_PRIVATE_KEY) {
    const previousKid = process.env.JWT_PREVIOUS_KEY_ID || "previous-key-v1";
    previousKey = loadKey(process.env.JWT_PREVIOUS_PRIVATE_KEY, previousKid);
  }
}

export function getPrimaryPrivateKey(): { key: string; kid: string } {
  initializeKeys();
  return { key: primaryKey!.privateKey, kid: primaryKey!.kid };
}

export function getPublicKey(kid: string): string | null {
  initializeKeys();
  if (primaryKey?.kid === kid) return primaryKey.publicKey;
  if (previousKey?.kid === kid) return previousKey.publicKey;
  return null;
}

export function getJwks(): { keys: Record<string, string>[] } {
  initializeKeys();
  return { keys: [primaryKey!.jwk, ...(previousKey ? [previousKey.jwk] : [])] };
}
