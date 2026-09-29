import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// Server side of Tinted Threads' row subtitles: the thread's model and the
// environment's diff stats and pull-request detail, which the sidebar payload
// does not carry. One batched RPC serves every kind; each lookup is cached
// with a short TTL and concurrent lookups for the same key share one promise,
// so a burst of rows never turns into a burst of git or git-host calls.

export const TINTED_BATCH_LIMIT = 100;
const LOOKUP_CONCURRENCY = 4;

const MODEL_TTL_MS = 60_000;
const CATALOG_TTL_MS = 10 * 60_000;
const DIFF_TTL_MS = 15_000;
const PULL_REQUEST_TTL_MS = 30_000;

const idSchema = z.string().min(1).max(200);

const modelSchema = z
  .object({
    providerId: z.string(),
    model: z.string().nullable(),
    displayName: z.string().nullable(),
    status: z.enum(["known", "unknown"]),
  })
  .strict();
export type TintedModel = z.infer<typeof modelSchema>;

const diffStatSchema = z
  .object({
    files: z.number().nullable(),
    additions: z.number(),
    deletions: z.number(),
  })
  .strict();
export type TintedDiffStat = z.infer<typeof diffStatSchema>;

const pullRequestDetailSchema = z
  .object({
    checksState: z.enum(["unknown", "pending", "passing", "failing", "no_checks"]),
    checksFailed: z.number(),
    checksPending: z.number(),
    checksPassed: z.number(),
    reviewState: z.enum([
      "none",
      "approved",
      "changes_requested",
      "review_required",
      "review_requested",
    ]),
    branchDiff: diffStatSchema.nullable(),
  })
  .strict();
export type TintedPullRequestDetail = z.infer<typeof pullRequestDetailSchema>;

export const tintedRpcContract = defineRpcContract({
  tintedRowDetails: {
    input: z
      .object({
        models: z
          .array(
            z
              .object({
                threadId: idSchema,
                providerId: idSchema,
                environmentId: idSchema.nullable(),
              })
              .strict(),
          )
          .max(TINTED_BATCH_LIMIT),
        diffs: z.array(idSchema).max(TINTED_BATCH_LIMIT),
        pullRequests: z.array(idSchema).max(TINTED_BATCH_LIMIT),
      })
      .strict(),
    output: z
      .object({
        // null: the lookup failed or has nothing to show.
        models: z.record(z.string(), modelSchema.nullable()),
        diffs: z.record(z.string(), diffStatSchema.nullable()),
        pullRequests: z.record(z.string(), pullRequestDetailSchema.nullable()),
      })
      .strict(),
  },
});

export type TintedRowDetailsInput = z.infer<
  (typeof tintedRpcContract)["tintedRowDetails"]["input"]
>;
export type TintedRowDetailsOutput = z.infer<
  (typeof tintedRpcContract)["tintedRowDetails"]["output"]
>;

/**
 * Parse git's `--shortstat` line ("3 files changed, 10 insertions(+), 2
 * deletions(-)"). Null when it names no counts at all (a clean tree).
 */
export function parseShortstat(shortstat: string): TintedDiffStat | null {
  const files = numberBefore(shortstat, "file");
  const additions = numberBefore(shortstat, "insertion");
  const deletions = numberBefore(shortstat, "deletion");
  if (files === null && additions === null && deletions === null) return null;
  return { files, additions: additions ?? 0, deletions: deletions ?? 0 };
}

function numberBefore(source: string, word: string): number | null {
  const match = source.match(new RegExp(`(\\d+)\\s+${word}`));
  return match ? Number(match[1]) : null;
}

/**
 * A TTL cache whose loads are deduplicated: while a key is loading, every
 * caller awaits the same promise. A failed load is cached as its fallback for
 * the same TTL so a broken environment is not retried on every request.
 */
export function createTtlCache<Value>({
  ttlMs,
  maxEntries = 2_000,
  now = Date.now,
}: {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}) {
  const entries = new Map<string, { value: Value; expiresAt: number }>();
  const inFlight = new Map<string, Promise<Value>>();

  function get(
    key: string,
    load: () => Promise<Value>,
    fallback: (error: unknown) => Value,
  ): Promise<Value> {
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.value);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const promise = load()
      .catch(fallback)
      .then((value) => {
        entries.delete(key);
        entries.set(key, { value, expiresAt: now() + ttlMs });
        while (entries.size > maxEntries) {
          const oldest = entries.keys().next();
          if (oldest.done) break;
          entries.delete(oldest.value);
        }
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return { get, size: () => entries.size };
}

/** Map with at most `limit` callbacks running; results keep input order. */
export async function mapLimited<Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as Item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createTintedRowDetails(bb: BbPluginApi) {
  type Catalog = Awaited<ReturnType<typeof bb.sdk.providers.models>> | null;
  const modelCache = createTtlCache<string | null>({ ttlMs: MODEL_TTL_MS });
  const catalogCache = createTtlCache<Catalog>({
    ttlMs: CATALOG_TTL_MS,
    maxEntries: 200,
  });
  const diffCache = createTtlCache<TintedDiffStat | null>({ ttlMs: DIFF_TTL_MS });
  const pullRequestCache = createTtlCache<TintedPullRequestDetail | null>({
    ttlMs: PULL_REQUEST_TTL_MS,
  });

  function logged<Value>(what: string, value: Value) {
    return (error: unknown): Value => {
      bb.log.debug(`could not read ${what}: ${describe(error)}`);
      return value;
    };
  }

  async function model({
    threadId,
    providerId,
    environmentId,
  }: TintedRowDetailsInput["models"][number]): Promise<TintedModel> {
    const resolved = await modelCache.get(
      threadId,
      async () =>
        (await bb.sdk.threads.defaultExecutionOptions({ threadId }))?.model ??
        null,
      logged(`model for ${threadId}`, null),
    );
    if (!resolved) {
      return { providerId, model: null, displayName: null, status: "unknown" };
    }
    const catalog = await catalogCache.get(
      `${environmentId ?? "primary"}:${providerId}`,
      () =>
        bb.sdk.providers.models(
          environmentId ? { environmentId, providerId } : { providerId },
        ),
      logged(`model catalog for ${providerId}`, null),
    );
    const entry = catalog?.models.find(
      (candidate) => candidate.model === resolved || candidate.id === resolved,
    );
    return {
      providerId,
      model: resolved,
      displayName: entry?.displayName ?? null,
      status: "known",
    };
  }

  function diff(environmentId: string): Promise<TintedDiffStat | null> {
    return diffCache.get(
      environmentId,
      async () => {
        const result = await bb.sdk.environments.diffFiles({
          environmentId,
          target: "uncommitted",
        });
        return result.outcome === "available"
          ? parseShortstat(result.shortstat)
          : null;
      },
      logged(`git status for ${environmentId}`, null),
    );
  }

  function pullRequest(
    environmentId: string,
  ): Promise<TintedPullRequestDetail | null> {
    return pullRequestCache.get(
      environmentId,
      async () => {
        const result = await bb.sdk.environments.pullRequest({ environmentId });
        if (result.outcome !== "available") return null;
        const pr = result.pullRequest;
        let branchDiff: TintedDiffStat | null = null;
        try {
          const diffResult = await bb.sdk.environments.diffFiles({
            environmentId,
            target: "branch_committed",
            mergeBaseBranch: pr.baseRefName,
          });
          if (diffResult.outcome === "available") {
            branchDiff = parseShortstat(diffResult.shortstat);
          }
        } catch (error) {
          bb.log.debug(
            `could not read branch diff for ${environmentId}: ${describe(error)}`,
          );
        }
        return {
          checksState: pr.checks.state,
          checksFailed: pr.checks.failedCount,
          checksPending: pr.checks.pendingCount,
          checksPassed: pr.checks.passedCount,
          reviewState: pr.review.state,
          branchDiff,
        };
      },
      logged(`pull request for ${environmentId}`, null),
    );
  }

  return async function tintedRowDetails(
    input: TintedRowDetailsInput,
  ): Promise<TintedRowDetailsOutput> {
    const models = [
      ...new Map(input.models.map((item) => [item.threadId, item])).values(),
    ];
    const diffs = [...new Set(input.diffs)];
    const pullRequests = [...new Set(input.pullRequests)];
    // Every lookup settles to a value (failures become null or "unknown"), so
    // one bad environment never sinks the rest of the batch.
    const [modelResults, diffResults, pullRequestResults] = await Promise.all([
      mapLimited(models, LOOKUP_CONCURRENCY, async (item) => {
        try {
          return [item.threadId, await model(item)] as const;
        } catch (error) {
          bb.log.debug(`could not read model for ${item.threadId}: ${describe(error)}`);
          return [item.threadId, null] as const;
        }
      }),
      mapLimited(diffs, LOOKUP_CONCURRENCY, async (id) => [id, await diff(id)] as const),
      mapLimited(
        pullRequests,
        LOOKUP_CONCURRENCY,
        async (id) => [id, await pullRequest(id)] as const,
      ),
    ]);
    return {
      models: Object.fromEntries(modelResults),
      diffs: Object.fromEntries(diffResults),
      pullRequests: Object.fromEntries(pullRequestResults),
    };
  };
}

export function registerTintedServer(bb: BbPluginApi): void {
  const tintedRowDetails = createTintedRowDetails(bb);
  bb.rpc.register(tintedRpcContract, { tintedRowDetails });
}
