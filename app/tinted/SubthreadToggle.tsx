import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { SidebarChildToggleChevron } from "../rows/SidebarChildToggleChevron.js";
import {
  worstTintedTone,
  type TintedTone,
  type TintedToneCounts,
} from "./tone.js";

const TONES: readonly TintedTone[] = ["blocked", "working", "idle"];

// The whole button takes the worst child tone, like a tinted row does.
const TOGGLE_TONE_CLASS: Record<TintedTone, string> = {
  blocked:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive",
  working:
    "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400",
  idle: "",
};

const COUNT_TONE_CLASS: Record<TintedTone, string> = {
  blocked: "text-destructive",
  working: "text-emerald-600 dark:text-emerald-400",
  idle: "text-muted-foreground",
};

export function SubthreadToggle({
  counts,
  isCollapsed,
  disabled,
  className,
  title,
  onToggle,
}: {
  counts: TintedToneCounts;
  isCollapsed: boolean;
  disabled: boolean;
  className?: string;
  title: string;
  onToggle: () => void;
}) {
  const tone = worstTintedTone(counts) ?? "idle";
  const total = counts.blocked + counts.working + counts.idle;
  const segments = TONES.filter((segmentTone) => counts[segmentTone] > 0);
  const breakdown = segments
    .map((segmentTone) => `${counts[segmentTone]} ${segmentTone}`)
    .join(", ");
  const summary = `${total} sub-thread${total === 1 ? "" : "s"}${
    breakdown ? ` (${breakdown})` : ""
  }`;
  return (
    <SidebarChildToggleChevron
      disabled={disabled}
      className={cn(
        "w-auto min-w-5 gap-0.5 pl-1 pr-0.5 text-2xs font-medium tabular-nums",
        TOGGLE_TONE_CLASS[tone],
        className,
      )}
      isCollapsed={isCollapsed}
      expandLabel={`Expand ${title} threads`}
      collapseLabel={`Collapse ${title} threads`}
      onToggle={onToggle}
    >
      {total > 0 ? (
        <span title={summary} className="text-muted-foreground">
          {segments.map((segmentTone, index) => (
            <Fragment key={segmentTone}>
              {index > 0 ? "/" : null}
              <span className={COUNT_TONE_CLASS[segmentTone]}>
                {counts[segmentTone]}
              </span>
            </Fragment>
          ))}
        </span>
      ) : null}
    </SidebarChildToggleChevron>
  );
}
