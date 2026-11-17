import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./outbound.js", () => ({
  assertPublicDestination: async (raw: string) => ({ url: new URL(raw) }),
  pinnedRequest: vi.fn(),
}));

import { discoverMcpOAuth } from "./mcpAuth";
import { pinnedRequest } from "./outbound.js";

const issuer = "https://agent.qcc.com";
const resource = `${issuer}/mcp/company/stream`;
const resourceMetadata = `${issuer}/mcp/.well-known/oauth-protected-resource/company/stream`;
const authorizationMetadata = `${issuer}/.well-known/oauth-authorization-server`;
const request = vi.mocked(pinnedRequest);

function jsonResponse(body: unknown) {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

beforeEach(() => request.mockReset());

describe("Platform MCP OAuth discovery", () => {
  it("uses the official resource metadata directly and retries a transient read timeout", async () => {
    request
      .mockRejectedValueOnce(Object.assign(new Error("connect timed out"), { code: "ETIMEDOUT" }))
      .mockResolvedValueOnce(jsonResponse({ resource, authorization_servers: [issuer], scopes_supported: ["mcp:tools"] }))
      .mockResolvedValueOnce(jsonResponse({
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      }));

    const discovery = await discoverMcpOAuth({ url: resource });

    expect(discovery).toMatchObject({ issuer, resource, resourceMetadataUrl: resourceMetadata, scopes: ["mcp:tools"] });
    expect(request.mock.calls.map(([destination, options]) => [destination.url.href, options?.method])).toEqual([
      [resourceMetadata, "GET"],
      [resourceMetadata, "GET"],
      [authorizationMetadata, "GET"],
    ]);
  });

  it("keeps challenge discovery for a different service on the same origin", async () => {
    request.mockResolvedValue({ status: 404, headers: {}, body: "" });
    const sibling = `${resource}-other`;

    await expect(discoverMcpOAuth({ url: sibling })).rejects.toMatchObject({ code: "MCP_OAUTH_UNSUPPORTED" });
    expect(request.mock.calls[0]?.[0].url.href).toBe(sibling);
    expect(request.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(request.mock.calls.some(([destination]) => destination.url.href === resourceMetadata)).toBe(false);
  });
});
