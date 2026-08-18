import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { DiffStatPills } from "@/components/diff-stat-pills";
import { cn } from "@/lib/utils";
import {
  pullRequestStatusDescription,
  pullRequestStatusTone,
  type PullRequestDetail,
} from "@/lib/pull-request";
import { parseDiffStat, pullRequestBadgeLabel } from "@/lib/subtitle";

function toneClass(tone: ReturnType<typeof pullRequestStatusTone>): string {
  switch (tone) {
    case "destructive":
      return "text-destructive";
    case "warning":
      return "text-amber-500";
    case "success":
      return "text-emerald-500";
    case "merged":
      return "text-[color:var(--pr-merged)]";
    default:
      return "text-muted-foreground/80";
  }
}

function PullRequestStatusIcon({
  attention,
  className,
}: {
  attention: PluginSidebarPullRequest["attention"];
  className?: string;
}) {
  const props = {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    role: "img" as const,
    className: cn("size-3 shrink-0", className),
  };

  switch (attention) {
    case "checks_failed":
    case "closed":
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" />
        </svg>
      );
    case "checks_pending":
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.5V8l2.25 2.25" />
        </svg>
      );
    case "changes_requested":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M3.5 4h7.5a1.5 1.5 0 0 1 0 3H5.5l2 2.25" />
          <path d="M5.5 12.5h7.5" />
        </svg>
      );
    case "review_requested":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M2.75 8.25c1.75-2.75 4.75-4 5.25-4s3.5 1.25 5.25 4" />
          <circle cx="8" cy="8.25" r="2.1" />
        </svg>
      );
    case "conflicts":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M8 2.5v11" />
          <path d="M4.5 6.5 8 3l3.5 3.5" />
          <path d="M4.5 9.5 8 13l3.5-3.5" />
        </svg>
      );
    case "blocked":
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M4.75 8h6.5" />
        </svg>
      );
    case "draft":
      return (
        <svg {...props} aria-hidden="true">
          <path d="M4.5 11.5h7" />
          <path d="M9.75 3.5 12.5 6.25 6.5 12.25H3.75V9.5Z" />
        </svg>
      );
    case "merged":
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="6" cy="6" r="3.1" />
          <circle cx="10" cy="10" r="3.1" />
          <path d="M8.1 7.9 10.9 5.1" />
        </svg>
      );
    case "ready_to_merge":
    case "none":
    default:
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.25 8.25 7.1 10.1 10.9 6.3" />
        </svg>
      );
  }
}

export function PullRequestCell({
  pullRequest,
  detail,
}: {
  pullRequest: PluginSidebarPullRequest;
  detail?: PullRequestDetail | null;
}) {
  const tone = pullRequestStatusTone(pullRequest.attention);
  const statusLabel = pullRequestStatusDescription(
    pullRequest.attention,
    detail,
  );
  const branchDiff = detail?.branchDiff ? parseDiffStat(detail.branchDiff) : null;
  const isDestructive = tone === "destructive";
  const tooltip = [pullRequest.title, statusLabel, detail?.branchDiff]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="flex shrink-0 items-center gap-1" title={tooltip}>
      <span
        className={cn(
          "rounded border border-sidebar-border/80 bg-muted/40 px-1 py-px font-mono text-[10px] font-medium tabular-nums leading-none",
          isDestructive && "border-destructive/25 bg-destructive/10 text-destructive",
        )}
      >
        {pullRequestBadgeLabel(pullRequest.number)}
      </span>
      <span
        aria-label={statusLabel}
        className={cn("flex shrink-0 items-center", toneClass(tone))}
      >
        <PullRequestStatusIcon attention={pullRequest.attention} />
      </span>
      {branchDiff ? <DiffStatPills diff={branchDiff} /> : null}
    </span>
  );
}
