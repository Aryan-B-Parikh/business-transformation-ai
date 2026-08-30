import dns from "dns/promises";
import net from "net";

export function isPrivateOrReservedIp(ip: string): boolean {
  let clean = ip.toLowerCase();
  if (clean.startsWith("::ffff:")) clean = clean.slice(7);
  const version = net.isIP(clean);
  if (version === 4) {
    const p = clean.split(".").map(Number); if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && p[2] === 0) ||
      (a === 192 && b === 0 && p[2] === 2) || (a === 192 && b === 168) || (a === 198 && b === 18) ||
      (a === 198 && b === 19) || (a === 198 && b === 51 && p[2] === 100) || (a === 203 && b === 0 && p[2] === 113) ||
      a >= 224;
  }
  if (version === 6) {
    const n = clean.replace(/^\[|\]$/g, "");
    return n === "::" || n === "::1" || n.startsWith("fc") || n.startsWith("fd") ||
      /^(fe[89a-f])/.test(n) || n.startsWith("ff") || n.startsWith("2001:db8:") || n.startsWith("::ffff:");
  }
  return true;
}

export async function validateSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password || parsed.port === "0") return false;
    const hostname = parsed.hostname;
    if (net.isIP(hostname)) return !isPrivateOrReservedIp(hostname);
    const [a, aaaa] = await Promise.all([dns.resolve4(hostname).catch(() => []), dns.resolve6(hostname).catch(() => [])]);
    const ips = [...a, ...aaaa];
    return ips.length > 0 && ips.every(ip => !isPrivateOrReservedIp(ip));
  } catch { return false; }
}
