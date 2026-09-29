import { z } from "zod";

// Tinted Threads' subtitle toggles. Spread into bb's `preferenceDefinitions`
// so they ride the same KV store, realtime sync, and `prefs` CLI as the
// built-in list's own preferences.

export const subtitleWorkspaceModeSchema = z.enum([
  "smart",
  "branch",
  "worktree",
  "host",
  "off",
]);
export type SubtitleWorkspaceMode = z.infer<typeof subtitleWorkspaceModeSchema>;

// "compact" is bb's stock row height; the others add room around each row.
export const densitySchema = z.enum(["default", "comfortable", "compact"]);
export type Density = z.infer<typeof densitySchema>;

function tintedPreference<Schema extends z.ZodTypeAny>(
  schema: Schema,
  defaultValue: z.infer<Schema>,
  description: string,
) {
  return { schema, defaultValue, description, legacyKey: null };
}

export const tintedPreferenceDefinitions = {
  subtitleModel: tintedPreference(
    z.boolean(),
    true,
    "Show each thread's provider and model under its title.",
  ),
  subtitlePullRequest: tintedPreference(
    z.boolean(),
    true,
    "Show the thread branch's pull request state, checks, and review under its title.",
  ),
  subtitleDiff: tintedPreference(
    z.boolean(),
    false,
    "Show the environment's uncommitted diff (+added -deleted) under each thread's title.",
  ),
  subtitleProject: tintedPreference(
    z.boolean(),
    false,
    "Show each thread's project name under its title.",
  ),
  density: tintedPreference(
    densitySchema,
    "default",
    "Row spacing: default, comfortable, or compact (bb's stock height).",
  ),
  hideEmptySections: tintedPreference(
    z.boolean(),
    false,
    "Hide project sections that have no threads to show.",
  ),
  subtitleWorkspace: tintedPreference(
    subtitleWorkspaceModeSchema,
    "smart",
    "Workspace label under each thread's title: smart (branch, else worktree, else host), branch, worktree, host, or off.",
  ),
} as const;
