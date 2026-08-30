import crypto from "crypto";

export interface KeyPair {
  kid: string;
  privateKey: string;
  publicKey: string;
  jwk: Record<string, string>;
}

// In-memory key store
let primaryKey: KeyPair | null = null;
let previousKey: KeyPair | null = null;

function extractJwk(publicKeyPem: string, kid: string): Record<string, string> {
  const key = crypto.createPublicKey(publicKeyPem);
  const jwk = key.export({ format: "jwk" }) as Record<string, string>;
  return {
    ...jwk,
    kid,
    alg: "RS256",
    use: "sig",
  };
}

function loadOrGenerateKey(envPriv: string | undefined, kidFallback: string): KeyPair {
  if (envPriv) {
    const pub = crypto.createPublicKey(envPriv).export({ type: "spki", format: "pem" });
    return {
      kid: kidFallback,
      privateKey: envPriv,
      publicKey: pub as string,
      jwk: extractJwk(pub as string, kidFallback),
    };
  }

  // Generate ephemeral keys for local dev
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return {
    kid: kidFallback,
    privateKey: privateKey as string,
    publicKey: publicKey as string,
    jwk: extractJwk(publicKey as string, kidFallback),
  };
}

export function initializeKeys() {
  if (primaryKey) return; // Already initialized

  if (process.env.NODE_ENV === "production") {
    if (!process.env.JWT_PRIVATE_KEY) {
      throw new Error("CRITICAL SECURITY INVARIANT VIOLATION: Production requires JWT_PRIVATE_KEY.");
    }
  }

  primaryKey = loadOrGenerateKey(process.env.JWT_PRIVATE_KEY, "primary-key-v1");
  
  if (process.env.JWT_PREVIOUS_PRIVATE_KEY) {
    previousKey = loadOrGenerateKey(process.env.JWT_PREVIOUS_PRIVATE_KEY, "previous-key-v1");
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
  const keys = [primaryKey!.jwk];
  if (previousKey) keys.push(previousKey.jwk);
  return { keys };
}
