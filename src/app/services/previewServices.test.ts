import { describe, expect, it } from "vitest";
import { previewApplicationServices, createPreviewApplicationServices } from "./previewServices";

describe("Feature Preview injection", () => {
  it("binds a preview source through the same people contract", async () => {
    const repository = previewApplicationServices.peopleRepository;
    expect(repository.kind).toBe("preview");
    const people = await repository.listFollowed("real-user-id");
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((person) => person.sample)).toBe(true);
    expect(people.every((person) => person.displayName.includes("示例"))).toBe(true);
    expect(await repository.getPerson("real-user-id", people[0]!.id)).toMatchObject({ id: people[0]!.id, sample: true });
    expect(await repository.getPerson("real-user-id", "not-a-sample")).toBeNull();
  });

  it("refuses every durable write and never silently mutates the sample set", async () => {
    const repository = createPreviewApplicationServices().peopleRepository;
    await expect(repository.follow("real-user-id", "preview-person-aqing")).rejects.toMatchObject({ code: "preview_read_only" });
    await expect(repository.unfollow("real-user-id", "preview-person-aqing")).rejects.toMatchObject({ code: "preview_read_only" });
    await expect(repository.setVisibility("real-user-id", "preview-person-aqing", "private")).rejects.toMatchObject({ code: "preview_read_only" });
    const after = await repository.listFollowed("real-user-id");
    expect(after.map((person) => person.visibility)).toEqual(["public", "private"]);
  });
});
