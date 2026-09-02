import { describe, expect, it, vi } from "vitest";
import { createPdfPageRecoveryGuard, loadPdfWithFreshSource, resolvePdfSourceUrl } from "./pdfSourceLifecycle";

describe("loadPdfWithFreshSource", () => {
  it("loads once with a current source when the first attempt succeeds", async () => {
    const resolveSourceUrl = vi.fn().mockResolvedValue("current-url");
    const load = vi.fn().mockResolvedValue("document");

    await expect(loadPdfWithFreshSource({ resolveSourceUrl, load })).resolves.toBe("document");
    expect(resolveSourceUrl).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes the source once and recovers after a fatal load error", async () => {
    const resolveSourceUrl = vi.fn().mockResolvedValueOnce("stale-url").mockResolvedValueOnce("fresh-url");
    const load = vi.fn().mockRejectedValueOnce(new Error("InvalidJWT")).mockResolvedValueOnce("document");

    await expect(loadPdfWithFreshSource({ resolveSourceUrl, load })).resolves.toBe("document");
    expect(resolveSourceUrl).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, "stale-url");
    expect(load).toHaveBeenNthCalledWith(2, "fresh-url");
  });

  it("stops after one refresh when the retry also fails", async () => {
    const resolveSourceUrl = vi.fn().mockResolvedValueOnce("stale-url").mockResolvedValueOnce("fresh-url");
    const load = vi.fn().mockRejectedValue(new Error("load failed"));

    await expect(loadPdfWithFreshSource({ resolveSourceUrl, load })).rejects.toThrow("load failed");
    expect(resolveSourceUrl).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not refresh an error that the reader marks unrecoverable", async () => {
    const passwordError = Object.assign(new Error("password"), { name: "PasswordException" });
    const resolveSourceUrl = vi.fn().mockResolvedValue("current-url");
    const load = vi.fn().mockRejectedValue(passwordError);

    await expect(loadPdfWithFreshSource({ resolveSourceUrl, load, shouldRefresh: () => false })).rejects.toBe(passwordError);
    expect(resolveSourceUrl).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("surfaces a source refresh failure without starting a retry loop", async () => {
    const resolveSourceUrl = vi.fn().mockRejectedValue(new Error("source unavailable"));
    const load = vi.fn();

    await expect(loadPdfWithFreshSource({ resolveSourceUrl, load })).rejects.toThrow("source unavailable");
    expect(resolveSourceUrl).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("requests a current source again when Reload starts a new load lifecycle", async () => {
    const resolveSourceUrl = vi.fn().mockResolvedValueOnce("first-url").mockResolvedValueOnce("reload-url");
    const load = vi.fn().mockResolvedValue("document");

    await loadPdfWithFreshSource({ resolveSourceUrl, load });
    await loadPdfWithFreshSource({ resolveSourceUrl, load });

    expect(resolveSourceUrl).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(2, "reload-url");
  });
});

describe("createPdfPageRecoveryGuard", () => {
  it("allows only one automatic document recovery for concurrent page failures", () => {
    const recover = vi.fn();
    const guard = createPdfPageRecoveryGuard(recover);

    expect(guard.recover(new Error("page range expired"))).toBe(true);
    expect(guard.recover(new Error("another page failed"))).toBe(false);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("ignores cancellation and password failures", () => {
    const recover = vi.fn();
    const guard = createPdfPageRecoveryGuard(recover);

    expect(guard.recover(Object.assign(new Error("cancelled"), { name: "RenderingCancelledException" }))).toBe(false);
    expect(guard.recover(Object.assign(new Error("password"), { name: "PasswordException" }))).toBe(false);
    expect(recover).not.toHaveBeenCalled();
  });

  it("allows manual Reload to start a new recovery lifecycle", () => {
    const recover = vi.fn();
    const guard = createPdfPageRecoveryGuard(recover);

    expect(guard.recover(new Error("first lifecycle"))).toBe(true);
    guard.reset();
    expect(guard.recover(new Error("manual reload lifecycle"))).toBe(true);
    expect(recover).toHaveBeenCalledTimes(2);
  });
});

describe("resolvePdfSourceUrl", () => {
  it("uses a stable repository-owned URL without calling the managed source endpoint", async () => {
    const resolveManagedSourceUrl = vi.fn().mockResolvedValue("signed-url");

    await expect(resolvePdfSourceUrl("/materials/demo.pdf", resolveManagedSourceUrl)).resolves.toBe("/materials/demo.pdf");
    expect(resolveManagedSourceUrl).not.toHaveBeenCalled();
  });

  it("resolves managed PDFs just in time when no stable URL exists", async () => {
    const resolveManagedSourceUrl = vi.fn().mockResolvedValue("signed-url");

    await expect(resolvePdfSourceUrl(undefined, resolveManagedSourceUrl)).resolves.toBe("signed-url");
    expect(resolveManagedSourceUrl).toHaveBeenCalledTimes(1);
  });
});
