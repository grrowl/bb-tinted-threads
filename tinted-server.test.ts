import { describe, expect, it, vi } from "vitest";
import {
  createTtlCache,
  mapLimited,
  parseShortstat,
} from "./tinted-server.js";

describe("parseShortstat", () => {
  it("reads files, insertions, and deletions", () => {
    expect(
      parseShortstat(" 3 files changed, 10 insertions(+), 2 deletions(-)"),
    ).toEqual({ files: 3, additions: 10, deletions: 2 });
    expect(parseShortstat(" 1 file changed, 1 insertion(+)")).toEqual({
      files: 1,
      additions: 1,
      deletions: 0,
    });
  });

  it("is null for a clean tree", () => {
    expect(parseShortstat("")).toBeNull();
  });
});

describe("createTtlCache", () => {
  it("shares one load between concurrent callers and caches it", async () => {
    let clock = 0;
    const cache = createTtlCache<number>({ ttlMs: 1_000, now: () => clock });
    const load = vi.fn(async () => 7);
    const results = await Promise.all([
      cache.get("k", load, () => -1),
      cache.get("k", load, () => -1),
    ]);
    expect(results).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);

    clock = 999;
    await cache.get("k", load, () => -1);
    expect(load).toHaveBeenCalledTimes(1);
    clock = 1_000;
    await cache.get("k", load, () => -1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches a failure as its fallback", async () => {
    const cache = createTtlCache<number | null>({ ttlMs: 1_000, now: () => 0 });
    const load = vi.fn(async (): Promise<number | null> => {
      throw new Error("boom");
    });
    await expect(cache.get("k", load, () => null)).resolves.toBeNull();
    await expect(cache.get("k", load, () => null)).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entries past its bound", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
    for (const key of ["a", "b", "c"]) {
      await cache.get(key, async () => key, () => "");
    }
    expect(cache.size()).toBe(2);
  });
});

describe("mapLimited", () => {
  it("never runs more than the limit at once and keeps order", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimited([1, 2, 3, 4, 5], 2, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return value * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
