import { memo, useCallback, useSyncExternalStore, type MouseEvent } from "react";
import { useAtomValue } from "jotai";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  experimental_useSidebarThreadPullRequest,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { useSidebarProjectName } from "../model/use-sidebar-data.js";
import { sidebarShowProviderIconsAtom } from "../preferences/atoms.js";
import type { tintedRpcContract } from "../../tinted-server.js";
import {
  subtitleDiffAtom,
  subtitleModelAtom,
  subtitleProjectAtom,
  subtitlePullRequestAtom,
  subtitleWorkspaceAtom,
} from "./atoms.js";
import {
  diffStatLabel,
  modelLabel,
  pullRequestAttentionGlyph,
  pullRequestStateGlyph,
  pullRequestStatusDescription,
  pullRequestTooltip,
  workspaceLabel,
  type DiffStat,
} from "./subtitle.js";
import {
  createSubtitleStore,
  type ModelParams,
  type SubtitleEntry,
  type SubtitleKind,
  type SubtitleValue,
} from "./subtitle-store.js";

type TintedRpc = ReturnType<typeof useRpc<typeof tintedRpcContract>>;

// One store for the whole list. The RPC client is the app's shared one; the
// latest mounted row hands it over before subscribing.
let rpcClient: TintedRpc | null = null;
const store = createSubtitleStore({
  fetchBatch: async (input) => {
    if (!rpcClient) throw new Error("tinted subtitle rpc is not ready");
    return rpcClient.call("tintedRowDetails", input);
  },
});

const NOOP_UNSUBSCRIBE = () => {};

function useSubtitleEntry<Kind extends SubtitleKind>(
  kind: Kind,
  id: string | null,
  params: ModelParams | null = null,
): SubtitleEntry<SubtitleValue<Kind>> | undefined {
  const rpc = useRpc<typeof tintedRpcContract>();
  const providerId = params?.providerId ?? null;
  const environmentId = params?.environmentId ?? null;
  // Keyed on primitives only, so a re-render with a fresh thread object never
  // re-subscribes (and so never re-requests).
  const subscribe = useCallback(
    (notify: () => void) => {
      if (id === null) return NOOP_UNSUBSCRIBE;
      rpcClient = rpc;
      return store.subscribe(
        kind,
        id,
        providerId === null ? null : { providerId, environmentId },
        notify,
      );
    },
    [kind, id, providerId, environmentId, rpc],
  );
  const getSnapshot = useCallback(
    () => (id === null ? undefined : store.peek(kind, id)),
    [kind, id],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Clicks on the few interactive cells still open the row's thread. */
function openRow(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget
    .closest("[data-sidebar-rename-row]")
    ?.querySelector<HTMLAnchorElement>("a[data-sidebar-thread-id]")
    ?.click();
}

function ModelCell({ thread }: { thread: SidebarThread }) {
  const entry = useSubtitleEntry("model", thread.id, {
    providerId: thread.providerId,
    environmentId: thread.environment?.id ?? null,
  });
  const titleHasIcon = useAtomValue(sidebarShowProviderIconsAtom);
  const { providers } = experimental_useProviders();
  const provider = providers.find(
    (candidate) => candidate.id === thread.providerId,
  );
  const label = modelLabel(entry?.value);
  return (
    <span
      data-tinted-subtitle-model=""
      className="flex min-w-0 max-w-[5.75rem] shrink items-center gap-1"
    >
      {titleHasIcon ? null : (
        <ProviderIcon
          providerKind="agent"
          provider={provider ?? { id: thread.providerId }}
          className="size-3 shrink-0 opacity-80"
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function DiffStatPills({ diff }: { diff: DiffStat }) {
  return (
    <span
      role="img"
      aria-label={diffStatLabel(diff)}
      className="flex shrink-0 items-center font-mono text-[9px] leading-none tabular-nums"
    >
      <span className="rounded-l bg-emerald-500/10 px-0.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
        +{diff.additions}
      </span>
      <span className="rounded-r bg-destructive/10 px-0.5 py-0.5 font-medium text-destructive">
        -{diff.deletions}
      </span>
    </span>
  );
}

function ProjectCell({ projectId }: { projectId: string }) {
  const name = useSidebarProjectName(projectId);
  if (!name) return null;
  return (
    <span
      data-tinted-subtitle-project=""
      className="min-w-0 flex-[0_1_auto] truncate"
    >
      {name}
    </span>
  );
}

function PullRequestCell({ thread }: { thread: SidebarThread }) {
  const { pullRequest } = experimental_useSidebarThreadPullRequest(thread.id);
  const environmentId = thread.environment?.id ?? null;
  // Checks counts, review state, and the branch diff are not in the host's
  // PR summary; ask for them only once the host says there is a PR.
  const entry = useSubtitleEntry(
    "pullRequest",
    pullRequest !== null ? environmentId : null,
  );
  if (pullRequest === null) return null;
  const detail = entry?.value ?? null;
  const state = pullRequestStateGlyph(pullRequest.state);
  const attention = pullRequestAttentionGlyph(
    pullRequest.attention,
    pullRequest.state,
    detail,
  );
  return (
    <span
      data-tinted-subtitle-pr=""
      title={pullRequestTooltip(pullRequest, detail)}
      onClick={openRow}
      className="pointer-events-auto relative z-[31] flex shrink-0 items-center gap-0.5"
    >
      <Icon
        name={state.icon}
        aria-label={state.label}
        className={cn("size-3 shrink-0", state.className)}
      />
      {attention ? (
        <Icon
          name={attention.icon}
          aria-label={attention.label}
          className={cn("size-2.5 shrink-0", attention.className)}
        />
      ) : null}
      <span className="sr-only">
        {pullRequestStatusDescription(pullRequest.attention, detail)}
      </span>
      {detail?.branchDiff ? <DiffStatPills diff={detail.branchDiff} /> : null}
    </span>
  );
}

function UncommittedDiffCell({ environmentId }: { environmentId: string }) {
  const entry = useSubtitleEntry("diff", environmentId);
  const diff = entry?.value;
  if (!diff || (diff.additions === 0 && diff.deletions === 0)) return null;
  return <DiffStatPills diff={diff} />;
}

/**
 * The pull request glyph, sat at the row's right edge beside the sub-thread
 * badge and chevron rather than in the subtitle, so titles keep their width.
 */
export const ThreadPullRequestIndicator = memo(
  function ThreadPullRequestIndicator({ thread }: { thread: SidebarThread }) {
    const showPullRequest = useAtomValue(subtitlePullRequestAtom);
    if (!showPullRequest || thread.environment?.id == null) return null;
    return <PullRequestCell thread={thread} />;
  },
);

/**
 * The line under a thread's title: model, project, workspace, and
 * uncommitted diff, each behind its own preference. Every part is its own
 * component so a row only looks up what it actually shows.
 */
export const ThreadSubtitle = memo(function ThreadSubtitle({
  thread,
}: {
  thread: SidebarThread;
}) {
  const showModel = useAtomValue(subtitleModelAtom);
  const showProject = useAtomValue(subtitleProjectAtom);
  const showDiff = useAtomValue(subtitleDiffAtom);
  const workspaceMode = useAtomValue(subtitleWorkspaceAtom);
  const workspace = workspaceLabel(thread, workspaceMode);
  const environmentId = thread.environment?.id ?? null;
  const isArchived = thread.archivedAt !== null;
  return (
    <span
      data-tinted-subtitle-row=""
      className="pointer-events-none flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs leading-none text-muted-foreground"
    >
      {showModel ? <ModelCell thread={thread} /> : null}
      {showProject ? <ProjectCell projectId={thread.projectId} /> : null}
      {workspace ? (
        <span className="min-w-0 flex-[0_1_5.25rem] truncate font-mono">
          {workspace}
        </span>
      ) : null}
      {showDiff && environmentId !== null && !isArchived ? (
        <UncommittedDiffCell environmentId={environmentId} />
      ) : null}
    </span>
  );
});
