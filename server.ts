import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Realtime channel the sidebar re-reads its manual order on. */
export const MANUAL_ORDER_CHANNEL = "manual-order";
/** Realtime channel the sidebar re-reads its collapsed set on. */
export const COLLAPSED_THREADS_CHANNEL = "collapsed-threads";

/** KV key holding the user's manual thread order (an array of thread ids). */
const MANUAL_ORDER_KEY = "manual-order";
/** KV key holding the ids of threads whose children are collapsed. */
const COLLAPSED_THREADS_KEY = "collapsed-threads";

export const rpcContract = defineRpcContract({
  manualOrderList: {
    input: z.object({}).strict(),
    output: z.object({ ids: z.array(z.string()) }).strict(),
  },
  manualOrderReorder: {
    input: z
      .object({ ids: z.array(z.string().min(1)).max(5000) })
      .strict(),
    output: z.object({ ids: z.array(z.string()) }).strict(),
  },
  collapsedThreadsList: {
    input: z.object({}).strict(),
    output: z.object({ ids: z.array(z.string()) }).strict(),
  },
  collapsedThreadsSet: {
    input: z
      .object({ ids: z.array(z.string().min(1)).max(5000) })
      .strict(),
    output: z.object({ ids: z.array(z.string()) }).strict(),
  },
  gitStats: {
    input: z.object({ environmentIds: z.array(z.string()).max(80) }).strict(),
    output: z.object({ stats: z.record(z.string(), z.string().nullable()) }),
  },
  threadModels: {
    input: z.object({ threadIds: z.array(z.string()).max(120) }).strict(),
    output: z.object({
      models: z.record(
        z.string(),
        z
          .object({
            providerId: z.string(),
            model: z.string().nullable(),
            displayName: z.string().nullable(),
            status: z.enum(["known", "unknown"]),
          })
          .strict(),
      ),
    }),
  },
  threadDisplayStatuses: {
    input: z.object({ threadIds: z.array(z.string()).max(120) }).strict(),
    output: z.object({
      statuses: z.record(z.string(), z.string().nullable()),
    }),
  },
  pullRequestDetails: {
    input: z.object({ environmentIds: z.array(z.string()).max(80) }).strict(),
    output: z.object({
      details: z.record(
        z.string(),
        z
          .object({
            checksState: z.enum([
              "unknown",
              "pending",
              "passing",
              "failing",
              "no_checks",
            ]),
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
            branchDiff: z.string().nullable(),
          })
          .strict()
          .nullable(),
      ),
    }),
  },
});

export default function plugin(bb: BbPluginApi) {
  bb.log.info("loaded tinted sidebar");

  bb.settings.define({
    groupBy: {
      type: "select",
      label: "Group by",
      description: "Project headers or one flat list.",
      options: ["project", "none"],
      default: "none",
    },
    pinnedPlacement: {
      type: "select",
      label: "Pinned threads",
      description: "Keep pins inside each group or in a section at the top.",
      options: ["in-group", "at-top"],
      default: "in-group",
    },
    sortBy: {
      type: "select",
      label: "Sort by",
      description:
        "Manual lets you drag threads into any order you like (per group).",
      options: ["created", "updated", "attention", "alpha", "manual"],
      default: "attention",
    },
    showArchivedChildren: {
      type: "boolean",
      label: "Show archived child threads",
      description: "Show archived sub-threads nested under a visible parent.",
      default: false,
    },
    showModel: {
      type: "boolean",
      label: "Show provider and model",
      default: true,
    },
    showDiff: {
      type: "boolean",
      label: "Show uncommitted diff",
      default: false,
    },
    showPullRequest: {
      type: "boolean",
      label: "Show pull request status",
      default: true,
    },
    workspaceLabel: {
      type: "select",
      label: "Workspace label",
      description: "Branch, worktree folder, host name, or smart fallback.",
      options: ["branch", "worktree", "host", "smart"],
      default: "smart",
    },
  });

  async function readStringList(key: string): Promise<string[]> {
    try {
      const stored = await bb.storage.kv.get<unknown>(key);
      if (!Array.isArray(stored)) return [];
      return stored.filter((id): id is string => typeof id === "string");
    } catch (error) {
      bb.log.debug(`could not read ${key}: ${String(error)}`);
      return [];
    }
  }

  // Keep the first occurrence of each id so a malformed client payload can
  // never corrupt the stored list.
  function dedupe(ids: readonly string[]): string[] {
    const seen = new Set<string>();
    return ids.filter((id) => !seen.has(id) && seen.add(id));
  }

  bb.rpc.register(rpcContract, {
    async manualOrderList() {
      return { ids: await readStringList(MANUAL_ORDER_KEY) };
    },
    async manualOrderReorder({ ids }) {
      const deduped = dedupe(ids);
      await bb.storage.kv.set(MANUAL_ORDER_KEY, deduped);
      bb.realtime.publish(MANUAL_ORDER_CHANNEL, {});
      return { ids: deduped };
    },
    async collapsedThreadsList() {
      return { ids: await readStringList(COLLAPSED_THREADS_KEY) };
    },
    async collapsedThreadsSet({ ids }) {
      const deduped = dedupe(ids);
      await bb.storage.kv.set(COLLAPSED_THREADS_KEY, deduped);
      bb.realtime.publish(COLLAPSED_THREADS_CHANNEL, {});
      return { ids: deduped };
    },
    async gitStats({ environmentIds }) {
      const uniqueIds = [...new Set(environmentIds)];
      const entries = await Promise.all(
        uniqueIds.map(async (environmentId) => {
          try {
            const result = await bb.sdk.environments.diffFiles({
              environmentId,
              target: "uncommitted",
            });
            if (result.outcome !== "available") return [environmentId, null];
            return [environmentId, shortGitStat(result.shortstat)];
          } catch (error) {
            bb.log.debug(
              `could not read git status for ${environmentId}: ${String(error)}`,
            );
            return [environmentId, null];
          }
        }),
      );
      return { stats: Object.fromEntries(entries) };
    },
    async threadModels({ threadIds }) {
      const uniqueIds = [...new Set(threadIds)];
      const resolutions = await Promise.all(
        uniqueIds.map(async (threadId) => {
          try {
            const thread = await bb.sdk.threads.get({ threadId });
            const options = await bb.sdk.threads.defaultExecutionOptions({
              threadId,
            });
            return { threadId, thread, model: options?.model ?? null };
          } catch (error) {
            bb.log.debug(
              `could not read model for ${threadId}: ${String(error)}`,
            );
            return { threadId, thread: null, model: null };
          }
        }),
      );

      const catalogs = new Map<string, Promise<Awaited<ReturnType<typeof bb.sdk.providers.models>>>>();
      function modelsFor(providerId: string, environmentId: string | null) {
        const key = `${environmentId ?? "primary"}:${providerId}`;
        let catalog = catalogs.get(key);
        if (!catalog) {
          catalog = bb.sdk.providers.models(
            environmentId ? { environmentId, providerId } : { providerId },
          );
          catalogs.set(key, catalog);
        }
        return catalog;
      }

      const entries = await Promise.all(
        resolutions.map(async ({ threadId, thread, model }) => {
          if (!thread || !model) {
            return [threadId, {
              providerId: thread?.providerId ?? "unknown",
              model: null,
              displayName: null,
              status: "unknown" as const,
            }];
          }
          try {
            const catalog = await modelsFor(thread.providerId, thread.environmentId);
            const entry = catalog.models.find(
              (candidate) => candidate.model === model || candidate.id === model,
            );
            return [threadId, {
              providerId: thread.providerId,
              model,
              displayName: entry?.displayName ?? null,
              status: "known" as const,
            }];
          } catch (error) {
            bb.log.debug(`could not read model catalog for ${threadId}: ${String(error)}`);
            return [threadId, {
              providerId: thread.providerId,
              model,
              displayName: null,
              status: "known" as const,
            }];
          }
        }),
      );
      return { models: Object.fromEntries(entries) };
    },
    async threadDisplayStatuses({ threadIds }) {
      const uniqueIds = [...new Set(threadIds)];
      const entries = await Promise.all(
        uniqueIds.map(async (threadId) => {
          try {
            const thread = await bb.sdk.threads.get({ threadId });
            return [threadId, thread.runtime?.displayStatus ?? null];
          } catch (error) {
            bb.log.debug(
              `could not read status for ${threadId}: ${String(error)}`,
            );
            return [threadId, null];
          }
        }),
      );
      return { statuses: Object.fromEntries(entries) };
    },
    async pullRequestDetails({ environmentIds }) {
      const uniqueIds = [...new Set(environmentIds)];
      const entries = await Promise.all(
        uniqueIds.map(async (environmentId) => {
          try {
            const result = await bb.sdk.environments.pullRequest({ environmentId });
            if (result.outcome !== "available") return [environmentId, null];

            const pullRequest = result.pullRequest;
            let branchDiff: string | null = null;
            try {
              const diffResult = await bb.sdk.environments.diffFiles({
                environmentId,
                target: "branch_committed",
                mergeBaseBranch: pullRequest.baseRefName,
              });
              if (diffResult.outcome === "available") {
                branchDiff = shortGitStat(diffResult.shortstat);
              }
            } catch (error) {
              bb.log.debug(
                `could not read branch diff for ${environmentId}: ${String(error)}`,
              );
            }

            return [
              environmentId,
              {
                checksState: pullRequest.checks.state,
                checksFailed: pullRequest.checks.failedCount,
                checksPending: pullRequest.checks.pendingCount,
                checksPassed: pullRequest.checks.passedCount,
                reviewState: pullRequest.review.state,
                branchDiff,
              },
            ];
          } catch (error) {
            bb.log.debug(
              `could not read pull request for ${environmentId}: ${String(error)}`,
            );
            return [environmentId, null];
          }
        }),
      );
      return { details: Object.fromEntries(entries) };
    },
  });
}

function shortGitStat(shortstat: string): string | null {
  const changed = numberBefore(shortstat, "file");
  const insertions = numberBefore(shortstat, "insertion");
  const deletions = numberBefore(shortstat, "deletion");
  if (changed === null && insertions === null && deletions === null) return null;

  const prefix = changed !== null ? `${changed}f ` : "";
  return `${prefix}+${insertions ?? 0} -${deletions ?? 0}`;
}

function numberBefore(source: string, word: string): number | null {
  const match = source.match(new RegExp(`(\\d+)\\s+${word}`));
  return match ? Number(match[1]) : null;
}
