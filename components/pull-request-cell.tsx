import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { DiffStatPills } from "@/components/diff-stat-pills";
import { Hugeicon } from "@/components/hugeicon";
import { cn } from "@/lib/utils";
import {
  pullRequestAttentionIndicator,
  pullRequestAttentionMeta,
  pullRequestStateMeta,
} from "@/lib/pull-request-attention";
import {
  pullRequestStatusDescription,
  type PullRequestDetail,
} from "@/lib/pull-request";
import { parseDiffStat } from "@/lib/subtitle";

export function PullRequestCell({
  pullRequest,
  detail,
}: {
  pullRequest: PluginSidebarPullRequest;
  detail?: PullRequestDetail | null;
}) {
  const stateMeta = pullRequestStateMeta(pullRequest.state);
  const attentionMeta = pullRequestAttentionMeta(pullRequest.attention);
  const indicator = pullRequestAttentionIndicator(
    pullRequest.attention,
    pullRequest.state,
    detail,
  );
  const statusLabel = pullRequestStatusDescription(
    pullRequest.attention,
    detail,
  );
  const branchDiff = detail?.branchDiff ? parseDiffStat(detail.branchDiff) : null;
  const tooltip = [
    pullRequest.title,
    `#${pullRequest.number}`,
    statusLabel,
    detail?.branchDiff,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="flex shrink-0 items-center gap-0.5" title={tooltip}>
      <Hugeicon
        icon={stateMeta.icon}
        aria-label={stateMeta.label}
        className={cn("size-3 shrink-0", stateMeta.className)}
      />
      {indicator ? (
        <Hugeicon
          icon={indicator.icon}
          aria-label={indicator.label}
          className={cn("size-2.5 shrink-0", indicator.className)}
        />
      ) : null}
      <span className="sr-only">{attentionMeta.label}</span>
      {branchDiff ? <DiffStatPills diff={branchDiff} /> : null}
    </span>
  );
}
