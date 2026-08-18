import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  definePluginApp,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  useRealtime,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { rpcContract } from "./server";
import { HermesIcon } from "./hermes-icon";

type ThreadWithOptionalMetadata = PluginSidebarThread &
  Record<string, unknown> & {
    environment?: Record<string, unknown> | null;
    runtime?: Record<string, unknown> | null;
  };

type RowTone = "blocked" | "working" | "idle";

type ThreadRowModel = {
  thread: PluginSidebarThread;
  depth: number;
};

type ThreadProjectGroup = {
  projectId: string;
  projectName: string;
  rows: ThreadRowModel[];
};

type ThreadModelMetadata = {
  providerId: string;
  model: string | null;
};

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
  const rpc = useRpc<typeof rpcContract>();
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => !thread.isArchived)
        .filter((thread) => matchesSearch(thread, searchQuery))
        .sort(compareThreads),
    [searchQuery, threads],
  );
  const visibleRows = useMemo(
    () => nestedThreadRows(visibleThreads),
    [visibleThreads],
  );
  const visibleGroups = useMemo(
    () => projectThreadGroups(visibleThreads, projectNameById),
    [projectNameById, visibleThreads],
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
  }, [rpc, visibleThreads]);

  useEffect(() => {
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
  }, [rpc, visibleThreads]);

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

  if (visibleRows.length === 0) {
    return (
      <StatusText>
        {searchQuery.trim().length > 0 ? "No threads found" : "No threads yet"}
      </StatusText>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
      {visibleGroups.map((group) => (
        <section key={group.projectId} className="mb-3 last:mb-0">
          <div className="sticky top-0 z-10 bg-sidebar px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-normal text-muted-foreground/70">
            {group.projectName}
          </div>
          <ol className="space-y-1">
            {group.rows.map(({ thread, depth }) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                depth={depth}
                isActive={thread.id === activeThreadId}
                gitStat={
                  thread.environment?.id
                    ? gitStats[thread.environment.id]
                    : null
                }
                modelMetadata={threadModels[thread.id]}
                displayStatus={displayStatuses[thread.id]}
                onNavigate={onNavigate}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ThreadRow({
  thread,
  depth,
  isActive,
  gitStat,
  modelMetadata,
  displayStatus,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  depth: number;
  isActive: boolean;
  gitStat: string | null | undefined;
  modelMetadata: ThreadModelMetadata | undefined;
  displayStatus: string | null | undefined;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const tone = rowTone(thread, displayStatus);
  const title = threadTitle(thread);
  const metadata = subtitleMetadata(thread, gitStat, modelMetadata);
  const subtitle = subtitleLabel(metadata);

  return (
    <ThreadContextMenu thread={thread} title={title} onNavigate={onNavigate}>
      <a
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        href="#"
        aria-label={subtitle.length > 0 ? `${title}, ${subtitle}` : title}
        {...splitProps}
        onClick={(event) => {
          event.preventDefault();
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
        style={{
          ...(depth > 0 ? { marginLeft: Math.min(depth, 4) * 16 } : undefined),
          ...rowStyle(tone, isActive),
        }}
        className={cn(
          "group block rounded-md border px-2.5 py-2 transition-colors",
          tone === "idle" && idleRowClass(isActive, layout !== null),
        )}
      >
        <div className="relative flex min-w-0 items-center gap-2">
          {depth > 0 ? (
            <span className="absolute left-1 top-1/2 h-px w-2 -translate-x-3 -translate-y-1/2 bg-sidebar-border" />
          ) : null}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={statusDotStyle(tone, thread.isUnread)}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm text-foreground",
              thread.isUnread && "font-medium",
            )}
          >
            {title}
          </span>
          {thread.isPinned ? (
            <span className="shrink-0 text-2xs font-medium text-muted-foreground">
              pinned
            </span>
          ) : null}
        </div>
        {metadata.model || metadata.diff || metadata.branch ? (
          <div
            className={cn(
              "mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground",
              "pl-4",
            )}
          >
            {metadata.model ? (
              <ModelCell
                label={metadata.model}
                providerId={modelMetadata?.providerId ?? thread.providerId}
              />
            ) : null}
            {metadata.diff ? <DiffCell diff={metadata.diff} /> : null}
            {metadata.branch ? <BranchCell label={metadata.branch} /> : null}
          </div>
        ) : null}
      </a>
    </ThreadContextMenu>
  );
}

function ThreadContextMenu({
  thread,
  title,
  onNavigate,
  children,
}: {
  thread: PluginSidebarThread;
  title: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();

  return (
    <li className="list-none">
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Thread actions"
            className="z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md"
          >
            <MenuItem
              onSelect={() => {
                actions.open(thread.id);
                onNavigate();
              }}
            >
              Open
            </MenuItem>
            <MenuItem
              onSelect={() => {
                actions.open(thread.id, { split: true });
                onNavigate();
              }}
            >
              Open in split
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
            >
              {thread.isPinned ? "Unpin" : "Pin"}
            </MenuItem>
            <MenuItem
              onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
            >
              {thread.isUnread ? "Mark read" : "Mark unread"}
            </MenuItem>
            <MenuItem
              onSelect={(event) => {
                event.preventDefault();
                window.setTimeout(() => {
                  const next = window.prompt("Rename thread", title);
                  if (next && next.trim() && next.trim() !== title) {
                    void actions.rename(thread.id, next.trim());
                  }
                }, 0);
              }}
            >
              Rename
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => actions.archive(thread.id)}>Archive</MenuItem>
            <MenuItem destructive onSelect={() => actions.requestDelete(thread.id)}>
              Delete
            </MenuItem>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}

function MenuItem({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: (event: Event) => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded px-2 py-1.5 outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive hover:text-destructive",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function MenuSeparator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}

function StatusText({ children }: { children: string }) {
  return (
    <p role="status" className="px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function ClaudeIcon() {
  return (
    <svg
      viewBox="0 0 149 149"
      fill="currentColor"
      role="img"
      aria-label="Claude"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M29 98.5 58.2 82.2l.5-1.4-.5-.8h-1.4l-4.9-.3-16.6-.5-14.5-.6-14-.7-3.5-.8L0 72.8l.3-2.2 3-2 4.2.4 9.4.6 14 1 10.2.6 15.1 1.6h2.4l.3-1-.8-.6-.6-.6-14.6-9.9-15.7-10.4-8.3-6-4.4-3-2.3-2.9-1-6.2 4.1-4.5 5.4.4 1.4.4 5.5 4.2 11.8 9.1 15.3 11.3 2.3 1.9.9-.7.1-.4-1-1.7-8.3-15.1-8.9-15.4-4-6.3-1-3.9c-.4-1.5-.7-2.9-.7-4.4L38.8.8 41.3 0l6.2.8 2.6 2.3 3.8 8.7 6.2 13.8 9.6 18.7 2.8 5.5 1.5 5.2.6 1.6h1v-.9l.8-10.6 1.4-12.9L79.2 15.5l.5-4.7 2.3-5.6L86.6 2.2l3.6 1.7 3 4.2-.4 2.8-1.8 11.4-3.4 17.9-2.3 12h1.3l1.5-1.5 6.1-8 10.2-12.8 4.5-5 5.2-5.6 3.4-2.7h6.4l4.7 7-2.1 7.2-6.6 8.3-5.4 7-7.8 10.6-4.9 8.4.5.7 1.1-.1 17.7-3.8 9.5-1.7 11.4-2 5.1 2.4.6 2.5-2 5-12.2 3-14.2 2.8-21.2 5-.3.2.3.4 9.6.9 4 .2h10l18.7 1.4 4.8 3.2 3 4-.5 3-7.5 3.8-10.2-2.4-23.6-5.6-8.1-2H97v.7l6.8 6.6 12.3 11.2 15.5 14.4.8 3.5-2 2.8-2.1-.3-13.6-10.2-5.2-4.6-12-10h-.7v1l2.7 4 14.5 21.8.7 6.7-1 2.1-3.7 1.4-4.2-.8-8.4-11.9-8.8-13.4-7-12-.9.5-4.2 44.8-1.9 2.3-4.5 1.7-3.8-2.8-2-4.7 2-9 2.4-11.9 2-9.5 1.7-11.7 1.1-3.9-.1-.3-.9.1-8.8 12.2-13.5 18.2-10.6 11.4-2.6 1-4.4-2.3.4-4 2.5-3.7 14.7-18.7 8.9-11.6 5.8-6.7v-1h-.4l-39.1 25.4-7 .9-3-2.8.4-4.6 1.4-1.5 11.8-8.1z" />
    </svg>
  );
}

function ModelCell({
  label,
  providerId,
}: {
  label: string;
  providerId: string;
}) {
  return (
    <span className="flex min-w-0 max-w-[5.75rem] shrink items-center gap-1">
      <ProviderIcon providerId={providerId} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function ProviderIcon({ providerId }: { providerId: string }) {
  if (providerId === "claude-code" || providerId.startsWith("claude")) {
    return <ClaudeIcon />;
  }
  if (providerId === "codex" || providerId.startsWith("openai")) {
    return <CodexIcon />;
  }
  if (providerId === "pi") return <PiIcon />;
  if (providerId === "acp-cursor") return <CursorIcon />;
  if (providerId === "acp-opencode") return <OpenCodeIcon />;
  if (providerId === "acp-hermes-agent") return <HermesIcon />;
  return (
    <span
      aria-label={labelize(providerId)}
      role="img"
      className="flex size-3 shrink-0 items-center justify-center rounded-full bg-muted text-[7px] font-semibold text-muted-foreground"
    >
      {providerInitial(providerId)}
    </span>
  );
}

function CodexIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Codex"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.03l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .03.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.54-3.02l.15.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86L13.1 8.36l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.03l-.14-.08-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.4.68zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Cursor"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

function PiIcon() {
  return (
    <svg
      viewBox="100 100 600 600"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Pi"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29V165.29ZM282.65 282.65V400H400V282.65H282.65Z" />
      <path d="M517.36 400H634.72V634.72H517.36V400Z" />
    </svg>
  );
}

function OpenCodeIcon() {
  return (
    <svg
      viewBox="-72 -42 384 384"
      fill="currentColor"
      role="img"
      aria-label="OpenCode"
      className="size-3 shrink-0 text-muted-foreground/80"
    >
      <path d="M180 240H60V120H180V240Z" fillOpacity={0.45} />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
    </svg>
  );
}

function DiffCell({ diff }: { diff: DiffStat }) {
  return (
    <span
      aria-label={`+${diff.additions} -${diff.deletions}`}
      className="flex shrink-0 items-center gap-0.5 font-mono tabular-nums"
    >
      <span
        className="rounded border border-emerald-500/25 bg-emerald-500/10 px-0.5 font-medium"
        style={{ color: "var(--color-emerald-500)" }}
      >
        +{diff.additions}
      </span>
      <span
        className="rounded border border-destructive/25 bg-destructive/10 px-0.5 font-medium"
        style={{ color: "var(--destructive)" }}
      >
        -{diff.deletions}
      </span>
    </span>
  );
}

function BranchCell({ label }: { label: string }) {
  return (
    <span className="min-w-0 flex-[0_1_5.25rem] truncate font-mono">
      {label}
    </span>
  );
}

function idleRowClass(isActive: boolean, isSplitOpen: boolean) {
  return cn(
    "border-transparent",
    isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
    !isActive && isSplitOpen && "bg-sidebar-accent/30",
  );
}

/** Plugin Tailwind often misses host tokens — inline color-mix matches DiffCell. */
function rowStyle(tone: RowTone, isActive: boolean): CSSProperties {
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

function statusDotStyle(tone: RowTone, isUnread: boolean): CSSProperties {
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
  const event = objectValue(payload);
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
  if (activity == null) return false;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0
  );
}

type DiffStat = {
  additions: number;
  deletions: number;
};

type SubtitleMetadata = {
  model: string;
  diff: DiffStat | null;
  branch: string | null;
};

function subtitleMetadata(
  thread: PluginSidebarThread,
  gitStat?: string | null,
  modelMetadata?: ThreadModelMetadata,
): SubtitleMetadata {
  return {
    model: modelLabel(thread, modelMetadata),
    diff: parseDiffStat(gitStat ?? gitDelta(thread)),
    branch: worktreeName(thread),
  };
}

function modelLabel(
  thread: PluginSidebarThread,
  modelMetadata?: ThreadModelMetadata,
): string {
  const data = thread as ThreadWithOptionalMetadata;
  const providerId = modelMetadata?.providerId ?? data.providerId;
  const model =
    modelMetadata?.model ??
    firstString(data.model, data.modelId, data.providerModel);

  if (providerId === "claude-code") {
    return claudeModelName(model);
  }

  if (providerId === "codex") {
    return codexModelName(model);
  }

  return model ? readableModelName(model) : labelize(String(providerId));
}

function claudeModelName(model: string | null): string {
  if (!model) return "Sonnet 5";
  const normalized = shortModel(model).replace(/^claude-?/i, "");
  if (/sonnet/i.test(normalized)) return compactClaudeName(normalized, "Sonnet");
  if (/opus/i.test(normalized)) return compactClaudeName(normalized, "Opus");
  if (/haiku/i.test(normalized)) return compactClaudeName(normalized, "Haiku");
  return normalized;
}

function compactClaudeName(value: string, family: "Sonnet" | "Opus" | "Haiku") {
  const major = value.match(/\b([3-9])(?:[.-]\d)?\b/)?.[1];
  return major ? `${family} ${major}` : family;
}

function codexModelName(model: string | null): string {
  if (!model) return "GPT";
  const normalized = shortModel(model).replace(/\[[^\]]+\]/g, "").trim();
  const gptMatch = normalized.match(/^gpt[-_\s]*(.+)$/i);
  if (gptMatch?.[1]) return compactCodexModelName(gptMatch[1]);
  return readableModelName(normalized);
}

function compactCodexModelName(model: string): string {
  const parts = model
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : titleCaseToken(part)));

  return parts.length > 1 ? `${parts[0]}-${parts.slice(1).join("-")}` : parts[0];
}

function readableModelName(model: string): string {
  return shortModel(model)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(gpt|o)(\d)/gi, (_, family: string, version: string) =>
      `${family.toUpperCase()}-${version}`,
    )
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function worktreeName(thread: PluginSidebarThread): string | null {
  const data = thread as ThreadWithOptionalMetadata;
  const env = objectValue(data.environment) ?? {};
  const raw =
    firstString(
      env.name,
      env.worktreeName,
      data.environmentName,
      env.branchName,
      data.environmentBranchName,
      data.worktreeName,
      data.branchName,
    ) ?? firstString(data.host?.name);

  if (!raw) return null;
  return basename(raw);
}

function gitDelta(thread: PluginSidebarThread): string | null {
  const data = thread as ThreadWithOptionalMetadata;
  const source =
    objectValue(data.gitStatus) ??
    objectValue(data.git) ??
    objectValue(data.diff) ??
    objectValue(data.environment?.gitStatus) ??
    objectValue(data.environment?.diff);

  const added = firstNumber(
    source?.added,
    source?.additions,
    source?.insertions,
    data.gitAdded,
    data.additions,
  );
  const removed = firstNumber(
    source?.removed,
    source?.deleted,
    source?.deletions,
    data.gitRemoved,
    data.deletions,
  );

  if (added !== null || removed !== null) {
    return `+${added ?? 0} -${removed ?? 0}`;
  }

  const summary = firstString(source?.short, source?.summary, data.gitStatusShort);
  return summary && summary.length <= 18 ? summary : null;
}

function parseDiffStat(value: string | null): DiffStat | null {
  if (!value) return null;
  const additions = value.match(/\+(\d+)/)?.[1];
  const deletions = value.match(/-(\d+)/)?.[1];
  if (additions === undefined && deletions === undefined) return null;
  return {
    additions: additions === undefined ? 0 : Number(additions),
    deletions: deletions === undefined ? 0 : Number(deletions),
  };
}

function subtitleLabel({ model, diff, branch }: SubtitleMetadata): string {
  return [
    model,
    diff ? `+${diff.additions} -${diff.deletions}` : null,
    branch,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function matchesSearch(thread: PluginSidebarThread, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return threadTitle(thread).toLowerCase().includes(normalized);
}

function compareThreads(left: PluginSidebarThread, right: PluginSidebarThread) {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  return right.createdAt - left.createdAt || left.id.localeCompare(right.id);
}

function nestedThreadRows(
  threads: readonly PluginSidebarThread[],
): ThreadRowModel[] {
  const threadIds = new Set(threads.map((thread) => thread.id));
  const childrenByParent = new Map<string, PluginSidebarThread[]>();
  const roots: PluginSidebarThread[] = [];

  for (const thread of threads) {
    if (thread.parentThreadId && threadIds.has(thread.parentThreadId)) {
      const children = childrenByParent.get(thread.parentThreadId) ?? [];
      children.push(thread);
      childrenByParent.set(thread.parentThreadId, children);
    } else {
      roots.push(thread);
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareThreads);
  }

  const rows: ThreadRowModel[] = [];
  const seen = new Set<string>();

  function visit(thread: PluginSidebarThread, depth: number) {
    if (seen.has(thread.id)) return;
    seen.add(thread.id);
    rows.push({ thread, depth });
    for (const child of childrenByParent.get(thread.id) ?? []) {
      visit(child, depth + 1);
    }
  }

  for (const root of roots) {
    visit(root, 0);
  }

  return rows;
}

function projectThreadGroups(
  threads: readonly PluginSidebarThread[],
  projectNameById: ReadonlyMap<string, string>,
): ThreadProjectGroup[] {
  const threadsByProject = new Map<string, PluginSidebarThread[]>();

  for (const thread of threads) {
    const projectThreads = threadsByProject.get(thread.projectId) ?? [];
    projectThreads.push(thread);
    threadsByProject.set(thread.projectId, projectThreads);
  }

  return Array.from(threadsByProject, ([projectId, projectThreads]) => ({
    projectId,
    projectName: projectNameById.get(projectId) ?? projectId,
    rows: nestedThreadRows(projectThreads),
  }));
}

function threadTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

function shortModel(model: string): string {
  return model.replace(/^openai\//, "").replace(/^anthropic\//, "");
}

function labelize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

function titleCaseToken(part: string): string {
  return part.slice(0, 1).toUpperCase() + part.slice(1);
}

function providerInitial(providerId: string): string {
  return labelize(providerId).slice(0, 1).toUpperCase() || "?";
}

function basename(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "tinted-threads",
    title: "Tinted Threads",
    description:
      "A compact thread list with blocked and working row hues plus provider/worktree subtitles.",
    component: SidebarThreadList,
  });
});
