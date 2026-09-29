import type {
  PluginSidebarPullRequest,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type {
  TintedModel,
  TintedPullRequestDetail,
} from "../../tinted-server.js";
import type { SubtitleWorkspaceMode } from "../../shared/tinted-preferences.js";

// Pure text and glyph rules for a row's subtitle, ported from the standalone
// Tinted Threads plugin (lib/subtitle.ts, lib/pull-request*.ts).

export function basename(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

type WorkspaceShape = Pick<PluginSidebarThread, "environment" | "host">;

export function workspaceLabel(
  thread: WorkspaceShape,
  mode: SubtitleWorkspaceMode,
): string | null {
  const branch = thread.environment?.branchName?.trim() || null;
  const worktreeName = thread.environment?.name?.trim() || null;
  const worktree = worktreeName ? basename(worktreeName) : null;
  const host = thread.host?.name?.trim() || null;
  switch (mode) {
    case "branch":
      return branch;
    case "worktree":
      return worktree;
    case "host":
      return host;
    case "smart":
      return branch ?? worktree ?? host;
    case "off":
      return null;
  }
}

function readableModelName(model: string): string {
  return model
    .replace(/^openai\//, "")
    .replace(/^anthropic\//, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b(gpt|o)[-_\s]?(\d)/gi, (_, family: string, version: string) =>
      `${family.toUpperCase()}-${version}`,
    )
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function compactProviderModelName(providerId: string, value: string): string {
  if (providerId === "codex") return value.replace(/^GPT-/i, "");
  if (providerId === "claude-code") return value.replace(/\s+\(1M\)$/i, "");
  if (providerId === "acp-opencode") return value.replace(/^OpenCode\s+/i, "");
  return value;
}

/**
 * The sidebar payload has no execution model. Until the lookup resolves, and
 * when bb cannot resolve one, say so rather than guessing a provider default.
 * `null` model metadata means the lookup itself failed.
 */
export function modelLabel(model: TintedModel | null | undefined): string {
  if (model === undefined) return "Loading…";
  if (model === null || model.status === "unknown" || !model.model) {
    return "Unknown model";
  }
  return compactProviderModelName(
    model.providerId,
    model.displayName ?? readableModelName(model.model),
  );
}

export type DiffStat = { additions: number; deletions: number };

export function diffStatLabel(diff: DiffStat): string {
  return `+${diff.additions} -${diff.deletions}`;
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

type PullRequestState = PluginSidebarPullRequest["state"];
type PullRequestAttention = PluginSidebarPullRequest["attention"];

/** Icon names come from the host `Icon` registry. */
export type SubtitleIconName =
  | "GitPullRequestArrow"
  | "GitPullRequestDraft"
  | "GitPullRequestClosed"
  | "GitMerge"
  | "CircleCheck"
  | "CircleX"
  | "Clock"
  | "AlertTriangle"
  | "Circle";

export interface SubtitleGlyph {
  label: string;
  icon: SubtitleIconName;
  className: string;
}

const PR_STATE: Record<PullRequestState, SubtitleGlyph> = {
  open: { label: "Open", icon: "GitPullRequestArrow", className: "text-success" },
  draft: {
    label: "Draft",
    icon: "GitPullRequestDraft",
    className: "text-muted-foreground",
  },
  merged: { label: "Merged", icon: "GitMerge", className: "text-pr-merged" },
  closed: {
    label: "Closed",
    icon: "GitPullRequestClosed",
    className: "text-destructive",
  },
};

const CHECKS = {
  passing: { label: "Checks passing", icon: "CircleCheck", className: "text-success" },
  failing: { label: "Checks failing", icon: "CircleX", className: "text-destructive" },
  pending: { label: "Checks pending", icon: "Clock", className: "text-warning-text" },
  no_checks: { label: "No checks", icon: "Circle", className: "text-muted-foreground" },
  unknown: {
    label: "Checks unknown",
    icon: "AlertTriangle",
    className: "text-warning-text",
  },
} satisfies Record<TintedPullRequestDetail["checksState"], SubtitleGlyph>;

const REVIEW = {
  approved: { label: "Approved", icon: "CircleCheck", className: "text-success" },
  changes_requested: {
    label: "Changes requested",
    icon: "CircleX",
    className: "text-destructive",
  },
  review_requested: {
    label: "Review requested",
    icon: "Clock",
    className: "text-destructive",
  },
} satisfies Record<string, SubtitleGlyph>;

const MERGE = {
  conflicts: { label: "Conflicts", icon: "AlertTriangle", className: "text-destructive" },
  blocked: { label: "Blocked", icon: "AlertTriangle", className: "text-destructive" },
} satisfies Record<string, SubtitleGlyph>;

export function pullRequestStateGlyph(state: PullRequestState): SubtitleGlyph {
  return PR_STATE[state];
}

/** Secondary glyph for an open or draft PR: the issue driving `attention`. */
export function pullRequestAttentionGlyph(
  attention: PullRequestAttention,
  state: PullRequestState,
  detail?: TintedPullRequestDetail | null,
): SubtitleGlyph | null {
  if (state === "merged" || state === "closed") return null;
  switch (attention) {
    case "checks_failed":
      return CHECKS.failing;
    case "checks_pending":
      return CHECKS.pending;
    case "changes_requested":
      return REVIEW.changes_requested;
    case "review_requested":
      return REVIEW.review_requested;
    case "conflicts":
      return MERGE.conflicts;
    case "blocked":
      return MERGE.blocked;
    case "ready_to_merge":
      return CHECKS.passing;
    case "none":
      if (detail?.checksState === "passing") return CHECKS.passing;
      if (detail?.reviewState === "approved") return REVIEW.approved;
      if (!detail || detail.checksState === "no_checks") return null;
      return CHECKS[detail.checksState];
    case "draft":
      return detail ? CHECKS[detail.checksState] : null;
    default:
      return null;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function pullRequestStatusDescription(
  attention: PullRequestAttention,
  detail?: TintedPullRequestDetail | null,
): string {
  switch (attention) {
    case "checks_failed":
      return detail?.checksFailed
        ? `${plural(detail.checksFailed, "check")} failed`
        : "Checks failed";
    case "checks_pending":
      return detail?.checksPending
        ? `${plural(detail.checksPending, "check")} pending`
        : "Checks pending";
    case "changes_requested":
      return "Changes requested";
    case "review_requested":
      return detail?.reviewState === "review_requested"
        ? "Review requested"
        : "Review required";
    case "conflicts":
      return "Merge conflicts";
    case "blocked":
      return "Blocked from merging";
    case "draft":
      return "Draft pull request";
    case "ready_to_merge":
      return "Ready to merge";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    case "none":
      if (detail?.checksState === "passing") return "Checks passing";
      if (detail?.reviewState === "approved") return "Approved";
      return "Open pull request";
    default:
      return "Pull request";
  }
}

/** Hover text for the PR cell: title · #number · status · branch diff. */
export function pullRequestTooltip(
  pullRequest: Pick<PluginSidebarPullRequest, "title" | "number" | "attention">,
  detail?: TintedPullRequestDetail | null,
): string {
  return [
    pullRequest.title,
    `#${pullRequest.number}`,
    pullRequestStatusDescription(pullRequest.attention, detail),
    detail?.branchDiff ? diffStatLabel(detail.branchDiff) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
