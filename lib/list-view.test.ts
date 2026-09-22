import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  buildListSections,
  environmentCaption,
  environmentLabel,
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

test("nestedThreadRows counts children and hides them when collapsed", () => {
  const threads = [
    thread({ id: "root", createdAt: 300 }),
    thread({ id: "child-a", parentThreadId: "root", createdAt: 200 }),
    thread({ id: "child-b", parentThreadId: "root", createdAt: 100 }),
    thread({ id: "grandchild", parentThreadId: "child-a", createdAt: 50 }),
  ];
  const compare = (left: PluginSidebarThread, right: PluginSidebarThread) =>
    right.createdAt - left.createdAt;

  const expanded = nestedThreadRows(threads, compare);
  assert.deepEqual(
    expanded.map((row) => row.thread.id),
    ["root", "child-a", "grandchild", "child-b"],
  );
  assert.equal(expanded[0]?.childThreadCount, 2);
  assert.equal(expanded[0]?.isCollapsed, false);

  const collapsed = nestedThreadRows(threads, compare, new Set(["root"]));
  assert.deepEqual(
    collapsed.map((row) => row.thread.id),
    ["root"],
  );
  assert.equal(collapsed[0]?.childThreadCount, 2);
  assert.equal(collapsed[0]?.isCollapsed, true);
});

test("nestedThreadRows never marks a childless row collapsed", () => {
  const rows = nestedThreadRows(
    [thread({ id: "lonely" })],
    (left, right) => right.createdAt - left.createdAt,
    new Set(["lonely"]),
  );
  assert.equal(rows[0]?.childThreadCount, 0);
  assert.equal(rows[0]?.isCollapsed, false);
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

const ENV_A = {
  id: "env_a",
  name: "/worktrees/feature-a",
  branchName: "feature/a",
  workspaceDisplayKind: "managed-worktree" as const,
};
const ENV_B = {
  id: "env_b",
  name: "/worktrees/feature-b",
  branchName: "feature/b",
  workspaceDisplayKind: "managed-worktree" as const,
};
const ENV_C = {
  id: "env_c",
  name: "/worktrees/feature-c",
  branchName: "feature/c",
  workspaceDisplayKind: "managed-worktree" as const,
};
const PROJECTS = [
  { id: "proj_a", name: "Alpha", isPersonal: false },
  { id: "proj_b", name: "Beta", isPersonal: false },
];

test("buildListSections groups by environment, folding singletons into Other", () => {
  const threads = [
    thread({ id: "none-1", createdAt: 500 }),
    thread({ id: "b-1", projectId: "proj_b", environment: ENV_B, createdAt: 400 }),
    thread({ id: "a-1", environment: ENV_A, createdAt: 300 }),
    thread({ id: "a-2", environment: ENV_A, createdAt: 200, parentThreadId: "a-1" }),
    thread({ id: "b-2", projectId: "proj_b", environment: ENV_B, createdAt: 100 }),
    thread({ id: "c-1", environment: ENV_C, createdAt: 50 }),
  ];

  const sections = buildListSections(
    threads,
    PROJECTS,
    { ...DEFAULT_LIST_SETTINGS, groupBy: "environment", sortBy: "created" },
    "",
  );

  assert.deepEqual(
    sections.map((section) => {
      const ids = section.rows.map((row) => row.thread.id);
      return section.kind === "environment"
        ? [section.projectName, section.environmentName, ids]
        : [section.kind, section.kind === "environment-misc" ? section.title : null, ids];
    }),
    [
      // Sections order by their top thread under the active sort (newest first).
      ["environment-misc", "Threads", ["none-1", "c-1"]],
      ["Beta", "feature/b", ["b-1", "b-2"]],
      ["Alpha", "feature/a", ["a-1", "a-2"]],
    ],
  );
  const envASection = sections[2];
  assert.equal(envASection?.kind, "environment");
  assert.equal(envASection?.rows[1]?.depth, 1);
});

test("buildListSections environment sections follow the row sort", () => {
  const threads = [
    thread({ id: "a-1", environment: ENV_A, createdAt: 400, latestAttentionAt: 10 }),
    thread({ id: "a-2", environment: ENV_A, createdAt: 300, latestAttentionAt: 10 }),
    thread({ id: "b-1", environment: ENV_B, createdAt: 200, latestAttentionAt: 900 }),
    thread({ id: "b-2", environment: ENV_B, createdAt: 100, latestAttentionAt: 10 }),
  ];
  const order = (sortBy: "created" | "attention") =>
    buildListSections(
      threads,
      PROJECTS,
      { ...DEFAULT_LIST_SETTINGS, groupBy: "environment", sortBy },
      "",
    ).map((section) => (section.kind === "environment" ? section.environmentId : section.kind));
  assert.deepEqual(order("created"), ["env_a", "env_b"]);
  assert.deepEqual(order("attention"), ["env_b", "env_a"]);
});

test("environment labels and captions follow the workspace label mode", () => {
  const full = thread({
    id: "t1",
    environment: {
      id: "env_1",
      name: "/worktrees/feature-x",
      branchName: "feature/x",
      workspaceDisplayKind: "managed-worktree",
    },
    host: { id: "host_1", name: "mactom" },
  });
  assert.equal(environmentLabel(full, "branch"), "feature/x");
  assert.equal(environmentLabel(full, "worktree"), "feature-x");
  assert.equal(environmentLabel(full, "host"), "mactom");
  assert.equal(environmentCaption(full, "Alpha", "branch"), "Alpha · feature/x");
  assert.equal(environmentCaption(thread({ id: "bare" }), "Alpha", "smart"), "Alpha");
  assert.equal(environmentCaption(thread({ id: "bare" }), null, "smart"), null);
});

test("buildListSections pinned-at-top with environment grouping keeps pins in the strip", () => {
  const sections = buildListSections(
    [
      thread({ id: "p1", environment: ENV_A, isPinned: true, createdAt: 300 }),
      thread({ id: "u1", environment: ENV_A, createdAt: 200 }),
      thread({ id: "u2", environment: ENV_A, createdAt: 150 }),
      thread({ id: "u3", createdAt: 100 }),
    ],
    PROJECTS,
    { ...DEFAULT_LIST_SETTINGS, groupBy: "environment", pinnedPlacement: "at-top", sortBy: "created" },
    "",
  );
  assert.deepEqual(
    sections.map((section) => [section.kind, section.rows.map((row) => row.thread.id)]),
    [
      ["pinned", ["p1"]],
      ["environment", ["u1", "u2"]],
      ["environment-misc", ["u3"]],
    ],
  );
});
