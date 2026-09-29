import { describe, expect, it, vi } from "vitest";
import type {
  TintedRowDetailsInput,
  TintedRowDetailsOutput,
} from "../../tinted-server.js";
import { createSubtitleStore } from "./subtitle-store.js";

interface Timer {
  at: number;
  callback: () => void;
  handle: number;
}

/** A hand-driven clock and timer queue, so batching is deterministic. */
function harness(
  respond: (input: TintedRowDetailsInput) => TintedRowDetailsOutput = (
    input,
  ) => ({
    models: Object.fromEntries(
      input.models.map((item) => [
        item.threadId,
        {
          providerId: item.providerId,
          model: `model-${item.threadId}`,
          displayName: null,
          status: "known" as const,
        },
      ]),
    ),
    diffs: Object.fromEntries(
      input.diffs.map((id) => [id, { files: 1, additions: 2, deletions: 3 }]),
    ),
    pullRequests: Object.fromEntries(input.pullRequests.map((id) => [id, null])),
  }),
) {
  let clock = 0;
  let nextHandle = 1;
  let timers: Timer[] = [];
  const calls: TintedRowDetailsInput[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const fetchBatch = vi.fn(async (input: TintedRowDetailsInput) => {
    calls.push(input);
    if (hold) await new Promise<void>((resolve) => (release = resolve));
    return respond(input);
  });
  const store = createSubtitleStore({
    fetchBatch,
    now: () => clock,
    setTimer: (callback, ms) => {
      const handle = nextHandle++;
      timers.push({ at: clock + ms, callback, handle });
      return handle;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.handle !== handle);
    },
    batchDelayMs: 50,
    refreshIntervalMs: 30_000,
    staleMs: { model: 60_000, diff: 30_000, pullRequest: 30_000 },
    maxBatch: 2,
  });

  async function advance(ms: number) {
    const target = clock + ms;
    for (;;) {
      const due = timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((timer) => timer !== due);
      clock = due.at;
      due.callback();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    clock = target;
  }

  return {
    store,
    calls,
    advance,
    pendingTimers: () => timers.length,
    holdResponses: () => {
      hold = true;
    },
    releaseResponse: async () => {
      hold = false;
      release?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("subtitle store", () => {
  it("batches keys subscribed together into one request", async () => {
    const { store, calls, advance } = harness();
    const listener = vi.fn();
    store.subscribe("model", "t1", { providerId: "codex", environmentId: null }, listener);
    store.subscribe("diff", "env1", null, listener);
    store.subscribe("pullRequest", "env1", null, listener);
    expect(calls).toHaveLength(0);

    await advance(50);
    expect(calls).toEqual([
      {
        models: [{ threadId: "t1", providerId: "codex", environmentId: null }],
        diffs: ["env1"],
        pullRequests: ["env1"],
      },
    ]);
    expect(store.peek("model", "t1")?.value?.model).toBe("model-t1");
    expect(store.peek("diff", "env1")?.value).toEqual({
      files: 1,
      additions: 2,
      deletions: 3,
    });
    expect(store.peek("pullRequest", "env1")?.value).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("does not re-request fresh keys when rows remount", async () => {
    const { store, calls, advance } = harness();
    const off = store.subscribe("diff", "env1", null, () => {});
    await advance(50);
    off();
    store.subscribe("diff", "env1", null, () => {});
    store.subscribe("diff", "env1", null, () => {});
    await advance(1_000);
    expect(calls).toHaveLength(1);
  });

  it("refreshes only stale keys that still have subscribers", async () => {
    const { store, calls, advance } = harness();
    store.subscribe("diff", "kept", null, () => {});
    const off = store.subscribe("diff", "dropped", null, () => {});
    await advance(50);
    expect(calls).toHaveLength(1);
    off();

    await advance(60_000);
    await advance(50);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ models: [], diffs: ["kept"], pullRequests: [] });
  });

  it("stops the refresh timer when nothing is subscribed", async () => {
    const { store, advance, pendingTimers } = harness();
    const off = store.subscribe("diff", "env1", null, () => {});
    await advance(50);
    expect(pendingTimers()).toBe(1);
    off();
    expect(pendingTimers()).toBe(0);
  });

  it("keeps one request in flight and sends later keys after it settles", async () => {
    const { store, calls, advance, holdResponses, releaseResponse } = harness();
    holdResponses();
    store.subscribe("diff", "a", null, () => {});
    await advance(50);
    store.subscribe("diff", "b", null, () => {});
    await advance(500);
    expect(calls).toHaveLength(1);

    await releaseResponse();
    await advance(50);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.diffs).toEqual(["b"]);
  });

  it("caps each kind per request and sends the rest next", async () => {
    const { store, calls, advance } = harness();
    for (const id of ["a", "b", "c"]) store.subscribe("diff", id, null, () => {});
    await advance(50);
    await advance(50);
    expect(calls.map((call) => call.diffs)).toEqual([["a", "b"], ["c"]]);
  });

  it("drops keys unsubscribed before the batch is sent", async () => {
    const { store, calls, advance } = harness();
    const off = store.subscribe("diff", "gone", null, () => {});
    store.subscribe("diff", "stays", null, () => {});
    off();
    await advance(50);
    expect(calls[0]?.diffs).toEqual(["stays"]);
  });

  it("settles a failed first request to null and keeps earlier values", async () => {
    let fail = true;
    const { store, calls, advance } = harness((input) => {
      if (fail) throw new Error("offline");
      return {
        models: {},
        diffs: Object.fromEntries(
          input.diffs.map((id) => [id, { files: null, additions: 1, deletions: 0 }]),
        ),
        pullRequests: {},
      };
    });
    store.subscribe("diff", "env1", null, () => {});
    await advance(50);
    expect(store.peek("diff", "env1")?.value).toBeNull();

    fail = false;
    await advance(60_000);
    await advance(50);
    expect(store.peek("diff", "env1")?.value).toEqual({
      files: null,
      additions: 1,
      deletions: 0,
    });

    fail = true;
    await advance(60_000);
    await advance(50);
    expect(calls).toHaveLength(3);
    expect(store.peek("diff", "env1")?.value?.additions).toBe(1);
  });
});
