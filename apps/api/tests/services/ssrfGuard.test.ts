import { describe, it, expect } from "vitest";
import { isPrivateOrReservedIp, validateSafeWebhookUrl } from "../../src/services/webhook/ssrfGuard";

describe("Phase 6: Deep SSRF & DNS-Rebinding Protection", () => {
  it("blocks IPv4 loopback (127.0.0.1 and 127.0.0.0/8)", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("127.1.2.3")).toBe(true);
  });

  it("blocks RFC1918 private subnets (10.x, 172.16.x, 192.168.x)", () => {
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });

  it("blocks AWS/Azure/GCP cloud metadata IP (169.254.169.254)", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });

  it("blocks CGNAT range (100.64.0.0/10)", () => {
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("100.127.255.255")).toBe(true);
  });

  it("blocks IPv6 loopback, ULA, and link-local", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows valid public IP addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
  });

  it("validateSafeWebhookUrl rejects localhost and private destinations", async () => {
    expect(await validateSafeWebhookUrl("http://localhost/webhook")).toBe(false);
    expect(await validateSafeWebhookUrl("http://127.0.0.1:8080/hook")).toBe(false);
    expect(await validateSafeWebhookUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(await validateSafeWebhookUrl("ftp://example.com/webhook")).toBe(false);
  });
});
