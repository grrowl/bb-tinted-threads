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

function compactClaudeName(value: string, family: "Sonnet" | "Opus" | "Haiku") {
  const major = value.match(/\b([3-9])(?:[.-]\d)?\b/)?.[1];
  return major ? `${family} ${major}` : family;
}

function compactCodexModelName(model: string): string {
  const parts = model
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : titleCaseToken(part)));

  return parts.length > 1 ? `${parts[0]}-${parts.slice(1).join("-")}` : parts[0];
}

function readableModelName(model: string): string {
  return shortModel(model)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(gpt|o)(\d)/gi, (_, family: string, version: string) =>
      `${family.toUpperCase()}-${version}`,
    )
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function claudeModelName(model: string | null): string {
  if (!model) return "Sonnet 5";
  const normalized = shortModel(model).replace(/^claude-?/i, "");
  if (/sonnet/i.test(normalized)) return compactClaudeName(normalized, "Sonnet");
  if (/opus/i.test(normalized)) return compactClaudeName(normalized, "Opus");
  if (/haiku/i.test(normalized)) return compactClaudeName(normalized, "Haiku");
  return normalized;
}

function codexModelName(model: string | null): string {
  if (!model) return "GPT";
  const normalized = shortModel(model).replace(/\[[^\]]+\]/g, "").trim();
  const gptMatch = normalized.match(/^gpt[-_\s]*(.+)$/i);
  if (gptMatch?.[1]) return compactCodexModelName(gptMatch[1]);
  return readableModelName(normalized);
}

export function modelLabel(
  thread: PluginSidebarThread,
  modelMetadata?: ThreadModelMetadata,
): string {
  const providerId = modelMetadata?.providerId ?? thread.providerId;
  const model = modelMetadata?.model ?? null;

  if (providerId === "claude-code") {
    return claudeModelName(model);
  }

  if (providerId === "codex") {
    return codexModelName(model);
  }

  return model ? readableModelName(model) : labelize(String(providerId));
}

export function pullRequestBadgeLabel(number: number): string {
  return `PR#${number}`;
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
