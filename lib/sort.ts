import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { threadTitle } from "./thread-title";
import type { SortBy } from "./settings";

export type ThreadComparator = (
  left: PluginSidebarThread,
  right: PluginSidebarThread,
) => number;

function compareById(left: PluginSidebarThread, right: PluginSidebarThread): number {
  return left.id.localeCompare(right.id);
}

export function createThreadComparator(sortBy: SortBy): ThreadComparator {
  switch (sortBy) {
    case "updated":
      return (left, right) =>
        right.updatedAt - left.updatedAt || compareById(left, right);
    case "attention":
      return (left, right) =>
        right.latestAttentionAt - left.latestAttentionAt ||
        compareById(left, right);
    case "alpha":
      return (left, right) => {
        const titleDelta = threadTitle(left)
          .localeCompare(threadTitle(right), undefined, {
            sensitivity: "base",
          });
        return titleDelta !== 0 ? titleDelta : compareById(left, right);
      };
    case "created":
    default:
      return (left, right) =>
        right.createdAt - left.createdAt || compareById(left, right);
  }
}

export function createListComparator(
  sortBy: SortBy,
  pinnedPlacement: "in-group" | "at-top",
): ThreadComparator {
  const sortThreads = createThreadComparator(sortBy);
  if (pinnedPlacement !== "in-group") {
    return sortThreads;
  }
  return (left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    return sortThreads(left, right);
  };
}
