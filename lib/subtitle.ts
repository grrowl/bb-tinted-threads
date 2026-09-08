import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { WorkspaceLabelMode } from "./settings";

export type DiffStat = {
  additions: number;
  deletions: number;
};

export function basename(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

export function workspaceLabel(
  thread: PluginSidebarThread,
  mode: WorkspaceLabelMode,
): string | null {
  const branch = thread.environment?.branchName?.trim();
  const worktree = thread.environment?.name?.trim();
  const host = thread.host?.name?.trim();

  switch (mode) {
    case "branch":
      return branch ?? null;
    case "worktree":
      return worktree ? basename(worktree) : null;
    case "host":
      return host ?? null;
    case "smart":
      return (
        branch ??
        (worktree ? basename(worktree) : null) ??
        host ??
        null
      );
  }
}

export function parseDiffStat(value: string | null | undefined): DiffStat | null {
  if (!value) return null;
  const additions = value.match(/\+(\d+)/)?.[1];
  const deletions = value.match(/-(\d+)/)?.[1];
  if (additions === undefined && deletions === undefined) return null;
  return {
    additions: additions === undefined ? 0 : Number(additions),
    deletions: deletions === undefined ? 0 : Number(deletions),
  };
}

export type ThreadModelMetadata = {
  providerId: string;
  model: string | null;
  displayName: string | null;
  status: "known" | "unknown";
};

function shortModel(model: string): string {
  return model.replace(/^openai\//, "").replace(/^anthropic\//, "");
}

function titleCaseToken(part: string): string {
  return part.slice(0, 1).toUpperCase() + part.slice(1);
}

function labelize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

function readableModelName(model: string): string {
  return shortModel(model)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b(gpt|o)[-_\s]?(\d)/gi, (_, family: string, version: string) =>
      `${family.toUpperCase()}-${version}`,
    )
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function compactProviderModelName(providerId: string, value: string): string {
  if (providerId === "codex") {
    return value.replace(/^GPT-/i, "");
  }
  if (providerId === "claude-code") {
    return value.replace(/\s+\(1M\)$/i, "");
  }
  if (providerId === "acp-opencode") {
    return value.replace(/^OpenCode\s+/i, "");
  }
  return value;
}

export function modelLabel(
  thread: PluginSidebarThread,
  modelMetadata?: ThreadModelMetadata,
): string {
  // The sidebar DTO has no execution model. Until the RPC resolves, and when
  // BB cannot resolve a historic execution plan, state that uncertainty rather
  // than guessing a current provider default.
  if (!modelMetadata) return "Loading…";
  if (modelMetadata.status === "unknown" || !modelMetadata.model) {
    return "Unknown model";
  }
  return compactProviderModelName(
    modelMetadata.providerId,
    modelMetadata.displayName ?? readableModelName(modelMetadata.model),
  );
}

export function pullRequestAttentionLabel(
  attention: string,
): string {
  switch (attention) {
    case "checks_failed":
      return "checks failed";
    case "checks_pending":
      return "checks";
    case "changes_requested":
      return "changes";
    case "review_requested":
      return "review";
    case "conflicts":
      return "conflicts";
    case "blocked":
      return "blocked";
    case "draft":
      return "draft";
    case "ready_to_merge":
      return "ready";
    case "merged":
      return "merged";
    case "closed":
      return "closed";
    default:
      return "PR";
  }
}

export function subtitleAriaLabel(parts: string[]): string {
  return parts.filter(Boolean).join(", ");
}
