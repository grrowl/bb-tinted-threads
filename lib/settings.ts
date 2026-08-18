export type GroupBy = "project" | "none";
export type PinnedPlacement = "in-group" | "at-top";
export type SortBy = "created" | "updated" | "attention" | "alpha";
export type WorkspaceLabelMode = "branch" | "worktree" | "host" | "smart";

export interface ListSettings {
  groupBy: GroupBy;
  pinnedPlacement: PinnedPlacement;
  sortBy: SortBy;
  showArchivedChildren: boolean;
  showModel: boolean;
  showDiff: boolean;
  showPullRequest: boolean;
  workspaceLabel: WorkspaceLabelMode;
}

export const DEFAULT_LIST_SETTINGS: ListSettings = {
  groupBy: "project",
  pinnedPlacement: "in-group",
  sortBy: "created",
  showArchivedChildren: false,
  showModel: true,
  showDiff: false,
  showPullRequest: true,
  workspaceLabel: "smart",
};

const GROUP_BY = new Set<GroupBy>(["project", "none"]);
const PINNED_PLACEMENT = new Set<PinnedPlacement>(["in-group", "at-top"]);
const SORT_BY = new Set<SortBy>(["created", "updated", "attention", "alpha"]);
const WORKSPACE_LABEL = new Set<WorkspaceLabelMode>([
  "branch",
  "worktree",
  "host",
  "smart",
]);

function readSelect<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  return typeof value === "string" && allowed.has(value as T)
    ? (value as T)
    : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseListSettings(
  values: Record<string, unknown> | undefined,
): ListSettings {
  if (values === undefined) return DEFAULT_LIST_SETTINGS;
  return {
    groupBy: readSelect(values.groupBy, GROUP_BY, DEFAULT_LIST_SETTINGS.groupBy),
    pinnedPlacement: readSelect(
      values.pinnedPlacement,
      PINNED_PLACEMENT,
      DEFAULT_LIST_SETTINGS.pinnedPlacement,
    ),
    sortBy: readSelect(values.sortBy, SORT_BY, DEFAULT_LIST_SETTINGS.sortBy),
    showArchivedChildren: readBoolean(
      values.showArchivedChildren,
      DEFAULT_LIST_SETTINGS.showArchivedChildren,
    ),
    showModel: readBoolean(values.showModel, DEFAULT_LIST_SETTINGS.showModel),
    showDiff: readBoolean(values.showDiff, DEFAULT_LIST_SETTINGS.showDiff),
    showPullRequest: readBoolean(
      values.showPullRequest,
      DEFAULT_LIST_SETTINGS.showPullRequest,
    ),
    workspaceLabel: readSelect(
      values.workspaceLabel,
      WORKSPACE_LABEL,
      DEFAULT_LIST_SETTINGS.workspaceLabel,
    ),
  };
}
