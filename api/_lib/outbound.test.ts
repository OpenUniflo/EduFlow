import { afterEach, describe, expect, it } from "vitest";
import { assertPublicDestination, publicHttpUrl } from "./outbound";

const original = process.env.MCP_ALLOW_LOCAL_FIXTURES;
afterEach(() => { if (original === undefined) delete process.env.MCP_ALLOW_LOCAL_FIXTURES; else process.env.MCP_ALLOW_LOCAL_FIXTURES = original; });

describe("MCP outbound destination policy", () => {
  it("rejects private, loopback, metadata, credentials and non-HTTPS URLs", async () => {
    for (const url of ["http://example.com/mcp", "https://127.0.0.1/mcp", "https://10.0.0.1/mcp", "https://169.254.169.254/latest", "https://[::1]/mcp", "https://user:pass@example.com/mcp", "https://example.com/mcp#fragment"]) {
      await expect(assertPublicDestination(url)).rejects.toThrow();
    }
  });

  it("normalizes every IPv4-mapped and IPv4-compatible IPv6 spelling", async () => {
    for (const url of [
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:7f00:1]/",
      "https://[::ffff:169.254.169.254]/",
      "https://[::ffff:a9fe:a9fe]/",
      "https://[::7f00:1]/",
      "https://[::a9fe:a9fe]/",
    ]) {
      await expect(assertPublicDestination(url)).rejects.toThrow();
    }
  });

  it("rejects IPv6 reserved, documentation, transition and non-global ranges", async () => {
    for (const url of [
      "https://[::]/", "https://[fe80::1]/", "https://[fc00::1]/", "https://[fd12:3456::1]/",
      "https://[ff02::1]/", "https://[2001:db8::1]/", "https://[3fff::1]/",
      "https://[64:ff9b::7f00:1]/", "https://[2002:7f00:1::]/", "https://[2001::1]/",
    ]) {
      await expect(assertPublicDestination(url)).rejects.toThrow();
    }
  });

  it("keeps a globally routable IPv6 literal allowed", async () => {
    const checked = await assertPublicDestination("https://[2606:4700:4700::1111]/mcp");
    expect(checked.address.toLowerCase()).toContain("2606:4700");
    expect(checked.family).toBe(6);
  });

  it("allows a public HTTPS IP literal without network access", async () => {
    const checked = await assertPublicDestination("https://93.184.216.34/mcp");
    expect(checked.address).toBe("93.184.216.34");
    expect(checked.url.pathname).toBe("/mcp");
  });

  it("only enables loopback HTTP for explicit local fixtures", async () => {
    delete process.env.MCP_ALLOW_LOCAL_FIXTURES;
    await expect(assertPublicDestination("http://127.0.0.1:19090/mcp")).rejects.toThrow();
    process.env.MCP_ALLOW_LOCAL_FIXTURES = "1";
    const checked = await assertPublicDestination("http://127.0.0.1:19090/mcp");
    expect(checked.url.hostname).toBe("127.0.0.1");
  });

  it("only projects HTTP(S) URLs without credentials or fragments", () => {
    expect(publicHttpUrl("https://example.com/mcp")?.hostname).toBe("example.com");
    expect(publicHttpUrl("http://127.0.0.1:19090/mcp")?.port).toBe("19090");
    expect(publicHttpUrl("ftp://example.com/mcp")).toBeNull();
    expect(publicHttpUrl("https://user@example.com/mcp")).toBeNull();
    expect(publicHttpUrl("https://example.com/mcp#x")).toBeNull();
  });
});
