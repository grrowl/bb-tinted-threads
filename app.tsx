import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  useRealtime,
  useRpc,
  useSettings,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { buildSubtitleParts, SubtitleRow } from "@/components/subtitle-row";
import { ThreadContextMenu } from "@/components/thread-context-menu";
import {
  buildListSections,
  filterVisibleThreads,
  totalRowCount,
  type ListSection,
  type ThreadRowModel,
} from "@/lib/list-view";
import { parseListSettings } from "@/lib/settings";
import { type ThreadModelMetadata } from "@/lib/subtitle";
import { threadTitle } from "@/lib/thread-title";
import { cn } from "@/lib/utils";
import type { rpcContract } from "./server";

type RowTone = "blocked" | "working" | "idle";

const LIVE_DISPLAY_STATUSES = new Set([
  "active",
  "starting",
  "stopping",
  "provisioning",
  "host-reconnecting",
  "waiting-for-host",
]);

const STATUS_REFRESH_DEBOUNCE_MS = 150;

function SidebarThreadList({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const { values: settingsValues } = useSettings();
  const settings = useMemo(
    () => parseListSettings(settingsValues as Record<string, unknown> | undefined),
    [settingsValues],
  );
  const rpc = useRpc<typeof rpcContract>();

  const sections = useMemo(
    () => buildListSections(threads, projects, settings, searchQuery),
    [projects, searchQuery, settings, threads],
  );
  const visibleThreads = useMemo(
    () => filterVisibleThreads(threads, settings, searchQuery),
    [searchQuery, settings, threads],
  );

  const [gitStats, setGitStats] = useState<Record<string, string | null>>({});
  const [threadModels, setThreadModels] = useState<
    Record<string, ThreadModelMetadata>
  >({});
  const [displayStatuses, setDisplayStatuses] = useState<
    Record<string, string | null>
  >({});
  const [statusRefreshTick, setStatusRefreshTick] = useState(0);
  const visibleThreadIds = useMemo(
    () => new Set(visibleThreads.map((thread) => thread.id)),
    [visibleThreads],
  );
  const visibleThreadIdsRef = useRef(visibleThreadIds);
  visibleThreadIdsRef.current = visibleThreadIds;
  const statusRefreshTimerRef = useRef<number | null>(null);

  useRealtime("thread:changed", (payload) => {
    if (!shouldRefreshDisplayStatuses(payload, visibleThreadIdsRef.current)) {
      return;
    }
    if (statusRefreshTimerRef.current !== null) {
      window.clearTimeout(statusRefreshTimerRef.current);
    }
    statusRefreshTimerRef.current = window.setTimeout(() => {
      statusRefreshTimerRef.current = null;
      setStatusRefreshTick((tick) => tick + 1);
    }, STATUS_REFRESH_DEBOUNCE_MS);
  });

  useEffect(
    () => () => {
      if (statusRefreshTimerRef.current !== null) {
        window.clearTimeout(statusRefreshTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!settings.showDiff) {
      setGitStats({});
      return;
    }

    const environmentIds = [
      ...new Set(
        visibleThreads
          .map((thread) => thread.environment?.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    if (environmentIds.length === 0) {
      setGitStats({});
      return;
    }

    let cancelled = false;
    void rpc
      .call("gitStats", { environmentIds })
      .then(({ stats }) => {
        if (!cancelled) setGitStats(stats);
      })
      .catch(() => {
        if (!cancelled) setGitStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, settings.showDiff, visibleThreads]);

  useEffect(() => {
    if (!settings.showModel) {
      setThreadModels({});
      return;
    }

    const threadIds = visibleThreads.map((thread) => thread.id);
    if (threadIds.length === 0) {
      setThreadModels({});
      return;
    }

    let cancelled = false;
    void rpc
      .call("threadModels", { threadIds })
      .then(({ models }) => {
        if (!cancelled) setThreadModels(models);
      })
      .catch(() => {
        // Keep the last good model labels on transient RPC failure.
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, settings.showModel, visibleThreads]);

  useEffect(() => {
    const threadIds = visibleThreads.map((thread) => thread.id);
    if (threadIds.length === 0) {
      setDisplayStatuses({});
      return;
    }

    let cancelled = false;
    void rpc
      .call("threadDisplayStatuses", { threadIds })
      .then(({ statuses }) => {
        if (!cancelled) setDisplayStatuses(statuses);
      })
      .catch(() => {
        // Keep the last good runtime tones on transient RPC failure.
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, visibleThreads, statusRefreshTick]);

  if (status === "loading") return null;

  if (status === "error") {
    return <StatusText>Could not load threads.</StatusText>;
  }

  if (totalRowCount(sections) === 0) {
    return (
      <StatusText>
        {searchQuery.trim().length > 0 ? "No threads found" : "No threads yet"}
      </StatusText>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
      {sections.map((section) => (
        <ListSectionView
          key={sectionKey(section)}
          section={section}
          activeThreadId={activeThreadId}
          settings={settings}
          gitStats={gitStats}
          threadModels={threadModels}
          displayStatuses={displayStatuses}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function sectionKey(section: ListSection): string {
  switch (section.kind) {
    case "pinned":
      return "pinned";
    case "project":
      return section.projectId;
    case "flat":
      return section.title ?? "flat";
  }
}

function sectionTitle(section: ListSection): string | null {
  switch (section.kind) {
    case "pinned":
      return section.title;
    case "project":
      return section.projectName;
    case "flat":
      return section.title;
  }
}

function ListSectionView({
  section,
  activeThreadId,
  settings,
  gitStats,
  threadModels,
  displayStatuses,
  onNavigate,
}: {
  section: ListSection;
  activeThreadId: string | null;
  settings: ReturnType<typeof parseListSettings>;
  gitStats: Record<string, string | null>;
  threadModels: Record<string, ThreadModelMetadata>;
  displayStatuses: Record<string, string | null>;
  onNavigate: () => void;
}) {
  const title = sectionTitle(section);

  return (
    <section className="mb-3 last:mb-0">
      {title ? (
        <div className="sticky top-0 z-10 bg-sidebar px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-normal text-muted-foreground/70">
          {title}
        </div>
      ) : null}
      <ol className="space-y-1">
        {section.rows.map((row) => (
          <ThreadRow
            key={row.thread.id}
            row={row}
            isActive={row.thread.id === activeThreadId}
            settings={settings}
            gitStat={
              row.thread.environment?.id
                ? gitStats[row.thread.environment.id]
                : null
            }
            modelMetadata={threadModels[row.thread.id]}
            displayStatus={displayStatuses[row.thread.id]}
            onNavigate={onNavigate}
          />
        ))}
      </ol>
    </section>
  );
}

function ThreadRow({
  row,
  isActive,
  settings,
  gitStat,
  modelMetadata,
  displayStatus,
  onNavigate,
}: {
  row: ThreadRowModel;
  isActive: boolean;
  settings: ReturnType<typeof parseListSettings>;
  gitStat: string | null | undefined;
  modelMetadata: ThreadModelMetadata | undefined;
  displayStatus: string | null | undefined;
  onNavigate: () => void;
}) {
  const { thread, depth, isArchivedChild } = row;
  const actions = useSidebarThreadActions();
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const tone = isArchivedChild ? "idle" : rowTone(thread, displayStatus);
  const title = threadTitle(thread);
  const subtitleParts = buildSubtitleParts({
    thread,
    settings,
    gitStat,
    modelMetadata,
    pullRequest,
  });
  const statusLabel = thread.indicatorLabel;
  const ariaLabel = [
    title,
    statusLabel,
    ...subtitleParts,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <ThreadContextMenu
      thread={thread}
      title={title}
      pullRequest={pullRequest}
      onNavigate={onNavigate}
    >
      <a
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        href="#"
        aria-label={ariaLabel}
        {...splitProps}
        onClick={(event) => {
          event.preventDefault();
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
        style={{
          ...(depth > 0 ? { marginLeft: Math.min(depth, 4) * 16 } : undefined),
          ...rowStyle(tone, isActive, isArchivedChild),
        }}
        className={cn(
          "group block rounded-md border px-2.5 py-2 transition-colors",
          isArchivedChild && "opacity-60",
          tone === "idle" && idleRowClass(isActive, layout !== null),
        )}
      >
        <div className="relative flex min-w-0 items-center gap-2">
          {depth > 0 ? (
            <span className="absolute left-1 top-1/2 h-px w-2 -translate-x-3 -translate-y-1/2 bg-sidebar-border" />
          ) : null}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={statusDotStyle(tone, thread.isUnread, isArchivedChild)}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm text-foreground",
              thread.isUnread && !isArchivedChild && "font-medium",
            )}
          >
            {title}
          </span>
          {thread.isPinned ? (
            <span className="shrink-0 text-2xs font-medium text-muted-foreground">
              pinned
            </span>
          ) : null}
          {isArchivedChild ? (
            <span className="shrink-0 text-2xs font-medium text-muted-foreground">
              archived
            </span>
          ) : null}
        </div>
        <SubtitleRow
          thread={thread}
          settings={settings}
          gitStat={gitStat}
          modelMetadata={modelMetadata}
          pullRequest={pullRequest}
        />
      </a>
    </ThreadContextMenu>
  );
}

function StatusText({ children }: { children: string }) {
  return (
    <p role="status" className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function idleRowClass(isActive: boolean, isSplitOpen: boolean) {
  return cn(
    "border-transparent",
    isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
    !isActive && isSplitOpen && "bg-sidebar-accent/30",
  );
}

function rowStyle(
  tone: RowTone,
  isActive: boolean,
  isArchivedChild: boolean,
): CSSProperties {
  if (isArchivedChild) return {};
  const fill = isActive ? 15 : 10;
  if (tone === "working") {
    return {
      backgroundColor: `color-mix(in oklab, var(--color-emerald-500) ${fill}%, transparent)`,
      borderColor: "color-mix(in oklab, var(--color-emerald-500) 25%, transparent)",
    };
  }
  if (tone === "blocked") {
    return {
      backgroundColor: `color-mix(in oklab, var(--destructive) ${fill}%, transparent)`,
      borderColor: "color-mix(in oklab, var(--destructive) 35%, transparent)",
    };
  }
  return {};
}

function statusDotStyle(
  tone: RowTone,
  isUnread: boolean,
  isArchivedChild: boolean,
): CSSProperties {
  if (isArchivedChild) {
    return {
      backgroundColor:
        "color-mix(in oklab, var(--muted-foreground) 35%, transparent)",
    };
  }
  if (tone === "blocked") {
    return { backgroundColor: "var(--destructive)" };
  }
  if (tone === "working") {
    return { backgroundColor: "var(--color-emerald-500)" };
  }
  if (isUnread) {
    return { backgroundColor: "var(--timeline-accent)" };
  }
  return {
    backgroundColor:
      "color-mix(in oklab, var(--muted-foreground) 35%, transparent)",
  };
}

function rowTone(
  thread: PluginSidebarThread,
  displayStatus?: string | null,
): RowTone {
  const { indicator, indicatorLabel, hasPendingInteraction, activity } = thread;

  if (
    indicator === "waiting-for-input" ||
    indicator === "unread-error" ||
    hasPendingInteraction ||
    displayStatus === "error"
  ) {
    return "blocked";
  }

  if (isLiveDisplayStatus(displayStatus)) {
    return "working";
  }

  if (
    hasActiveActivity(activity) ||
    /running|working|active|stopping|agent|workflow|command|plan|goal/.test(
      (indicatorLabel ?? "").toLowerCase(),
    ) ||
    indicator === "runtime" ||
    indicator === "workflow" ||
    indicator === "background-agent" ||
    indicator === "background-command" ||
    indicator === "plan-mode" ||
    indicator === "goal" ||
    indicator === "working-draft"
  ) {
    return "working";
  }

  return "idle";
}

function isLiveDisplayStatus(displayStatus?: string | null): boolean {
  return (
    typeof displayStatus === "string" &&
    LIVE_DISPLAY_STATUSES.has(displayStatus)
  );
}

function shouldRefreshDisplayStatuses(
  payload: unknown,
  visibleThreadIds: ReadonlySet<string>,
): boolean {
  const event =
    payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  if (event === null) return false;

  const changes = event.changes;
  if (
    !Array.isArray(changes) ||
    !changes.some((change) => change === "status-changed")
  ) {
    return false;
  }

  const threadId = event.id;
  if (typeof threadId !== "string") return false;
  if (visibleThreadIds.size === 0) return false;
  return visibleThreadIds.has(threadId);
}

function hasActiveActivity(activity: PluginSidebarThread["activity"]): boolean {
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "tinted-threads",
    title: "Tinted Threads",
    description:
      "A configurable tinted thread list with subtitles, grouping, and pull request actions.",
    component: SidebarThreadList,
  });
});
