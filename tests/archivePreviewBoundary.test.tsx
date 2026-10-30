// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PreviewReadOnlyError } from "@/features/profile/people/PeopleRepository";
import { PreviewPeopleRepository } from "@/demo/preview/people/PreviewPeopleRepository";
import { ArchivePeopleBar } from "@/features/archive/components/ArchivePeopleBar";
import { GuestAssistantCard } from "@/features/archive/components/ArchiveAssistantPanel";

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

function firstSharedStatus(people: readonly { sharedKnowledgeStatuses?: Record<string, string> }[]) {
  for (const person of people) {
    const values = Object.values(person.sharedKnowledgeStatuses ?? {});
    if (values.length) return values[0];
  }
  return undefined;
}

describe("Archive social preview boundary", () => {
  it("is a read-only sample source bound to real Knowledge IDs without mutating the sample dataset", async () => {
    const repository = new PreviewPeopleRepository();
    const nodeIds = Array.from({ length: 60 }, (_, index) => `K${index}`);
    repository.bindKnowledgeNodeIds(nodeIds);
    const first = await repository.listFollowed("owner");
    const second = await repository.listFollowed("owner");
    expect(first.every((person) => person.sample)).toBe(true);
    expect(first.every((person) => person.sharedKnowledgeIds?.every((id) => nodeIds.includes(id)))).toBe(true);
    expect(first.map((person) => person.sharedKnowledgeIds)).toEqual(second.map((person) => person.sharedKnowledgeIds));
    await expect(repository.follow("owner", "p1")).rejects.toBeInstanceOf(PreviewReadOnlyError);
    await expect(repository.unfollow("owner", "p1")).rejects.toBeInstanceOf(PreviewReadOnlyError);
    await expect(repository.setVisibility("owner", "p1", "private")).rejects.toBeInstanceOf(PreviewReadOnlyError);
    expect(repository.kind).toBe("preview");
  });

  it("marks every social region as preview and uses obviously sample identities", async () => {
    const repository = new PreviewPeopleRepository();
    repository.bindKnowledgeNodeIds(Array.from({ length: 40 }, (_, index) => `K${index}`));
    const people = await repository.listFollowed("owner");
    const bar = renderToStaticMarkup(<ArchivePeopleBar sessionName="P3" people={people} selectedIds={[people[0].id]} onToggleMe={() => {}} onTogglePerson={() => {}} onOpenPeople={() => {}} onOpenSearch={() => {}} />);
    expect(bar).toContain("预览 · 示例数据");
    expect(bar).toContain("示例");
    expect(bar).toContain('data-preview="sample"');
    expect(firstSharedStatus(people)).toBeDefined();
    const fullBar = renderToStaticMarkup(<ArchivePeopleBar sessionName="P3" people={people} selectedIds={people.slice(0, 3).map((person) => person.id)} onToggleMe={() => {}} onTogglePerson={() => {}} onOpenPeople={() => {}} onOpenSearch={() => {}} />);
    expect(fullBar).toContain("预览 · 示例数据");
    expect(fullBar).toContain('aria-pressed="true"');
    const guest = renderToStaticMarkup(<GuestAssistantCard onLogin={() => {}} onRegister={() => {}} />);
    expect(guest).toContain("登录后可使用助手");
    expect(guest).toContain("登录");
  });

  it("keeps feature code on the injected contract, never importing demo or writing social state", () => {
    const files = [
      "src/features/archive/components/ArchivePeopleBar.tsx",
      "src/features/archive/components/ArchiveSocialDialogs.tsx",
      "src/features/archive/pages/ArchivePage.tsx"
    ];
    const feature = files.map(source).join("\n");
    expect(feature).not.toMatch(/from ["'][^"']*demo\//);
    expect(feature).toContain("applicationServices.preview");
    expect(source("src/app/services/previewServices.ts")).toContain("PreviewPeopleRepository");
    expect(source("src/demo/preview/people/PreviewPeopleRepository.ts")).toContain("PreviewReadOnlyError");
    expect(source("src/features/archive/components/ArchiveSocialDialogs.tsx")).not.toContain(".follow(");
  });
});
