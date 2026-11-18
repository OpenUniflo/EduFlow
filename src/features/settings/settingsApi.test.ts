import { describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/apiClient", () => ({ apiRequest }));

import { updateDisplayName } from "./settingsApi";

describe("settings display name API", () => {
  it("writes through the learner profile resource instead of the knowledge graph", async () => {
    apiRequest.mockResolvedValue({ displayName: "新名字" });

    await expect(updateDisplayName("新名字")).resolves.toBe("新名字");
    expect(apiRequest).toHaveBeenCalledWith("/api/learner?resource=profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "新名字" })
    });
  });
});
