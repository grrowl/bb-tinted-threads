import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { pullRequestAttentionLabel } from "@/lib/subtitle";

export function PullRequestCell({
  pullRequest,
}: {
  pullRequest: PluginSidebarPullRequest;
}) {
  const label = pullRequestAttentionLabel(pullRequest.attention);
  const isDestructive =
    pullRequest.attention === "checks_failed" ||
    pullRequest.attention === "changes_requested" ||
    pullRequest.attention === "conflicts" ||
    pullRequest.attention === "blocked" ||
    pullRequest.attention === "review_requested";

  return (
    <span
      className={cn(
        "shrink-0 font-mono tabular-nums",
        isDestructive && "text-destructive",
      )}
      title={pullRequest.title}
    >
      #{pullRequest.number} {label}
    </span>
  );
}
