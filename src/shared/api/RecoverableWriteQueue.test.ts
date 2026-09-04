import { describe, expect, it, vi } from "vitest";
import { RecoverableWriteQueue } from "./RecoverableWriteQueue";

describe("RecoverableWriteQueue", () => {
  it("cancels queued work from an expired authenticated generation", async () => {
    const queue = new RecoverableWriteQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const staleQueuedWrite = vi.fn(async () => undefined);
    queue.enqueue(() => gate);
    queue.enqueue(staleQueuedWrite);
    await Promise.resolve();

    queue.cancel();
    release();
    await gate;
    await Promise.resolve();
    await queue.flush();

    expect(staleQueuedWrite).not.toHaveBeenCalled();
  });

  it("accepts new work after cancellation without surfacing an old failure", async () => {
    const queue = new RecoverableWriteQueue();
    let rejectOld!: (error: Error) => void;
    queue.enqueue(() => new Promise((_, reject) => { rejectOld = reject; }));
    await Promise.resolve();
    queue.cancel();
    const currentWrite = vi.fn(async () => undefined);
    queue.enqueue(currentWrite);
    rejectOld(new Error("expired user write"));

    await queue.flush();

    expect(currentWrite).toHaveBeenCalledOnce();
  });
});
