import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import {
  pullRequestAttentionLabel,
  pullRequestBadgeLabel,
} from "@/lib/subtitle";

export function PullRequestCell({
  pullRequest,
}: {
  pullRequest: PluginSidebarPullRequest;
}) {
  const status = pullRequestAttentionLabel(pullRequest.attention);
  const showStatus = status !== "PR";
  const isDestructive =
    pullRequest.attention === "checks_failed" ||
    pullRequest.attention === "changes_requested" ||
    pullRequest.attention === "conflicts" ||
    pullRequest.attention === "blocked" ||
    pullRequest.attention === "review_requested";

  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={pullRequest.title}
    >
      <span
        className={cn(
          "rounded border border-sidebar-border/80 bg-muted/40 px-1 py-px font-mono text-[10px] font-medium tabular-nums leading-none",
          isDestructive && "border-destructive/25 bg-destructive/10 text-destructive",
        )}
      >
        {pullRequestBadgeLabel(pullRequest.number)}
      </span>
      {showStatus ? (
        <span className={cn(isDestructive && "text-destructive")}>{status}</span>
      ) : null}
    </span>
  );
}
