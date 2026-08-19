import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export const PULL_REQUEST_ICONS = {
  GitPullRequestArrow: GitPullRequestIcon,
  GitPullRequest: GitPullRequestIcon,
  GitPullRequestDraft: GitPullRequestDraftIcon,
  GitPullRequestClosed: GitPullRequestClosedIcon,
  GitMerge: GitMergeIcon,
  CircleCheck: CheckmarkCircle02Icon,
  CircleX: CancelCircleIcon,
  Clock: Clock01Icon,
  AlertTriangle: Alert02Icon,
  Circle: CircleIcon,
} as const satisfies Record<string, IconSvgElement>;

export type PullRequestIconName = keyof typeof PULL_REQUEST_ICONS;

export function Hugeicon({
  icon,
  className,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
}: {
  icon: PullRequestIconName;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}) {
  return (
    <HugeiconsIcon
      icon={PULL_REQUEST_ICONS[icon]}
      className={cn(className)}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      data-icon={icon}
    />
  );
}
