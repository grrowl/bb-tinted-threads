export type PullRequestDetail = {
  checksState: "unknown" | "pending" | "passing" | "failing" | "no_checks";
  checksFailed: number;
  checksPending: number;
  checksPassed: number;
  reviewState:
    | "none"
    | "approved"
    | "changes_requested"
    | "review_required"
    | "review_requested";
  branchDiff: string | null;
};

export type PullRequestStatusTone =
  | "destructive"
  | "warning"
  | "success"
  | "merged"
  | "muted";

export function pullRequestStatusTone(
  attention: string,
): PullRequestStatusTone {
  switch (attention) {
    case "checks_failed":
    case "changes_requested":
    case "conflicts":
    case "blocked":
      return "destructive";
    case "checks_pending":
    case "review_requested":
      return "warning";
    case "ready_to_merge":
    case "none":
      return "success";
    case "merged":
      return "merged";
    default:
      return "muted";
  }
}

export function pullRequestStatusDescription(
  attention: string,
  detail?: PullRequestDetail | null,
): string {
  switch (attention) {
    case "checks_failed":
      return detail?.checksFailed
        ? `${detail.checksFailed} check${detail.checksFailed === 1 ? "" : "s"} failed`
        : "Checks failed";
    case "checks_pending":
      return detail?.checksPending
        ? `${detail.checksPending} check${detail.checksPending === 1 ? "" : "s"} pending`
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
