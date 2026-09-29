import type { SidebarThread } from "../model/sidebar-thread.js";
import { isRuntimeBusyThread } from "../model/thread-activity.js";

/**
 * Tinted Threads' three-way row state: red when a thread needs you, green
 * while work is running, untinted otherwise.
 */
export type TintedTone = "blocked" | "working" | "idle";

export type TintedToneCounts = Record<TintedTone, number>;

export const NO_TINTED_TONE_COUNTS: TintedToneCounts = {
  blocked: 0,
  working: 0,
  idle: 0,
};

type ToneShape = Pick<
  SidebarThread,
  | "archivedAt"
  | "indicator"
  | "hasPendingInteraction"
  | "runtimeStatus"
  | "activity"
>;

export function tintedToneForThread(thread: ToneShape): TintedTone {
  if (thread.archivedAt !== null) return "idle";
  if (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input" ||
    thread.indicator === "unread-error" ||
    thread.indicator === "queued-failed" ||
    thread.runtimeStatus === "error"
  ) {
    return "blocked";
  }
  const { activity } = thread;
  if (
    isRuntimeBusyThread(thread) ||
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0
  ) {
    return "working";
  }
  return "idle";
}

export function countTintedTones(
  threads: readonly ToneShape[],
): TintedToneCounts {
  const counts = { ...NO_TINTED_TONE_COUNTS };
  for (const thread of threads) {
    counts[tintedToneForThread(thread)] += 1;
  }
  return counts;
}

/** The most attention-worthy tone present, or null when there are none. */
export function worstTintedTone(counts: TintedToneCounts): TintedTone | null {
  if (counts.blocked > 0) return "blocked";
  if (counts.working > 0) return "working";
  if (counts.idle > 0) return "idle";
  return null;
}
