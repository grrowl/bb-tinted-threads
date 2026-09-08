import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
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
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  GitBranchIcon,
  PinIcon,
  Robot01Icon,
} from "@hugeicons/core-free-icons";
import { buildSubtitleParts, SubtitleRow } from "@/components/subtitle-row";
import { ThreadContextMenu } from "@/components/thread-context-menu";
import { useCollapsedThreads } from "@/components/use-collapsed-threads";
import { useManualOrder } from "@/components/use-manual-order";
import {
  useReorderDrag,
  type ReorderControls,
} from "@/components/use-reorder-drag";
import {
  buildListSections,
  dragScopeById,
  filterVisibleThreads,
  rootRowIds,
  totalRowCount,
  type ListSection,
  type ThreadRowModel,
} from "@/lib/list-view";
import { buildOrderRank } from "@/lib/manual-order";
import { parseListSettings } from "@/lib/settings";
import { type ThreadModelMetadata } from "@/lib/subtitle";
import type { PullRequestDetail } from "@/lib/pull-request";
import { threadTitle } from "@/lib/thread-title";
import { cn } from "@/lib/utils";
import type { rpcContract } from "./server";

type RowTone = "blocked" | "working" | "idle";

type ChildToneCounts = { blocked: number; working: number; idle: number };

const TONE_SEVERITY: Record<RowTone, number> = {
  idle: 0,
  working: 1,
  blocked: 2,
};

/** The more attention-worthy of two tones (blocked > working > idle). */
function maxTone(a: RowTone | null, b: RowTone | null): RowTone | null {
  if (a === null) return b;
  if (b === null) return a;
  return TONE_SEVERITY[a] >= TONE_SEVERITY[b] ? a : b;
}

const LIVE_DISPLAY_STATUSES = new Set([
  "active",
  "starting",
  "stopping",
  "provisioning",
  "host-reconnecting",
  "waiting-for-host",
]);

const STATUS_REFRESH_DEBOUNCE_MS = 150;
const THREAD_MODEL_BATCH_SIZE = 120;

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

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
  const isManual = settings.sortBy === "manual";
  const manualOrder = useManualOrder();
  const collapsed = useCollapsedThreads();

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const baseSections = useMemo(
    () =>
      buildListSections(
        threads,
        projects,
        settings,
        searchQuery,
        manualOrder.orderRank,
        collapsed.collapsedIds,
      ),
    [
      collapsed.collapsedIds,
      manualOrder.orderRank,
      projects,
      searchQuery,
      settings,
      threads,
    ],
  );

  const dragContext = useMemo(
    () => ({
      baseRootIds: rootRowIds(baseSections),
      scopeById: dragScopeById(baseSections),
    }),
    [baseSections],
  );
  const reorderDrag = useReorderDrag({
    enabled: isManual,
    isReordering: manualOrder.isReordering,
    context: dragContext,
    reorder: manualOrder.reorder,
  });

  // While dragging, re-rank the list under the cursor so rows slide live.
  const sections = useMemo(() => {
    if (!reorderDrag.dragOrderIds) return baseSections;
    return buildListSections(
      threads,
      projects,
      settings,
      searchQuery,
      buildOrderRank(reorderDrag.dragOrderIds),
      collapsed.collapsedIds,
    );
  }, [
    baseSections,
    collapsed.collapsedIds,
    projects,
    reorderDrag.dragOrderIds,
    searchQuery,
    settings,
    threads,
  ]);
  const visibleThreads = useMemo(
    () => filterVisibleThreads(threads, settings, searchQuery),
    [searchQuery, settings, threads],
  );
  const visibleThreadIdsKey = useMemo(
    () => visibleThreads.map((thread) => thread.id).sort().join(","),
    [visibleThreads],
  );

  const [gitStats, setGitStats] = useState<Record<string, string | null>>({});
  const [pullRequestDetails, setPullRequestDetails] = useState<
    Record<string, PullRequestDetail | null>
  >({});
  const [threadModels, setThreadModels] = useState<
    Record<string, ThreadModelMetadata>
  >({});
  const [displayStatuses, setDisplayStatuses] = useState<
    Record<string, string | null>
  >({});
  const [statusRefreshTick, setStatusRefreshTick] = useState(0);

  // Aggregate each parent's descendant tone so a collapsed row's disclosure
  // badge can signal "something inside needs you" (red) or "work is running"
  // (green) without expanding it.
  const childToneByParent = useMemo(() => {
    const childrenByParent = new Map<string, PluginSidebarThread[]>();
    for (const thread of visibleThreads) {
      const parentId = thread.parentThreadId;
      if (!parentId) continue;
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(thread);
      childrenByParent.set(parentId, siblings);
    }

    const result = new Map<string, RowTone>();
    const visiting = new Set<string>();
    function descendantTone(id: string): RowTone | null {
      const children = childrenByParent.get(id);
      if (!children || children.length === 0 || visiting.has(id)) return null;
      visiting.add(id);
      let best: RowTone | null = null;
      for (const child of children) {
        const childTone = child.isArchived
          ? "idle"
          : rowTone(child, displayStatuses[child.id]);
        best = maxTone(maxTone(best, childTone), descendantTone(child.id));
        if (best === "blocked") break;
      }
      visiting.delete(id);
      return best;
    }

    for (const thread of visibleThreads) {
      if (!childrenByParent.has(thread.id)) continue;
      const tone = descendantTone(thread.id);
      if (tone) result.set(thread.id, tone);
    }
    return result;
  }, [displayStatuses, visibleThreads]);

  // Break each parent's direct children down by tone so the disclosure badge
  // can read `working/idle` (e.g. 3/1), or `blocked/working/idle` when any
  // child needs input. Counts direct children only, matching childThreadCount.
  const childCountsByParent = useMemo(() => {
    const result = new Map<string, ChildToneCounts>();
    for (const thread of visibleThreads) {
      const parentId = thread.parentThreadId;
      if (!parentId) continue;
      const tone: RowTone = thread.isArchived
        ? "idle"
        : rowTone(thread, displayStatuses[thread.id]);
      const bucket = result.get(parentId) ?? { blocked: 0, working: 0, idle: 0 };
      bucket[tone] += 1;
      result.set(parentId, bucket);
    }
    return result;
  }, [displayStatuses, visibleThreads]);
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
    if (!settings.showPullRequest) {
      setPullRequestDetails({});
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
      setPullRequestDetails({});
      return;
    }

    let cancelled = false;
    void rpc
      .call("pullRequestDetails", { environmentIds })
      .then(({ details }) => {
        if (!cancelled) setPullRequestDetails(details);
      })
      .catch(() => {
        if (!cancelled) setPullRequestDetails({});
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, settings.showPullRequest, visibleThreads]);

  useEffect(() => {
    if (!settings.showModel) {
      setThreadModels({});
      return;
    }

    const threadIds = visibleThreadIdsKey ? visibleThreadIdsKey.split(",") : [];
    if (threadIds.length === 0) {
      setThreadModels({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      batches(threadIds, THREAD_MODEL_BATCH_SIZE).map((ids) =>
        rpc.call("threadModels", { threadIds: ids }),
      ),
    )
      .then((responses) => {
        if (!cancelled) {
          const models = responses.reduce<Record<string, ThreadModelMetadata>>(
            (all, response) => ({
              ...all,
              ...(response.models as Record<string, ThreadModelMetadata>),
            }),
            {},
          );
          setThreadModels((previous) =>
            Object.fromEntries(
              Object.entries(models).map(([threadId, metadata]) => {
                const prior = previous[threadId];
                // A temporary inability to resolve historic execution options
                // must not erase the last verified model for this same row.
                return [
                  threadId,
                  metadata.status === "unknown" && prior?.status === "known"
                    ? prior
                    : metadata,
                ];
              }),
            ),
          );
        }
      })
      .catch(() => {
        // Keep the last good model labels on transient RPC failure.
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, settings.showModel, visibleThreadIdsKey]);

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
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-0.5 pb-2">
      {sections.map((section) => (
        <ListSectionView
          key={sectionKey(section)}
          section={section}
          activeThreadId={activeThreadId}
          settings={settings}
          gitStats={gitStats}
          pullRequestDetails={pullRequestDetails}
          threadModels={threadModels}
          displayStatuses={displayStatuses}
          projectNameById={projectNameById}
          childToneByParent={childToneByParent}
          childCountsByParent={childCountsByParent}
          isManual={isManual}
          controlsFor={reorderDrag.controlsFor}
          onToggleCollapse={collapsed.toggle}
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
  pullRequestDetails,
  threadModels,
  displayStatuses,
  projectNameById,
  childToneByParent,
  childCountsByParent,
  isManual,
  controlsFor,
  onToggleCollapse,
  onNavigate,
}: {
  section: ListSection;
  activeThreadId: string | null;
  settings: ReturnType<typeof parseListSettings>;
  gitStats: Record<string, string | null>;
  pullRequestDetails: Record<string, PullRequestDetail | null>;
  threadModels: Record<string, ThreadModelMetadata>;
  displayStatuses: Record<string, string | null>;
  projectNameById: ReadonlyMap<string, string>;
  childToneByParent: ReadonlyMap<string, RowTone>;
  childCountsByParent: ReadonlyMap<string, ChildToneCounts>;
  isManual: boolean;
  controlsFor: (threadId: string) => ReorderControls;
  onToggleCollapse: (threadId: string) => void;
  onNavigate: () => void;
}) {
  const title = sectionTitle(section);
  // Cross-project sections (the flat list, the pinned strip) lose the project
  // header, so caption each root row with its project instead.
  const showProjectLabel = section.kind !== "project";

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
            isInPinnedSection={section.kind === "pinned"}
            settings={settings}
            gitStat={
              row.thread.environment?.id
                ? gitStats[row.thread.environment.id]
                : null
            }
            pullRequestDetail={
              row.thread.environment?.id
                ? pullRequestDetails[row.thread.environment.id]
                : null
            }
            modelMetadata={threadModels[row.thread.id]}
            displayStatus={displayStatuses[row.thread.id]}
            projectLabel={
              showProjectLabel && row.depth === 0
                ? (projectNameById.get(row.thread.projectId) ?? null)
                : null
            }
            reorderControls={isManual ? controlsFor(row.thread.id) : null}
            childTone={childToneByParent.get(row.thread.id) ?? null}
            childCounts={childCountsByParent.get(row.thread.id) ?? null}
            onToggleCollapse={onToggleCollapse}
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
  isInPinnedSection,
  settings,
  gitStat,
  pullRequestDetail,
  modelMetadata,
  displayStatus,
  projectLabel,
  reorderControls,
  childTone,
  childCounts,
  onToggleCollapse,
  onNavigate,
}: {
  row: ThreadRowModel;
  isActive: boolean;
  isInPinnedSection: boolean;
  settings: ReturnType<typeof parseListSettings>;
  gitStat: string | null | undefined;
  pullRequestDetail?: PullRequestDetail | null;
  modelMetadata: ThreadModelMetadata | undefined;
  displayStatus: string | null | undefined;
  projectLabel: string | null;
  reorderControls: ReorderControls | null;
  childTone: RowTone | null;
  childCounts: ChildToneCounts | null;
  onToggleCollapse: (threadId: string) => void;
  onNavigate: () => void;
}) {
  const { thread, depth, isArchivedChild, childThreadCount, isCollapsed } = row;
  const subagentCount = thread.activity.backgroundAgents;
  const actions = useSidebarThreadActions();
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const tone = isArchivedChild ? "idle" : rowTone(thread, displayStatus);
  const title = threadTitle(thread);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  function commitRename(value: string) {
    const next = value.trim();
    setIsRenaming(false);
    if (next && next !== title) {
      void actions.rename(thread.id, next);
    }
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(event.currentTarget.value);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsRenaming(false);
    }
  }
  const subtitleParts = buildSubtitleParts({
    thread,
    settings,
    gitStat,
    modelMetadata,
    pullRequest,
    pullRequestDetail,
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
      pullRequest={pullRequest}
      onNavigate={onNavigate}
      onRename={() => setIsRenaming(true)}
    >
      <a
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        href="#"
        aria-label={ariaLabel}
        {...splitProps}
        onClick={(event) => {
          event.preventDefault();
          if (isRenaming) return;
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
        // Compose bb's split-drag (horizontal, toward the main area) with our
        // reorder-drag (vertical, within the list). The reorder gesture only
        // engages on vertical travel, so the two never fight over a press.
        onPointerDown={(event) => {
          splitProps.onPointerDown?.(event);
          if (isRenaming) return;
          // While this row's context menu is open, Radix owns the next press
          // (it dismisses the menu), so don't try to start a reorder from it.
          if (event.currentTarget.getAttribute("data-state") === "open") return;
          reorderControls?.onPointerDown(event);
        }}
        onKeyDown={reorderControls?.onKeyDown}
        style={{
          ...(depth > 0 ? { marginLeft: Math.min(depth, 4) * 16 } : undefined),
          ...rowStyle(tone, isActive, isArchivedChild),
        }}
        className={cn(
          "group flex flex-col gap-0.5 rounded-md border px-2.5 pt-1.5 pb-2 transition-colors",
          isArchivedChild && "opacity-60",
          reorderControls?.isDragging && "opacity-50",
          // Whole-row drag in manual mode: hint it with a grab cursor on the
          // rows that can actually move (top-level threads). Drop the hint
          // while the context menu is open — the row isn't draggable then.
          reorderControls && !reorderControls.disabled && depth === 0 &&
            "cursor-grab active:cursor-grabbing data-[state=open]:cursor-default",
          tone === "idle" && idleRowClass(isActive, layout !== null),
          // Selected row always shows a ring border — beats the inline tint
          // borderColor so an active tinted thread stays obviously selected.
          isActive && !isArchivedChild && "!border-ring",
        )}
      >
        {projectLabel ? (
          <span className="truncate text-2xs font-medium uppercase tracking-normal text-muted-foreground/60">
            {projectLabel}
          </span>
        ) : null}
        <div className="relative flex min-h-5 min-w-0 items-center gap-2">
          {depth > 0 ? (
            <span className="absolute left-1 top-1/2 h-px w-2 -translate-x-3 -translate-y-1/2 bg-sidebar-border" />
          ) : null}
          <span
            className="size-1.5 shrink-0 translate-y-px rounded-full"
            style={statusDotStyle(tone, thread.isUnread, isArchivedChild)}
          />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              defaultValue={title}
              aria-label="Rename thread"
              className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0 text-sm leading-tight text-foreground outline-none ring-1 ring-ring"
              onBlur={(event) => commitRename(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleRenameKeyDown}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm leading-tight text-foreground",
                thread.isUnread && !isArchivedChild && "font-medium",
              )}
            >
              {title}
            </span>
          )}
          {subagentCount > 0 && !isArchivedChild ? (
            <SubagentBadge count={subagentCount} />
          ) : null}
          {childThreadCount > 0 &&
          childCounts &&
          !isInPinnedSection &&
          !isArchivedChild ? (
            <SubthreadBadge
              counts={childCounts}
              collapsed={isCollapsed}
              tone={childTone}
              onToggle={() => onToggleCollapse(thread.id)}
            />
          ) : null}
          {thread.isPinned && !isInPinnedSection ? (
            <HugeiconsIcon
              icon={PinIcon}
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden={true}
            />
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
          pullRequestDetail={pullRequestDetail}
        />
      </a>
    </ThreadContextMenu>
  );
}

function SubagentBadge({ count }: { count: number }) {
  const label = `${count} subagent${count === 1 ? "" : "s"} running`;
  return (
    <span
      aria-label={label}
      title={label}
      className="flex h-4 shrink-0 items-center gap-0.5 rounded bg-muted px-1 text-2xs font-medium tabular-nums text-muted-foreground"
    >
      <HugeiconsIcon icon={Robot01Icon} className="size-3" aria-hidden={true} />
      {count}
    </span>
  );
}

/** Text colour for a single tone's count within the breakdown. */
function segmentToneClass(tone: RowTone): string {
  return tone === "blocked"
    ? "text-destructive"
    : tone === "working"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground";
}

function SubthreadBadge({
  counts,
  collapsed,
  tone,
  onToggle,
}: {
  counts: ChildToneCounts;
  collapsed: boolean;
  tone: RowTone | null;
  onToggle: () => void;
}) {
  const total = counts.blocked + counts.working + counts.idle;
  // Only show tones that are actually present, so `3 working, 0 idle` reads as a
  // single tinted `3` rather than `3/0`, and a mixed subtree reads `1/2/4`.
  const segments = (["blocked", "working", "idle"] as const)
    .map((tone) => ({ tone, value: counts[tone] }))
    .filter((segment) => segment.value > 0);

  const breakdown = segments
    .map((segment) => `${segment.value} ${segment.tone}`)
    .join(", ");
  const label = `${total} sub-thread${
    total === 1 ? "" : "s"
  } (${breakdown})${collapsed ? ", collapsed" : ""}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      title={`${label} — click to ${collapsed ? "expand" : "collapse"}`}
      // A click here toggles children; it must not open the thread.
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        "flex h-4 shrink-0 items-center gap-0.5 rounded px-1 text-2xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
        // Colour by the worst child status so a collapsed subtree still shows
        // whether it needs you (red) or has work running (green).
        tone === "blocked"
          ? "text-destructive hover:bg-destructive/10"
          : tone === "working"
            ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed &&
          (tone === "blocked"
            ? "bg-destructive/10"
            : tone === "working"
              ? "bg-emerald-500/10"
              : "bg-muted"),
      )}
    >
      <HugeiconsIcon icon={GitBranchIcon} className="size-3" aria-hidden={true} />
      <span className="tabular-nums">
        {segments.map((segment, index) => (
          <Fragment key={segment.tone}>
            {index > 0 ? (
              <span className="text-muted-foreground/40">/</span>
            ) : null}
            <span className={segmentToneClass(segment.tone)}>
              {segment.value}
            </span>
          </Fragment>
        ))}
      </span>
      <HugeiconsIcon
        icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
        className="size-3 text-muted-foreground/70"
        aria-hidden={true}
      />
    </button>
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
