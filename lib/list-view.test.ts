import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  buildListSections,
  flatThreadRows,
  nestedThreadRows,
  visibleThreadIds,
} from "./list-view";
import { DEFAULT_LIST_SETTINGS } from "./settings";
import { workspaceLabel } from "./subtitle";

function thread(
  overrides: Partial<PluginSidebarThread> & Pick<PluginSidebarThread, "id">,
): PluginSidebarThread {
  return {
    projectId: "proj_a",
    title: overrides.id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: null,
    latestAttentionAt: 100,
    ...overrides,
  };
}

test("visibleThreadIds hides archived roots and optional archived children", () => {
  const threads = [
    thread({ id: "root", createdAt: 300 }),
    thread({ id: "child", parentThreadId: "root", isArchived: true, createdAt: 200 }),
    thread({ id: "archived-root", isArchived: true, createdAt: 100 }),
  ];

  const hiddenChildren = visibleThreadIds(threads, false);
  assert.deepEqual([...hiddenChildren].sort(), ["root"]);
  assert.equal(hiddenChildren.has("archived-root"), false);
  assert.equal(hiddenChildren.has("child"), false);

  const withChildren = visibleThreadIds(threads, true);
  assert.equal(withChildren.has("root"), true);
  assert.equal(withChildren.has("child"), true);
  assert.equal(withChildren.has("archived-root"), false);
});

test("nestedThreadRows orphans children when parent is outside the set", () => {
  const pinnedParent = thread({ id: "pin", isPinned: true, createdAt: 200 });
  const child = thread({ id: "child", parentThreadId: "pin", createdAt: 100 });
  const rows = nestedThreadRows([child], (left, right) =>
    right.createdAt - left.createdAt,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.depth, 0);
  assert.equal(rows[0]?.thread.id, "child");
});

test("flatThreadRows keeps pinned section flat", () => {
  const parent = thread({ id: "pin", isPinned: true, createdAt: 200 });
  const child = thread({
    id: "child",
    parentThreadId: "pin",
    isPinned: true,
    createdAt: 100,
  });
  const rows = flatThreadRows([parent, child], (left, right) =>
    right.createdAt - left.createdAt,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.every((row) => row.depth === 0), true);
});

test("buildListSections pinned-at-top splits cross-project pins", () => {
  const threads = [
    thread({ id: "p1", projectId: "proj_a", isPinned: true, createdAt: 400 }),
    thread({ id: "u1", projectId: "proj_a", createdAt: 300 }),
    thread({ id: "p2", projectId: "proj_b", isPinned: true, createdAt: 200 }),
    thread({ id: "u2", projectId: "proj_b", createdAt: 100 }),
  ];
  const projects = [
    { id: "proj_a", name: "Alpha", isPersonal: false },
    { id: "proj_b", name: "Beta", isPersonal: false },
  ];

  const sections = buildListSections(
    threads,
    projects,
    {
      ...DEFAULT_LIST_SETTINGS,
      pinnedPlacement: "at-top",
      groupBy: "project",
    },
    "",
  );

  assert.equal(sections[0]?.kind, "pinned");
  assert.equal(sections[0]?.kind === "pinned" ? sections[0].rows.length : 0, 2);
  assert.equal(sections[1]?.kind, "project");
});

test("workspaceLabel smart prefers branch then worktree then host", () => {
  const full = thread({
    id: "full",
    environment: {
      id: "env_1",
      name: "/worktrees/feature-x",
      branchName: "feature/x",
      workspaceDisplayKind: "managed-worktree",
    },
    host: { id: "host_1", name: "mactom" },
  });
  assert.equal(workspaceLabel(full, "smart"), "feature/x");
  assert.equal(
    workspaceLabel(
      thread({
        id: "worktree-only",
        environment: {
          id: "env_2",
          name: "/worktrees/feature-y",
          branchName: null,
          workspaceDisplayKind: "managed-worktree",
        },
        host: { id: "host_1", name: "mactom" },
      }),
      "smart",
    ),
    "feature-y",
  );
  assert.equal(
    workspaceLabel(
      thread({
        id: "host-only",
        host: { id: "host_1", name: "mactom" },
      }),
      "smart",
    ),
    "mactom",
  );
});
