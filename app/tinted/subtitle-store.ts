import type {
  TintedDiffStat,
  TintedModel,
  TintedPullRequestDetail,
  TintedRowDetailsInput,
  TintedRowDetailsOutput,
} from "../../tinted-server.js";

// Client cache for server-sourced subtitle data (model, diff, PR detail).
//
// Rows subscribe by key on mount and unsubscribe on unmount. New or stale
// keys are collected for ~50ms and sent as ONE request; only one request is
// in flight at a time, and keys that arrive meanwhile wait for the next one.
// A slow timer re-requests stale keys, but only those some mounted row still
// subscribes to, so scrolling or re-rendering never re-sends the visible set.

export type SubtitleKind = "model" | "diff" | "pullRequest";

export type SubtitleValue<Kind extends SubtitleKind> = Kind extends "model"
  ? TintedModel | null
  : Kind extends "diff"
    ? TintedDiffStat | null
    : TintedPullRequestDetail | null;

export interface ModelParams {
  providerId: string;
  environmentId: string | null;
}

export interface SubtitleEntry<Value> {
  /** Undefined until the first response for this key arrives. */
  value: Value | undefined;
  fetchedAt: number;
}

export type FetchSubtitleBatch = (
  input: TintedRowDetailsInput,
) => Promise<TintedRowDetailsOutput>;

export interface SubtitleStoreOptions {
  fetchBatch: FetchSubtitleBatch;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  batchDelayMs?: number;
  refreshIntervalMs?: number;
  staleMs?: Record<SubtitleKind, number>;
  maxBatch?: number;
  /** Drop unsubscribed entries after this long without a refresh. */
  evictAfterMs?: number;
  /** Skip timed refreshes while true (e.g. the window is hidden). */
  isPaused?: () => boolean;
}

const DEFAULT_STALE_MS: Record<SubtitleKind, number> = {
  model: 60_000,
  diff: 30_000,
  pullRequest: 30_000,
};

interface KeyState {
  kind: SubtitleKind;
  id: string;
  params: ModelParams | null;
  subscribers: number;
  listeners: Set<() => void>;
  entry: SubtitleEntry<unknown> | undefined;
}

export function subtitleKey(kind: SubtitleKind, id: string): string {
  return `${kind}:${id}`;
}

export function createSubtitleStore({
  fetchBatch,
  now = Date.now,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  batchDelayMs = 50,
  refreshIntervalMs = 30_000,
  staleMs = DEFAULT_STALE_MS,
  maxBatch = 100,
  evictAfterMs = 10 * 60_000,
  isPaused = () => false,
}: SubtitleStoreOptions) {
  const states = new Map<string, KeyState>();
  const pending = new Set<string>();
  let flushTimer: unknown = null;
  let refreshTimer: unknown = null;
  let inFlight = false;
  let activeSubscribers = 0;

  function isStale(state: KeyState): boolean {
    return (
      state.entry === undefined ||
      now() - state.entry.fetchedAt >= staleMs[state.kind]
    );
  }

  function scheduleFlush(): void {
    if (flushTimer !== null || inFlight || pending.size === 0) return;
    flushTimer = setTimer(() => {
      flushTimer = null;
      void flush();
    }, batchDelayMs);
  }

  function enqueue(key: string): void {
    pending.add(key);
    scheduleFlush();
  }

  function takeBatch(): KeyState[] {
    const counts: Record<SubtitleKind, number> = {
      model: 0,
      diff: 0,
      pullRequest: 0,
    };
    const batch: KeyState[] = [];
    for (const key of [...pending]) {
      const state = states.get(key);
      if (!state || state.subscribers === 0 || !isStale(state)) {
        pending.delete(key);
        continue;
      }
      if (counts[state.kind] >= maxBatch) continue;
      counts[state.kind] += 1;
      pending.delete(key);
      batch.push(state);
    }
    return batch;
  }

  async function flush(): Promise<void> {
    if (inFlight) return;
    const batch = takeBatch();
    if (batch.length === 0) return;
    const input: TintedRowDetailsInput = {
      models: [],
      diffs: [],
      pullRequests: [],
    };
    for (const state of batch) {
      if (state.kind === "model") {
        input.models.push({
          threadId: state.id,
          providerId: state.params?.providerId ?? "unknown",
          environmentId: state.params?.environmentId ?? null,
        });
      } else if (state.kind === "diff") {
        input.diffs.push(state.id);
      } else {
        input.pullRequests.push(state.id);
      }
    }
    inFlight = true;
    let output: TintedRowDetailsOutput | null = null;
    try {
      output = await fetchBatch(input);
    } catch {
      // Keep whatever was shown; the refresh timer retries once stale.
    } finally {
      inFlight = false;
    }
    const fetchedAt = now();
    for (const state of batch) {
      const record =
        output === null
          ? undefined
          : state.kind === "model"
            ? output.models
            : state.kind === "diff"
              ? output.diffs
              : output.pullRequests;
      const hasValue = record !== undefined && Object.hasOwn(record, state.id);
      // A failed request keeps the last value; with none, settle on null so
      // the row stops showing "Loading…".
      const value = hasValue ? record[state.id] : (state.entry?.value ?? null);
      state.entry = { value, fetchedAt };
      for (const listener of state.listeners) listener();
    }
    scheduleFlush();
  }

  function refresh(): void {
    const cutoff = now() - evictAfterMs;
    const paused = isPaused();
    for (const [key, state] of states) {
      if (state.subscribers > 0) {
        if (!paused && isStale(state)) enqueue(key);
      } else if (!state.entry || state.entry.fetchedAt < cutoff) {
        states.delete(key);
      }
    }
    refreshTimer = setTimer(refresh, refreshIntervalMs);
  }

  function subscribe(
    kind: SubtitleKind,
    id: string,
    params: ModelParams | null,
    listener: () => void,
  ): () => void {
    const key = subtitleKey(kind, id);
    let state = states.get(key);
    if (!state) {
      state = {
        kind,
        id,
        params,
        subscribers: 0,
        listeners: new Set(),
        entry: undefined,
      };
      states.set(key, state);
    }
    if (params) state.params = params;
    state.subscribers += 1;
    state.listeners.add(listener);
    activeSubscribers += 1;
    if (refreshTimer === null) {
      refreshTimer = setTimer(refresh, refreshIntervalMs);
    }
    if (isStale(state)) enqueue(key);

    const subscribed = state;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscribed.subscribers -= 1;
      subscribed.listeners.delete(listener);
      activeSubscribers -= 1;
      if (activeSubscribers === 0 && refreshTimer !== null) {
        clearTimer(refreshTimer);
        refreshTimer = null;
      }
    };
  }

  function peek<Kind extends SubtitleKind>(
    kind: Kind,
    id: string,
  ): SubtitleEntry<SubtitleValue<Kind>> | undefined {
    return states.get(subtitleKey(kind, id))?.entry as
      | SubtitleEntry<SubtitleValue<Kind>>
      | undefined;
  }

  return {
    subscribe,
    peek,
    /** Test hook: send whatever is pending now instead of waiting. */
    flush,
    isInFlight: () => inFlight,
  };
}

export type SubtitleStore = ReturnType<typeof createSubtitleStore>;
