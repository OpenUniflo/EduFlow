import type { VercelRequest, VercelResponse } from "@vercel/node";

export type ApiHandler = (request: VercelRequest, response: VercelResponse) => Promise<void> | void;

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function json(response: VercelResponse, status: number, body: unknown) {
  response.status(status).json(body);
}

export function methodNotAllowed(response: VercelResponse, allowed: string[]) {
  response.setHeader("Allow", allowed.join(", "));
  json(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } });
}

export function handleApi(handler: ApiHandler): ApiHandler {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      if (error instanceof ApiError) {
        json(response, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      console.error("API request failed", error instanceof Error ? error.message : "Unknown error");
      json(response, 500, { error: { code: "internal_error", message: "Internal server error" } });
    }
  };
}

export function bearerToken(request: VercelRequest) {
  const value = request.headers.authorization;
  const match = typeof value === "string" ? /^Bearer\s+(.+)$/i.exec(value) : null;
  if (!match) throw new ApiError(401, "unauthorized", "A valid session is required");
  return match[1];
}
