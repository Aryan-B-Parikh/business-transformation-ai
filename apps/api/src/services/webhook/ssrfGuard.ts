import dns from "dns/promises";
import net from "net";

/**
 * Validates whether an IP address belongs to private/reserved ranges
 * Blocks:
 *  - 0.0.0.0/8
 *  - 127.0.0.0/8 (loopback)
 *  - 10.0.0.0/8 (RFC 1918)
 *  - 172.16.0.0/12 (RFC 1918)
 *  - 192.168.0.0/16 (RFC 1918)
 *  - 169.254.0.0/16 (link-local & AWS/Azure cloud metadata)
 *  - 100.64.0.0/10 (CGNAT)
 *  - ::1 (IPv6 loopback)
 *  - fc00::/7 (IPv6 ULA)
 *  - fe80::/10 (IPv6 link-local)
 *  - IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1)
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6
  let cleanIp = ip.toLowerCase();
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.substring(7);
  }

  const version = net.isIP(cleanIp);
  if (version === 4) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4) return true;

    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
  }

  if (version === 6) {
    if (cleanIp === "::1" || cleanIp === "::") return true;
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // fc00::/7 ULA
    if (cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) {
      return true; // fe80::/10 link-local
    }
    return false;
  }

  return true; // Invalid format treated as unsafe
}

/**
 * Deep SSRF & DNS-Rebinding Protection:
 * Resolves both A and AAAA records and verifies that EVERY resolved IP address is public.
 */
export async function validateSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname;

    // Check if hostname is direct IP literal
    if (net.isIP(hostname)) {
      return !isPrivateOrReservedIp(hostname);
    }

    // Resolve DNS records (A & AAAA)
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);

    const allIps = [...ipv4Addresses, ...ipv6Addresses];
    if (allIps.length === 0) {
      return false; // Could not resolve
    }

    // Ensure all resolved IPs are public / safe
    for (const ip of allIps) {
      if (isPrivateOrReservedIp(ip)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
