import { afterEach, describe, expect, it } from "vitest";
import { oauthCallbackUrl } from "./mcpAuth";

const original = process.env.MCP_PUBLIC_ORIGIN;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
afterEach(() => {
  if (original === undefined) delete process.env.MCP_PUBLIC_ORIGIN; else process.env.MCP_PUBLIC_ORIGIN = original;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("MCP OAuth callback origin", () => {
  it("uses the configured public origin when present", () => {
    process.env.MCP_PUBLIC_ORIGIN = "https://eduflow.example.com/";
    expect(oauthCallbackUrl({ headers: {} } as never)).toBe("https://eduflow.example.com/api/workflows?resource=mcp-auth&op=callback");
  });

  it("never trusts a forwarded host when the public origin is not configured", () => {
    delete process.env.MCP_PUBLIC_ORIGIN;
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    expect(() => oauthCallbackUrl({ headers: { "x-forwarded-proto": "https", "x-forwarded-host": "preview.example.com", host: "preview.example.com" } } as never)).toThrow();
  });

  it("allows a loopback host only for local development", () => {
    delete process.env.MCP_PUBLIC_ORIGIN;
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    expect(oauthCallbackUrl({ headers: { host: "127.0.0.1:5173" } } as never)).toBe("http://127.0.0.1:5173/api/workflows?resource=mcp-auth&op=callback");
    process.env.NODE_ENV = "production";
    expect(() => oauthCallbackUrl({ headers: { host: "127.0.0.1:5173" } } as never)).toThrow();
  });

  it("rejects a configured origin with a path or query", () => {
    process.env.MCP_PUBLIC_ORIGIN = "https://eduflow.example.com/path";
    expect(() => oauthCallbackUrl({ headers: {} } as never)).toThrow();
  });
});
