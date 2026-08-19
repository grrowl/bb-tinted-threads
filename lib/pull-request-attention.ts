import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import type { PullRequestDetail } from "@/lib/pull-request";
import type { PullRequestIconName } from "@/components/hugeicon";

type PullRequestMeta = {
  label: string;
  icon: PullRequestIconName;
  className: string;
};

/** PR lifecycle state — matches bb workspace checkout (`x7` / `h7`). */
export const PR_STATE_META: Record<
  PluginSidebarPullRequest["state"],
  PullRequestMeta
> = {
  open: {
    label: "Open",
    icon: "GitPullRequestArrow",
    className: "text-success",
  },
  draft: {
    label: "Draft",
    icon: "GitPullRequestDraft",
    className: "text-muted-foreground",
  },
  merged: {
    label: "Merged",
    icon: "GitMerge",
    className: "text-pr-merged",
  },
  closed: {
    label: "Closed",
    icon: "GitPullRequestClosed",
    className: "text-destructive",
  },
};

const CHECKS_META = {
  passing: {
    label: "Checks passing",
    icon: "CircleCheck" as const,
    className: "text-success",
  },
  failing: {
    label: "Checks failing",
    icon: "CircleX" as const,
    className: "text-destructive",
  },
  pending: {
    label: "Checks pending",
    icon: "Clock" as const,
    className: "text-warning-text",
  },
  no_checks: {
    label: "No checks",
    icon: "Circle" as const,
    className: "text-muted-foreground",
  },
  unknown: {
    label: "Checks unknown",
    icon: "AlertTriangle" as const,
    className: "text-warning-text",
  },
};

const REVIEW_META = {
  approved: {
    label: "Approved",
    icon: "CircleCheck" as const,
    className: "text-success",
  },
  changes_requested: {
    label: "Changes requested",
    icon: "CircleX" as const,
    className: "text-destructive",
  },
  review_required: {
    label: "Review required",
    icon: "Clock" as const,
    className: "text-destructive",
  },
  review_requested: {
    label: "Review requested",
    icon: "Clock" as const,
    className: "text-destructive",
  },
  none: {
    label: "No review",
    icon: "Circle" as const,
    className: "text-muted-foreground",
  },
};

const MERGE_META = {
  mergeable: {
    label: "Mergeable",
    icon: "CircleCheck" as const,
    className: "text-success",
  },
  conflicts: {
    label: "Conflicts",
    icon: "AlertTriangle" as const,
    className: "text-destructive",
  },
  blocked: {
    label: "Blocked",
    icon: "AlertTriangle" as const,
    className: "text-destructive",
  },
  draft: {
    label: "Draft",
    icon: "Clock" as const,
    className: "text-muted-foreground",
  },
  unknown: {
    label: "Mergeability unknown",
    icon: "AlertTriangle" as const,
    className: "text-warning-text",
  },
};

/** Rolled-up attention — matches bb workspace checkout (`pMe`). */
export const PULL_REQUEST_ATTENTION_META: Record<
  PluginSidebarPullRequest["attention"],
  PullRequestMeta
> = {
  checks_failed: {
    ...CHECKS_META.failing,
    icon: "GitPullRequestArrow",
  },
  checks_pending: {
    ...CHECKS_META.pending,
    icon: "GitPullRequestArrow",
  },
  changes_requested: {
    ...REVIEW_META.changes_requested,
    icon: "GitPullRequestArrow",
  },
  review_requested: {
    ...REVIEW_META.review_requested,
    icon: "GitPullRequestArrow",
  },
  conflicts: {
    ...MERGE_META.conflicts,
    icon: "GitPullRequestArrow",
  },
  blocked: {
    ...MERGE_META.blocked,
    icon: "GitPullRequestArrow",
  },
  draft: PR_STATE_META.draft,
  ready_to_merge: {
    label: "Ready to merge",
    icon: "GitPullRequestArrow",
    className: "text-success",
  },
  merged: PR_STATE_META.merged,
  closed: PR_STATE_META.closed,
  none: PR_STATE_META.open,
};

export function pullRequestStateMeta(
  state: PluginSidebarPullRequest["state"],
): PullRequestMeta {
  return PR_STATE_META[state];
}

export function pullRequestAttentionMeta(
  attention: PluginSidebarPullRequest["attention"],
): PullRequestMeta {
  return PULL_REQUEST_ATTENTION_META[attention];
}

/** Secondary glyph for open/draft rows — the issue driving `attention`. */
export function pullRequestAttentionIndicator(
  attention: PluginSidebarPullRequest["attention"],
  state: PluginSidebarPullRequest["state"],
  detail?: PullRequestDetail | null,
): PullRequestMeta | null {
  if (state === "merged" || state === "closed") return null;

  switch (attention) {
    case "checks_failed":
      return CHECKS_META.failing;
    case "checks_pending":
      return CHECKS_META.pending;
    case "changes_requested":
      return REVIEW_META.changes_requested;
    case "review_requested":
      return REVIEW_META.review_requested;
    case "conflicts":
      return MERGE_META.conflicts;
    case "blocked":
      return MERGE_META.blocked;
    case "ready_to_merge":
      return CHECKS_META.passing;
    case "none":
      if (detail?.checksState === "passing") return CHECKS_META.passing;
      if (detail?.reviewState === "approved") return REVIEW_META.approved;
      if (detail?.checksState === "no_checks") return null;
      return detail?.checksState
        ? CHECKS_META[detail.checksState]
        : null;
    case "draft":
      return detail?.checksState ? CHECKS_META[detail.checksState] : null;
    default:
      return null;
  }
}
