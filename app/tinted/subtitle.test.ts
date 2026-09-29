import { describe, expect, it } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import {
  basename,
  modelLabel,
  pullRequestAttentionGlyph,
  pullRequestStatusDescription,
  pullRequestTooltip,
  workspaceLabel,
} from "./subtitle.js";
import type { TintedPullRequestDetail } from "../../tinted-server.js";

describe("modelLabel", () => {
  it("never invents a provider default while metadata is unavailable", () => {
    expect(modelLabel(undefined)).toBe("Loading…");
    expect(modelLabel(null)).toBe("Unknown model");
    expect(
      modelLabel({
        providerId: "claude-code",
        model: null,
        displayName: null,
        status: "unknown",
      }),
    ).toBe("Unknown model");
  });

  it("prefers the provider catalog display name", () => {
    expect(
      modelLabel({
        providerId: "claude-code",
        model: "claude-fable-5-1",
        displayName: "Fable 5.1",
        status: "known",
      }),
    ).toBe("Fable 5.1");
  });

  it("applies compact provider-specific display rules", () => {
    expect(
      modelLabel({
        providerId: "codex",
        model: "gpt-5.6-terra",
        displayName: "GPT-5.6-Terra",
        status: "known",
      }),
    ).toBe("5.6-Terra");
    expect(
      modelLabel({
        providerId: "claude-code",
        model: "claude-opus-5[1m]",
        displayName: "Opus 5 (1M)",
        status: "known",
      }),
    ).toBe("Opus 5");
    expect(
      modelLabel({
        providerId: "acp-opencode",
        model: "opencode-big-pickle",
        displayName: "OpenCode Big Pickle",
        status: "known",
      }),
    ).toBe("Big Pickle");
  });

  it("gives a known but unlisted model a readable, non-default fallback", () => {
    expect(
      modelLabel({
        providerId: "codex",
        model: "gpt-5.6-terra",
        displayName: null,
        status: "known",
      }),
    ).toBe("GPT 5.6 Terra");
  });
});

describe("workspaceLabel", () => {
  const environment = {
    id: "env_1",
    name: "/Users/me/worktrees/feature-x",
    branchName: "feat/x",
    path: null,
    isWorktree: true,
    providerId: null,
    workspaceDisplayKind: null,
  };
  const thread = makeSidebarThread({
    environment,
    host: { id: "host_1", name: "Laptop" },
  });

  it("follows the chosen mode", () => {
    expect(workspaceLabel(thread, "branch")).toBe("feat/x");
    expect(workspaceLabel(thread, "worktree")).toBe("feature-x");
    expect(workspaceLabel(thread, "host")).toBe("Laptop");
    expect(workspaceLabel(thread, "off")).toBeNull();
  });

  it("smart falls back from branch to worktree to host", () => {
    expect(workspaceLabel(thread, "smart")).toBe("feat/x");
    expect(
      workspaceLabel(
        { ...thread, environment: { ...environment, branchName: "  " } },
        "smart",
      ),
    ).toBe("feature-x");
    expect(workspaceLabel({ ...thread, environment: null }, "smart")).toBe(
      "Laptop",
    );
    expect(
      workspaceLabel({ ...thread, environment: null, host: null }, "smart"),
    ).toBeNull();
  });

  it("takes the last path segment for basename", () => {
    expect(basename("C:\\work\\repo\\")).toBe("repo");
    expect(basename("plain")).toBe("plain");
  });
});

describe("pull request text and glyphs", () => {
  const detail: TintedPullRequestDetail = {
    checksState: "failing",
    checksFailed: 2,
    checksPending: 0,
    checksPassed: 5,
    reviewState: "review_requested",
    branchDiff: { files: 3, additions: 10, deletions: 4 },
  };

  it("counts checks when detail is known", () => {
    expect(pullRequestStatusDescription("checks_failed", detail)).toBe(
      "2 checks failed",
    );
    expect(pullRequestStatusDescription("checks_failed")).toBe("Checks failed");
    expect(
      pullRequestStatusDescription("checks_pending", {
        ...detail,
        checksPending: 1,
      }),
    ).toBe("1 check pending");
    expect(pullRequestStatusDescription("review_requested", detail)).toBe(
      "Review requested",
    );
    expect(pullRequestStatusDescription("review_requested")).toBe(
      "Review required",
    );
  });

  it("describes an open PR with nothing pending by its checks or review", () => {
    expect(
      pullRequestStatusDescription("none", { ...detail, checksState: "passing" }),
    ).toBe("Checks passing");
    expect(
      pullRequestStatusDescription("none", {
        ...detail,
        checksState: "pending",
        reviewState: "approved",
      }),
    ).toBe("Approved");
    expect(pullRequestStatusDescription("none")).toBe("Open pull request");
  });

  it("shows no attention glyph once a PR is merged or closed", () => {
    expect(pullRequestAttentionGlyph("merged", "merged", detail)).toBeNull();
    expect(pullRequestAttentionGlyph("checks_failed", "closed", detail)).toBeNull();
  });

  it("picks the glyph for the issue driving attention", () => {
    expect(pullRequestAttentionGlyph("checks_failed", "open")?.label).toBe(
      "Checks failing",
    );
    expect(pullRequestAttentionGlyph("conflicts", "open")?.icon).toBe(
      "AlertTriangle",
    );
    expect(pullRequestAttentionGlyph("ready_to_merge", "open")?.icon).toBe(
      "CircleCheck",
    );
    expect(pullRequestAttentionGlyph("none", "open")).toBeNull();
    expect(
      pullRequestAttentionGlyph("none", "open", {
        ...detail,
        checksState: "no_checks",
        reviewState: "none",
      }),
    ).toBeNull();
    expect(
      pullRequestAttentionGlyph("none", "open", {
        ...detail,
        checksState: "pending",
        reviewState: "approved",
      })?.label,
    ).toBe("Approved");
    expect(pullRequestAttentionGlyph("draft", "draft", detail)?.label).toBe(
      "Checks failing",
    );
  });

  it("builds the hover text from title, number, status, and branch diff", () => {
    expect(
      pullRequestTooltip(
        { title: "Add subtitles", number: 42, attention: "checks_failed" },
        detail,
      ),
    ).toBe("Add subtitles · #42 · 2 checks failed · +10 -4");
    expect(
      pullRequestTooltip({ title: "", number: 7, attention: "merged" }),
    ).toBe("#7 · Merged");
  });
});
