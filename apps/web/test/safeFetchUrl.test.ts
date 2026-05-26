import { describe, it, expect } from "vitest";
import { assertPublicHttpUrl, SsrfBlockedError } from "@/lib/safeFetchUrl";

// regression: vendor-supplied webhook URLs must reject
// internal/loopback/CGNAT/link-local targets before Klaro's server
// `fetch()`s them. Both literal-IP and DNS-resolved private ranges
// must fail closed.

describe("assertPublicHttpUrl", () => {
  it("accepts a public https URL", async () => {
    await expect(
      assertPublicHttpUrl("https://example.com/webhook"),
    ).resolves.toBeUndefined();
  });

  it("rejects malformed URL", async () => {
    await expect(assertPublicHttpUrl("not-a-url")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it("rejects non-http scheme", async () => {
    await expect(
      assertPublicHttpUrl("file:///etc/passwd"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertPublicHttpUrl("javascript:alert(1)"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertPublicHttpUrl("gopher://internal.svc/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects userinfo in URL", async () => {
    await expect(
      assertPublicHttpUrl("https://user:pass@example.com/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects AWS IMDS literal IP", async () => {
    await expect(
      assertPublicHttpUrl(
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      ),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects loopback literal IP", async () => {
    await expect(
      assertPublicHttpUrl("http://127.0.0.1:6379/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertPublicHttpUrl("http://127.5.5.5/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects RFC1918 literal IPs", async () => {
    for (const ip of ["10.0.0.1", "172.16.5.5", "192.168.1.1"]) {
      await expect(assertPublicHttpUrl(`http://${ip}/`)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    }
  });

  it("rejects CGNAT literal IPs", async () => {
    await expect(
      assertPublicHttpUrl("http://100.64.1.1/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects IPv6 loopback + link-local", async () => {
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    await expect(
      assertPublicHttpUrl("http://[fe80::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(
      assertPublicHttpUrl("http://[fc00::1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects IPv4-mapped IPv6 to a private address", async () => {
    await expect(
      assertPublicHttpUrl("http://[::ffff:127.0.0.1]/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects domain that resolves to localhost", async () => {
    // localhost typically resolves to 127.0.0.1 / ::1
    await expect(
      assertPublicHttpUrl("http://localhost:5432/"),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
