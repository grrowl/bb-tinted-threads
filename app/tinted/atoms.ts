import { createSyncedPreferenceAtom } from "../preferences/synced-preference-atom.js";

export const subtitleModelAtom = createSyncedPreferenceAtom("subtitleModel");
export const subtitlePullRequestAtom = createSyncedPreferenceAtom(
  "subtitlePullRequest",
);
export const subtitleDiffAtom = createSyncedPreferenceAtom("subtitleDiff");
export const subtitleWorkspaceAtom =
  createSyncedPreferenceAtom("subtitleWorkspace");
export const subtitleProjectAtom = createSyncedPreferenceAtom("subtitleProject");
export const densityAtom = createSyncedPreferenceAtom("density");
export const hideEmptySectionsAtom =
  createSyncedPreferenceAtom("hideEmptySections");
